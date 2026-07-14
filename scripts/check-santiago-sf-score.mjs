/**
 * Diagnóstico de solo-lectura: desglosa el puntaje de "santiago londoño" en
 * la Polla Garra para el partido de semifinal Francia vs España.
 * Ejecutar: node scripts/check-santiago-sf-score.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { calcPredictedBracketTeams, calcBracketScoreAll } from '../src/utils/scoring.js'
import { BRACKET_PAIRING_PTS, BRACKET_TEAM_PTS } from '../src/data/initialData.js'

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

async function main() {
  const { data: configRows } = await supabase.from('config').select('pollas').limit(1)
  const pollas = Array.isArray(configRows?.[0]?.pollas) ? configRows[0].pollas : []
  const garra = pollas.find(p => p.name.toLowerCase().includes('garra'))
  if (!garra) {
    console.log('No se encontró una polla con "garra" en el nombre. Pollas disponibles:')
    pollas.forEach(p => console.log(`  - ${p.id}: ${p.name}`))
    return
  }
  console.log(`Polla: ${garra.name} (${garra.id})`)

  const partRows = await fetchAll('participants', q => q.eq('polla_id', garra.id))
  const santiago = partRows.find(p => p.name.toLowerCase().includes('santi') && p.name.toLowerCase().includes('londo'))
  if (!santiago) {
    console.log('No se encontró a Santiago Londoño en esta polla. Participantes:')
    partRows.forEach(p => console.log(`  - ${p.id}: ${p.name}`))
    return
  }
  console.log(`Participante: ${santiago.name} (${santiago.id})\n`)

  const matchRows = await fetchAll('matches')
  const bmRows = await fetchAll('bracket_matches')

  const matches = matchRows.map(r => ({
    id: r.id, phase: r.phase, group: r.group,
    homeTeam: r.home_team, awayTeam: r.away_team,
    homeScore: r.home_score, awayScore: r.away_score, status: r.status,
  }))
  const bracketMatches = bmRows.map(r => ({
    id: r.id, round: r.round, position: r.position, label: r.label,
    homeTeam: r.home_team, awayTeam: r.away_team,
    homeScore: r.home_score, awayScore: r.away_score,
    winner: r.winner, status: r.status,
  }))

  const sf1 = bracketMatches.find(m => m.id === 'sf_1')
  const sf2 = bracketMatches.find(m => m.id === 'sf_2')
  console.log(`Bracket real: sf_1 = ${sf1?.homeTeam} vs ${sf1?.awayTeam} (${sf1?.homeScore ?? '-'}-${sf1?.awayScore ?? '-'}, winner=${sf1?.winner || '-'})`)
  console.log(`              sf_2 = ${sf2?.homeTeam || '(vacío)'} vs ${sf2?.awayTeam || '(vacío)'} (${sf2?.homeScore ?? '-'}-${sf2?.awayScore ?? '-'}, winner=${sf2?.winner || '-'})\n`)

  const predRows = await fetchAll('predictions', q => q.eq('participant_id', santiago.id))
  const predictions = predRows.map(r => ({
    participantId: r.participant_id, matchId: r.match_id,
    homeScore: r.home_score, awayScore: r.away_score,
  }))
  const bpRows = await fetchAll('bracket_predictions', q => q.eq('participant_id', santiago.id))
  const bracketPredictions = bpRows.map(r => ({
    participantId: r.participant_id, bracketMatchId: r.bracket_match_id,
    ...decodeBracketPred(r.predicted_winner),
  }))

  const predTeamMap = calcPredictedBracketTeams(matches, predictions, bracketPredictions, santiago.id, bracketMatches)
  console.log('Pronóstico de Santiago para semifinales:')
  console.log(`  sf_1: ${predTeamMap.sf_1?.homeTeam || '—'} vs ${predTeamMap.sf_1?.awayTeam || '—'}`)
  console.log(`  sf_2: ${predTeamMap.sf_2?.homeTeam || '—'} vs ${predTeamMap.sf_2?.awayTeam || '—'}`)
  const predSf1 = bracketPredictions.find(p => p.bracketMatchId === 'sf_1')?.predictedWinner
  const predSf2 = bracketPredictions.find(p => p.bracketMatchId === 'sf_2')?.predictedWinner
  console.log(`  Ganador que eligió en sf_1: ${predSf1 || '—'}`)
  console.log(`  Ganador que eligió en sf_2: ${predSf2 || '—'}\n`)

  // Reconstruir manualmente el desglose SF, igual que calcBracketScoreAll pero con logs
  function actualTeamsSet(round) {
    return new Set(bracketMatches.filter(m => m.round === round).flatMap(m => [m.homeTeam, m.awayTeam]).filter(Boolean))
  }
  function actualPairingsSet(round) {
    const s = new Set()
    bracketMatches.filter(m => m.round === round && m.homeTeam && m.awayTeam)
      .forEach(m => s.add([m.homeTeam, m.awayTeam].sort().join('|')))
    return s
  }
  const aSF = actualTeamsSet('sf')
  const sfActualPairings = actualPairingsSet('sf')
  console.log(`Equipos reales que llegaron a SF: ${[...aSF].join(', ')}`)
  console.log(`Llaves reales de SF (conjunto): ${[...sfActualPairings].join(' | ')}\n`)

  let teamPtsFromSF = 0
  const teamHits = []
  for (const id of ['sf_1', 'sf_2']) {
    const pm = predTeamMap[id]
    for (const t of [pm?.homeTeam, pm?.awayTeam].filter(Boolean)) {
      if (aSF.has(t) && !teamHits.includes(t)) {
        teamHits.push(t)
      }
    }
  }
  teamHits.forEach(t => { teamPtsFromSF += BRACKET_TEAM_PTS.sf })
  console.log(`>> Puntos por "equipo llegó a semis" (${BRACKET_TEAM_PTS.sf} c/u): equipos acertados = [${teamHits.join(', ')}] => ${teamPtsFromSF} pts`)

  let pairingPts = 0
  const pairingHits = []
  const used = new Set()
  for (const id of ['sf_1', 'sf_2']) {
    const pm = predTeamMap[id]
    if (!pm?.homeTeam || !pm?.awayTeam) continue
    const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
    if (sfActualPairings.has(key) && !used.has(key)) {
      pairingPts += BRACKET_PAIRING_PTS.sf
      pairingHits.push(key)
      used.add(key)
    }
  }
  console.log(`>> Puntos por "llave (emparejamiento) acertada" (${BRACKET_PAIRING_PTS.sf} c/u): llaves acertadas = [${pairingHits.join(', ')}] => ${pairingPts} pts`)
  console.log(`>> TOTAL aportado por SF (equipo + llave) = ${teamPtsFromSF + pairingPts} pts\n`)

  const full = calcBracketScoreAll(santiago.id, bracketMatches, bracketPredictions, matches, predictions)
  console.log('Desglose TOTAL de bracket para Santiago:')
  console.log(`  ptsPairing = ${full.ptsPairing}`)
  console.log(`  ptsTeam    = ${full.ptsTeam}`)
  console.log(`  ptsBonus   = ${full.ptsBonus}`)
  console.log(`  TOTAL      = ${full.total}`)
}

main().catch(err => { console.error(err); process.exit(1) })
