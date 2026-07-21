/**
 * Recalcula el puntaje de bracket de todos los participantes tras corregir el
 * bug de "pairing lineal" en calcPredictedBracketTeams (scoring.js), que armaba
 * los cruces de Octavos/Cuartos/Semis de los PRONÓSTICOS por posición secuencial
 * (r32_1+r32_2→r16_1, etc.) en vez de usar el fixture oficial FIFA 2026
 * (R16_FROM_R32 / QF_FROM_R16 / SF_FROM_QF), que es el que sí se usa para
 * propagar el bracket REAL del admin.
 *
 * Compara el puntaje ANTES (lógica vieja, reimplementada acá tal cual estaba)
 * vs DESPUÉS (lógica ya corregida en src/utils/scoring.js) para los 77
 * participantes de ambas pollas.
 *
 * Ejecutar: node scripts/recalc-fixture-fix.mjs
 */
import { createClient } from '@supabase/supabase-js'
import {
  calcGroupScore, calcGroupStandings, calcPredictedGroupStandings,
  calcStandingsScore, calcClasificadoScore, calcScorerScore,
  calcParticipantStats, calcBracketScoreAll,
} from '../src/utils/scoring.js'
import { GROUP_LETTERS, DEFAULT_PTS, BRACKET_PAIRING_PTS, BRACKET_TEAM_PTS, BONUS_PTS, R32_BRACKET_MAP } from '../src/data/initialData.js'
import { calcPredictedR32Qualifiers } from '../src/utils/scoring.js'

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

// ─── Reimplementación EXACTA de la lógica vieja (buggy) que había en scoring.js
// antes de la corrección, para poder comparar contra la nueva ──────────────────
function calcPredictedBracketTeamsOLD(matches, predictions, bracketPredictions, participantId, adminBracket = []) {
  const qualifiers = calcPredictedR32Qualifiers(matches, predictions, participantId)
  const teamMap = {}

  R32_BRACKET_MAP.forEach(({ pos, home, away }) => {
    const admin = adminBracket.find(m => m.id === `r32_${pos}`)
    teamMap[`r32_${pos}`] = {
      homeTeam: qualifiers[home] || admin?.homeTeam || '',
      awayTeam: qualifiers[away] || admin?.awayTeam || '',
    }
  })

  function getPredWinner(matchId) {
    const pred = bracketPredictions.find(p => p.participantId === participantId && p.bracketMatchId === matchId)
    if (!pred?.predictedWinner) return ''
    const teams = teamMap[matchId]
    if (!teams || (!teams.homeTeam && !teams.awayTeam)) return ''
    if ((teams.homeTeam && teams.homeTeam === pred.predictedWinner) || (teams.awayTeam && teams.awayTeam === pred.predictedWinner)) {
      return pred.predictedWinner
    }
    return ''
  }
  function getLoser(matchId) {
    const winner = getPredWinner(matchId)
    if (!winner) return ''
    const teams = teamMap[matchId]
    return teams.homeTeam === winner ? teams.awayTeam : teams.homeTeam
  }

  // BUG: pairing lineal secuencial en vez del fixture oficial FIFA
  for (let pos = 1; pos <= 8; pos++) {
    teamMap[`r16_${pos}`] = { homeTeam: getPredWinner(`r32_${pos * 2 - 1}`), awayTeam: getPredWinner(`r32_${pos * 2}`) }
  }
  for (let pos = 1; pos <= 4; pos++) {
    teamMap[`qf_${pos}`] = { homeTeam: getPredWinner(`r16_${pos * 2 - 1}`), awayTeam: getPredWinner(`r16_${pos * 2}`) }
  }
  for (let pos = 1; pos <= 2; pos++) {
    teamMap[`sf_${pos}`] = { homeTeam: getPredWinner(`qf_${pos * 2 - 1}`), awayTeam: getPredWinner(`qf_${pos * 2}`) }
  }
  teamMap['third_1'] = { homeTeam: getLoser('sf_1'), awayTeam: getLoser('sf_2') }
  teamMap['final_1'] = { homeTeam: getPredWinner('sf_1'), awayTeam: getPredWinner('sf_2') }

  return teamMap
}

