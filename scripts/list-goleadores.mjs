/**
 * Lista de solo-lectura: Participante / Goleador pronosticado, para las dos pollas.
 * Ejecutar: node scripts/list-goleadores.mjs
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
  const { data: configRows } = await supabase.from('config').select('pollas').limit(1)
  const pollas = Array.isArray(configRows?.[0]?.pollas) ? configRows[0].pollas : []
  const pollaNameById = Object.fromEntries(pollas.map(p => [p.id, p.name]))

  const partRows = await fetchAll('participants')
  const scorerRows = await fetchAll('scorer_predictions')
  const scorerByParticipant = Object.fromEntries(scorerRows.map(r => [r.participant_id, r.scorers]))

  partRows.sort((a, b) => (pollaNameById[a.polla_id] || '').localeCompare(pollaNameById[b.polla_id] || '') || a.name.localeCompare(b.name))

  console.log(`Total participantes: ${partRows.length}\n`)
  console.log('| # | Polla | Participante | Goleador pronosticado (1°) | Otros (2°/3° si aplica) |')
  console.log('|---|---|---|---|---|')
  partRows.forEach((p, i) => {
    const scorers = scorerByParticipant[p.id] || []
    const first = scorers[0] || '(sin pronóstico)'
    const rest = scorers.slice(1).filter(Boolean).join(', ') || '—'
    console.log(`| ${i + 1} | ${pollaNameById[p.polla_id] || '?'} | ${p.name} | ${first} | ${rest} |`)
  })

  // Resumen de variaciones del nombre
  const counts = {}
  partRows.forEach(p => {
    const first = (scorerByParticipant[p.id] || [])[0]
    if (!first) return
    counts[first] = (counts[first] || 0) + 1
  })
  console.log('\n--- Conteo de variaciones de nombre (1° goleador) ---')
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
    console.log(`  "${name}": ${count}`)
  })
}

main().catch(err => { console.error(err); process.exit(1) })
