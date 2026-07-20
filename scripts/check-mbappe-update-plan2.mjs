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

const ACCEPTED_RAW = [
  'Kylian mbappe', 'Kylian Mbappe', 'Kylian Mbappé', 'Mbape', 'Mbappe',
  'mbappe', 'MBAPPE', 'Mbappé', 'KYLIAN MBAPPE', 'KYLIAN MBAPPÉ',
]
const acceptedLower = new Set(ACCEPTED_RAW.map(s => s.toLowerCase()))
const TARGET = 'Kylian Mbappé'

async function main() {
  const { data: configRows } = await supabase.from('config').select('pollas').limit(1)
  const pollas = Array.isArray(configRows?.[0]?.pollas) ? configRows[0].pollas : []
  const pollaNameById = Object.fromEntries(pollas.map(p => [p.id, p.name]))

  const partRows = await fetchAll('participants')
  const scorerRows = await fetchAll('scorer_predictions')

  const alreadyExact = []
  const needsUpdate = []
  scorerRows.forEach(r => {
    const raw = (r.scorers || [])[0]
    if (!raw) return
    const trimmed = raw.trim()
    if (!acceptedLower.has(trimmed.toLowerCase())) return
    const part = partRows.find(p => p.id === r.participant_id)
    const info = { rowId: r.id, participantId: r.participant_id, name: part?.name, polla: pollaNameById[part?.polla_id], scorersFull: r.scorers, raw }
    if (raw === TARGET) alreadyExact.push(info)
    else needsUpdate.push(info)
  })

  console.log(`YA exacto "Kylian Mbappé" (byte a byte, ya reciben los 10 pts hoy): ${alreadyExact.length}`)
  alreadyExact.forEach(r => console.log(`  [${r.polla}] ${r.name}`))

  console.log(`\nA ACTUALIZAR (no coinciden byte a byte con "Kylian Mbappé", incluye espacios/mayúsculas/tildes): ${needsUpdate.length}`)
  needsUpdate.forEach(r => console.log(`  rowId=${r.rowId} participantId=${r.participantId} [${r.polla}] ${r.name} | scorers actual=${JSON.stringify(r.scorersFull)}`))

  console.log(`\nTOTAL variantes válidas (exact + a actualizar): ${alreadyExact.length + needsUpdate.length}`)
}

main().catch(err => { console.error(err); process.exit(1) })
