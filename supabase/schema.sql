-- ============================================================
--  RolMix – Schema de Supabase
--  Ejecuta esto en: Dashboard → SQL Editor → New query
-- ============================================================

-- ── Extensiones ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Reset de desarrollo ──────────────────────────────────────
-- Elimina restos de esquemas anteriores (por ejemplo room_id/rooms)
-- para poder recrear este módulo desde cero sin conflictos.
drop table if exists messages cascade;
drop table if exists session_members cascade;
drop table if exists sessions cascade;
drop table if exists rooms cascade;

drop function if exists set_updated_at() cascade;
drop function if exists is_session_dm(uuid) cascade;
drop function if exists is_session_member(uuid) cascade;
drop function if exists validate_member_insert() cascade;
drop function if exists validate_message_insert() cascade;

drop type if exists message_type cascade;
drop type if exists member_status cascade;
drop type if exists session_role cascade;

-- ── Tipos (con bloque DO para idempotencia) ───────────────────
do $$ begin
  create type session_role as enum ('dm', 'player');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_status as enum ('invited', 'pending', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_type as enum ('message', 'action', 'dice', 'narration', 'whisper');
exception when duplicate_object then null; end $$;

-- ── Tablas ────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique,
  avatar_color text not null default '#7c3aed',
  created_at   timestamptz not null default now()
);

