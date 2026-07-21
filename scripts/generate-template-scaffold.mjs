/**
 * Extrae la estructura (no los resultados) del Mundial 2026 desde Supabase:
 * los 72 partidos de grupos (equipos, sin marcador) y las 32 llaves de bracket
 * (ronda + posicion + label, sin equipos/marcador). Sirve de "scaffold" para
 * scripts/build-manual-template-excel.py, que arma el formato manual en blanco.
 * Ejecutar: node scripts/generate-template-scaffold.mjs > schedule-scaffold.json
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://whvswbgnhimwwgnzxarx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodnN3YmduaGltd3dnbnp4YXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA2NjYsImV4cCI6MjA5MDQ5NjY2Nn0.xEJuZqC4dF4FbuJ9zE7-IhfvPOWZaAtDQ652eoqYgAc'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function fetchAll(table) {
  const PAGE = 1000
  let from = 0
  let rows = []
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) throw error
    rows = rows.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

async function main() {
  const matchRows = await fetchAll('matches')
  const bracketRows = await fetchAll('bracket_matches')

  const matches = matchRows
    .map(m => ({ id: m.id, group: m.group, homeTeam: m.home_team, awayTeam: m.away_team }))
    .sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.id.localeCompare(b.id))

  const bracketMatches = bracketRows
    .map(m => ({ id: m.id, round: m.round, position: m.position, label: m.label }))
    .sort((a, b) => a.round.localeCompare(b.round) || a.position - b.position)

  console.log(JSON.stringify({ matches, bracketMatches }, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
