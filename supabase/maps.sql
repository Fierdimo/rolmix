-- ══════════════════════════════════════════════════════════════════════════════
-- Motor de Mapas · RolMix
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Tablas ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS maps (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL DEFAULT 'Mapa',
  background_url  TEXT,
  bg_offset_x     INTEGER     NOT NULL DEFAULT 0,
  bg_offset_y     INTEGER     NOT NULL DEFAULT 0,
  bg_scale        REAL        NOT NULL DEFAULT 1.0,
  grid_cols       INT         NOT NULL DEFAULT 30,
  grid_rows       INT         NOT NULL DEFAULT 20,
  grid_size_px    INT         NOT NULL DEFAULT 60,
  feet_per_square INT         NOT NULL DEFAULT 5,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migración para mapas existentes (ejecutar si la tabla ya existe)
ALTER TABLE maps ADD COLUMN IF NOT EXISTS bg_offset_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS bg_offset_y INTEGER NOT NULL DEFAULT 0;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS bg_scale    REAL    NOT NULL DEFAULT 1.0;

-- Un token por combatiente en el mapa
CREATE TABLE IF NOT EXISTS map_tokens (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id        UUID    NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  combatant_id  UUID    NOT NULL REFERENCES combatants(id) ON DELETE CASCADE,
  col           INT     NOT NULL DEFAULT 0,
  row           INT     NOT NULL DEFAULT 0,
  size_squares  INT     NOT NULL DEFAULT 1,
  color         TEXT    NOT NULL DEFAULT '#6B7280',
  is_visible    BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(map_id, combatant_id)
);

-- Eventos del mapa: AOE, movimientos, marcadores
CREATE TABLE IF NOT EXISTS map_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      UUID        NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  session_id  UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  action_id   TEXT,
  payload     JSONB       NOT NULL DEFAULT '{}',
  created_by  UUID        REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

-- Fog of war por mapa
CREATE TABLE IF NOT EXISTS map_fog (
  map_id          UUID  PRIMARY KEY REFERENCES maps(id) ON DELETE CASCADE,
  revealed_cells  JSONB NOT NULL DEFAULT '[]'
);

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS map_tokens_map_idx      ON map_tokens(map_id);
CREATE INDEX IF NOT EXISTS map_events_map_idx      ON map_events(map_id);
CREATE INDEX IF NOT EXISTS map_events_session_idx  ON map_events(session_id);
CREATE INDEX IF NOT EXISTS maps_session_idx        ON maps(session_id);

-- ── Trigger updated_at en map_tokens ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_map_token_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS map_tokens_updated_at ON map_tokens;
CREATE TRIGGER map_tokens_updated_at
  BEFORE UPDATE ON map_tokens
  FOR EACH ROW EXECUTE FUNCTION touch_map_token_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE maps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_fog    ENABLE ROW LEVEL SECURITY;

-- maps: miembros aceptados leen, solo DM escribe
DROP POLICY IF EXISTS "members_read_maps" ON maps;
CREATE POLICY "members_read_maps" ON maps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM session_members sm
    WHERE sm.session_id = maps.session_id
      AND sm.user_id    = auth.uid()
      AND sm.status     = 'accepted'
  ));

DROP POLICY IF EXISTS "dm_manage_maps" ON maps;
CREATE POLICY "dm_manage_maps" ON maps FOR ALL
  USING (EXISTS (
    SELECT 1 FROM session_members sm
    WHERE sm.session_id = maps.session_id
      AND sm.user_id    = auth.uid()
      AND sm.role       = 'dm'
      AND sm.status     = 'accepted'
  ));

-- map_tokens: miembros leen; DM escribe
DROP POLICY IF EXISTS "members_read_map_tokens" ON map_tokens;
CREATE POLICY "members_read_map_tokens" ON map_tokens FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM maps m
    JOIN session_members sm ON sm.session_id = m.session_id
    WHERE m.id          = map_tokens.map_id
      AND sm.user_id    = auth.uid()
      AND sm.status     = 'accepted'
  ));

