-- ============================================================
--  RolMix – Personajes
--  Aplica esto DESPUÉS de schema.sql.
--  Es idempotente: se puede ejecutar varias veces sin perder datos.
-- ============================================================

create table if not exists characters (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  system_id   text not null,
  name        text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists characters_owner_idx on characters(owner_id);

drop trigger if exists characters_updated_at on characters;
create trigger characters_updated_at
  before update on characters
  for each row execute function set_updated_at();

-- Personaje activo del jugador en una partida concreta.
-- La columna ya se crea (sin FK) en schema.sql para que sea siempre disponible.
-- Aquí añadimos/aseguramos la FK hacia characters de forma idempotente.
alter table session_members
  add column if not exists active_character_id uuid;

do $$ begin
  alter table session_members
    add constraint session_members_active_character_id_fkey
      foreign key (active_character_id) references characters(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ── RLS ──────────────────────────────────────────────────────
alter table characters enable row level security;

drop policy if exists "characters_select" on characters;
-- Cualquier usuario autenticado puede leer personajes (necesario para que
-- el DM pueda consultar la hoja del jugador para tiradas dirigidas).
create policy "characters_select" on characters for select
  using (auth.role() = 'authenticated');

drop policy if exists "characters_insert" on characters;
create policy "characters_insert" on characters for insert
  with check (auth.uid() = owner_id);

drop policy if exists "characters_update" on characters;
create policy "characters_update" on characters for update
  using (auth.uid() = owner_id);

drop policy if exists "characters_delete" on characters;
create policy "characters_delete" on characters for delete
  using (auth.uid() = owner_id);

-- ── RPC: fijar personaje activo en una partida ───────────────
create or replace function set_active_character(
  p_session_id uuid,
  p_character_id uuid
) returns void language plpgsql security definer as $$
begin
  -- Verifica que el personaje sea del usuario actual (o sea null para limpiar)
  if p_character_id is not null then
    if not exists (
      select 1 from characters where id = p_character_id and owner_id = auth.uid()
    ) then
      raise exception 'No puedes asignar un personaje que no es tuyo';
    end if;
  end if;

  -- Verifica que el usuario sea miembro aceptado de la partida
  if not exists (
    select 1 from session_members
    where session_id = p_session_id and user_id = auth.uid() and status = 'accepted'
  ) then
    raise exception 'Debes estar dentro de la partida para elegir personaje';
  end if;

  update session_members
  set active_character_id = p_character_id,
      updated_at = now()
  where session_id = p_session_id and user_id = auth.uid();
end;
$$;

-- ── Realtime ─────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table characters;
exception when duplicate_object then null; end $$;
