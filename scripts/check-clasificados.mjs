/**
 * Diagnóstico de solo-lectura: para un participante, compara
 *  (1) los 32 clasificados a dieciseisavos (predicho vs real), y
 *  (2) los equipos clasificados a octavos (predicho vs real),
 * mostrando los puntos que da cada uno.
 * Ejecutar: node scripts/check-clasificados.mjs "<nombre exacto>"
 */
import { createClient } from '@supabase/supabase-js'
import {
  calcR32Qualifiers, calcPredictedR32Qualifiers, calcClasificadoScore,
  calcPredictedBracketTeams,
} from '../src/utils/scoring.js'
import { BRACKET_TEAM_PTS } from '../src/data/initialData.js'

const SUPABASE_URL = 'https://whvswbgnhimwwgnzxarx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodnN3YmduaGltd3dnbnp4YXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA2NjYsImV4cCI6MjA5MDQ5NjY2Nn0.xEJuZqC4dF4FbuJ9zE7-IhfvPOWZaAtDQ652eoqYgAc'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const PARTICIPANT_NAME = process.argv[2] || 'Jeison Alvarez'

function decodeBracketPred(raw) {
  if (!raw) return { predictedWinner: null }
  return { predictedWinner: raw.split('|')[0] || null }
}

async function main() {
  const { data: configRows } = await supabase.from('config').select('pts').limit(1)
  const config = { pts: configRows[0].pts }

  const { data: partRow } = await supabase.from('participants').select('id,name').eq('name', PARTICIPANT_NAME).single()
  if (!partRow) throw new Error(`No encontré a "${PARTICIPANT_NAME}"`)
  const pid = partRow.id

  const { data: matchRows } = await supabase.from('matches').select('*')
  const matches = matchRows.map(r => ({
    id: r.id, phase: r.phase, group: r.group,
    homeTeam: r.home_team, awayTeam: r.away_team,
    homeScore: r.home_score, awayScore: r.away_score, status: r.status,
  }))

  const { data: bmRows } = await supabase.from('bracket_matches').select('*')
  const bracketMatches = bmRows.map(r => ({
    id: r.id, round: r.round, position: r.position, label: r.label,
    homeTeam: r.home_team, awayTeam: r.away_team,
    homeScore: r.home_score, awayScore: r.away_score,
    winner: r.winner, status: r.status,
  }))

  const { data: predRows } = await supabase.from('predictions').select('*').eq('participant_id', pid)
  const predictions = predRows.map(r => ({
    participantId: r.participant_id, matchId: r.match_id,
    homeScore: r.home_score, awayScore: r.away_score,
  }))

  const { data: bpRows } = await supabase.from('bracket_predictions').select('*').eq('participant_id', pid)
  const bracketPredictions = bpRows.map(r => ({
    participantId: r.participant_id, bracketMatchId: r.bracket_match_id,
    ...decodeBracketPred(r.predicted_winner),
  }))

  console.log(`\n############ ${partRow.name} ############\n`)

  // ══════════════════ 1) CLASIFICADOS A DIECISEISAVOS (32) ══════════════════
  const actualQualifiers = calcR32Qualifiers(matches)
  const predictedQualifiers = calcPredictedR32Qualifiers(matches, predictions, pid)
  const actualSet32 = new Set(Object.values(actualQualifiers).filter(Boolean))
  const predictedSet32 = new Set(Object.values(predictedQualifiers).filter(Boolean))

  console.log('=== 1) Clasificados a DIECISEISAVOS — predicho vs real (32 cupos) ===')
  const slotLabels = Object.keys(predictedQualifiers).length ? Object.keys(actualQualifiers) : []
  slotLabels.forEach(slot => {
    const pred = predictedQualifiers[slot] || '—'
    const real = actualQualifiers[slot] || '—'
    const ok = predictedQualifiers[slot] && actualSet32.has(predictedQualifiers[slot])
    console.log(`  ${slot.padEnd(4)} | predicho: ${pred.padEnd(17)} | real: ${real.padEnd(17)} | ${ok ? '✓ cuenta' : '✗'}`)
  })

  const aciertos32 = [...predictedSet32].filter(t => actualSet32.has(t)).sort()
  const fallos32 = [...predictedSet32].filter(t => !actualSet32.has(t)).sort()
  const clasifScore = calcClasificadoScore(matches, predictions, pid, config)

  console.log(`\nEquipos predichos que SÍ clasificaron a dieciseisavos: ${aciertos32.length}/32`)
  console.log(`  ${aciertos32.join(', ')}`)
  console.log(`Equipos predichos que NO clasificaron: ${fallos32.length}`)
  console.log(`  ${fallos32.join(', ') || '(ninguno)'}`)
  console.log(`\n>>> Puntos por "clasificado a dieciseisavos": ${aciertos32.length} equipos x ${config.pts.clasificado} pts = ${clasifScore} pts\n`)

  // ══════════════════ 2) CLASIFICADOS A OCTAVOS (equipos en R16) ══════════════════
  const predTeamMap = calcPredictedBracketTeams(matches, predictions, bracketPredictions, pid, bracketMatches)

  const actualR16 = new Set(
    bracketMatches.filter(m => m.round === 'r16').flatMap(m => [m.homeTeam, m.awayTeam]).filter(Boolean)
  )
  const predictedR16 = new Set(
    Array.from({ length: 8 }, (_, i) => `r16_${i + 1}`)
      .flatMap(id => [predTeamMap[id]?.homeTeam, predTeamMap[id]?.awayTeam])
      .filter(Boolean)
  )

  console.log('=== 2) Clasificados a OCTAVOS (R16) — predicho vs real ===')
  console.log(`Equipos reales en octavos (${actualR16.size}): ${[...actualR16].sort().join(', ')}`)
  console.log(`Equipos que ${partRow.name} predijo en octavos (${predictedR16.size}): ${[...predictedR16].sort().join(', ')}`)

  const aciertosR16 = [...predictedR16].filter(t => actualR16.has(t)).sort()
  const fallosR16 = [...predictedR16].filter(t => !actualR16.has(t)).sort()
  const ptsR16 = aciertosR16.length * BRACKET_TEAM_PTS.r16

  console.log(`\nEquipos predichos que SÍ llegaron a octavos: ${aciertosR16.length}`)
  console.log(`  ${aciertosR16.join(', ')}`)
  console.log(`Equipos predichos que NO llegaron a octavos: ${fallosR16.length}`)
  console.log(`  ${fallosR16.join(', ') || '(ninguno)'}`)
  console.log(`\n>>> Puntos por "equipo clasificado a octavos": ${aciertosR16.length} equipos x ${BRACKET_TEAM_PTS.r16} pts = ${ptsR16} pts`)
}

main().catch(err => { console.error(err); process.exit(1) })