DROP POLICY IF EXISTS "dm_manage_map_tokens" ON map_tokens;
CREATE POLICY "dm_manage_map_tokens" ON map_tokens FOR ALL
  USING (EXISTS (
    SELECT 1 FROM maps m
    JOIN session_members sm ON sm.session_id = m.session_id
    WHERE m.id          = map_tokens.map_id
      AND sm.user_id    = auth.uid()
      AND sm.role       = 'dm'
      AND sm.status     = 'accepted'
  ));

-- map_events: miembros leen; DM y creador escriben
DROP POLICY IF EXISTS "members_read_map_events" ON map_events;
CREATE POLICY "members_read_map_events" ON map_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM session_members sm
    WHERE sm.session_id = map_events.session_id
      AND sm.user_id    = auth.uid()
      AND sm.status     = 'accepted'
  ));

DROP POLICY IF EXISTS "members_insert_map_events" ON map_events;
CREATE POLICY "members_insert_map_events" ON map_events FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM session_members sm
      WHERE sm.session_id = map_events.session_id
        AND sm.user_id    = auth.uid()
        AND sm.status     = 'accepted'
    )
  );

-- map_fog: igual que map_tokens
DROP POLICY IF EXISTS "members_read_fog" ON map_fog;
CREATE POLICY "members_read_fog" ON map_fog FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM maps m
    JOIN session_members sm ON sm.session_id = m.session_id
    WHERE m.id       = map_fog.map_id
      AND sm.user_id = auth.uid()
      AND sm.status  = 'accepted'
  ));

DROP POLICY IF EXISTS "dm_manage_fog" ON map_fog;
CREATE POLICY "dm_manage_fog" ON map_fog FOR ALL
  USING (EXISTS (
    SELECT 1 FROM maps m
    JOIN session_members sm ON sm.session_id = m.session_id
    WHERE m.id       = map_fog.map_id
      AND sm.user_id = auth.uid()
      AND sm.role    = 'dm'
      AND sm.status  = 'accepted'
  ));

-- ── Storage: bucket para imágenes de fondo ────────────────────────────────────
-- Bucket público (las URLs no requieren autenticación para verse)

INSERT INTO storage.buckets (id, name, public)
VALUES ('map-backgrounds', 'map-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "dm_upload_map_bg" ON storage.objects;
CREATE POLICY "dm_upload_map_bg" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'map-backgrounds'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "dm_update_map_bg" ON storage.objects;
CREATE POLICY "dm_update_map_bg" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'map-backgrounds' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "dm_delete_map_bg" ON storage.objects;
CREATE POLICY "dm_delete_map_bg" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'map-backgrounds' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "public_read_map_bg" ON storage.objects;
CREATE POLICY "public_read_map_bg" ON storage.objects
  FOR SELECT USING (bucket_id = 'map-backgrounds');

-- ── Realtime ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE map_tokens;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE map_events;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE maps;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RPC: get_or_create_map ────────────────────────────────────────────────────
-- Devuelve el mapa activo de la sesión o crea uno nuevo si no existe.

CREATE OR REPLACE FUNCTION get_or_create_map(p_session_id UUID)
RETURNS SETOF maps
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_map_id UUID;
BEGIN
  SELECT id INTO v_map_id
  FROM maps
  WHERE session_id = p_session_id AND is_active = true
  LIMIT 1;

  IF v_map_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM session_members
      WHERE session_id = p_session_id
        AND user_id    = auth.uid()
        AND role       = 'dm'
        AND status     = 'accepted'
    ) THEN
      RAISE EXCEPTION 'Solo el DM puede crear mapas';
    END IF;

    INSERT INTO maps (session_id)
    VALUES (p_session_id)
    RETURNING id INTO v_map_id;

    INSERT INTO map_fog (map_id) VALUES (v_map_id);
  END IF;

  RETURN QUERY SELECT * FROM maps WHERE id = v_map_id;
