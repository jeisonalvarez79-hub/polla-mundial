/**
 * Diagnóstico de solo-lectura: desglosa TODOS los rubros de puntaje de
 * "Santi Londoño" en la Polla Garra (Grupos, 16avos, Octavos, Cuartos,
 * Semifinales, Clasificado a la final) y valida que el total coincide
 * con lo que calcularía la app hoy (mismo motor de scoring.js, datos crudos
 * de Supabase, sin cache).
 * Ejecutar: node scripts/check-santiago-full-breakdown.mjs
 */
import { createClient } from '@supabase/supabase-js'
import {
  calcGroupScore, calcGroupStandings, calcPredictedGroupStandings,
  calcStandingsScore, calcClasificadoScore, calcR32Qualifiers, calcPredictedR32Qualifiers,
  calcPredictedBracketTeams, calcBracketScoreAll, calcParticipantStats,
} from '../src/utils/scoring.js'
import { GROUP_LETTERS, BRACKET_PAIRING_PTS, BRACKET_TEAM_PTS, BONUS_PTS, DEFAULT_PTS } from '../src/data/initialData.js'

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

function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)) }

async function main() {
  const { data: configRows } = await supabase.from('config').select('pollas, pts').limit(1)
  const config = configRows?.[0] || {}
  const pollas = Array.isArray(config.pollas) ? config.pollas : []
  const garra = pollas.find(p => p.name.toLowerCase().includes('garra'))
  if (!garra) { console.log('No se encontró Polla Garra'); return }

  const partRows = await fetchAll('participants', q => q.eq('polla_id', garra.id))
  const santi = partRows.find(p => p.name.toLowerCase().includes('santi') && p.name.toLowerCase().includes('londo'))
  if (!santi) { console.log('No se encontró a Santi Londoño'); return }

  console.log(`Polla: ${garra.name}  |  Participante: ${santi.name} (${santi.id})\n`)

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

  const predRows = await fetchAll('predictions', q => q.eq('participant_id', santi.id))
  const predictions = predRows.map(r => ({
    participantId: r.participant_id, matchId: r.match_id,
    homeScore: r.home_score, awayScore: r.away_score,
  }))
  const bpRows = await fetchAll('bracket_predictions', q => q.eq('participant_id', santi.id))
  const bracketPredictions = bpRows.map(r => ({
    participantId: r.participant_id, bracketMatchId: r.bracket_match_id,
    ...decodeBracketPred(r.predicted_winner),
  }))

  // ── Validación de integridad de datos ─────────────────────────────────
  console.log('=== Validación de integridad ===')
  const dupPred = predRows.length - new Set(predRows.map(r => r.match_id)).size
  const dupBp   = bpRows.length - new Set(bpRows.map(r => r.bracket_match_id)).size
  console.log(`Predicciones de grupo: ${predRows.length} filas (${dupPred} duplicadas por match_id)`)
  console.log(`Predicciones de bracket: ${bpRows.length} filas (${dupBp} duplicadas por bracket_match_id)`)
  const finishedGroupMatches = matches.filter(m => m.phase === 'groups' && m.status === 'finished')
  const finishedNoScore = finishedGroupMatches.filter(m => m.homeScore === null || m.awayScore === null)
  console.log(`Partidos de grupo marcados "finished": ${finishedGroupMatches.length} (${finishedNoScore.length} sin marcador — inconsistente)`)
  console.log()

  // ── 1) GRUPOS: resultado de partidos (exacto/resultado) ───────────────
  let ptsExacto = 0, ptsResultado = 0
  const groupDetail = []
  for (const match of finishedGroupMatches) {
    const pred = predictions.find(p => p.matchId === match.id)
    const score = calcGroupScore(pred, match, config)
    if (score === DEFAULT_PTS.exacto) ptsExacto += score
    else if (score > 0) ptsResultado += score
    if (score > 0) groupDetail.push({ match, pred, score })
  }
  console.log(`=== 1. GRUPOS (resultado de partidos) ===`)
  console.log(`  Marcador exacto (${DEFAULT_PTS.exacto} pts c/u): ${groupDetail.filter(d => d.score === DEFAULT_PTS.exacto).length} aciertos => ${ptsExacto} pts`)
  console.log(`  Ganador/empate (${DEFAULT_PTS.resultado} pt c/u): ${groupDetail.filter(d => d.score === DEFAULT_PTS.resultado).length} aciertos => ${ptsResultado} pts`)
  console.log(`  Subtotal grupos (resultados): ${ptsExacto + ptsResultado} pts\n`)

  // ── 2) GRUPOS: posición exacta en tabla ────────────────────────────────
  let ptsPosicion = 0
  for (const group of GROUP_LETTERS) {
    const gm = matches.filter(m => m.group === group && m.phase === 'groups')
    if (!gm.length || !gm.every(m => m.homeScore !== null && m.awayScore !== null)) continue
    const actual = calcGroupStandings(matches, group).map(t => t.name)
    const predicted = calcPredictedGroupStandings(matches, predictions, santi.id, group).map(t => t.name)
    ptsPosicion += calcStandingsScore(predicted, actual, config)
  }
  console.log(`=== 2. GRUPOS (posición exacta 1°-4°, ${DEFAULT_PTS.ordenGrupo} pt c/u) ===`)
  console.log(`  Subtotal: ${ptsPosicion} pts\n`)

  // ── 3) 16AVOS (R32): clasificado al cuadro de 32 ──────────────────────
  const ptsClasificado = calcClasificadoScore(matches, predictions, santi.id, config)
  const actualQ = calcR32Qualifiers(matches)
  const predQ = calcPredictedR32Qualifiers(matches, predictions, santi.id)
  const actualSet = new Set(Object.values(actualQ).filter(Boolean))
  const clasificadoHits = Object.values(predQ).filter(t => t && actualSet.has(t))
  console.log(`=== 3a. 16AVOS — clasificado a R32 por pronóstico de grupos (${DEFAULT_PTS.clasificado} pts/equipo) ===`)
  console.log(`  Equipos acertados (${clasificadoHits.length}): ${clasificadoHits.join(', ')}`)
  console.log(`  Subtotal: ${ptsClasificado} pts\n`)

  // ── Helper genérico para rondas de bracket con equipo+llave ───────────
  const predTeamMap = calcPredictedBracketTeams(matches, predictions, bracketPredictions, santi.id, bracketMatches)
  function actualTeamsSet(round) {
    return new Set(bracketMatches.filter(m => m.round === round).flatMap(m => [m.homeTeam, m.awayTeam]).filter(Boolean))
  }
  function actualPairingsSet(round) {
    const s = new Set()
    bracketMatches.filter(m => m.round === round && m.homeTeam && m.awayTeam)
      .forEach(m => s.add([m.homeTeam, m.awayTeam].sort().join('|')))
    return s
  }
  function roundBreakdown(round, ids, teamPts, pairPts) {
    const actualTeams = actualTeamsSet(round)
    const actualPairs = actualPairingsSet(round)
    const teamHits = []
    for (const id of ids) {
      const pm = predTeamMap[id]
      for (const t of [pm?.homeTeam, pm?.awayTeam].filter(Boolean)) {
        if (actualTeams.has(t) && !teamHits.includes(t)) teamHits.push(t)
      }
    }
    const pairHits = []
    const used = new Set()
    for (const id of ids) {
      const pm = predTeamMap[id]
      if (!pm?.homeTeam || !pm?.awayTeam) continue
      const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
      if (actualPairs.has(key) && !used.has(key)) { pairHits.push(key); used.add(key) }
    }
    return {
      teamPtsTotal: teamHits.length * teamPts,
      pairPtsTotal: pairHits.length * pairPts,
      teamHits, pairHits, actualTeams: [...actualTeams], actualPairs: [...actualPairs],
    }
  }

  // ── 3b. 16AVOS — llave de bracket acertada (R32, comparación por conjunto) ─
  const r32ActualPairings = actualPairingsSet('r32')
  const r32PairHits = []
  const r32Used = new Set()
  for (let i = 1; i <= 16; i++) {
    const pm = predTeamMap[`r32_${i}`]
    if (!pm?.homeTeam || !pm?.awayTeam) continue
    const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
    if (r32ActualPairings.has(key) && !r32Used.has(key)) { r32PairHits.push(key); r32Used.add(key) }
  }
  const r32PairPts = r32PairHits.length * BRACKET_PAIRING_PTS.r32
  console.log(`=== 3b. 16AVOS — llave de bracket acertada (${BRACKET_PAIRING_PTS.r32} pts/llave) ===`)
  console.log(`  Llaves acertadas (${r32PairHits.length}): ${r32PairHits.join(' | ')}`)
  console.log(`  Subtotal: ${r32PairPts} pts`)
  console.log(`  Subtotal 16avos (3a+3b): ${ptsClasificado + r32PairPts} pts\n`)

  const r16 = roundBreakdown('r16', Array.from({ length: 8 }, (_, i) => `r16_${i + 1}`), BRACKET_TEAM_PTS.r16, BRACKET_PAIRING_PTS.r16)
  console.log(`=== 4. OCTAVOS (R16) ===`)
  console.log(`  Equipos reales en octavos: ${r16.actualTeams.join(', ')}`)
  console.log(`  Equipos acertados (${BRACKET_TEAM_PTS.r16} pts c/u): [${r16.teamHits.join(', ')}] => ${r16.teamPtsTotal} pts`)
  console.log(`  Llaves acertadas (${BRACKET_PAIRING_PTS.r16} pts c/u): [${r16.pairHits.join(' | ')}] => ${r16.pairPtsTotal} pts`)
  console.log(`  Subtotal octavos: ${r16.teamPtsTotal + r16.pairPtsTotal} pts\n`)

  const qf = roundBreakdown('qf', ['qf_1', 'qf_2', 'qf_3', 'qf_4'], BRACKET_TEAM_PTS.qf, BRACKET_PAIRING_PTS.qf)
  console.log(`=== 5. CUARTOS (QF) ===`)
  console.log(`  Equipos reales en cuartos: ${qf.actualTeams.join(', ')}`)
  console.log(`  Equipos acertados (${BRACKET_TEAM_PTS.qf} pts c/u): [${qf.teamHits.join(', ')}] => ${qf.teamPtsTotal} pts`)
  console.log(`  Llaves acertadas (${BRACKET_PAIRING_PTS.qf} pts c/u): [${qf.pairHits.join(' | ')}] => ${qf.pairPtsTotal} pts`)
  console.log(`  Subtotal cuartos: ${qf.teamPtsTotal + qf.pairPtsTotal} pts\n`)

  const sf = roundBreakdown('sf', ['sf_1', 'sf_2'], BRACKET_TEAM_PTS.sf, BRACKET_PAIRING_PTS.sf)
  console.log(`=== 6. SEMIFINALES (SF) ===`)
  console.log(`  Equipos reales en semis: ${sf.actualTeams.join(', ')}`)
  console.log(`  Equipos acertados (${BRACKET_TEAM_PTS.sf} pts c/u): [${sf.teamHits.join(', ')}] => ${sf.teamPtsTotal} pts`)
  console.log(`  Llaves acertadas (${BRACKET_PAIRING_PTS.sf} pts c/u): [${sf.pairHits.join(' | ')}] => ${sf.pairPtsTotal} pts`)
  console.log(`  Subtotal semis: ${sf.teamPtsTotal + sf.pairPtsTotal} pts\n`)

  // ── 7) CLASIFICADO A LA FINAL (equipo debe estar en el partido correcto:
  // Final o 3er puesto — no son intercambiables) ─────────────────────────
  const bmFinal = bracketMatches.find(m => m.id === 'final_1')
  const bmThird = bracketMatches.find(m => m.id === 'third_1')
  const aFinalTeams = new Set([bmFinal?.homeTeam, bmFinal?.awayTeam].filter(Boolean))
  const aThirdTeams = new Set([bmThird?.homeTeam, bmThird?.awayTeam].filter(Boolean))
  const aFF = new Set([...aFinalTeams, ...aThirdTeams])
  const pmFinal = predTeamMap['final_1']
  const pmThird = predTeamMap['third_1']
  const pFinalTeams = new Set([pmFinal?.homeTeam, pmFinal?.awayTeam].filter(Boolean))
  const pThirdTeams = new Set([pmThird?.homeTeam, pmThird?.awayTeam].filter(Boolean))
  const finalHits = [...pFinalTeams].filter(t => aFinalTeams.has(t))
  const thirdHits = [...pThirdTeams].filter(t => aThirdTeams.has(t))
  const ffHits = [...finalHits, ...thirdHits]
  const ffPts = ffHits.length * BRACKET_TEAM_PTS.finalFour

  let thirdPairPts = 0
  if (bmThird?.homeTeam && bmThird?.awayTeam && pmThird?.homeTeam && pmThird?.awayTeam) {
    const match = (pmThird.homeTeam === bmThird.homeTeam && pmThird.awayTeam === bmThird.awayTeam) ||
                  (pmThird.homeTeam === bmThird.awayTeam && pmThird.awayTeam === bmThird.homeTeam)
    if (match) thirdPairPts = BRACKET_PAIRING_PTS.third
  }
  let finalPairPts = 0
  if (bmFinal?.homeTeam && bmFinal?.awayTeam && pmFinal?.homeTeam && pmFinal?.awayTeam) {
    const match = (pmFinal.homeTeam === bmFinal.homeTeam && pmFinal.awayTeam === bmFinal.awayTeam) ||
                  (pmFinal.homeTeam === bmFinal.awayTeam && pmFinal.awayTeam === bmFinal.homeTeam)
    if (match) finalPairPts = BRACKET_PAIRING_PTS.final
  }

  console.log(`=== 7. CLASIFICADO A LA FINAL (final four: 2 finalistas + 2 de 3er/4to puesto) ===`)
  console.log(`  Equipos reales en la Final: ${[...aFinalTeams].join(', ') || '(sin definir)'}  |  Equipos reales en 3er puesto: ${[...aThirdTeams].join(', ') || '(sin definir)'}`)
  console.log(`  Acertados para la Final (${BRACKET_TEAM_PTS.finalFour} pts c/u): [${finalHits.join(', ')}]`)
  console.log(`  Acertados para 3er puesto (${BRACKET_TEAM_PTS.finalFour} pts c/u): [${thirdHits.join(', ')}]`)
  console.log(`  Total equipos acertados: [${ffHits.join(', ')}] => ${ffPts} pts`)
  console.log(`  Llave 3er puesto acertada (${BRACKET_PAIRING_PTS.third} pts): ${thirdPairPts} pts`)
  console.log(`  Llave final acertada (${BRACKET_PAIRING_PTS.final} pts): ${finalPairPts} pts`)
  console.log(`  Subtotal clasificado a la final: ${ffPts + thirdPairPts + finalPairPts} pts\n`)

  // ── Bonus (campeón/subcampeón/3ro/4to) — solo si ya hay resultado ─────
  let ptsBonus = 0
  if (bmFinal?.winner) {
    const predWinner = bracketPredictions.find(p => p.bracketMatchId === 'final_1')?.predictedWinner
    if (predWinner && predWinner === bmFinal.winner) ptsBonus += BONUS_PTS.champion
    const actualRU = bmFinal.homeTeam === bmFinal.winner ? bmFinal.awayTeam : bmFinal.homeTeam
    const predRU = pmFinal?.homeTeam === predWinner ? pmFinal?.awayTeam : pmFinal?.homeTeam
    if (predRU && actualRU && predRU === actualRU) ptsBonus += BONUS_PTS.runnerUp
  }
  if (bmThird?.winner) {
    const predWinner = bracketPredictions.find(p => p.bracketMatchId === 'third_1')?.predictedWinner
    if (predWinner && predWinner === bmThird.winner) ptsBonus += BONUS_PTS.thirdPlace
    const actualFourth = bmThird.homeTeam === bmThird.winner ? bmThird.awayTeam : bmThird.homeTeam
    const predFourth = pmThird?.homeTeam === predWinner ? pmThird?.awayTeam : pmThird?.homeTeam
    if (predFourth && actualFourth && predFourth === actualFourth) ptsBonus += BONUS_PTS.fourthPlace
  }
  console.log(`=== 8. BONUS (campeón/subcampeón/3ro/4to) ===`)
  console.log(`  Subtotal bonus: ${ptsBonus} pts\n`)

  // ── TOTAL manual vs TOTAL de la función oficial de la app ─────────────
  const manualGroups   = ptsExacto + ptsResultado
  const manualStandings = ptsPosicion + ptsClasificado
  const manualBracket  = r32PairPts + r16.teamPtsTotal + r16.pairPtsTotal + qf.teamPtsTotal + qf.pairPtsTotal +
                          sf.teamPtsTotal + sf.pairPtsTotal + ffPts + thirdPairPts + finalPairPts + ptsBonus
  const manualTotal = manualGroups + manualStandings + manualBracket

  const official = calcParticipantStats(
    santi.id, matches, predictions, bracketMatches, bracketPredictions,
    null, null, null, null, config
  )
  const officialGroups = official.ptsExacto + official.ptsResultado

  console.log('=== RESUMEN ===')
  console.log(pad('Rubro', 45) + pad('Manual (este script)', 22) + 'Oficial (calcParticipantStats)')
  console.log(pad('Grupos (resultados)', 45) + pad(manualGroups, 22) + officialGroups)
  console.log(pad('Grupos (posición + clasificado 16avos)', 45) + pad(manualStandings, 22) + official.ptsStandings)
  console.log(pad('Bracket (R32+R16+QF+SF+FinalFour+Bonus)', 45) + pad(manualBracket, 22) + official.ptsBracket)
  console.log(pad('TOTAL', 45) + pad(manualTotal, 22) + official.total)
  console.log()
  console.log(manualTotal === official.total
    ? '✅ El total manual coincide EXACTO con el motor oficial de la app (scoring.js). Los puntos que vería Santi en la Tabla/Ranking son estos, calculados en vivo desde los datos actuales de Supabase.'
    : '⚠️ DISCREPANCIA entre el cálculo manual y el oficial — revisar.')
}

main().catch(err => { console.error(err); process.exit(1) })