function calcBracketScoreAllOLD(participantId, bracketMatches, bracketPredictions, matches, predictions) {
  let ptsPairing = 0, ptsTeam = 0, ptsBonus = 0
  const predTeamMap = calcPredictedBracketTeamsOLD(matches, predictions, bracketPredictions, participantId, bracketMatches)

  function pairsMatch(ph, pa, ah, aa) {
    if (!ph || !pa || !ah || !aa) return false
    return (ph === ah && pa === aa) || (ph === aa && pa === ah)
  }
  function actualTeamsSet(round) {
    return new Set(bracketMatches.filter(m => m.round === round).flatMap(m => [m.homeTeam, m.awayTeam]).filter(Boolean))
  }
  function predTeamsSet(ids) {
    return new Set(ids.flatMap(id => [predTeamMap[id]?.homeTeam, predTeamMap[id]?.awayTeam]).filter(Boolean))
  }
  function actualPairingsSet(round) {
    const s = new Set()
    bracketMatches.filter(m => m.round === round && m.homeTeam && m.awayTeam).forEach(m => s.add([m.homeTeam, m.awayTeam].sort().join('|')))
    return s
  }

  const r32ActualPairings = actualPairingsSet('r32')
  const r32UsedPairings = new Set()
  for (let i = 1; i <= 16; i++) {
    const pm = predTeamMap[`r32_${i}`]
    if (!pm?.homeTeam || !pm?.awayTeam) continue
    const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
    if (r32ActualPairings.has(key) && !r32UsedPairings.has(key)) { ptsPairing += BRACKET_PAIRING_PTS.r32; r32UsedPairings.add(key) }
  }

  const aR16 = actualTeamsSet('r16')
  if (aR16.size > 0) {
    const pR16 = predTeamsSet(Array.from({ length: 8 }, (_, i) => `r16_${i + 1}`))
    for (const t of pR16) if (aR16.has(t)) ptsTeam += BRACKET_TEAM_PTS.r16
    const r16ActualPairings = actualPairingsSet('r16')
    const r16UsedPairings = new Set()
    for (let i = 1; i <= 8; i++) {
      const pm = predTeamMap[`r16_${i}`]
      if (!pm?.homeTeam || !pm?.awayTeam) continue
      const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
      if (r16ActualPairings.has(key) && !r16UsedPairings.has(key)) { ptsPairing += BRACKET_PAIRING_PTS.r16; r16UsedPairings.add(key) }
    }
  }

  const aQF = actualTeamsSet('qf')
  if (aQF.size > 0) {
    const pQF = predTeamsSet(['qf_1', 'qf_2', 'qf_3', 'qf_4'])
    for (const t of pQF) if (aQF.has(t)) ptsTeam += BRACKET_TEAM_PTS.qf
    const qfActualPairings = actualPairingsSet('qf')
    const qfUsedPairings = new Set()
    for (let i = 1; i <= 4; i++) {
      const pm = predTeamMap[`qf_${i}`]
      if (!pm?.homeTeam || !pm?.awayTeam) continue
      const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
      if (qfActualPairings.has(key) && !qfUsedPairings.has(key)) { ptsPairing += BRACKET_PAIRING_PTS.qf; qfUsedPairings.add(key) }
    }
  }

  const aSF = actualTeamsSet('sf')
  if (aSF.size > 0) {
    const pSF = predTeamsSet(['sf_1', 'sf_2'])
    for (const t of pSF) if (aSF.has(t)) ptsTeam += BRACKET_TEAM_PTS.sf
    const sfActualPairings = actualPairingsSet('sf')
    const sfUsedPairings = new Set()
    for (let i = 1; i <= 2; i++) {
      const pm = predTeamMap[`sf_${i}`]
      if (!pm?.homeTeam || !pm?.awayTeam) continue
      const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
      if (sfActualPairings.has(key) && !sfUsedPairings.has(key)) { ptsPairing += BRACKET_PAIRING_PTS.sf; sfUsedPairings.add(key) }
    }
  }

  const bmFinal = bracketMatches.find(m => m.id === 'final_1')
  const bmThird = bracketMatches.find(m => m.id === 'third_1')
  const aFinalTeams = new Set([bmFinal?.homeTeam, bmFinal?.awayTeam].filter(Boolean))
  const aThirdTeams = new Set([bmThird?.homeTeam, bmThird?.awayTeam].filter(Boolean))
  if (aFinalTeams.size > 0 || aThirdTeams.size > 0) {
    const pmFinal = predTeamMap['final_1']
    const pmThird = predTeamMap['third_1']
    const pFinalTeams = new Set([pmFinal?.homeTeam, pmFinal?.awayTeam].filter(Boolean))
    const pThirdTeams = new Set([pmThird?.homeTeam, pmThird?.awayTeam].filter(Boolean))
    for (const t of pFinalTeams) if (aFinalTeams.has(t)) ptsTeam += BRACKET_TEAM_PTS.finalFour
    for (const t of pThirdTeams) if (aThirdTeams.has(t)) ptsTeam += BRACKET_TEAM_PTS.finalFour
    if (bmThird?.homeTeam && bmThird?.awayTeam && pmThird?.homeTeam && pmThird?.awayTeam)
      if (pairsMatch(pmThird.homeTeam, pmThird.awayTeam, bmThird.homeTeam, bmThird.awayTeam)) ptsPairing += BRACKET_PAIRING_PTS.third
    if (bmFinal?.homeTeam && bmFinal?.awayTeam && pmFinal?.homeTeam && pmFinal?.awayTeam)
      if (pairsMatch(pmFinal.homeTeam, pmFinal.awayTeam, bmFinal.homeTeam, bmFinal.awayTeam)) ptsPairing += BRACKET_PAIRING_PTS.final
  }

  if (bmFinal?.winner) {
    const predWinner = bracketPredictions.find(p => p.participantId === participantId && p.bracketMatchId === 'final_1')?.predictedWinner
    const pmFinal = predTeamMap['final_1']
    if (predWinner && predWinner === bmFinal.winner) ptsBonus += BONUS_PTS.champion
    const actualRU = bmFinal.homeTeam === bmFinal.winner ? bmFinal.awayTeam : bmFinal.homeTeam
    const predRU = pmFinal?.homeTeam === predWinner ? pmFinal?.awayTeam : pmFinal?.homeTeam
    if (predRU && actualRU && predRU === actualRU) ptsBonus += BONUS_PTS.runnerUp
  }
  if (bmThird?.winner) {
    const predWinner = bracketPredictions.find(p => p.participantId === participantId && p.bracketMatchId === 'third_1')?.predictedWinner
    const pmThird = predTeamMap['third_1']
    if (predWinner && predWinner === bmThird.winner) ptsBonus += BONUS_PTS.thirdPlace
    const actualFourth = bmThird.homeTeam === bmThird.winner ? bmThird.awayTeam : bmThird.homeTeam
    const predFourth = pmThird?.homeTeam === predWinner ? pmThird?.awayTeam : pmThird?.homeTeam
    if (predFourth && actualFourth && predFourth === actualFourth) ptsBonus += BONUS_PTS.fourthPlace
  }

  return { ptsPairing, ptsTeam, ptsBonus, total: ptsPairing + ptsTeam + ptsBonus }
}

