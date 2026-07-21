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

// Filas corregidas el 2026-07-20 (ver scripts/apply-mbappe-normalization.mjs)
const CORRECTED_ROW_IDS = new Set([3, 9, 12, 13, 45, 99, 25, 26, 28, 34, 42, 43, 50, 52, 53, 54, 55, 64, 69, 71, 76, 78, 79, 81, 89, 90, 91, 95, 96, 23])
// Filas que ya venían exactas "Kylian Mbappé" (no se tocaron, ya sumaban)
const ALREADY_EXACT_NAMES = new Set(['Alvaro Jaime', 'Jeison Alvarez', 'Aleja Luján', 'David', 'Daniel Luján', 'Tata', 'Alejo Cadena', 'Paulina', 'Julián (Volcy)', 'Carlos Cadena', 'Toña'])

async function main() {
  const { data: configRows } = await supabase.from('config').select('pollas').limit(1)
  const pollas = Array.isArray(configRows?.[0]?.pollas) ? configRows[0].pollas : []
  const pollaNameById = Object.fromEntries(pollas.map(p => [p.id, p.name]))
  const { data: topScorerRow } = await supabase.from('top_scorers').select('*').eq('id', 1).single()
  const topScorers = topScorerRow?.scorers || []

  const partRows = await fetchAll('participants')
  const scorerRows = await fetchAll('scorer_predictions')
  const scorerRowByParticipant = Object.fromEntries(scorerRows.map(r => [r.participant_id, r]))

  partRows.sort((a, b) => (pollaNameById[a.polla_id] || '').localeCompare(pollaNameById[b.polla_id] || '') || a.name.localeCompare(b.name))

  const list = partRows.map(p => {
    const row = scorerRowByParticipant[p.id]
    const scorers = row?.scorers || []
    const first = scorers[0] || null
    const status = !first ? 'sin-pronostico'
      : CORRECTED_ROW_IDS.has(row.id) ? 'corregido'
      : (first === 'Kylian Mbappé' && ALREADY_EXACT_NAMES.has(p.name)) ? 'ya-exacto'
      : (topScorers.includes(first)) ? 'exacto-otro'
      : 'sin-cambio'
    return {
      polla: pollaNameById[p.polla_id] || '?',
      name: p.name,
      goleador: first,
      otros: scorers.slice(1).filter(Boolean),
      status,
      hit: !!(first && topScorers.includes(first)),
    }
  })

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), topScorers, list }, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
