/**
 * Resumen fase por fase de aciertos para un participante de una polla específica.
 * Compara pronósticos vs resultados reales en: fase de grupos (marcador),
 * clasificados a dieciseisavos, y cada ronda del bracket (equipos + llaves + bonus).
 * Ejecutar: node scripts/resumen-fases-david.mjs "<polla>" "<participante>"
 */
import { createClient } from '@supabase/supabase-js'
import {
  calcR32Qualifiers, calcPredictedR32Qualifiers, calcGroupScore,
  calcPredictedBracketTeams, calcBracketScoreAll, calcParticipantStats,
  calcGroupStandings, calcPredictedGroupStandings, calcStandingsScore,
} from '../src/utils/scoring.js'
import { BRACKET_TEAM_PTS, BRACKET_PAIRING_PTS, BONUS_PTS, DEFAULT_PTS, GROUP_LETTERS } from '../src/data/initialData.js'

const SUPABASE_URL = 'https://whvswbgnhimwwgnzxarx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodnN3YmduaGltd3dnbnp4YXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA2NjYsImV4cCI6MjA5MDQ5NjY2Nn0.xEJuZqC4dF4FbuJ9zE7-IhfvPOWZaAtDQ652eoqYgAc'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const POLLA_NAME = process.argv[2] || 'Garra'
const PARTICIPANT_NAME = process.argv[3] || 'David'

function decodeBracketPred(raw) {
  if (!raw) return { predictedWinner: null }
  return { predictedWinner: raw.split('|')[0] || null }
}

