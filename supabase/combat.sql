-- ══════════════════════════════════════════════════════════════════════════════
-- Sistema de Combate · RolMix
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Tablas ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS combat_encounters (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round        INT     NOT NULL DEFAULT 1,
  active_index INT     NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS combatants (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID    NOT NULL REFERENCES combat_encounters(id) ON DELETE CASCADE,
  character_id UUID    REFERENCES characters(id),
  name         TEXT    NOT NULL,
  initiative   INT     NOT NULL DEFAULT 0,
  dex_mod      INT     NOT NULL DEFAULT 0,
  turn_order   INT     NOT NULL DEFAULT 0,
  hp_max       INT     NOT NULL DEFAULT 1,
  hp_current   INT     NOT NULL DEFAULT 1,
  is_npc       BOOLEAN NOT NULL DEFAULT false,
  is_defeated  BOOLEAN NOT NULL DEFAULT false
);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE combat_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE combatants        ENABLE ROW LEVEL SECURITY;

-- Miembros aceptados leen encuentros de su sesión
CREATE POLICY "members_read_encounters"
  ON combat_encounters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM session_members sm
      WHERE sm.session_id = combat_encounters.session_id
        AND sm.user_id    = auth.uid()
        AND sm.status     = 'accepted'
    )
  );

-- Solo el DM puede crear/modificar/eliminar encuentros
CREATE POLICY "dm_manage_encounters"
  ON combat_encounters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM session_members sm
      WHERE sm.session_id = combat_encounters.session_id
        AND sm.user_id    = auth.uid()
        AND sm.role       = 'dm'
        AND sm.status     = 'accepted'
    )
  );

-- Miembros aceptados leen combatientes
CREATE POLICY "members_read_combatants"
  ON combatants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM combat_encounters ce
      JOIN session_members sm ON sm.session_id = ce.session_id
      WHERE ce.id        = combatants.encounter_id
        AND sm.user_id   = auth.uid()
        AND sm.status    = 'accepted'
    )
  );

-- Solo el DM puede crear/modificar/eliminar combatientes
CREATE POLICY "dm_manage_combatants"
  ON combatants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM combat_encounters ce
      JOIN session_members sm ON sm.session_id = ce.session_id
      WHERE ce.id        = combatants.encounter_id
        AND sm.user_id   = auth.uid()
        AND sm.role      = 'dm'
        AND sm.status    = 'accepted'
    )
  );

-- ── Habilitar Realtime ────────────────────────────────────────────────────────
-- Ejecutar también en Supabase → Database → Replication si es necesario:
-- ALTER PUBLICATION supabase_realtime ADD TABLE combat_encounters;
-- ALTER PUBLICATION supabase_realtime ADD TABLE combatants;

-- ── RPC: start_combat ─────────────────────────────────────────────────────────
-- Crea un encuentro de combate con los combatientes ordenados por iniciativa.
-- p_combatants: JSON array de { character_id, name, initiative, dex_mod,
--                               hp_max, hp_current, is_npc, turn_order }

CREATE OR REPLACE FUNCTION start_combat(
  p_session_id  UUID,
  p_combatants  JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_is_dm     BOOLEAN;
  v_encounter UUID;
  v_item      JSONB;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM session_members
    WHERE session_id = p_session_id
      AND user_id    = auth.uid()
      AND role       = 'dm'
      AND status     = 'accepted'
  ) INTO v_is_dm;

  IF NOT v_is_dm THEN
    RAISE EXCEPTION 'Only the DM can start combat';
  END IF;

  -- Cerrar cualquier encuentro activo previo
  UPDATE combat_encounters
  SET is_active = false, ended_at = NOW()
  WHERE session_id = p_session_id AND is_active = true;

  INSERT INTO combat_encounters (session_id)
  VALUES (p_session_id)
  RETURNING id INTO v_encounter;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_combatants) LOOP
    INSERT INTO combatants (
      encounter_id, character_id, name,
      initiative, dex_mod, turn_order,
      hp_max, hp_current, is_npc
    ) VALUES (
      v_encounter,
      NULLIF(v_item->>'character_id', '')::UUID,
      v_item->>'name',
      (v_item->>'initiative')::INT,
      (v_item->>'dex_mod')::INT,
      (v_item->>'turn_order')::INT,
      (v_item->>'hp_max')::INT,
      (v_item->>'hp_current')::INT,
      (v_item->>'is_npc')::BOOLEAN
    );
  END LOOP;

  RETURN v_encounter;
