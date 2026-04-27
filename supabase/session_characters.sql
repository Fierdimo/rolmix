-- ============================================================
--  RolMix – Copias de personaje por sesión (session_characters)
--  Aplica esto DESPUÉS de characters.sql.
--  Es idempotente: se puede ejecutar varias veces sin perder datos.
--
--  Modelo:
--    · Cada personaje puede tener UNA copia de trabajo por partida.
--    · La copia se crea la primera vez que el jugador activa el
--      personaje en esa partida (activate_character_in_session).
--    · El jugador y el DM pueden editar la copia (update_session_character_data).
--    · El personaje original (tabla characters) nunca se toca durante
--      una partida.
--    · El jugador puede resetear la copia al estado del original
--      (reset_session_character).
-- ============================================================

-- ── Tabla ────────────────────────────────────────────────────
create table if not exists session_characters (
  id           uuid primary key default uuid_generate_v4(),
  session_id   uuid not null references sessions(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  owner_id     uuid not null references profiles(id) on delete cascade,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Solo puede existir una copia por personaje por partida.
  unique (session_id, character_id)
);

create index if not exists session_characters_session_idx  on session_characters(session_id);
create index if not exists session_characters_char_idx     on session_characters(character_id);
create index if not exists session_characters_owner_idx    on session_characters(owner_id);

drop trigger if exists session_characters_updated_at on session_characters;
create trigger session_characters_updated_at
  before update on session_characters
  for each row execute function set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
alter table session_characters enable row level security;

-- Cualquier miembro aceptado de la partida puede leer las fichas de sesión
-- (el DM necesita ver los datos para tiradas dirigidas y co-administración).
drop policy if exists "sc_select" on session_characters;
create policy "sc_select" on session_characters for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from session_members sm
      where sm.session_id = session_characters.session_id
        and sm.user_id = auth.uid()
        and sm.status = 'accepted'
    )
  );

-- Solo el dueño puede insertar (la creación del snapshot la hace el RPC).
drop policy if exists "sc_insert" on session_characters;
create policy "sc_insert" on session_characters for insert
  with check (auth.uid() = owner_id);

-- El dueño O el DM de la sesión puede actualizar la copia de trabajo.
drop policy if exists "sc_update" on session_characters;
create policy "sc_update" on session_characters for update
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from sessions s
      where s.id = session_characters.session_id
        and s.dm_id = auth.uid()
    )
  );

-- Solo el dueño puede borrar su copia.
drop policy if exists "sc_delete" on session_characters;
create policy "sc_delete" on session_characters for delete
  using (auth.uid() = owner_id);

-- ── RPC: activar personaje en partida (crea snapshot) ────────
-- Crea la copia de sesión si no existe (sin sobrescribir si ya hay datos).
-- Fija active_character_id en session_members.
-- Devuelve el id de la session_character.
drop function if exists activate_character_in_session(uuid, uuid);
create or replace function activate_character_in_session(
  p_session_id   uuid,
  p_character_id uuid
) returns uuid language plpgsql security definer as $$
declare
  v_owner_id   uuid;
  v_char_data  jsonb;
  v_sc_id      uuid;
begin
  -- Verificar que el personaje pertenece al usuario actual.
  select owner_id, data
  into v_owner_id, v_char_data
  from characters
  where id = p_character_id;

  if not found or v_owner_id <> auth.uid() then
    raise exception 'No puedes activar un personaje que no es tuyo';
  end if;

  -- Verificar que el usuario es miembro aceptado de la partida.
  if not exists (
    select 1 from session_members
    where session_id = p_session_id
      and user_id = auth.uid()
      and status = 'accepted'
  ) then
    raise exception 'Debes estar dentro de la partida para elegir personaje';
  end if;

  -- Crear la copia de sesión solo si no existe todavía.
  -- Si ya existe (de una sesión anterior de juego), se conserva el estado
  -- de esa copia para no perder el progreso de la partida.
  insert into session_characters (session_id, character_id, owner_id, data)
  values (p_session_id, p_character_id, auth.uid(), v_char_data)
  on conflict (session_id, character_id) do nothing
  returning id into v_sc_id;

  -- Si ya existía, recuperar su id.
  if v_sc_id is null then
    select id into v_sc_id
    from session_characters
    where session_id = p_session_id and character_id = p_character_id;
  end if;

  -- Fijar personaje activo en el membership.
  update session_members
  set active_character_id = p_character_id,
      updated_at = now()
  where session_id = p_session_id and user_id = auth.uid();

  return v_sc_id;
