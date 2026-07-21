/**
 * Backup completo de los pronósticos de los 77 participantes (ambas pollas):
 * participantes, partidos de grupos, llaves de bracket, pronósticos de grupos,
 * pronósticos de bracket y pronóstico de goleador. No incluye PIN (dato
 * sensible de login, fuera del alcance de un backup de pronósticos).
 * Ejecutar: node scripts/generate-backup.mjs > backup-polla-pronosticos-<fecha>.json
 */
import { createClient } from '@supabase/supabase-js'

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
  const { data: configRows } = await supabase.from('config').select('*').limit(1)
  const config = configRows?.[0] || {}
  const pollas = Array.isArray(config.pollas) ? config.pollas.map(p => ({ id: p.id, name: p.name })) : []

  const participantRows = await fetchAll('participants')
  const participants = participantRows.map(p => ({
    id: p.id, name: p.name, pollaId: p.polla_id, createdAt: p.created_at,
  }))

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

  const predictionRows = await fetchAll('predictions')
  const predictions = predictionRows.map(p => ({
    participantId: p.participant_id, matchId: p.match_id,
    homeScore: p.home_score, awayScore: p.away_score,
  }))

  const bracketPredictionRows = await fetchAll('bracket_predictions')
  const bracketPredictions = bracketPredictionRows.map(p => ({
    participantId: p.participant_id, bracketMatchId: p.bracket_match_id,
    predictedWinner: (p.predicted_winner || '').split('|')[0] || null,
  }))

  const scorerPredictionRows = await fetchAll('scorer_predictions')
  const scorerPredictions = scorerPredictionRows.map(p => ({
    participantId: p.participant_id, scorers: p.scorers,
  }))

  const { data: topScorerRow } = await supabase.from('top_scorers').select('*').eq('id', 1).single()

  const output = {
    exportedAt: new Date().toISOString(),
    version: 'claude-backup-1',
    note: 'Backup de solo lectura de pronosticos (grupos, bracket, goleador) de ambas pollas. No incluye PIN de participantes.',
    pollas,
    pts: config.pts || null,
    topScorers: topScorerRow?.scorers || [],
    participants,
    matches,
    bracketMatches,
    predictions,
    bracketPredictions,
    scorerPredictions,
    counts: {
      participants: participants.length,
      matches: matches.length,
      bracketMatches: bracketMatches.length,
      predictions: predictions.length,
      bracketPredictions: bracketPredictions.length,
      scorerPredictions: scorerPredictions.length,
    },
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
