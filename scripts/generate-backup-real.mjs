/**
 * Backup de los RESULTADOS REALES del Mundial 2026 (no pronósticos):
 * partidos de grupos con marcador real, tabla de posiciones de cada grupo,
 * clasificados a dieciseisavos, llaves de bracket con marcador/ganador real,
 * y goleador real.
 * Ejecutar: node scripts/generate-backup-real.mjs > backup-polla-real-<fecha>.json
 */
import { createClient } from '@supabase/supabase-js'
import { calcGroupStandings, calcR32Qualifiers } from '../src/utils/scoring.js'
import { GROUP_LETTERS } from '../src/data/initialData.js'

const SUPABASE_URL = 'https://whvswbgnhimwwgnzxarx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodnN3YmduaGltd3dnbnp4YXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA2NjYsImV4cCI6MjA5MDQ5NjY2Nn0.xEJuZqC4dF4FbuJ9zE7-IhfvPOWZaAtDQ652eoqYgAc'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function fetchAll(table, build = (q) => q) {
  const PAGE = 1000
  let from = 0
  let rows = []
  while (true) {
    const { data, error } = await build(supabase.from(table).select('*')).range(from, from + PAGE - 1)
    if (error) throw error
    rows = rows.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

async function main() {
  const matchRows = await fetchAll('matches')
  const matches = matchRows.map(m => ({
    id: m.id, phase: m.phase, group: m.group, status: m.status,
    homeTeam: m.home_team, awayTeam: m.away_team,
    homeScore: m.home_score, awayScore: m.away_score,
  }))

  const bracketMatchRows = await fetchAll('bracket_matches')
  const bracketMatches = bracketMatchRows.map(m => ({
    id: m.id, round: m.round, position: m.position, label: m.label,
    homeTeam: m.home_team, awayTeam: m.away_team,
    homeScore: m.home_score, awayScore: m.away_score,
    winner: m.winner, status: m.status,
  }))

  const { data: topScorerRow } = await supabase.from('top_scorers').select('*').eq('id', 1).single()
  const topScorers = topScorerRow?.scorers || []

  // Tabla de posiciones real de cada grupo (mismo motor que usa la app)
  const groupStandings = {}
  GROUP_LETTERS.forEach(group => {
    const gm = matches.filter(m => m.group === group && m.phase === 'groups')
    if (!gm.length) return
    const allFinished = gm.every(m => m.homeScore !== null && m.awayScore !== null)
    groupStandings[group] = {
      allFinished,
      standings: calcGroupStandings(matches, group),
    }
  })

  // Clasificados a dieciseisavos (32) — solo válido si TODA la fase de grupos terminó
  const allGroupsFinished = matches.filter(m => m.phase === 'groups').length > 0 &&
    matches.filter(m => m.phase === 'groups').every(m => m.homeScore !== null && m.awayScore !== null)
  const qualifiers = allGroupsFinished ? calcR32Qualifiers(matches) : null

  const output = {
    exportedAt: new Date().toISOString(),
    version: 'claude-backup-real-1',
    note: 'Backup de solo lectura de RESULTADOS REALES (no pronosticos): marcadores de grupos, tabla de posiciones, clasificados a 32avos, bracket real y goleador real.',
    topScorers,
    matches,
    bracketMatches,
    groupStandings,
    r32Qualifiers: qualifiers,
    counts: {
      matches: matches.length,
      matchesFinished: matches.filter(m => m.status === 'finished').length,
      bracketMatches: bracketMatches.length,
      bracketMatchesFinished: bracketMatches.filter(m => m.status === 'finished').length,
    },
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
