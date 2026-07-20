/**
 * Diagnóstico de solo-lectura: para los primeros 4 participantes (por puntos)
 * de cada polla, muestra su pronóstico de Campeón/Subcampeón/3er/4to puesto
 * y Goleador, junto a sus puntos acumulados actuales.
 * Ejecutar: node scripts/top4-summary.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { calcPredictedBracketTeams, calcParticipantStats } from '../src/utils/scoring.js'
import { BONUS_PTS, DEFAULT_PTS } from '../src/data/initialData.js'

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

function decodeBracketPred(raw) {
  if (!raw) return { predictedWinner: null }
  return { predictedWinner: raw.split('|')[0] || null }
}

async function main() {
  const { data: configRows } = await supabase.from('config').select('pollas, pts').limit(1)
  const config = configRows?.[0] || {}
  const pollas = Array.isArray(config.pollas) ? config.pollas : []
  const ptsGoleador = config?.pts?.goleador ?? DEFAULT_PTS.goleador

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

      const pmFinal = predTeamMap['final_1']
      const pmThird = predTeamMap['third_1']
      const finalWinner = bracketPredictions.find(
        p => p.participantId === part.id && p.bracketMatchId === 'final_1'
      )?.predictedWinner || ''
      const finalRunnerUp = finalWinner
        ? (pmFinal?.homeTeam === finalWinner ? pmFinal?.awayTeam : pmFinal?.homeTeam) || ''
        : ''
      const thirdWinner = bracketPredictions.find(
        p => p.participantId === part.id && p.bracketMatchId === 'third_1'
      )?.predictedWinner || ''
      const fourthPlace = thirdWinner
        ? (pmThird?.homeTeam === thirdWinner ? pmThird?.awayTeam : pmThird?.homeTeam) || ''
        : ''

      results.push({
        name: part.name,
        total: stats.total,
        champion: finalWinner || '—',
        runnerUp: finalRunnerUp || '—',
        third: thirdWinner || '—',
        fourth: fourthPlace || '—',
        scorer: scorerPred?.scorers?.[0] || '—',
      })
    }

    results.sort((a, b) => b.total - a.total)
    const top4 = results.slice(0, 4)

    console.log(`\n############ POLLA: ${polla.name} — TOP 4 ############\n`)
    console.log(`| Participante | Puntos acumulados a hoy | Equipo Campeón (${BONUS_PTS.champion} pts) | Equipo Subcampeón (${BONUS_PTS.runnerUp} pts) | Tercer Puesto (${BONUS_PTS.thirdPlace} pts) | Cuarto Puesto (${BONUS_PTS.fourthPlace} pts) | Goleador (${ptsGoleador} pts) |`)
    console.log('|---|---|---|---|---|---|---|')
    top4.forEach((r) => {
      console.log(`| ${r.name} | ${r.total} | ${r.champion} | ${r.runnerUp} | ${r.third} | ${r.fourth} | ${r.scorer} |`)
    })
  }
}

main().catch(err => { console.error(err); process.exit(1) })
