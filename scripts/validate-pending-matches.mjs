/**
 * Valida partidos con marcador cargado pero sin status "finished", y llaves
 * de bracket con marcador/ganador incompleto, que dejarían puntos sin sumar.
 * Ejecutar: node scripts/validate-pending-matches.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://whvswbgnhimwwgnzxarx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodnN3YmduaGltd3dnbnp4YXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA2NjYsImV4cCI6MjA5MDQ5NjY2Nn0.xEJuZqC4dF4FbuJ9zE7-IhfvPOWZaAtDQ652eoqYgAc'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

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
  const matches = await fetchAll('matches')
  const bracketMatches = await fetchAll('bracket_matches')

  console.log('=== PARTIDOS DE GRUPOS (matches) ===')
  console.log(`Total: ${matches.length}`)
  const hasScoreNotFinished = matches.filter(m => m.home_score !== null && m.away_score !== null && m.status !== 'finished')
  const finishedNoScore = matches.filter(m => m.status === 'finished' && (m.home_score === null || m.away_score === null))
  const noScoreNoStatus = matches.filter(m => m.home_score === null && m.away_score === null && m.status !== 'scheduled' && m.status !== 'finished')
  console.log(`Con marcador cargado pero status != 'finished' (PENDIENTE): ${hasScoreNotFinished.length}`)
  hasScoreNotFinished.forEach(m => console.log(`  id=${m.id} ${m.home_team} ${m.home_score}-${m.away_score} ${m.away_team} | status="${m.status}" | phase=${m.phase} group=${m.group}`))
  console.log(`Marcado 'finished' pero SIN marcador (inconsistente): ${finishedNoScore.length}`)
  finishedNoScore.forEach(m => console.log(`  id=${m.id} ${m.home_team} vs ${m.away_team} | status="${m.status}"`))
  console.log(`Status raro (ni scheduled ni finished) sin marcador: ${noScoreNoStatus.length}`)
  noScoreNoStatus.forEach(m => console.log(`  id=${m.id} ${m.home_team} vs ${m.away_team} | status="${m.status}"`))

  console.log('\n=== PARTIDOS DE BRACKET (bracket_matches) ===')
  console.log(`Total: ${bracketMatches.length}`)
  const bmHasScoreNotFinished = bracketMatches.filter(m => m.home_score !== null && m.away_score !== null && m.status !== 'finished')
  const bmHasScoreNoWinner = bracketMatches.filter(m => m.home_score !== null && m.away_score !== null && !m.winner)
  const bmFinishedNoScore = bracketMatches.filter(m => m.status === 'finished' && (m.home_score === null || m.away_score === null))
  const bmFinishedNoWinner = bracketMatches.filter(m => m.status === 'finished' && !m.winner && m.home_team && m.away_team)
  const bmWinnerNotFinished = bracketMatches.filter(m => m.winner && m.status !== 'finished')

  console.log(`Con marcador cargado pero status != 'finished' (PENDIENTE): ${bmHasScoreNotFinished.length}`)
  bmHasScoreNotFinished.forEach(m => console.log(`  id=${m.id} round=${m.round} ${m.home_team} ${m.home_score}-${m.away_score} ${m.away_team} | status="${m.status}" winner="${m.winner || ''}"`))

  console.log(`Con marcador cargado pero SIN ganador seleccionado (PENDIENTE): ${bmHasScoreNoWinner.length}`)
  bmHasScoreNoWinner.forEach(m => console.log(`  id=${m.id} round=${m.round} ${m.home_team} ${m.home_score}-${m.away_score} ${m.away_team} | status="${m.status}"`))

  console.log(`Marcado 'finished' pero SIN marcador (inconsistente): ${bmFinishedNoScore.length}`)
  bmFinishedNoScore.forEach(m => console.log(`  id=${m.id} round=${m.round} ${m.home_team} vs ${m.away_team} | status="${m.status}"`))

  console.log(`Marcado 'finished', ambos equipos definidos, pero SIN ganador: ${bmFinishedNoWinner.length}`)
  bmFinishedNoWinner.forEach(m => console.log(`  id=${m.id} round=${m.round} ${m.home_team} vs ${m.away_team} | status="${m.status}"`))

  console.log(`Con ganador pero status != 'finished' (raro): ${bmWinnerNotFinished.length}`)
  bmWinnerNotFinished.forEach(m => console.log(`  id=${m.id} round=${m.round} ${m.home_team} vs ${m.away_team} | winner="${m.winner}" status="${m.status}"`))

  // Búsqueda específica de los partidos mencionados por el usuario
  console.log('\n=== Búsqueda específica: Noruega vs Inglaterra / Argentina vs Suiza ===')
  const needle = ['noruega', 'inglaterra', 'argentina', 'suiza']
  const allRows = [...matches.map(m => ({ ...m, _table: 'matches' })), ...bracketMatches.map(m => ({ ...m, _table: 'bracket_matches' }))]
  allRows.forEach(m => {
    const h = (m.home_team || '').toLowerCase()
    const a = (m.away_team || '').toLowerCase()
    if (needle.some(n => h.includes(n) || a.includes(n))) {
      console.log(`  [${m._table}] id=${m.id} ${m.round || m.phase || ''} ${m.home_team} ${m.home_score ?? '?'}-${m.away_score ?? '?'} ${m.away_team} | status="${m.status}"${m._table === 'bracket_matches' ? ` | winner="${m.winner || ''}"` : ''}`)
    }
  })
}

main().catch(err => { console.error(err); process.exit(1) })
