/**
 * Diagnóstico de solo-lectura: compara el puntaje de bracket de TODOS los
 * participantes (ambas pollas) ANTES y DESPUÉS del fix de "Final Four"
 * (que ya no premia a un equipo predicho para la Final si en la vida real
 * quedó en el partido de 3er puesto, y viceversa).
 * Ejecutar: node scripts/check-finalfour-fix-impact.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { calcPredictedBracketTeams, calcParticipantStats } from '../src/utils/scoring.js'
import { BRACKET_TEAM_PTS } from '../src/data/initialData.js'

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

// Réplica de la lógica VIEJA (buggy) del bloque Final Four, para comparar.
function oldFinalFourPts(predTeamMap, bmFinal, bmThird) {
  const aFF = new Set([bmFinal?.homeTeam, bmFinal?.awayTeam, bmThird?.homeTeam, bmThird?.awayTeam].filter(Boolean))
  if (aFF.size === 0) return 0
  const pmFinal = predTeamMap['final_1']
  const pmThird = predTeamMap['third_1']
  const pFF = new Set([pmFinal?.homeTeam, pmFinal?.awayTeam, pmThird?.homeTeam, pmThird?.awayTeam].filter(Boolean))
  let pts = 0
  for (const t of pFF) if (aFF.has(t)) pts += BRACKET_TEAM_PTS.finalFour
  return pts
}

async function main() {
  const { data: configRows } = await supabase.from('config').select('pollas, pts').limit(1)
  const config = configRows?.[0] || {}
  const pollas = Array.isArray(config.pollas) ? config.pollas : []

  const partRows = await fetchAll('participants')
  const matchRows = await fetchAll('matches')
  const bmRows = await fetchAll('bracket_matches')
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
  const bmFinal = bracketMatches.find(m => m.id === 'final_1')
  const bmThird = bracketMatches.find(m => m.id === 'third_1')

  const pollaList = pollas.length > 0 ? pollas : [{ id: null, name: '(sin sistema de pollas)' }]

  for (const polla of pollaList) {
    const participantsInPolla = polla.id ? partRows.filter(p => p.polla_id === polla.id) : partRows
    console.log(`\n############ POLLA: ${polla.name} (${participantsInPolla.length} participantes) ############`)
    let anyChange = false

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
      const predTeamMap = calcPredictedBracketTeams(matches, predictions, bracketPredictions, part.id, bracketMatches)
      const oldFF = oldFinalFourPts(predTeamMap, bmFinal, bmThird)

      const newStats = calcParticipantStats(part.id, matches, predictions, bracketMatches, bracketPredictions, null, null, null, null, config)
      // newFF: recomputar el finalFour nuevo manualmente para comparar contra oldFF
      const aFinalTeams = new Set([bmFinal?.homeTeam, bmFinal?.awayTeam].filter(Boolean))
      const aThirdTeams = new Set([bmThird?.homeTeam, bmThird?.awayTeam].filter(Boolean))
      const pmFinal = predTeamMap['final_1']
      const pmThird = predTeamMap['third_1']
      const pFinalTeams = new Set([pmFinal?.homeTeam, pmFinal?.awayTeam].filter(Boolean))
      const pThirdTeams = new Set([pmThird?.homeTeam, pmThird?.awayTeam].filter(Boolean))
      const newFF = [...pFinalTeams].filter(t => aFinalTeams.has(t)).length * BRACKET_TEAM_PTS.finalFour +
                    [...pThirdTeams].filter(t => aThirdTeams.has(t)).length * BRACKET_TEAM_PTS.finalFour

      if (oldFF !== newFF) {
        anyChange = true
        console.log(`  >>> ${part.name}: Final Four pts ${oldFF} -> ${newFF} (total bracket ahora ${newStats.ptsBracket}, total general ${newStats.total})`)
      }
    }
    if (!anyChange) console.log('  (nadie tenía puntos de Final Four en esta polla)')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
