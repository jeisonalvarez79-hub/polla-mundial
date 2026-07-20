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

async function main() {
  const { data: topScorerRow } = await supabase.from('top_scorers').select('*').eq('id', 1).single()
  console.log('top_scorers row:', JSON.stringify(topScorerRow))

  const { data: configRows } = await supabase.from('config').select('pollas').limit(1)
  const pollas = Array.isArray(configRows?.[0]?.pollas) ? configRows[0].pollas : []
  const pollaNameById = Object.fromEntries(pollas.map(p => [p.id, p.name]))

  const partRows = await fetchAll('participants')
  const scorerRows = await fetchAll('scorer_predictions')

  console.log('\nEstructura completa de scorer_predictions para los 41 (id fila, participant_id, scorers array completo):')
  let count = 0
  scorerRows.forEach(r => {
    const first = (r.scorers || [])[0]
    const trimmed = first ? first.trim() : null
    const isMatch = trimmed && acceptedLower.has(trimmed.toLowerCase()) && trimmed !== 'Kylian Mbappé'
    if (isMatch) {
      const part = partRows.find(p => p.id === r.participant_id)
      count++
      console.log(`  row.id=${r.id} | participant_id=${r.participant_id} | ${part?.name} (${pollaNameById[part?.polla_id]}) | scorers=${JSON.stringify(r.scorers)}`)
    }
  })
  console.log(`\nTotal a actualizar (excluye los que YA son exacto "Kylian Mbappé"): ${count}`)
}

main().catch(err => { console.error(err); process.exit(1) })