create table if not exists sessions (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  system      text,
  access      text not null default 'open' check (access in ('open', 'invite')),
  dm_id       uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists session_members (
  id          uuid primary key default uuid_generate_v4(),
  session_id  uuid not null references sessions(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        session_role not null default 'player',
  status      member_status not null default 'pending',
  invited_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (session_id, user_id)
);

create table if not exists messages (
  id         uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  content    text not null,
  type       message_type not null default 'message',
  metadata   jsonb,
  created_at timestamptz not null default now()
);

create index if not exists session_members_session_idx on session_members(session_id);
create index if not exists session_members_user_idx on session_members(user_id);
create index if not exists messages_session_created_idx on messages(session_id, created_at desc);

-- ── Funciones ────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  preferred_username text;
  preferred_color text;
begin
  preferred_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');
  preferred_color := coalesce(new.raw_user_meta_data ->> 'avatar_color', '#7c3aed');

  if preferred_username is null then
    preferred_username := 'user_' || substr(new.id::text, 1, 8);
  end if;

  begin
    insert into public.profiles (id, username, avatar_color)
    values (new.id, preferred_username, preferred_color)
    on conflict (id) do update
      set username = excluded.username,
          avatar_color = excluded.avatar_color;
  exception
    when unique_violation then
      insert into public.profiles (id, username, avatar_color)
      values (new.id, preferred_username || '_' || substr(new.id::text, 1, 4), preferred_color)
      on conflict (id) do update
        set username = excluded.username,
            avatar_color = excluded.avatar_color;
  end;

  return new;
end;
$$;

create or replace function validate_member_insert()
returns trigger language plpgsql security definer as $$
begin
  if not (
    new.user_id = auth.uid()
    or exists (
      select 1
      from sessions
      where id = new.session_id and dm_id = auth.uid()
    )
  ) then
    raise exception 'Solo puedes crear tu propia solicitud o invitar como DM';
  end if;

  return new;
end;
$$;

create or replace function validate_message_insert()
returns trigger language plpgsql security definer as $$
begin
  if new.user_id <> auth.uid() then
    raise exception 'Solo puedes enviar mensajes con tu propio usuario';
  end if;

  return new;
end;
$$;

create or replace function create_session_with_dm_member(
  p_name text,
  p_description text default null,
  p_system text default null,
  p_access text default 'open'
) returns uuid language plpgsql security definer as $$
declare
  new_session_id uuid;
begin
  insert into sessions (name, description, system, access, dm_id)
  values (p_name, p_description, p_system, p_access, auth.uid())
  returning id into new_session_id;

  insert into session_members (session_id, user_id, role, status, invited_by)
  values (new_session_id, auth.uid(), 'dm', 'accepted', auth.uid())
  on conflict (session_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        invited_by = excluded.invited_by,
        updated_at = now();

  return new_session_id;
end;
$$;

create or replace function request_join_session(p_session_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into session_members (session_id, user_id, role, status, invited_by)
  values (p_session_id, auth.uid(), 'player', 'pending', null)
  on conflict (session_id, user_id) do update
    set status = 'pending',
        role = 'player',
        invited_by = null,
        updated_at = now();
end;
$$;

create or replace function accept_session_invitation(p_session_id uuid)
returns void language plpgsql security definer as $$
begin
  update session_members
  set status = 'accepted',
      updated_at = now()
  where session_id = p_session_id
    and user_id = auth.uid()
    and status = 'invited';
end;
$$;

create or replace function invite_player_to_session(p_session_id uuid, p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from sessions where id = p_session_id and dm_id = auth.uid()
  ) then
    raise exception 'Solo el DM puede invitar jugadores';
  end if;

  insert into session_members (session_id, user_id, role, status, invited_by)
  values (p_session_id, p_user_id, 'player', 'invited', auth.uid())
  on conflict (session_id, user_id) do update
    set status = 'invited',
        role = 'player',
        invited_by = auth.uid(),
        updated_at = now();
end;
$$;

create or replace function set_session_member_status(
  p_session_id uuid,
  p_user_id uuid,
  p_status member_status
) returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from sessions where id = p_session_id and dm_id = auth.uid()
  ) then
    raise exception 'Solo el DM puede gestionar miembros';
  end if;

  update session_members
  set status = p_status,
      updated_at = now()
  where session_id = p_session_id and user_id = p_user_id;
end;
$$;

create or replace function send_session_message(
  p_session_id uuid,
  p_content text,
  p_type message_type default 'message',
  p_metadata jsonb default null
) returns uuid language plpgsql security definer as $$
declare
  new_message_id uuid;
begin
  if not exists (
    select 1
    from session_members
    where session_id = p_session_id
      and user_id = auth.uid()
      and status = 'accepted'
  ) then
    raise exception 'No puedes escribir en una partida sin acceso aceptado';
  end if;

  insert into messages (session_id, user_id, content, type, metadata)
  values (p_session_id, auth.uid(), p_content, p_type, p_metadata)
  returning id into new_message_id;

  return new_message_id;
end;
$$;

-- ── Triggers ─────────────────────────────────────────────────
drop trigger if exists session_members_updated_at on session_members;
create trigger session_members_updated_at
  before update on session_members
  for each row execute function set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists session_members_validate_insert on session_members;
create trigger session_members_validate_insert
  before insert on session_members
  for each row execute function validate_member_insert();

drop trigger if exists messages_validate_insert on messages;
create trigger messages_validate_insert
  before insert on messages
  for each row execute function validate_message_insert();

-- ── RLS ──────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table sessions enable row level security;
alter table session_members enable row level security;
alter table messages enable row level security;

drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "profiles_insert" on profiles;
create policy "profiles_insert" on profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update
  using (auth.uid() = id);

drop policy if exists "sessions_select" on sessions;
create policy "sessions_select" on sessions for select
  using (auth.role() = 'authenticated');

drop policy if exists "sessions_insert" on sessions;
create policy "sessions_insert" on sessions for insert
  with check (auth.uid() = dm_id);

drop policy if exists "sessions_update" on sessions;
create policy "sessions_update" on sessions for update
  using (auth.uid() = dm_id);

drop policy if exists "sessions_delete" on sessions;
create policy "sessions_delete" on sessions for delete
  using (auth.uid() = dm_id);

drop policy if exists "members_select" on session_members;
create policy "members_select" on session_members for select
  using (auth.role() = 'authenticated');

drop policy if exists "members_insert" on session_members;
create policy "members_insert" on session_members for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "members_update" on session_members;
create policy "members_update" on session_members for update
  using (auth.role() = 'authenticated');

drop policy if exists "members_delete" on session_members;
create policy "members_delete" on session_members for delete
  using (auth.role() = 'authenticated');

drop policy if exists "messages_select" on messages;
create policy "messages_select" on messages for select
  using (auth.role() = 'authenticated');

drop policy if exists "messages_insert" on messages;
create policy "messages_insert" on messages for insert
  with check (auth.uid() = messages.user_id);

drop policy if exists "messages_delete" on messages;
create policy "messages_delete" on messages for delete
  using (auth.uid() = messages.user_id);

-- ── Realtime ──────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table sessions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table session_members;
exception when duplicate_object then null; end $$;