function calcParticipantStatsOLD(pid, matches, predictions, bracketMatches, bracketPredictions, topScorers, scorerPredictions, config) {
  let ptsExacto = 0, ptsResultado = 0
  const finishedGroups = matches.filter(m => m.status === 'finished' && m.phase === 'groups')
  for (const match of finishedGroups) {
    const pred = predictions.find(pr => pr.participantId === pid && pr.matchId === match.id)
    const score = calcGroupScore(pred, match, config)
    if (score === (config?.pts?.exacto ?? DEFAULT_PTS.exacto)) ptsExacto += score
    else if (score > 0) ptsResultado += score
  }
  let ptsStandings = 0
  for (const group of GROUP_LETTERS) {
    const groupMatches = matches.filter(m => m.group === group && m.phase === 'groups')
    if (!groupMatches.length) continue
    const allFinished = groupMatches.every(m => m.homeScore !== null && m.awayScore !== null)
    if (!allFinished) continue
    const actual = calcGroupStandings(matches, group).map(t => t.name)
    const predicted = calcPredictedGroupStandings(matches, predictions, pid, group).map(t => t.name)
    if (!actual.length || !predicted.length) continue
    ptsStandings += calcStandingsScore(predicted, actual, config)
  }
  ptsStandings += calcClasificadoScore(matches, predictions, pid, config)

  const { total: bracketTotal } = calcBracketScoreAllOLD(pid, bracketMatches, bracketPredictions, matches, predictions)

  let ptsScorers = 0
  if (topScorers && topScorers.some(s => s)) {
    const pred = (scorerPredictions || []).find(pr => pr.participantId === pid)
    ptsScorers += calcScorerScore(pred?.scorers, topScorers, config)
  }

  return {
    ptsExacto, ptsResultado, ptsBracket: bracketTotal, ptsStandings, ptsScorers,
    total: ptsExacto + ptsResultado + bracketTotal + ptsStandings + ptsScorers,
  }
}