end;
$$;

-- ── RPC: actualizar datos de la copia de sesión ───────────────
-- Permitido para el dueño del personaje O para el DM de la partida.
-- El nombre del personaje no se almacena en session_characters;
-- pertenece siempre a la tabla characters.
drop function if exists update_session_character_data(uuid, uuid, jsonb);
create or replace function update_session_character_data(
  p_session_id   uuid,
  p_character_id uuid,
  p_data         jsonb
) returns void language plpgsql security definer as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id
  from session_characters
  where session_id = p_session_id and character_id = p_character_id;

  if not found then
    raise exception 'No existe copia de ese personaje en esta partida';
  end if;

  -- Permitido si es el dueño o el DM de la sesión.
  if auth.uid() <> v_owner_id then
    if not exists (
      select 1 from sessions where id = p_session_id and dm_id = auth.uid()
    ) then
      raise exception 'Solo el dueño del personaje o el DM pueden editar la ficha de sesión';
    end if;
  end if;

  update session_characters
  set data = p_data, updated_at = now()
  where session_id = p_session_id and character_id = p_character_id;
end;
$$;

-- ── RPC: el DM agrega un NPC/monstruo a la partida ──────────
-- Crea la copia de sesión del personaje (snapshot) sin tocar
-- active_character_id del DM. El personaje debe pertenecer al DM.
-- Si ya existe la copia, devuelve el id existente sin sobrescribir.
drop function if exists add_npc_to_session(uuid, uuid);
create or replace function add_npc_to_session(
  p_session_id   uuid,
  p_character_id uuid
) returns uuid language plpgsql security definer as $$
declare
  v_char_data  jsonb;
  v_sc_id      uuid;
begin
  -- El personaje debe pertenecer al usuario que llama.
  select data into v_char_data
  from characters
  where id = p_character_id and owner_id = auth.uid();

  if not found then
    raise exception 'El personaje no existe o no te pertenece';
  end if;

  -- El usuario debe ser el DM de la partida.
  if not exists (
    select 1 from sessions where id = p_session_id and dm_id = auth.uid()
  ) then
    raise exception 'Solo el DM puede agregar NPCs a la partida';
  end if;

  -- Insertar solo si no existe ya (preservar datos de sesión anteriores).
  insert into session_characters (session_id, character_id, owner_id, data)
  values (p_session_id, p_character_id, auth.uid(), v_char_data)
  on conflict (session_id, character_id) do nothing
  returning id into v_sc_id;

  if v_sc_id is null then
    select id into v_sc_id
    from session_characters
    where session_id = p_session_id and character_id = p_character_id;
  end if;

  return v_sc_id;
end;
$$;

-- ── RPC: resetear copia al estado actual del personaje original ─
-- Solo el dueño puede resetear. Útil para "iniciar" limpio una partida
-- usando el estado actual del personaje.
drop function if exists reset_session_character(uuid, uuid);
create or replace function reset_session_character(
  p_session_id   uuid,
  p_character_id uuid
) returns void language plpgsql security definer as $$
declare
  v_char_data jsonb;
begin
  -- Solo el dueño puede resetear.
  if not exists (
    select 1 from characters
    where id = p_character_id and owner_id = auth.uid()
  ) then
    raise exception 'Solo el dueño puede resetear la copia de sesión';
  end if;

  select data into v_char_data from characters where id = p_character_id;

  if not found then
    raise exception 'Personaje no encontrado';
  end if;

  update session_characters
  set data = v_char_data, updated_at = now()
  where session_id = p_session_id and character_id = p_character_id;
end;
$$;

-- ── Realtime ─────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table session_characters;
exception when duplicate_object then null; end $$;
