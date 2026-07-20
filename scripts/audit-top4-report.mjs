/**
 * Auditoría detallada fase por fase para el Top 4 de cada polla.
 * Genera un JSON con: por participante, por fase (grupos partido-a-partido,
 * posición de grupo, clasificados a dieciseisavos, R32/R16/QF/SF llaves y
 * equipos, final+tercer puesto, bonus), comparando real vs pronóstico.
 * Ejecutar: node scripts/audit-top4-report.mjs > scratchpad/audit-top4.json
 */
import { createClient } from '@supabase/supabase-js'
import {
  calcGroupScore, calcGroupStandings, calcPredictedGroupStandings,
  calcStandingsScore, calcR32Qualifiers, calcPredictedR32Qualifiers,
  calcPredictedBracketTeams, calcBracketScoreAll, calcParticipantStats, calcScorerScore,
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

function actualTeamsSet(bracketMatches, round) {
  return new Set(bracketMatches.filter(m => m.round === round).flatMap(m => [m.homeTeam, m.awayTeam]).filter(Boolean))
}
function actualPairingsSet(bracketMatches, round) {
  const s = new Set()
  bracketMatches.filter(m => m.round === round && m.homeTeam && m.awayTeam)
    .forEach(m => s.add([m.homeTeam, m.awayTeam].sort().join('|')))
  return s
}

function buildRoundDetail(round, ids, teamPts, pairPts, bracketMatches, predTeamMap) {
  const actualTeams = actualTeamsSet(bracketMatches, round)
  const actualPairs = actualPairingsSet(bracketMatches, round)

  // Llaves: real (de bracketMatches) vs predicho (predTeamMap), emparejadas por posición para mostrar en tabla
  const realMatches = bracketMatches.filter(m => m.round === round)
  const pairs = ids.map((id, i) => {
    const pm = predTeamMap[id]
    const real = realMatches[i] || null
    const predKey = pm?.homeTeam && pm?.awayTeam ? [pm.homeTeam, pm.awayTeam].sort().join('|') : null
    const pairHit = predKey ? actualPairs.has(predKey) : false
    return {
      id,
      realHome: real?.homeTeam || null,
      realAway: real?.awayTeam || null,
      predHome: pm?.homeTeam || null,
      predAway: pm?.awayTeam || null,
      pairHit,
    }
  })

  const teamHits = []
  for (const id of ids) {
    const pm = predTeamMap[id]
    for (const t of [pm?.homeTeam, pm?.awayTeam].filter(Boolean)) {
      if (actualTeams.has(t) && !teamHits.includes(t)) teamHits.push(t)
    }
  }
  const predTeamsAll = new Set(ids.flatMap(id => [predTeamMap[id]?.homeTeam, predTeamMap[id]?.awayTeam]).filter(Boolean))
  const teamMisses = [...predTeamsAll].filter(t => !actualTeams.has(t))

  const pairHitsList = []
  const used = new Set()
  for (const id of ids) {
    const pm = predTeamMap[id]
    if (!pm?.homeTeam || !pm?.awayTeam) continue
    const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
    if (actualPairs.has(key) && !used.has(key)) { pairHitsList.push(key); used.add(key) }
  }

  return {
    round,
    actualTeams: [...actualTeams].sort(),
    teamHits: teamHits.sort(),
    teamMisses: teamMisses.sort(),
    teamPts: teamHits.length * teamPts,
    teamPtsUnit: teamPts,
    pairHits: pairHitsList,
    pairPts: pairHitsList.length * pairPts,
    pairPtsUnit: pairPts,
    pairs,
  }
}

async function buildParticipantAudit(part, matches, bracketMatches, config, topScorers, scorerPredictions) {
  const pid = part.id
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

  const stats = calcParticipantStats(
    pid, matches, predictions, bracketMatches, bracketPredictions, null, null, topScorers, scorerPredictions, config
  )

  // ── GOLEADOR ──
  const scorerPred = (scorerPredictions || []).find(s => s.participantId === pid)
  const predScorer = scorerPred?.scorers?.[0] || null
  const scorerHit = !!(topScorers && topScorers.some(s => s) && predScorer && topScorers.includes(predScorer))
  const scorerDetail = {
    predicted: predScorer,
    actualTop: (topScorers || []).filter(Boolean),
    hit: scorerHit,
    pts: calcScorerScore(scorerPred?.scorers, topScorers, config),
    ptsUnit: config?.pts?.goleador ?? DEFAULT_PTS.goleador,
  }

  // ── FASE GRUPOS: partido por partido ──
  const groupMatches = matches.filter(m => m.phase === 'groups')
  const finishedGroups = groupMatches.filter(m => m.status === 'finished')
  const groupDetail = finishedGroups.map(m => {
    const pred = predictions.find(p => p.matchId === m.id)
    const score = calcGroupScore(pred, m, config)
    return {
      matchId: m.id, group: m.group,
      homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      realHome: m.homeScore, realAway: m.awayScore,
      predHome: pred?.homeScore ?? null, predAway: pred?.awayScore ?? null,
      pts: score,
      kind: score === DEFAULT_PTS.exacto ? 'exacto' : score > 0 ? 'resultado' : 'fallo',
    }
  })
  const ptsExacto = groupDetail.filter(d => d.kind === 'exacto').reduce((s, d) => s + d.pts, 0)
  const ptsResultado = groupDetail.filter(d => d.kind === 'resultado').reduce((s, d) => s + d.pts, 0)

  // ── POSICIÓN EXACTA EN TABLA DE GRUPO ──
  const standingsDetail = []
  let ptsPosicion = 0
  for (const group of GROUP_LETTERS) {
    const gm = matches.filter(m => m.group === group && m.phase === 'groups')
    if (!gm.length) continue
    const allFinished = gm.every(m => m.homeScore !== null && m.awayScore !== null)
    const actual = allFinished ? calcGroupStandings(matches, group).map(t => t.name) : []
    const predicted = calcPredictedGroupStandings(matches, predictions, pid, group).map(t => t.name)
    const score = allFinished ? calcStandingsScore(predicted, actual, config) : 0
    ptsPosicion += score
    standingsDetail.push({ group, allFinished, actual, predicted, pts: score })
  }

  // ── CLASIFICADOS A DIECISEISAVOS (32) — "32avos" ──
  const allGroupsFinished = groupMatches.length > 0 && groupMatches.every(m => m.homeScore !== null && m.awayScore !== null)
  let clasificadoDetail = null
  if (allGroupsFinished) {
    const actualQ = calcR32Qualifiers(matches)
    const predQ = calcPredictedR32Qualifiers(matches, predictions, pid)
    const actualSet = new Set(Object.values(actualQ).filter(Boolean))
    const predSet = new Set(Object.values(predQ).filter(Boolean))
    const hits = [...predSet].filter(t => actualSet.has(t)).sort()
    const misses = [...predSet].filter(t => !actualSet.has(t)).sort()
    clasificadoDetail = {
      actual: [...actualSet].sort(), predicted: [...predSet].sort(),
      hits, misses, pts: hits.length * DEFAULT_PTS.clasificado, ptsUnit: DEFAULT_PTS.clasificado,
    }
  }

  // ── BRACKET POR RONDA ──
  const predTeamMap = calcPredictedBracketTeams(matches, predictions, bracketPredictions, pid, bracketMatches)

  const r32 = buildRoundDetail('r32', Array.from({ length: 16 }, (_, i) => `r32_${i + 1}`), 0, BRACKET_PAIRING_PTS.r32, bracketMatches, predTeamMap)
  const r16 = buildRoundDetail('r16', Array.from({ length: 8 }, (_, i) => `r16_${i + 1}`), BRACKET_TEAM_PTS.r16, BRACKET_PAIRING_PTS.r16, bracketMatches, predTeamMap)
  const qf  = buildRoundDetail('qf',  ['qf_1', 'qf_2', 'qf_3', 'qf_4'], BRACKET_TEAM_PTS.qf, BRACKET_PAIRING_PTS.qf, bracketMatches, predTeamMap)
  const sf  = buildRoundDetail('sf',  ['sf_1', 'sf_2'], BRACKET_TEAM_PTS.sf, BRACKET_PAIRING_PTS.sf, bracketMatches, predTeamMap)

  // ── FINAL + TERCER PUESTO (final four) ──
  const bmFinal = bracketMatches.find(m => m.id === 'final_1')
  const bmThird = bracketMatches.find(m => m.id === 'third_1')
  const aFinalTeams = new Set([bmFinal?.homeTeam, bmFinal?.awayTeam].filter(Boolean))
  const aThirdTeams = new Set([bmThird?.homeTeam, bmThird?.awayTeam].filter(Boolean))
  const pmFinal = predTeamMap['final_1']
  const pmThird = predTeamMap['third_1']
  const pFinalTeams = new Set([pmFinal?.homeTeam, pmFinal?.awayTeam].filter(Boolean))
  const pThirdTeams = new Set([pmThird?.homeTeam, pmThird?.awayTeam].filter(Boolean))
  const finalHits = [...pFinalTeams].filter(t => aFinalTeams.has(t))
  const thirdHits = [...pThirdTeams].filter(t => aThirdTeams.has(t))

  function pairsMatch(ph, pa, ah, aa) {
    if (!ph || !pa || !ah || !aa) return false
    return (ph === ah && pa === aa) || (ph === aa && pa === ah)
  }
  const thirdPairHit = pairsMatch(pmThird?.homeTeam, pmThird?.awayTeam, bmThird?.homeTeam, bmThird?.awayTeam)
  const finalPairHit = pairsMatch(pmFinal?.homeTeam, pmFinal?.awayTeam, bmFinal?.homeTeam, bmFinal?.awayTeam)

  const finalFourDetail = {
    realFinal: { home: bmFinal?.homeTeam || null, away: bmFinal?.awayTeam || null, winner: bmFinal?.winner || null },
    realThird: { home: bmThird?.homeTeam || null, away: bmThird?.awayTeam || null, winner: bmThird?.winner || null },
    predFinal: { home: pmFinal?.homeTeam || null, away: pmFinal?.awayTeam || null },
    predThird: { home: pmThird?.homeTeam || null, away: pmThird?.awayTeam || null },
    finalHits, thirdHits,
    teamPts: (finalHits.length + thirdHits.length) * BRACKET_TEAM_PTS.finalFour,
    teamPtsUnit: BRACKET_TEAM_PTS.finalFour,
    thirdPairHit, thirdPairPts: thirdPairHit ? BRACKET_PAIRING_PTS.third : 0,
    finalPairHit, finalPairPts: finalPairHit ? BRACKET_PAIRING_PTS.final : 0,
  }

  // ── BONUS ──
  const predFinalWinner = bracketPredictions.find(p => p.bracketMatchId === 'final_1')?.predictedWinner || null
  const predThirdWinner = bracketPredictions.find(p => p.bracketMatchId === 'third_1')?.predictedWinner || null
  const actualRU = bmFinal?.winner ? (bmFinal.homeTeam === bmFinal.winner ? bmFinal.awayTeam : bmFinal.homeTeam) : null
  const predRU = pmFinal?.homeTeam === predFinalWinner ? pmFinal?.awayTeam : pmFinal?.homeTeam
  const actualFourth = bmThird?.winner ? (bmThird.homeTeam === bmThird.winner ? bmThird.awayTeam : bmThird.homeTeam) : null
  const predFourth = pmThird?.homeTeam === predThirdWinner ? pmThird?.awayTeam : pmThird?.homeTeam

  const champOk = !!(bmFinal?.winner && predFinalWinner && predFinalWinner === bmFinal.winner)
  const ruOk = !!(bmFinal?.winner && predRU && actualRU && predRU === actualRU)
  const thirdOk = !!(bmThird?.winner && predThirdWinner && predThirdWinner === bmThird.winner)
  const fourthOk = !!(bmThird?.winner && predFourth && actualFourth && predFourth === actualFourth)

  const bonusDetail = {
    champion: { real: bmFinal?.winner || null, pred: predFinalWinner, hit: champOk, pts: champOk ? BONUS_PTS.champion : 0, ptsUnit: BONUS_PTS.champion },
    runnerUp: { real: actualRU, pred: predRU || null, hit: ruOk, pts: ruOk ? BONUS_PTS.runnerUp : 0, ptsUnit: BONUS_PTS.runnerUp },
    third:    { real: bmThird?.winner || null, pred: predThirdWinner, hit: thirdOk, pts: thirdOk ? BONUS_PTS.thirdPlace : 0, ptsUnit: BONUS_PTS.thirdPlace },
    fourth:   { real: actualFourth, pred: predFourth || null, hit: fourthOk, pts: fourthOk ? BONUS_PTS.fourthPlace : 0, ptsUnit: BONUS_PTS.fourthPlace },
  }
  const bonusPts = bonusDetail.champion.pts + bonusDetail.runnerUp.pts + bonusDetail.third.pts + bonusDetail.fourth.pts

  const bracketDetail = calcBracketScoreAll(pid, bracketMatches, bracketPredictions, matches, predictions)

  return {
    id: pid,
    name: part.name,
    total: stats.total,
    officialBreakdown: stats,
    phases: {
      grupos: { matches: groupDetail, ptsExacto, ptsResultado, ptsPosicion, standingsDetail, total: ptsExacto + ptsResultado + ptsPosicion },
      clasificados32: clasificadoDetail,
      r32, r16, qf, sf,
      finalFour: finalFourDetail,
      bonus: { ...bonusDetail, total: bonusPts },
      goleador: scorerDetail,
    },
    bracketTotals: bracketDetail,
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

  const output = { generatedAt: new Date().toISOString(), pollas: [] }

  for (const polla of pollas) {
    const participantsInPolla = partRows.filter(p => p.polla_id === polla.id)

    // Primero calcular totales rápidos para ordenar
    const quickTotals = []
    for (const part of participantsInPolla) {
      const predRows = await fetchAll('predictions', q => q.eq('participant_id', part.id))
      const predictions = predRows.map(r => ({ participantId: r.participant_id, matchId: r.match_id, homeScore: r.home_score, awayScore: r.away_score }))
      const bpRows = await fetchAll('bracket_predictions', q => q.eq('participant_id', part.id))
      const bracketPredictions = bpRows.map(r => ({ participantId: r.participant_id, bracketMatchId: r.bracket_match_id, ...decodeBracketPred(r.predicted_winner) }))
      const stats = calcParticipantStats(part.id, matches, predictions, bracketMatches, bracketPredictions, null, null, topScorers, scorerPredictions, config)
      quickTotals.push({ part, total: stats.total })
    }
    quickTotals.sort((a, b) => b.total - a.total)
    const top4 = quickTotals.slice(0, 4)

    const participantsAudit = []
    for (const { part } of top4) {
      const audit = await buildParticipantAudit(part, matches, bracketMatches, config, topScorers, scorerPredictions)
      participantsAudit.push(audit)
    }

    output.pollas.push({ id: polla.id, name: polla.name, top4: participantsAudit })
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
