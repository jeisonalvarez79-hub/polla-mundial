/**
 * Diagnóstico de solo-lectura: para los primeros 6 participantes (por puntos)
 * de cada polla, muestra su pronóstico de 3er/4to puesto, de la Final, su
 * goleador elegido y sus puntos actuales.
 * Ejecutar: node scripts/top6-final-scorer.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { calcPredictedBracketTeams, calcParticipantStats } from '../src/utils/scoring.js'

const SUPABASE_URL = 'https://whvswbgnhimwwgnzxarx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodnN3YmduaGltd3dnbnp4YXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA2NjYsImV4cCI6MjA5MDQ5NjY2Nn0.xEJuZqC4dF4FbuJ9zE7-IhfvPOWZaAtDQ652eoqYgAc'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function decodeBracketPred(raw) {
  if (!raw) return { predictedWinner: null }
  return { predictedWinner: raw.split('|')[0] || null }
}

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

function fmtMatch(pm) {
  if (!pm) return '—'
  const h = pm.homeTeam || '?'
  const a = pm.awayTeam || '?'
  if (h === '?' && a === '?') return '—'
  return `${h} vs ${a}`
}

async function main() {
  const { data: configRows } = await supabase.from('config').select('pollas, pts').limit(1)
  const config = configRows?.[0] || {}
  const pollas = Array.isArray(config.pollas) ? config.pollas : []

  const partRows = await fetchAll('participants')
  const matchRows = await fetchAll('matches')
  const bmRows = await fetchAll('bracket_matches')
  const scorerRows = await fetchAll('scorer_predictions')
  const { data: topScorerRow } = await supabase.from('top_scorers').select('*').eq('id', 1).single()
  const topScorers = topScorerRow?.scorers || ['', '', '']

  const matches = matchRows.map(r => ({
    id: r.id, phase: r.phase, group: r.group, status: r.status,
    homeTeam: r.home_team, awayTeam: r.away_team,
    homeScore: r.home_score, awayScore: r.away_score,
  }))
  const bracketMatches = bmRows.map(r => ({
    id: r.id, round: r.round, position: r.position, label: r.label,
    homeTeam: r.home_team, awayTeam: r.away_team,
    homeScore: r.home_score, awayScore: r.away_score,
    winner: r.winner, status: r.status,
  }))
  const scorerPredictions = scorerRows.map(r => ({ participantId: r.participant_id, scorers: r.scorers }))

  const pollaList = pollas.length > 0 ? pollas : [{ id: null, name: '(sin sistema de pollas)' }]

  for (const polla of pollaList) {
    const participantsInPolla = polla.id ? partRows.filter(p => p.polla_id === polla.id) : partRows

    const results = []
    for (const part of participantsInPolla) {
      const predRows = await fetchAll('predictions', q => q.eq('participant_id', part.id))
      const predictions = predRows.map(r => ({
        participantId: r.participant_id, matchId: r.match_id,
        homeScore: r.home_score, awayScore: r.away_score,
      }))
      const bpRows = await fetchAll('bracket_predictions', q => q.eq('participant_id', part.id))
      const bracketPredictions = bpRows.map(r => ({
        participantId: r.participant_id, bracketMatchId: r.bracket_match_id,
        ...decodeBracketPred(r.predicted_winner),
      }))

      const stats = calcParticipantStats(
        part.id, matches, predictions, bracketMatches, bracketPredictions,
        null, null, topScorers, scorerPredictions, config
      )
      const predTeamMap = calcPredictedBracketTeams(matches, predictions, bracketPredictions, part.id, bracketMatches)
      const scorerPred = scorerPredictions.find(s => s.participantId === part.id)

      results.push({
        name: part.name,
        total: stats.total,
        third: predTeamMap['third_1'],
        final: predTeamMap['final_1'],
        scorer: scorerPred?.scorers?.[0] || '—',
      })
    }

    results.sort((a, b) => b.total - a.total)
    const top6 = results.slice(0, 6)

    console.log(`\n############ POLLA: ${polla.name} — TOP 6 ############\n`)
    console.log('| # | Participante | Partido 3er y 4to puesto (pronóstico) | Partido Final (pronóstico) | Goleador | Puntos |')
    console.log('|---|---|---|---|---|---|')
    top6.forEach((r, i) => {
      console.log(`| ${i + 1} | ${r.name} | ${fmtMatch(r.third)} | ${fmtMatch(r.final)} | ${r.scorer} | ${r.total} |`)
    })
  }
}

main().catch(err => { console.error(err); process.exit(1) })
