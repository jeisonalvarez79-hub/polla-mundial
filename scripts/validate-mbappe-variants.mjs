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

// Variantes EXACTAS validadas por el usuario (tras trim, sin normalizar mayúsculas)
const ACCEPTED_RAW = [
  'Kylian mbappe', 'Kylian Mbappe', 'Kylian Mbappé', 'Mbape', 'Mbappe',
  'mbappe', 'MBAPPE', 'Mbappé', 'KYLIAN MBAPPE', 'KYLIAN MBAPPÉ',
]
const acceptedLower = new Set(ACCEPTED_RAW.map(s => s.toLowerCase()))

async function main() {
  const { data: configRows } = await supabase.from('config').select('pollas').limit(1)
  const pollas = Array.isArray(configRows?.[0]?.pollas) ? configRows[0].pollas : []
  const pollaNameById = Object.fromEntries(pollas.map(p => [p.id, p.name]))

  const partRows = await fetchAll('participants')
  const scorerRows = await fetchAll('scorer_predictions')
  const scorerByParticipant = Object.fromEntries(scorerRows.map(r => [r.participant_id, r.scorers]))

  const matched = []
  const notMatched = []
  partRows.forEach(p => {
    const raw = (scorerByParticipant[p.id] || [])[0]
    const trimmed = raw ? raw.trim() : null
    const isMatch = trimmed && acceptedLower.has(trimmed.toLowerCase())
    const row = { polla: pollaNameById[p.polla_id] || '?', name: p.name, raw: raw || '(sin pronóstico)' }
    if (isMatch) matched.push(row); else notMatched.push(row)
  })

  const byPolla = {}
  matched.forEach(r => { byPolla[r.polla] = (byPolla[r.polla] || 0) + 1 })

  console.log('=== COINCIDEN con alguna variación aceptada de Mbappé ===')
  console.log(`Total: ${matched.length}`)
  Object.entries(byPolla).forEach(([polla, n]) => console.log(`  ${polla}: ${n}`))
  console.log()
  matched.forEach(r => console.log(`  [${r.polla}] ${r.name} -> "${r.raw}"`))

  console.log('\n=== NO coinciden (revisar si faltó alguna variante o son otro jugador) ===')
  notMatched.forEach(r => console.log(`  [${r.polla}] ${r.name} -> "${r.raw}"`))
}

main().catch(err => { console.error(err); process.exit(1) })
