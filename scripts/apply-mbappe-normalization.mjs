/**
 * Normaliza scorer_predictions.scorers[0] a "Kylian Mbappé" (exacto) para los
 * 30 participantes que colocaron una variante de escritura del mismo jugador.
 * Ejecutar: node scripts/apply-mbappe-normalization.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://whvswbgnhimwwgnzxarx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodnN3YmduaGltd3dnbnp4YXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA2NjYsImV4cCI6MjA5MDQ5NjY2Nn0.xEJuZqC4dF4FbuJ9zE7-IhfvPOWZaAtDQ652eoqYgAc'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TARGET = 'Kylian Mbappé'

const ROW_IDS = [3, 9, 12, 13, 45, 99, 25, 26, 28, 34, 42, 43, 50, 52, 53, 54, 55, 64, 69, 71, 76, 78, 79, 81, 89, 90, 91, 95, 96, 23]

async function main() {
  console.log(`Actualizando ${ROW_IDS.length} filas de scorer_predictions...`)
  let ok = 0, fail = 0
  for (const id of ROW_IDS) {
    const { data: before } = await supabase.from('scorer_predictions').select('*').eq('id', id).single()
    if (!before) { console.log(`  id=${id} NO ENCONTRADO`); fail++; continue }
    const newScorers = [...(before.scorers || [])]
    newScorers[0] = TARGET
    const { data, error } = await supabase
      .from('scorer_predictions')
      .update({ scorers: newScorers })
      .eq('id', id)
      .select()
    if (error) {
      console.log(`  id=${id} participant_id=${before.participant_id} ERROR: ${error.message}`)
      fail++
    } else if (!data || data.length === 0) {
      console.log(`  id=${id} participant_id=${before.participant_id} SIN CAMBIOS APLICADOS (posible bloqueo RLS, 0 filas afectadas)`)
      fail++
    } else {
      console.log(`  id=${id} participant_id=${before.participant_id} "${before.scorers?.[0]}" -> "${data[0].scorers?.[0]}" OK`)
      ok++
    }
  }
  console.log(`\nResumen: ${ok} actualizadas, ${fail} con problema`)
}

main().catch(err => { console.error(err); process.exit(1) })
