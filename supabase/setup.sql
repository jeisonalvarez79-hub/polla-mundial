-- =====================================================
-- POLLA MUNDIAL - Setup de Base de Datos Supabase
-- Ejecutar en: Supabase > SQL Editor > New Query
-- =====================================================

-- 1. TABLAS

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT DEFAULT 'Polla Mundial',
  tournament_name TEXT DEFAULT 'Mundial 2026',
  year TEXT DEFAULT '2026',
  admin_password TEXT DEFAULT 'admin123',
  pts JSONB DEFAULT '{"exacto":3,"resultado":1,"clasificado":2,"ordenGrupo":1,"goleador":2}'::jsonb
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  phase TEXT DEFAULT 'groups',
  "group" TEXT,
  home_team TEXT DEFAULT '',
  away_team TEXT DEFAULT '',
  date TEXT DEFAULT '',
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

-- 2. SEGURIDAD (permite acceso público - la app maneja la autenticación del admin)

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

-- 3. DATOS INICIALES

INSERT INTO config (id, name, tournament_name, year, admin_password, pts)
VALUES (1, 'Polla Mundial', 'Mundial 2026', '2026', 'admin123',
  '{"exacto":3,"resultado":1,"clasificado":2,"ordenGrupo":1,"goleador":2}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO top_scorers (id, scorers)
VALUES (1, '["","",""]'::jsonb)
ON CONFLICT (id) DO NOTHING;
