/**
 * Diagnóstico de solo-lectura: compara los 32 clasificados a dieciseisavos que
 * Meli Juanda predijo vs los 32 clasificados reales, y contrasta los puntos de
 * "clasificado" que el sistema actual calcula vs los que debería dar según la
 * regla correcta (equipo en el conjunto de 32 predichos Y en el conjunto de 32 reales).
 * Ejecutar: node scripts/check-meli-juanda.mjs
 */
import { createClient } from '@supabase/supabase-js'
import {
  calcGroupStandings, calcPredictedGroupStandings,
  calcR32Qualifiers, calcPredictedR32Qualifiers,
  calcStandingsScore,
} from '../src/utils/scoring.js'
import { GROUP_LETTERS } from '../src/data/initialData.js'

const SUPABASE_URL = 'https://whvswbgnhimwwgnzxarx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodnN3YmduaGltd3dnbnp4YXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA2NjYsImV4cCI6MjA5MDQ5NjY2Nn0.xEJuZqC4dF4FbuJ9zE7-IhfvPOWZaAtDQ652eoqYgAc'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const MELI_ID = 'p_1779890724586'

async function main() {
  const { data: configRows } = await supabase.from('config').select('pts').limit(1)
  const config = { pts: configRows[0].pts }

  const { data: matchRows } = await supabase.from('matches').select('*')
  const matches = matchRows.map(r => ({
    id: r.id, phase: r.phase, group: r.group,
    homeTeam: r.home_team, awayTeam: r.away_team,
    homeScore: r.home_score, awayScore: r.away_score, status: r.status,
  }))

  const { data: predRows } = await supabase
    .from('predictions').select('*').eq('participant_id', MELI_ID)
  const predictions = predRows.map(r => ({
    participantId: r.participant_id, matchId: r.match_id,
    homeScore: r.home_score, awayScore: r.away_score,
  }))

  const actualQualifiers = calcR32Qualifiers(matches)
  const predictedQualifiers = calcPredictedR32Qualifiers(matches, predictions, MELI_ID)

  const actualSet = new Set(Object.values(actualQualifiers).filter(Boolean))
  const predictedSet = new Set(Object.values(predictedQualifiers).filter(Boolean))

  console.log('=== Meli Juanda — 32 clasificados PREDICHOS vs REALES ===\n')
  console.log('Slot | Predicho          | Real              | ¿Coincide en el conjunto de 32?')
  const slots = [...GROUP_LETTERS.map(g => `1${g}`), ...GROUP_LETTERS.map(g => `2${g}`), ...Array.from({ length: 8 }, (_, i) => `t${i + 1}`)]
  slots.forEach(slot => {
    const pred = predictedQualifiers[slot] || '—'
    const real = actualQualifiers[slot] || '—'
    const predOk = predictedQualifiers[slot] && actualSet.has(predictedQualifiers[slot])
    console.log(`${slot.padEnd(4)} | ${pred.padEnd(17)} | ${real.padEnd(17)} | ${predOk ? 'SI' : 'no'}`)
  })

  const aciertos = [...predictedSet].filter(t => actualSet.has(t))
  console.log(`\nEquipos predichos por Meli que SÍ están entre los 32 reales: ${aciertos.length}/32`)
  console.log(aciertos.sort().join(', '))

  const fallos = [...predictedSet].filter(t => !actualSet.has(t))
  console.log(`\nEquipos predichos por Meli que NO clasificaron en la realidad: ${fallos.length}`)
  console.log(fallos.sort().join(', '))

  // ── Puntos actuales (lógica vigente: por grupo, solo top-2) ─────────────
  let ptsStandingsActual = 0
  let ptsClasificadoActual = 0
  let ptsOrdenGrupoActual = 0
  const detalleActual = []
  GROUP_LETTERS.forEach(group => {
    const groupMatches = matches.filter(m => m.group === group && m.phase === 'groups')
    if (!groupMatches.length) return
    const allFinished = groupMatches.every(m => m.homeScore !== null && m.awayScore !== null)
    if (!allFinished) return
    const actual = calcGroupStandings(matches, group).map(t => t.name)
    const predicted = calcPredictedGroupStandings(matches, predictions, MELI_ID, group).map(t => t.name)
    const score = calcStandingsScore(predicted, actual, config)
    ptsStandingsActual += score

    // Desglose manual (misma lógica de calcStandingsScore, pero separada)
    const actualTop2 = actual.slice(0, 2).filter(Boolean)
    const predTop2 = predicted.slice(0, 2).filter(Boolean)
    let clasif = 0
    for (const team of predTop2) if (actualTop2.includes(team)) clasif += config.pts.clasificado
    let orden = 0
    for (let i = 0; i < 4; i++) if (predicted[i] && actual[i] && predicted[i] === actual[i]) orden += config.pts.ordenGrupo
    ptsClasificadoActual += clasif
    ptsOrdenGrupoActual += orden

    detalleActual.push({ group, predicted, actual, score, clasif, orden })
  })

  console.log('\n=== Detalle por grupo (predicho vs real) ===')
  detalleActual.forEach(d => {
    console.log(`Grupo ${d.group}: predicho [${d.predicted.join(', ')}] | real [${d.actual.join(', ')}] | clasificado=${d.clasif} orden=${d.orden} total=${d.score}`)
  })

  console.log('\n=== Puntos ACTUALES (lógica vigente: top-2 por grupo) ===')
  console.log(`ptsClasificado actual = ${ptsClasificadoActual}`)
  console.log(`ptsOrdenGrupo actual  = ${ptsOrdenGrupoActual}`)
  console.log(`Total ptsStandings actual = ${ptsStandingsActual}`)

  // ── Puntos que DEBERÍA tener: equipo en el set de 32 predichos y en el set real ──
  const clasificadoCorrecto = aciertos.length * config.pts.clasificado
  console.log('\n=== Puntos "clasificado" CORRECTOS (comparando el set completo de 32) ===')
  console.log(`${aciertos.length} equipos coinciden x ${config.pts.clasificado} pts = ${clasificadoCorrecto} pts`)

  console.log('\n=== Ejemplo puntual: Ecuador ===')
  const ecuadorSlotPred = Object.entries(predictedQualifiers).find(([, v]) => v === 'Ecuador')
  const ecuadorSlotReal = Object.entries(actualQualifiers).find(([, v]) => v === 'Ecuador')
  console.log(`Meli lo predijo en el slot: ${ecuadorSlotPred ? ecuadorSlotPred[0] : 'no lo predijo clasificado'}`)
  console.log(`Ecuador realmente clasificó en el slot: ${ecuadorSlotReal ? ecuadorSlotReal[0] : 'no clasificó'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
