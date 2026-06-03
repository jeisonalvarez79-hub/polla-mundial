-- =====================================================
-- POLLA MUNDIAL - Setup de Base de Datos Supabase
-- Ejecutar en: Supabase > SQL Editor > New Query
-- =====================================================

-- 0. EXTENSIONES

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABLAS

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT DEFAULT 'Polla Mundial',
  tournament_name TEXT DEFAULT 'Mundial 2026',
  year TEXT DEFAULT '2026',
  pts JSONB DEFAULT '{"exacto":3,"resultado":1,"clasificado":2,"ordenGrupo":1,"goleador":2}'::jsonb,
  pollas JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin TEXT,
  polla_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  phase TEXT DEFAULT 'groups',
  "group" TEXT,
  home_team TEXT DEFAULT '',
  away_team TEXT DEFAULT '',
  date TEXT DEFAULT '',
  hora TEXT DEFAULT '',
  jornada TEXT DEFAULT '',
  home_score INTEGER,
  away_score INTEGER,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS bracket_matches (
  id TEXT PRIMARY KEY,
  round TEXT,
  position INTEGER,
  label TEXT,
  home_team TEXT DEFAULT '',
  away_team TEXT DEFAULT '',
  home_score INTEGER,
  away_score INTEGER,
  winner TEXT,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  participant_id TEXT,
  match_id TEXT,
  home_score INTEGER,
  away_score INTEGER,
  UNIQUE(participant_id, match_id)
);

CREATE TABLE IF NOT EXISTS bracket_predictions (
  id SERIAL PRIMARY KEY,
  participant_id TEXT,
  bracket_match_id TEXT,
  predicted_winner TEXT,
  predicted_home_score INTEGER,
  predicted_away_score INTEGER,
  UNIQUE(participant_id, bracket_match_id)
);

CREATE TABLE IF NOT EXISTS group_standings (
  "group" TEXT PRIMARY KEY,
  standings JSONB DEFAULT '["","","",""]'::jsonb
);

CREATE TABLE IF NOT EXISTS standings_predictions (
  id SERIAL PRIMARY KEY,
  participant_id TEXT,
  "group" TEXT,
  standings JSONB,
  UNIQUE(participant_id, "group")
);

CREATE TABLE IF NOT EXISTS top_scorers (
  id INTEGER PRIMARY KEY DEFAULT 1,
  scorers JSONB DEFAULT '["","",""]'::jsonb
);

CREATE TABLE IF NOT EXISTS scorer_predictions (
  id SERIAL PRIMARY KEY,
  participant_id TEXT UNIQUE,
  scorers JSONB
);

-- 2. SEGURIDAD - Row Level Security

ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE top_scorers ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorer_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all" ON config FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON participants FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON matches FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON bracket_matches FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON predictions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON bracket_predictions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON group_standings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON standings_predictions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON top_scorers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON scorer_predictions FOR ALL TO anon USING (true) WITH CHECK (true);

-- 3. FUNCION DE VERIFICACION DE PIN (PIN nunca sale del servidor)

CREATE OR REPLACE FUNCTION public.verify_participant_pin(
    p_participant_id TEXT,
    p_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog, pg_temp
AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT pin INTO stored_hash
    FROM public.participants
    WHERE id = p_participant_id;
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN stored_hash = extensions.crypt(p_pin, stored_hash);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_participant_pin(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_participant_pin(TEXT, TEXT) TO anon, authenticated;

-- 4. TRIGGER: hashea automaticamente los PINs al crear/actualizar participantes

CREATE OR REPLACE FUNCTION public.hash_pin_on_save()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog, pg_temp
AS $$
BEGIN
    IF NEW.pin IS NOT NULL AND NEW.pin NOT LIKE '$2a$%' THEN
        NEW.pin = extensions.crypt(NEW.pin, extensions.gen_salt('bf', 8));
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER hash_pin_before_save
    BEFORE INSERT OR UPDATE OF pin ON public.participants
    FOR EACH ROW
    EXECUTE FUNCTION public.hash_pin_on_save();

-- 5. DATOS INICIALES

INSERT INTO config (id, name, tournament_name, year, pts, pollas)
VALUES (1, 'Polla Mundial', 'Mundial 2026', '2026',
  '{"exacto":3,"resultado":1,"clasificado":2,"ordenGrupo":1,"goleador":10}'::jsonb,
  '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO top_scorers (id, scorers)
VALUES (1, '["","",""]'::jsonb)
ON CONFLICT (id) DO NOTHING;