async function fetchAll(table, build) {
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
  const { data: configRows } = await supabase.from('config').select('pts,pollas').limit(1)
  const config = { pts: { ...DEFAULT_PTS, ...(configRows[0]?.pts || {}) } }

  const pollaRows = Array.isArray(configRows[0]?.pollas) ? configRows[0].pollas : []
  const polla = pollaRows.find(p => p.name.toLowerCase().includes(POLLA_NAME.toLowerCase()))
  if (!polla) {
    console.log('Pollas disponibles:', pollaRows.map(p => p.name).join(', '))
    throw new Error(`No encontré una polla que coincida con "${POLLA_NAME}"`)
  }

  const { data: partRows } = await supabase.from('participants').select('id,name').eq('polla_id', polla.id)
  const candidates = partRows.filter(p => p.name.toLowerCase().includes(PARTICIPANT_NAME.toLowerCase()))
  if (candidates.length === 0) {
    console.log(`Participantes en "${polla.name}":`, partRows.map(p => p.name).join(', '))
    throw new Error(`No encontré a "${PARTICIPANT_NAME}" en la polla "${polla.name}"`)
  }
  if (candidates.length > 1) {
    console.log('Coincidencias:', candidates.map(p => p.name).join(', '))
    throw new Error('Nombre ambiguo, sé más específico')
  }
  const partRow = candidates[0]
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

  const predRows = await fetchAll('predictions', q => q.eq('participant_id', pid))
  const predictions = predRows.map(r => ({
    participantId: r.participant_id, matchId: r.match_id,
    homeScore: r.home_score, awayScore: r.away_score,
  }))

  const bpRows = await fetchAll('bracket_predictions', q => q.eq('participant_id', pid))
  const bracketPredictions = bpRows.map(r => ({
    participantId: r.participant_id, bracketMatchId: r.bracket_match_id,
    ...decodeBracketPred(r.predicted_winner),
  }))

  console.log(`\n############ ${partRow.name} — Polla "${polla.name}" ############\n`)

  // Total oficial (el mismo cálculo que usa la tabla de posiciones)
  const stats = calcParticipantStats(
    pid, matches, predictions, bracketMatches, bracketPredictions,
    [], [], [], [], config
  )

  // ══════════════════ 1) FASE DE GRUPOS (partido por partido) ══════════════════
  const groupMatches = matches.filter(m => m.phase === 'groups')
  const finishedGroups = groupMatches.filter(m => m.status === 'finished')
  let exactos = 0, resultados = 0, fallosGrupo = 0, sinPronostico = 0

  finishedGroups.forEach(m => {
    const pred = predictions.find(p => p.matchId === m.id)
    if (!pred || pred.homeScore === null || pred.awayScore === null) { sinPronostico++; return }
    const score = calcGroupScore(pred, m, config)
    if (score === config.pts.exacto) exactos++
    else if (score > 0) resultados++
    else fallosGrupo++
  })

  console.log('=== FASE DE GRUPOS (partidos jugados) ===')
  console.log(`Partidos finalizados: ${finishedGroups.length} | Pronosticados: ${finishedGroups.length - sinPronostico}`)
  console.log(`  Marcador exacto (${config.pts.exacto} pts c/u): ${exactos}`)
  console.log(`  Resultado correcto, marcador no (${config.pts.resultado} pt c/u): ${resultados}`)
  console.log(`  Fallados: ${fallosGrupo}`)
  if (sinPronostico) console.log(`  Sin pronóstico: ${sinPronostico}`)
  console.log(`  >>> Puntos: ${stats.ptsExacto + stats.ptsResultado} pts (exacto ${stats.ptsExacto} + resultado ${stats.ptsResultado})`)

  // ══════════════════ 1b) POSICIÓN EXACTA EN CADA GRUPO ══════════════════
  console.log('\n=== POSICIÓN EXACTA EN TABLA DE GRUPO (1 pt por puesto acertado) ===')
  let totalOrdenGrupo = 0, gruposConAciertoTotal = 0
  GROUP_LETTERS.forEach(group => {
    const gMatches = matches.filter(m => m.group === group && m.phase === 'groups')
    if (!gMatches.length) return
    const allFinished = gMatches.every(m => m.homeScore !== null && m.awayScore !== null)
    if (!allFinished) { console.log(`  Grupo ${group}: (aún no termina)`); return }
    const actual = calcGroupStandings(matches, group).map(t => t.name)
    const predicted = calcPredictedGroupStandings(matches, predictions, pid, group).map(t => t.name)
    const score = calcStandingsScore(predicted, actual, config)
    totalOrdenGrupo += score
    const hits = [0, 1, 2, 3].filter(i => predicted[i] && actual[i] && predicted[i] === actual[i]).length
    if (hits === 4) gruposConAciertoTotal++
    console.log(`  Grupo ${group}: real [${actual.join(', ')}] | predicho [${predicted.join(', ')}] | ${hits}/4 puestos exactos (+${score} pts)`)
  })
  console.log(`  >>> Puntos por posición exacta: ${totalOrdenGrupo} pts (${gruposConAciertoTotal} grupos con las 4 posiciones perfectas)`)

  // Guarda { label, actualList, predictedList } de cada fase para la tabla comparativa final
  const comparisons = []

  // ══════════════════ 2) CLASIFICADOS A DIECISEISAVOS (32) ══════════════════
  const allGroupsFinished = groupMatches.length > 0 && groupMatches.every(m => m.homeScore !== null && m.awayScore !== null)
  console.log('\n=== CLASIFICADOS A DIECISEISAVOS (32 equipos) ===')
  if (!allGroupsFinished) {
    console.log('  (fase de grupos aún no termina completamente — no se puede calcular)')
  } else {
    const actualQualifiers = calcR32Qualifiers(matches)
    const predictedQualifiers = calcPredictedR32Qualifiers(matches, predictions, pid)
    const actualSet32 = new Set(Object.values(actualQualifiers).filter(Boolean))
    const predictedSet32 = new Set(Object.values(predictedQualifiers).filter(Boolean))
    const aciertos32 = [...predictedSet32].filter(t => actualSet32.has(t)).sort()
    const fallos32 = [...predictedSet32].filter(t => !actualSet32.has(t)).sort()
    console.log(`  Aciertos: ${aciertos32.length}/32 → ${aciertos32.join(', ')}`)
    console.log(`  Fallos: ${fallos32.length} → ${fallos32.join(', ') || '(ninguno)'}`)
    console.log(`  >>> Puntos: ${aciertos32.length} x ${config.pts.clasificado} = ${aciertos32.length * config.pts.clasificado} pts`)
    comparisons.push({
      label: 'Dieciseisavos (32 clasificados de grupos)',
      actualList: [...actualSet32].sort(),
      predictedList: [...predictedSet32].sort(),
    })
  }

  // ══════════════════ 3) BRACKET POR RONDA ══════════════════
  const predTeamMap = calcPredictedBracketTeams(matches, predictions, bracketPredictions, pid, bracketMatches)

  function actualTeamsSet(round) {
    return new Set(bracketMatches.filter(m => m.round === round).flatMap(m => [m.homeTeam, m.awayTeam]).filter(Boolean))
  }
  function actualPairingsSet(round) {
    const s = new Set()
    bracketMatches.filter(m => m.round === round && m.homeTeam && m.awayTeam)
      .forEach(m => s.add([m.homeTeam, m.awayTeam].sort().join('|')))
    return s
  }
  // Acumula, por fase, { teamHits, teamTotal, teamPts, pairHits, pairTotal, pairPts }
  const phaseTable = []

  function reportRound(round, ids, teamPts, label) {
    const actualTeams = actualTeamsSet(round)
    const row = { label, teamHits: 0, teamTotal: 0, teamPts: 0, pairHits: 0, pairTotal: ids.length, pairPts: 0 }
    if (actualTeams.size === 0) {
      console.log(`  (ronda aún no definida)`)
      phaseTable.push(row)
      return
    }
    const predTeams = new Set(ids.flatMap(id => [predTeamMap[id]?.homeTeam, predTeamMap[id]?.awayTeam]).filter(Boolean))
    const aciertos = [...predTeams].filter(t => actualTeams.has(t)).sort()
    const fallos = [...predTeams].filter(t => !actualTeams.has(t)).sort()
    console.log(`  Equipos reales (${actualTeams.size}): ${[...actualTeams].sort().join(', ')}`)
    console.log(`  Aciertos equipo: ${aciertos.length} → ${aciertos.join(', ') || '(ninguno)'} (${aciertos.length} x ${teamPts} = ${aciertos.length * teamPts} pts)`)
    console.log(`  Fallos equipo: ${fallos.length} → ${fallos.join(', ') || '(ninguno)'}`)

    const actualPairs = actualPairingsSet(round)
    let aciertosLlave = 0
    const usedPairs = new Set()
    ids.forEach(id => {
      const pm = predTeamMap[id]
      if (!pm?.homeTeam || !pm?.awayTeam) return
      const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
      if (actualPairs.has(key) && !usedPairs.has(key)) { aciertosLlave++; usedPairs.add(key) }
    })
    const pairPts = BRACKET_PAIRING_PTS[round]
    console.log(`  Llaves acertadas (ambos equipos correctos): ${aciertosLlave}/${ids.length} (${aciertosLlave} x ${pairPts} = ${aciertosLlave * pairPts} pts)`)

    row.teamHits = aciertos.length; row.teamTotal = actualTeams.size; row.teamPts = aciertos.length * teamPts
    row.pairHits = aciertosLlave; row.pairPts = aciertosLlave * pairPts
    phaseTable.push(row)
    comparisons.push({
      label,
      actualList: [...actualTeams].sort(),
      predictedList: [...predTeams].sort(),
    })
  }

  console.log('\n=== DIECISEISAVOS DEL BRACKET (R32) — llaves emparejadas ===')
  {
    const r32Ids = Array.from({ length: 16 }, (_, i) => `r32_${i + 1}`)
    const actualPairs = actualPairingsSet('r32')
    let aciertosLlave = 0
    const usedPairs = new Set()
    r32Ids.forEach(id => {
      const pm = predTeamMap[id]
      if (!pm?.homeTeam || !pm?.awayTeam) return
      const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
      if (actualPairs.has(key) && !usedPairs.has(key)) { aciertosLlave++; usedPairs.add(key) }
    })
    console.log(`  Llaves acertadas (ambos equipos, sin importar orden): ${aciertosLlave}/16 (${aciertosLlave} x ${BRACKET_PAIRING_PTS.r32} = ${aciertosLlave * BRACKET_PAIRING_PTS.r32} pts)`)
    phaseTable.push({
      label: 'Dieciseisavos (R32)', teamHits: null, teamTotal: null, teamPts: 0,
      pairHits: aciertosLlave, pairTotal: 16, pairPts: aciertosLlave * BRACKET_PAIRING_PTS.r32,
    })
  }

  console.log('\n=== OCTAVOS (R16) ===')
  reportRound('r16', Array.from({ length: 8 }, (_, i) => `r16_${i + 1}`), BRACKET_TEAM_PTS.r16, 'Octavos (R16)')

  console.log('\n=== CUARTOS (QF) ===')
  reportRound('qf', ['qf_1', 'qf_2', 'qf_3', 'qf_4'], BRACKET_TEAM_PTS.qf, 'Cuartos (QF)')

  console.log('\n=== SEMIFINAL (SF) ===')
  reportRound('sf', ['sf_1', 'sf_2'], BRACKET_TEAM_PTS.sf, 'Semifinal (SF)')

  // Final four (final + tercer puesto)
  console.log('\n=== FINAL Y TERCER PUESTO ===')
  const bmFinal = bracketMatches.find(m => m.id === 'final_1')
  const bmThird = bracketMatches.find(m => m.id === 'third_1')
  const aFF = new Set([bmFinal?.homeTeam, bmFinal?.awayTeam, bmThird?.homeTeam, bmThird?.awayTeam].filter(Boolean))
  const finalRow = { label: 'Final / 3er puesto', teamHits: null, teamTotal: null, teamPts: 0, pairHits: 0, pairTotal: 2, pairPts: 0 }
  if (aFF.size === 0) {
    console.log('  (ronda aún no definida)')
  } else {
    const pmFinal = predTeamMap['final_1']
    const pmThird = predTeamMap['third_1']
    const pFF = new Set([pmFinal?.homeTeam, pmFinal?.awayTeam, pmThird?.homeTeam, pmThird?.awayTeam].filter(Boolean))
    const aciertosFF = [...pFF].filter(t => aFF.has(t)).sort()
    console.log(`  Equipos reales en semifinales/final (4): ${[...aFF].sort().join(', ')}`)
    console.log(`  Aciertos equipo: ${aciertosFF.length} → ${aciertosFF.join(', ') || '(ninguno)'} (${aciertosFF.length} x ${BRACKET_TEAM_PTS.finalFour} = ${aciertosFF.length * BRACKET_TEAM_PTS.finalFour} pts)`)
    finalRow.teamHits = aciertosFF.length; finalRow.teamTotal = aFF.size; finalRow.teamPts = aciertosFF.length * BRACKET_TEAM_PTS.finalFour
    comparisons.push({
      label: 'Final / 3er puesto (4 equipos)',
      actualList: [...aFF].sort(),
      predictedList: [...pFF].sort(),
    })

    function pairsMatch(ph, pa, ah, aa) {
      if (!ph || !pa || !ah || !aa) return false
      return (ph === ah && pa === aa) || (ph === aa && pa === ah)
    }
    let pairHits = 0
    if (bmThird?.homeTeam && bmThird?.awayTeam) {
      const ok = pmThird?.homeTeam && pmThird?.awayTeam && pairsMatch(pmThird.homeTeam, pmThird.awayTeam, bmThird.homeTeam, bmThird.awayTeam)
      console.log(`  Llave 3er puesto: real ${bmThird.homeTeam} vs ${bmThird.awayTeam} | predicho ${pmThird?.homeTeam || '—'} vs ${pmThird?.awayTeam || '—'} | ${ok ? `✓ acierto (+${BRACKET_PAIRING_PTS.third} pts)` : '✗'}`)
      if (ok) { pairHits++; finalRow.pairPts += BRACKET_PAIRING_PTS.third }
    }
    if (bmFinal?.homeTeam && bmFinal?.awayTeam) {
      const ok = pmFinal?.homeTeam && pmFinal?.awayTeam && pairsMatch(pmFinal.homeTeam, pmFinal.awayTeam, bmFinal.homeTeam, bmFinal.awayTeam)
      console.log(`  Llave FINAL: real ${bmFinal.homeTeam} vs ${bmFinal.awayTeam} | predicho ${pmFinal?.homeTeam || '—'} vs ${pmFinal?.awayTeam || '—'} | ${ok ? `✓ acierto (+${BRACKET_PAIRING_PTS.final} pts)` : '✗'}`)
      if (ok) { pairHits++; finalRow.pairPts += BRACKET_PAIRING_PTS.final }
    }
    finalRow.pairHits = pairHits
  }
  phaseTable.push(finalRow)

  // Bonus
  console.log('\n=== BONUS (campeón / subcampeón / 3ro / 4to) ===')
  let bonusPts = 0
  if (bmFinal?.winner) {
    const predWinner = bracketPredictions.find(p => p.bracketMatchId === 'final_1')?.predictedWinner
    const pmFinal = predTeamMap['final_1']
    const champOk = predWinner && predWinner === bmFinal.winner
    console.log(`  Campeón real: ${bmFinal.winner} | predicho: ${predWinner || '—'} | ${champOk ? `✓ (+${BONUS_PTS.champion} pts)` : '✗'}`)
    if (champOk) bonusPts += BONUS_PTS.champion
    const actualRU = bmFinal.homeTeam === bmFinal.winner ? bmFinal.awayTeam : bmFinal.homeTeam
    const predRU = pmFinal?.homeTeam === predWinner ? pmFinal?.awayTeam : pmFinal?.homeTeam
    const ruOk = predRU && actualRU && predRU === actualRU
    console.log(`  Subcampeón real: ${actualRU} | predicho: ${predRU || '—'} | ${ruOk ? `✓ (+${BONUS_PTS.runnerUp} pts)` : '✗'}`)
    if (ruOk) bonusPts += BONUS_PTS.runnerUp
  } else {
    console.log('  Final aún no jugada')
  }
  if (bmThird?.winner) {
    const predWinner = bracketPredictions.find(p => p.bracketMatchId === 'third_1')?.predictedWinner
    const pmThird = predTeamMap['third_1']
    const thirdOk = predWinner && predWinner === bmThird.winner
    console.log(`  3er puesto real: ${bmThird.winner} | predicho: ${predWinner || '—'} | ${thirdOk ? `✓ (+${BONUS_PTS.thirdPlace} pts)` : '✗'}`)
    if (thirdOk) bonusPts += BONUS_PTS.thirdPlace
    const actualFourth = bmThird.homeTeam === bmThird.winner ? bmThird.awayTeam : bmThird.homeTeam
    const predFourth = pmThird?.homeTeam === predWinner ? pmThird?.awayTeam : pmThird?.homeTeam
    const fourthOk = predFourth && actualFourth && predFourth === actualFourth
    console.log(`  4to puesto real: ${actualFourth} | predicho: ${predFourth || '—'} | ${fourthOk ? `✓ (+${BONUS_PTS.fourthPlace} pts)` : '✗'}`)
    if (fourthOk) bonusPts += BONUS_PTS.fourthPlace
  } else {
    console.log('  Partido 3er puesto aún no jugado')
  }

  const bracketDetail = calcBracketScoreAll(pid, bracketMatches, bracketPredictions, matches, predictions)
  console.log(`\n>>> Puntos totales de bracket (llaves ${bracketDetail.ptsPairing} + equipos ${bracketDetail.ptsTeam} + bonus ${bracketDetail.ptsBonus}): ${bracketDetail.total} pts`)

  // ══════════════════ TABLA DE LLAVES (cruces) — real vs predicho, por slot ══════════════════
  console.log(`\n════════════════════════════════════════════════════════════════════════════`)
  console.log(`TABLA DE LLAVES (cruces) — real vs. lo que ${partRow.name} pronosticó`)
  console.log(`════════════════════════════════════════════════════════════════════════════`)

  function pairsMatchLoose(ph, pa, ah, aa) {
    if (!ph || !pa || !ah || !aa) return false
    return (ph === ah && pa === aa) || (ph === aa && pa === ah)
  }

  // Compara por CONJUNTO de llaves (igual que calcBracketScoreAll), no por slot/posición:
  // una llave predicha cuenta como acierto si ese cruce ocurrió en algún partido real de
  // la ronda, sin importar en qué posición del bracket haya caído cada uno.
  function printBracketRoundSet(round, ids) {
    const actualPairs = actualPairingsSet(round)
    const predictedPairsRaw = ids
      .map(id => predTeamMap[id])
      .filter(pm => pm?.homeTeam && pm?.awayTeam)
      .map(pm => [pm.homeTeam, pm.awayTeam].sort().join(' vs '))
    const actualList = [...actualPairs].map(k => k.split('|').join(' vs ')).sort()
    const predictedList = [...new Set(predictedPairsRaw)].sort()

    if (!actualList.length && !predictedList.length) {
      console.log('  (ronda aún no definida)')
      return
    }
    const maxLen = Math.max(actualList.length, predictedList.length)
    console.log(`  ${'LLAVE REAL'.padEnd(30)} | LLAVE PRONOSTICADA POR ${partRow.name.toUpperCase()}`)
    console.log(`  ${'-'.repeat(30)}-|-${'-'.repeat(34)}`)
    for (let i = 0; i < maxLen; i++) {
      const real = actualList[i] || ''
      const pred = predictedList[i] || ''
      const mark = pred ? (actualPairs.has(pred.split(' vs ').sort().join('|')) ? '✓' : '✗') : ' '
      console.log(`  ${real.padEnd(30)} | ${mark} ${pred}`)
    }
    const aciertos = predictedList.filter(p => actualPairs.has(p.split(' vs ').sort().join('|'))).length
    console.log(`  (${aciertos}/${predictedList.length} llaves pronosticadas SÍ ocurrieron realmente)`)
  }

  console.log('\n--- Dieciseisavos (R32) — 16 llaves ---')
  printBracketRoundSet('r32', Array.from({ length: 16 }, (_, i) => `r32_${i + 1}`))

  console.log('\n--- Octavos (R16) — 8 llaves ---')
  printBracketRoundSet('r16', Array.from({ length: 8 }, (_, i) => `r16_${i + 1}`))

  console.log('\n--- Cuartos (QF) — 4 llaves ---')
  printBracketRoundSet('qf', ['qf_1', 'qf_2', 'qf_3', 'qf_4'])

  console.log('\n--- Semifinal (SF) — 2 llaves ---')
  printBracketRoundSet('sf', ['sf_1', 'sf_2'])

  console.log('\n--- Tercer puesto ---')
  printBracketRoundSet('third', ['third_1'])

  console.log('\n--- Final ---')
  printBracketRoundSet('final', ['final_1'])

  // ══════════════════ TABLA CONSOLIDADA POR FASE ══════════════════
  console.log(`\n════════════════════════════════════════════════════════════════════════════`)
  console.log(`TABLA CONSOLIDADA — Puntos por fase / llave / equipos clasificados`)
  console.log(`════════════════════════════════════════════════════════════════════════════`)

  function fmtCell(hits, total) {
    if (hits === null || total === null) return 'n/a'
    return `${hits}/${total}`
  }

  console.log(`\nFASE                     | EQUIPOS CLASIF. (acierto/total → pts) | LLAVE (acierto/total → pts) | TOTAL FASE`)
  console.log(`--------------------------|----------------------------------------|------------------------------|----------`)
  console.log(`Grupos (marcador)         | n/a                                    | n/a                          | ${(stats.ptsExacto + stats.ptsResultado)} pts`)
  console.log(`Grupos (posición exacta)  | n/a                                    | n/a                          | ${totalOrdenGrupo} pts`)
  console.log(`Grupos → Dieciseisavos    | 24/32 → 48 pts                         | n/a                          | 48 pts`)
  phaseTable.forEach(r => {
    console.log(
      `${r.label.padEnd(25)} | ${fmtCell(r.teamHits, r.teamTotal).padEnd(8)} → ${String(r.teamPts).padStart(3)} pts`.padEnd(66) +
      ` | ${fmtCell(r.pairHits, r.pairTotal).padEnd(6)} → ${String(r.pairPts).padStart(3)} pts`.padEnd(31) +
      ` | ${r.teamPts + r.pairPts} pts`
    )
  })
  console.log(`Bonus (campeón/subcamp/3ro/4to) | —                                | —                            | ${bonusPts} pts`)

  console.log(`\nRESUMEN POR GRAN CATEGORÍA:`)
  console.log(`  Grupos (marcador + posición + clasificado): ${stats.ptsExacto + stats.ptsResultado + totalOrdenGrupo + 48} pts`)
  console.log(`  Bracket — puntos por LLAVE (pairing) total: ${bracketDetail.ptsPairing} pts`)
  console.log(`  Bracket — puntos por EQUIPO clasificado total: ${bracketDetail.ptsTeam} pts`)
  console.log(`  Bonus: ${bracketDetail.ptsBonus} pts`)

  // ══════════════════ TABLA COMPARATIVA: EQUIPOS REALES VS PREDICHOS POR FASE ══════════════════
  console.log(`\n════════════════════════════════════════════════════════════════════════════`)
  console.log(`TABLA COMPARATIVA — Equipos que REALMENTE pasaron vs. los que ${partRow.name} predijo`)
  console.log(`════════════════════════════════════════════════════════════════════════════`)
  comparisons.forEach(c => {
    const actualSet = new Set(c.actualList)
    const predictedSet = new Set(c.predictedList)
    const maxLen = Math.max(c.actualList.length, c.predictedList.length)
    console.log(`\n--- ${c.label} ---`)
    console.log(`${'REAL'.padEnd(22)} | ${'PREDICHO POR ' + partRow.name.toUpperCase()}`)
    console.log(`${'-'.repeat(22)}-|-${'-'.repeat(30)}`)
    for (let i = 0; i < maxLen; i++) {
      const real = c.actualList[i] || ''
      const pred = c.predictedList[i] || ''
      const predMark = pred ? (actualSet.has(pred) ? '✓' : '✗') : ' '
      console.log(`${real.padEnd(22)} | ${predMark} ${pred}`)
    }
    const aciertos = c.predictedList.filter(t => actualSet.has(t)).length
    console.log(`(${aciertos}/${c.predictedList.length} equipos predichos SÍ están en la lista real)`)
  })

  console.log(`\n════════════════════════════════════════`)
  console.log(`TOTAL OFICIAL EN TABLA: ${stats.total} pts`)
  console.log(`  Grupos (exacto+resultado): ${stats.ptsExacto + stats.ptsResultado}`)
  console.log(`  Clasificación/standings: ${stats.ptsStandings}`)
  console.log(`  Bracket: ${stats.ptsBracket}`)
  console.log(`  Goleador: ${stats.ptsScorers}`)
}

main().catch(err => { console.error(err); process.exit(1) })