END;
$$;

-- ── RPC: end_combat ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION end_combat(p_encounter_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE combat_encounters ce
  SET is_active = false, ended_at = NOW()
  FROM session_members sm
  WHERE ce.id          = p_encounter_id
    AND sm.session_id  = ce.session_id
    AND sm.user_id     = auth.uid()
    AND sm.role        = 'dm';
END;
$$;

-- ── RPC: next_combat_turn ─────────────────────────────────────────────────────
-- Avanza al siguiente combatiente no derrotado.
-- Incrementa la ronda cuando se completa un ciclo completo.

CREATE OR REPLACE FUNCTION next_combat_turn(p_encounter_id UUID)
RETURNS TABLE(new_index INT, new_round INT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cur_idx   INT;
  v_cur_round INT;
  v_total     INT;
  v_new_idx   INT;
  v_new_round INT;
  v_loop      INT := 0;
  v_defeated  BOOLEAN;
BEGIN
  SELECT ce.active_index, ce.round
  INTO v_cur_idx, v_cur_round
  FROM combat_encounters ce
  JOIN session_members sm ON sm.session_id = ce.session_id
  WHERE ce.id       = p_encounter_id
    AND sm.user_id  = auth.uid()
    AND sm.role     = 'dm';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM combatants WHERE encounter_id = p_encounter_id;

  IF v_total = 0 THEN
    RETURN QUERY SELECT v_cur_idx, v_cur_round;
    RETURN;
  END IF;

  v_new_idx   := (v_cur_idx + 1) % v_total;
  v_new_round := v_cur_round + (CASE WHEN v_new_idx = 0 THEN 1 ELSE 0 END);

  -- Saltar combatientes derrotados (máximo v_total iteraciones)
  LOOP
    EXIT WHEN v_loop >= v_total;
    SELECT is_defeated INTO v_defeated
    FROM combatants
    WHERE encounter_id = p_encounter_id AND turn_order = v_new_idx;
    EXIT WHEN NOT COALESCE(v_defeated, false);
    v_new_idx   := (v_new_idx + 1) % v_total;
    IF v_new_idx = 0 THEN v_new_round := v_new_round + 1; END IF;
    v_loop := v_loop + 1;
  END LOOP;

  UPDATE combat_encounters
  SET active_index = v_new_idx, round = v_new_round
  WHERE id = p_encounter_id;

  RETURN QUERY SELECT v_new_idx, v_new_round;
END;
$$;

-- ── RPC: update_combatant_hp ──────────────────────────────────────────────────
-- Aplica un delta de PG (positivo = curación, negativo = daño).
-- Resultado se limita a [0, hp_max]. Marca is_defeated cuando hp = 0.

CREATE OR REPLACE FUNCTION update_combatant_hp(
  p_combatant_id UUID,
  p_hp_delta     INT
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_hp INT;
BEGIN
  SELECT GREATEST(0, LEAST(c.hp_current + p_hp_delta, c.hp_max))
  INTO v_new_hp
  FROM combatants c
  JOIN combat_encounters ce ON ce.id = c.encounter_id
  JOIN session_members sm   ON sm.session_id = ce.session_id
  WHERE c.id         = p_combatant_id
    AND sm.user_id   = auth.uid()
    AND sm.role      = 'dm';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE combatants
  SET hp_current  = v_new_hp,
      is_defeated = (v_new_hp = 0)
  WHERE id = p_combatant_id;

  RETURN v_new_hp;
END;
$$;