END;
$$;

-- ── RPC: upsert_map_token ─────────────────────────────────────────────────────
-- El DM coloca o mueve un token en el mapa.

CREATE OR REPLACE FUNCTION upsert_map_token(
  p_map_id        UUID,
  p_combatant_id  UUID,
  p_col           INT,
  p_row           INT,
  p_color         TEXT DEFAULT '#6B7280',
  p_size_squares  INT  DEFAULT 1
) RETURNS SETOF map_tokens
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM maps m
    JOIN session_members sm ON sm.session_id = m.session_id
    WHERE m.id       = p_map_id
      AND sm.user_id = auth.uid()
      AND sm.role    = 'dm'
      AND sm.status  = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Solo el DM puede mover tokens';
  END IF;

  INSERT INTO map_tokens (map_id, combatant_id, col, row, color, size_squares)
  VALUES (p_map_id, p_combatant_id, p_col, p_row, p_color, p_size_squares)
  ON CONFLICT (map_id, combatant_id) DO UPDATE
    SET col          = EXCLUDED.col,
        row          = EXCLUDED.row,
        color        = EXCLUDED.color,
        size_squares = EXCLUDED.size_squares,
        updated_at   = NOW();

  RETURN QUERY SELECT * FROM map_tokens
  WHERE map_id = p_map_id AND combatant_id = p_combatant_id;
END;
$$;

-- ── RPC: place_own_token ─────────────────────────────────────────────────────
-- Un jugador coloca/mueve su propio token en el mapa.
-- Resuelve el combatant_id desde el personaje activo del jugador.

CREATE OR REPLACE FUNCTION place_own_token(
  p_map_id UUID,
  p_col    INT,
  p_row    INT
) RETURNS SETOF map_tokens
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session_id   UUID;
  v_character_id UUID;
  v_combatant_id UUID;
BEGIN
  SELECT session_id INTO v_session_id FROM maps WHERE id = p_map_id;

  SELECT active_character_id INTO v_character_id
  FROM session_members
  WHERE session_id = v_session_id
    AND user_id    = auth.uid()
    AND status     = 'accepted';

  IF v_character_id IS NULL THEN
    RAISE EXCEPTION 'Sin personaje activo en esta sesión';
  END IF;

  SELECT c.id INTO v_combatant_id
  FROM combatants c
  JOIN combat_encounters ce ON ce.id = c.encounter_id
  WHERE c.character_id = v_character_id
    AND ce.session_id  = v_session_id
    AND ce.is_active   = true
  LIMIT 1;

  IF v_combatant_id IS NULL THEN
    RAISE EXCEPTION 'Tu personaje no está en el combate activo';
  END IF;

  INSERT INTO map_tokens (map_id, combatant_id, col, row, color, size_squares)
  VALUES (p_map_id, v_combatant_id, p_col, p_row, '#6D28D9', 1)
  ON CONFLICT (map_id, combatant_id) DO UPDATE
    SET col        = EXCLUDED.col,
        row        = EXCLUDED.row,
        updated_at = NOW();

  RETURN QUERY SELECT * FROM map_tokens
  WHERE map_id = p_map_id AND combatant_id = v_combatant_id;
END;
$$;

-- ── RPC: set_token_visibility ─────────────────────────────────────────────────
-- El DM oculta/muestra un token (fog of war por token).

CREATE OR REPLACE FUNCTION set_token_visibility(
  p_token_id  UUID,
  p_visible   BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE map_tokens mt
  SET is_visible = p_visible
  FROM maps m
  JOIN session_members sm ON sm.session_id = m.session_id
  WHERE mt.id      = p_token_id
    AND mt.map_id  = m.id
    AND sm.user_id = auth.uid()
    AND sm.role    = 'dm'
    AND sm.status  = 'accepted';
END;
$$;
