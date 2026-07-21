/**
 * Verificación estructural (paso 4 del plan Copa América) con datos sintéticos:
 * confirma que el formato de 4 grupos + bracket de 4 rondas (Cuartos→Semis→
 * Tercer Lugar/Final) funciona de punta a punta — fixture de grupos, mapeo de
 * clasificados a Cuartos (cruce 1A-2B/1B-2A/1C-2D/1D-2C), propagación de
 * ganadores/perdedores hasta Semis→Tercer Lugar/Final (cruce adyacente
 * qf_1+qf_2→sf_1, qf_3+qf_4→sf_2), y el cálculo de puntaje, sin usar datos
 * reales de Supabase (el torneo aún no existe).
 * Ejecutar: node scripts/verify-copa-america-format.mjs
 */
import {
  GROUP_LETTERS, DEFAULT_GROUPS, generateGroupMatches, generateBracketMatches,
  BRACKET_ROUNDS, QUALIFIER_RULES, TOTAL_QUALIFIERS, TOTAL_GROUP_MATCHES,
  QF_BRACKET_MAP, SF_FROM_QF, BRACKET_PAIRING_PTS, BRACKET_TEAM_PTS,
} from '../src/data/initialData.js'
import {
  calcGroupStandings, calcR32Qualifiers, calcPredictedBracketTeams, calcBracketScoreAll,
} from '../src/utils/scoring.js'

let failures = 0
function check(desc, cond) {
  console.log(`${cond ? '✅' : '❌'} ${desc}`)
  if (!cond) failures++
}

// ── 1. Formato base ─────────────────────────────────────────────────────────
check('4 grupos (A-D)', JSON.stringify(GROUP_LETTERS) === JSON.stringify(['A', 'B', 'C', 'D']))
check('TOTAL_GROUP_MATCHES = 24 (4 grupos x 6)', TOTAL_GROUP_MATCHES === 24)
check('TOTAL_QUALIFIERS = 8 (sin mejores terceros)', TOTAL_QUALIFIERS === 8)
check('bestThirds = 0', QUALIFIER_RULES.bestThirds === 0)
check('BRACKET_ROUNDS = [qf, sf, third, final]', JSON.stringify(BRACKET_ROUNDS.map(r => r.id)) === JSON.stringify(['qf', 'sf', 'third', 'final']))

// ── 2. Equipos sintéticos por grupo ─────────────────────────────────────────
const teams = {
  A: ['A1', 'A2', 'A3', 'A4'],
  B: ['B1', 'B2', 'B3', 'B4'],
  C: ['C1', 'C2', 'C3', 'C4'],
  D: ['D1', 'D2', 'D3', 'D4'],
}
const groupMatchesRaw = generateGroupMatches(teams)
check(`generateGroupMatches produce ${groupMatchesRaw.length} partidos (esperado 24)`, groupMatchesRaw.length === 24)

// Resultados: en cada grupo, el equipo "1" gana todo, el "2" le gana a "3" y "4", el "3" le gana a "4".
// Standings esperados: 1°=X1, 2°=X2 en cada grupo.
function scoreMatch(m) {
  const rank = t => Number(t.slice(1))
  const rH = rank(m.homeTeam), rA = rank(m.awayTeam)
  return rH < rA ? { homeScore: 2, awayScore: 0 } : { homeScore: 0, awayScore: 2 }
}
const matches = groupMatchesRaw.map(m => ({ ...m, ...scoreMatch(m), status: 'finished' }))

GROUP_LETTERS.forEach(g => {
  const standings = calcGroupStandings(matches, g)
  const names = standings.map(t => t.name)
  check(`Grupo ${g}: 1°=${g}1, 2°=${g}2 (real: ${names.join(',')})`, names[0] === `${g}1` && names[1] === `${g}2`)
})

// ── 3. Clasificados y cruce de Cuartos ──────────────────────────────────────
const qualifiers = calcR32Qualifiers(matches)
check('Sin slots t1..tN (bestThirds=0)', !Object.keys(qualifiers).some(k => k.startsWith('t')))
check('8 clasificados en total', Object.keys(qualifiers).length === 8)

const bracketMatches = generateBracketMatches().map(bm => ({ ...bm }))
check(`generateBracketMatches produce ${bracketMatches.length} llaves (esperado 8: 4+2+1+1)`, bracketMatches.length === 8)

QF_BRACKET_MAP.forEach(({ pos, home, away }) => {
  const bm = bracketMatches.find(m => m.id === `qf_${pos}`)
  bm.homeTeam = qualifiers[home]
  bm.awayTeam = qualifiers[away]
})
check('qf_1 = A1 vs B2 (cruce 1A-2B)', bracketMatches.find(m => m.id === 'qf_1').homeTeam === 'A1' && bracketMatches.find(m => m.id === 'qf_1').awayTeam === 'B2')
check('qf_2 = B1 vs A2 (cruce 1B-2A)', bracketMatches.find(m => m.id === 'qf_2').homeTeam === 'B1' && bracketMatches.find(m => m.id === 'qf_2').awayTeam === 'A2')
check('qf_3 = C1 vs D2 (cruce 1C-2D)', bracketMatches.find(m => m.id === 'qf_3').homeTeam === 'C1' && bracketMatches.find(m => m.id === 'qf_3').awayTeam === 'D2')
check('qf_4 = D1 vs C2 (cruce 1D-2C)', bracketMatches.find(m => m.id === 'qf_4').homeTeam === 'D1' && bracketMatches.find(m => m.id === 'qf_4').awayTeam === 'C2')

