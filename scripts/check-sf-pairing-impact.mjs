/**
 * Diagnóstico de solo-lectura: verifica si el fix de emparejamiento de
 * semifinales (qf_1+qf_3 -> sf_1, qf_2+qf_4 -> sf_2, Francia vs España)
 * cambia los puntos de algún participante, en todas las pollas.
 * Ejecutar: node scripts/check-sf-pairing-impact.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { calcPredictedBracketTeams, calcBracketScoreAll } from '../src/utils/scoring.js'

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
  console.log(`Pollas encontradas: ${pollas.length}`)
  pollas.forEach(p => console.log(`  - ${p.id}: ${p.name}`))

  const partRows = await fetchAll('participants')
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
  console.log(`\nBracket real (post-fix): sf_1=${sf1?.homeTeam} vs ${sf1?.awayTeam} | sf_2=${sf2?.homeTeam || '(vacío)'} vs ${sf2?.awayTeam || '(vacío)'}\n`)

  const pollaList = pollas.length > 0 ? pollas : [{ id: null, name: '(sin sistema de pollas)' }]

  for (const polla of pollaList) {
    const participantsInPolla = polla.id
      ? partRows.filter(p => p.polla_id === polla.id)
      : partRows
    console.log(`\n############ POLLA: ${polla.name} (${participantsInPolla.length} participantes) ############`)

    let anyImpact = false

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
      const pSf1 = predTeamMap['sf_1']
      const pSf2 = predTeamMap['sf_2']
      const key = ['España', 'Francia'].sort().join('|')
      const predictedFranciaEspanaSF =
        (pSf1?.homeTeam && pSf1?.awayTeam && [pSf1.homeTeam, pSf1.awayTeam].sort().join('|') === key) ||
        (pSf2?.homeTeam && pSf2?.awayTeam && [pSf2.homeTeam, pSf2.awayTeam].sort().join('|') === key)

      if (predictedFranciaEspanaSF) {
        anyImpact = true
        console.log(`  >>> ${part.name}: predijo Francia vs España en semifinal  (su sf_1: ${pSf1?.homeTeam || '—'} vs ${pSf1?.awayTeam || '—'} | su sf_2: ${pSf2?.homeTeam || '—'} vs ${pSf2?.awayTeam || '—'})`)
      }
    }

    if (!anyImpact) console.log('  (nadie predijo Francia vs España en semifinal en esta polla)')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