async function main() {
  const { data: configRows } = await supabase.from('config').select('pollas, pts').limit(1)
  const configRow = configRows?.[0] || {}
  const config = { pts: { ...DEFAULT_PTS, ...(configRow.pts || {}) } }
  const pollas = Array.isArray(configRow.pollas) ? configRow.pollas : []

  const partRows = await fetchAll('participants')
  const matchRows = await fetchAll('matches')
  const bmRows = await fetchAll('bracket_matches')
  const scorerRows = await fetchAll('scorer_predictions')
  const { data: topScorerRow } = await supabase.from('top_scorers').select('*').eq('id', 1).single()
  const topScorers = topScorerRow?.scorers || ['', '', '']
  const scorerPredictions = scorerRows.map(r => ({ participantId: r.participant_id, scorers: r.scorers }))

  const allPredRows = await fetchAll('predictions')
  const allBpRows = await fetchAll('bracket_predictions')

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

  console.log(`Participantes: ${partRows.length} | Pollas: ${pollas.map(p => p.name).join(', ')}\n`)

  const jsonOutput = { generatedAt: new Date().toISOString(), pollas: [] }

  for (const polla of pollas) {
    const participantsInPolla = partRows.filter(p => p.polla_id === polla.id)
    const rows = []

    for (const part of participantsInPolla) {
      const predictions = allPredRows
        .filter(r => r.participant_id === part.id)
        .map(r => ({ participantId: r.participant_id, matchId: r.match_id, homeScore: r.home_score, awayScore: r.away_score }))
      const bracketPredictions = allBpRows
        .filter(r => r.participant_id === part.id)
        .map(r => ({ participantId: r.participant_id, bracketMatchId: r.bracket_match_id, ...decodeBracketPred(r.predicted_winner) }))

      const oldStats = calcParticipantStatsOLD(part.id, matches, predictions, bracketMatches, bracketPredictions, topScorers, scorerPredictions, config)
      const newStats = calcParticipantStats(part.id, matches, predictions, bracketMatches, bracketPredictions, null, null, topScorers, scorerPredictions, config)

      rows.push({
        id: part.id, name: part.name,
        oldTotal: oldStats.total, oldBracket: oldStats.ptsBracket,
        newTotal: newStats.total, newBracket: newStats.ptsBracket,
        delta: newStats.total - oldStats.total,
      })
    }

    rows.sort((a, b) => b.oldTotal - a.oldTotal)
    rows.forEach((r, i) => { r.oldPos = i + 1 })
    rows.sort((a, b) => b.newTotal - a.newTotal)
    rows.forEach((r, i) => { r.newPos = i + 1 })

    console.log(`\n=== ${polla.name} (${rows.length} participantes) ===`)
    console.log('Pos.new Pos.old  Nombre                          Bracket.old Bracket.new  Total.old Total.new  Delta')
    rows.forEach(r => {
      const posChange = r.oldPos - r.newPos
      const posStr = posChange === 0 ? '   =' : posChange > 0 ? `  ↑${posChange}` : `  ↓${-posChange}`
      console.log(
        `${String(r.newPos).padStart(3)}    ${String(r.oldPos).padStart(3)}${posStr.padEnd(6)} ${r.name.padEnd(32)}`
        + `${String(r.oldBracket).padStart(9)}  ${String(r.newBracket).padStart(9)}  `
        + `${String(r.oldTotal).padStart(9)} ${String(r.newTotal).padStart(9)}  ${r.delta >= 0 ? '+' : ''}${r.delta}`
      )
    })

    const changed = rows.filter(r => r.delta !== 0)
    console.log(`\n${changed.length}/${rows.length} participantes cambiaron de puntaje en ${polla.name}.`)
    const posChanged = rows.filter(r => r.oldPos !== r.newPos)
    console.log(`${posChanged.length}/${rows.length} cambiaron de posición en el ranking.`)

    jsonOutput.pollas.push({ id: polla.id, name: polla.name, rows })
  }

  if (process.argv.includes('--json')) {
    const fs = await import('fs')
    const outPath = process.argv[process.argv.indexOf('--json') + 1]
    fs.writeFileSync(outPath, JSON.stringify(jsonOutput, null, 2))
  }
}

main().catch(err => { console.error(err); process.exit(1) })
