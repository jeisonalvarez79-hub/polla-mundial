/**
 * Análisis de probabilidades — Polla Familia Alzate.
 * Calcula el ranking actual, el máximo de puntos que puede sumar cada uno de los
 * primeros 10 puestos, y una simulación Monte Carlo de quién puede terminar en el podio.
 * Ejecutar: node scripts/analyze-familia-alzate.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { calcParticipantStats, calcBracketScoreAll, buildRanking } from '../src/utils/scoring.js'
import { QF_FROM_R16 } from '../src/data/initialData.js'

const SUPABASE_URL = 'https://whvswbgnhimwwgnzxarx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodnN3YmduaGltd3dnbnp4YXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA2NjYsImV4cCI6MjA5MDQ5NjY2Nn0.xEJuZqC4dF4FbuJ9zE7-IhfvPOWZaAtDQ652eoqYgAc'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const POLLA_ID = 'polla_1779169822666' // Polla Familia Alzate
const N_TRIALS = 8000

function decodeBracketPred(raw) {
  if (!raw) return { predictedWinner: null }
  const parts = raw.split('|')
  return { predictedWinner: parts[0] || null }
}

async function main() {
  const { data: configRows, error: e1 } = await supabase.from('config').select('pts').limit(1)
  if (e1) throw e1
  const config = { pts: configRows[0].pts }

  const { data: partRows, error: e2 } = await supabase
    .from('participants').select('id,name').eq('polla_id', POLLA_ID)
  if (e2) throw e2
  const participants = partRows
  const participantIds = participants.map(p => p.id)

  const { data: matchRows, error: e3 } = await supabase.from('matches').select('*')
  if (e3) throw e3
  const matches = matchRows.map(r => ({
    id: r.id, phase: r.phase, group: r.group,
    homeTeam: r.home_team, awayTeam: r.away_team,
    homeScore: r.home_score, awayScore: r.away_score, status: r.status,
  }))

  const { data: bmRows, error: e4 } = await supabase.from('bracket_matches').select('*')
  if (e4) throw e4
  const bracketMatches = bmRows.map(r => ({
    id: r.id, round: r.round, position: r.position, label: r.label,
    homeTeam: r.home_team, awayTeam: r.away_team,
    homeScore: r.home_score, awayScore: r.away_score,
    winner: r.winner, status: r.status,
  }))

  const { data: predRows, error: e5 } = await supabase
    .from('predictions').select('*').in('participant_id', participantIds)
  if (e5) throw e5
  const predictions = predRows.map(r => ({
    participantId: r.participant_id, matchId: r.match_id,
    homeScore: r.home_score, awayScore: r.away_score,
  }))

  const { data: bpRows, error: e6 } = await supabase
    .from('bracket_predictions').select('*').in('participant_id', participantIds)
  if (e6) throw e6
  const bracketPredictions = bpRows.map(r => ({
    participantId: r.participant_id, bracketMatchId: r.bracket_match_id,
    ...decodeBracketPred(r.predicted_winner),
  }))

  const topScorers = []
  const scorerPredictions = []

  // ── Ranking actual ──────────────────────────────────────────────────────
  const ranking = buildRanking(
    participants, matches, predictions, bracketMatches, bracketPredictions,
    [], [], topScorers, scorerPredictions, config
  )
  const top10 = ranking.slice(0, 10)

  console.log('=== RANKING ACTUAL — Polla Familia Alzate (top 10) ===')
  top10.forEach(r => console.log(
    `${String(r.position).padStart(2)}. ${r.participant.name.padEnd(28)} ${r.stats.total} pts` +
    ` (exacto ${r.stats.ptsExacto} / resultado ${r.stats.ptsResultado} / grupos ${r.stats.ptsStandings} / bracket ${r.stats.ptsBracket})`
  ))

  // Parte fija (no cambia con el resto del torneo): grupos + posiciones + goleador.
  const fixedScore = {}
  const statsById = {}
  participants.forEach(p => {
    const s = calcParticipantStats(
      p.id, matches, predictions, bracketMatches, bracketPredictions,
      [], [], topScorers, scorerPredictions, config
    )
    statsById[p.id] = s
    fixedScore[p.id] = s.total - s.ptsBracket
  })

  const bmById = Object.fromEntries(bracketMatches.map(m => [m.id, m]))
  const r16Ids = Array.from({ length: 8 }, (_, i) => `r16_${i + 1}`)

  function predWinnerFor(pid, matchId) {
    return bracketPredictions.find(bp => bp.participantId === pid && bp.bracketMatchId === matchId)?.predictedWinner || null
  }

  // Construye una versión hipotética de bracketMatches resolviendo las llaves
  // pendientes con una función "pickWinner(matchId, home, away)".
  function simulateBracket(pickWinner) {
    const sim = {}
    bracketMatches.forEach(m => { sim[m.id] = { ...m } })

    r16Ids.forEach(id => {
      const m = sim[id]
      if (!m.winner) m.winner = pickWinner(id, m.homeTeam, m.awayTeam)
    })

    QF_FROM_R16.forEach(([id1, id2], i) => {
      const qfId = `qf_${i + 1}`
      const home = sim[id1].winner, away = sim[id2].winner
      sim[qfId].homeTeam = home
      sim[qfId].awayTeam = away
      if (!sim[qfId].winner) sim[qfId].winner = pickWinner(qfId, home, away)
    })

    for (let pos = 1; pos <= 2; pos++) {
      const id1 = `qf_${pos * 2 - 1}`, id2 = `qf_${pos * 2}`
      const sfId = `sf_${pos}`
      const home = sim[id1].winner, away = sim[id2].winner
      sim[sfId].homeTeam = home
      sim[sfId].awayTeam = away
      if (!sim[sfId].winner) sim[sfId].winner = pickWinner(sfId, home, away)
    }

    const sf1 = sim.sf_1, sf2 = sim.sf_2
    const loser1 = sf1.homeTeam === sf1.winner ? sf1.awayTeam : sf1.homeTeam
    const loser2 = sf2.homeTeam === sf2.winner ? sf2.awayTeam : sf2.homeTeam
    sim.third_1.homeTeam = loser1
    sim.third_1.awayTeam = loser2
    if (!sim.third_1.winner) sim.third_1.winner = pickWinner('third_1', loser1, loser2)

    sim.final_1.homeTeam = sf1.winner
    sim.final_1.awayTeam = sf2.winner
    if (!sim.final_1.winner) sim.final_1.winner = pickWinner('final_1', sf1.winner, sf2.winner)

    return Object.values(sim)
  }

  // ── Mejor caso posible para cada uno de los top 10 ──────────────────────
  console.log('\n=== MÁXIMO DE PUNTOS QUE PUEDE SUMAR CADA UNO (mejor caso posible) ===')
  const bestCaseById = {}
  top10.forEach(r => {
    const pid = r.participant.id
    const sim = simulateBracket((matchId, home, away) => {
      const pred = predWinnerFor(pid, matchId)
      if (pred === home || pred === away) return pred
      return home // si no coincide, da igual para este participante
    })
    const bracketTotal = calcBracketScoreAll(pid, sim, bracketPredictions, matches, predictions).total
    const bestTotal = fixedScore[pid] + bracketTotal
    bestCaseById[pid] = bestTotal
    console.log(
      `${r.participant.name.padEnd(28)} actual ${r.stats.total} pts -> máximo posible ${bestTotal} pts` +
      ` (+${bestTotal - r.stats.total})`
    )
  })

  // ── Monte Carlo: probabilidad de terminar en el podio ───────────────────
  console.log(`\nCorriendo simulación Monte Carlo (${N_TRIALS} escenarios aleatorios para lo que falta del bracket)...`)
  const counts = {}
  participants.forEach(p => { counts[p.id] = { top1: 0, top2: 0, top3: 0, totals: [] } })

  for (let t = 0; t < N_TRIALS; t++) {
    const sim = simulateBracket((_matchId, home, away) => (Math.random() < 0.5 ? home : away))
    const totals = participants.map(p => ({
      id: p.id,
      total: fixedScore[p.id] + calcBracketScoreAll(p.id, sim, bracketPredictions, matches, predictions).total,
    }))
    totals.sort((a, b) => b.total - a.total)
    totals.forEach((r, idx) => {
      const c = counts[r.id]
      c.totals.push(r.total)
      if (idx === 0) c.top1++
      if (idx <= 1) c.top2++
      if (idx <= 2) c.top3++
    })
  }

  console.log('\n=== PROBABILIDAD DE PODIO (top 10 actual) ===')
  top10.forEach(r => {
    const c = counts[r.participant.id]
    const avg = c.totals.reduce((a, b) => a + b, 0) / c.totals.length
    console.log(
      `${r.participant.name.padEnd(28)} P(1°)=${(c.top1 / N_TRIALS * 100).toFixed(1)}%  ` +
      `P(top2)=${(c.top2 / N_TRIALS * 100).toFixed(1)}%  P(top3)=${(c.top3 / N_TRIALS * 100).toFixed(1)}%  ` +
      `prom.final=${avg.toFixed(1)}  máx=${bestCaseById[r.participant.id]}`
    )
  })

  console.log('\n=== RANKING POR PROBABILIDAD DE PODIO (todos los participantes) ===')
  const allByProb = participants
    .map(p => ({ name: p.name, id: p.id, ...counts[p.id] }))
    .sort((a, b) => b.top3 - a.top3)
    .slice(0, 12)
  allByProb.forEach((p, i) => {
    const avg = p.totals.reduce((a, b) => a + b, 0) / p.totals.length
    console.log(`${String(i + 1).padStart(2)}. ${p.name.padEnd(28)} P(top3)=${(p.top3 / N_TRIALS * 100).toFixed(1)}%  prom.final=${avg.toFixed(1)}`)
  })
}

main().catch(err => { console.error(err); process.exit(1) })