// ── 4. Simular resultados reales: gana el "N°" más bajo (1° de grupo le gana
// a 2° de grupo); si empatan en N°, desempata el grupo (A < B < C < D) ──────
function winnerOf(h, a) {
  const num = t => Number(t.slice(1))
  const letter = t => t.charCodeAt(0)
  if (num(h) !== num(a)) return num(h) < num(a) ? h : a
  return letter(h) <= letter(a) ? h : a
}
bracketMatches.forEach(bm => {
  bm.status = 'finished'
  if (bm.round === 'qf') {
    bm.winner = winnerOf(bm.homeTeam, bm.awayTeam)
  }
})
// Propagar SF (adyacente: qf_1+qf_2 -> sf_1, qf_3+qf_4 -> sf_2)
SF_FROM_QF.forEach(([id1, id2], i) => {
  const m1 = bracketMatches.find(m => m.id === id1)
  const m2 = bracketMatches.find(m => m.id === id2)
  const sf = bracketMatches.find(m => m.id === `sf_${i + 1}`)
  sf.homeTeam = m1.winner
  sf.awayTeam = m2.winner
  sf.winner = winnerOf(sf.homeTeam, sf.awayTeam)
})
check('sf_1 = A1 vs B1 (ganadores de qf_1+qf_2)', bracketMatches.find(m => m.id === 'sf_1').homeTeam === 'A1' && bracketMatches.find(m => m.id === 'sf_1').awayTeam === 'B1')
check('sf_2 = C1 vs D1 (ganadores de qf_3+qf_4)', bracketMatches.find(m => m.id === 'sf_2').homeTeam === 'C1' && bracketMatches.find(m => m.id === 'sf_2').awayTeam === 'D1')

const sf1 = bracketMatches.find(m => m.id === 'sf_1')
const sf2 = bracketMatches.find(m => m.id === 'sf_2')
const third = bracketMatches.find(m => m.id === 'third_1')
const final = bracketMatches.find(m => m.id === 'final_1')
third.homeTeam = sf1.homeTeam === sf1.winner ? sf1.awayTeam : sf1.homeTeam
third.awayTeam = sf2.homeTeam === sf2.winner ? sf2.awayTeam : sf2.homeTeam
third.winner = winnerOf(third.homeTeam, third.awayTeam)
final.homeTeam = sf1.winner
final.awayTeam = sf2.winner
final.winner = winnerOf(final.homeTeam, final.awayTeam)
check('final = A1 vs C1', final.homeTeam === 'A1' && final.awayTeam === 'C1')
check('third = B1 vs D1 (perdedores de semis)', third.homeTeam === 'B1' && third.awayTeam === 'D1')

// ── 5. Pronósticos de un participante que acierta TODO ──────────────────────
const pid = 'test_participant'
const predictions = matches.map(m => ({ participantId: pid, matchId: m.id, homeScore: m.homeScore, awayScore: m.awayScore }))
const bracketPredictions = bracketMatches.map(bm => ({ participantId: pid, bracketMatchId: bm.id, predictedWinner: bm.winner }))

const predTeamMap = calcPredictedBracketTeams(matches, predictions, bracketPredictions, pid, bracketMatches)
check('predTeamMap.qf_1 coincide con el real', predTeamMap.qf_1.homeTeam === 'A1' && predTeamMap.qf_1.awayTeam === 'B2')
check('predTeamMap.sf_1 coincide con el real (adyacente, no salteado)', predTeamMap.sf_1.homeTeam === 'A1' && predTeamMap.sf_1.awayTeam === 'B1')
check('predTeamMap.final_1 coincide con el real', predTeamMap.final_1.homeTeam === 'A1' && predTeamMap.final_1.awayTeam === 'C1')
check('predTeamMap.third_1 coincide con el real', predTeamMap.third_1.homeTeam === 'B1' && predTeamMap.third_1.awayTeam === 'D1')

const score = calcBracketScoreAll(pid, bracketMatches, bracketPredictions, matches, predictions)
const maxPairing = BRACKET_PAIRING_PTS.qf * 4 + BRACKET_PAIRING_PTS.sf * 2 + BRACKET_PAIRING_PTS.third + BRACKET_PAIRING_PTS.final
// sf: 4 equipos (2 llaves x 2); final+third: 4 equipos (2 finalistas + 2 de 3er puesto)
const maxTeam = BRACKET_TEAM_PTS.sf * 4 + BRACKET_TEAM_PTS.finalFour * 4
check(`ptsPairing = máximo posible (${maxPairing}) al acertar todas las llaves`, score.ptsPairing === maxPairing)
check(`ptsTeam = máximo posible (${maxTeam}) al acertar todos los equipos`, score.ptsTeam === maxTeam)
check('ptsBonus incluye campeón (15) ya que acertó el campeón', score.ptsBonus >= 15)

console.log(`\n${failures === 0 ? '✅ Todo correcto' : `❌ ${failures} fallo(s)`} — formato Copa América funciona de punta a punta.`)
process.exit(failures === 0 ? 0 : 1)
