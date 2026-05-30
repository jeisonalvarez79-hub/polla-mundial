/**
 * Script: Carga los 72 partidos oficiales del Mundial 2026 en Supabase.
 * Todas las horas están en hora Colombia (UTC-5).
 * Ejecutar: node scripts/load-matches.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://whvswbgnhimwwgnzxarx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodnN3YmduaGltd3dnbnp4YXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjA2NjYsImV4cCI6MjA5MDQ5NjY2Nn0.xEJuZqC4dF4FbuJ9zE7-IhfvPOWZaAtDQ652eoqYgAc'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// 72 partidos del Mundial 2026 — hora Colombia (UTC-5)
// Grupos: A-L, 6 partidos por grupo (J1×2, J2×2, J3×2)
const MATCHES = [
  // ── GRUPO A: México, Sudáfrica, Corea del Sur, República Checa ──────────
  { id: 'g1',  group: 'A', jornada: 'J1', date: '11/06/2026', hora: '14:00', home_team: 'México',           away_team: 'Sudáfrica' },
  { id: 'g2',  group: 'A', jornada: 'J1', date: '11/06/2026', hora: '21:00', home_team: 'Corea del Sur',    away_team: 'República Checa' },
  { id: 'g3',  group: 'A', jornada: 'J2', date: '18/06/2026', hora: '11:00', home_team: 'República Checa',  away_team: 'Sudáfrica' },
  { id: 'g4',  group: 'A', jornada: 'J2', date: '18/06/2026', hora: '20:00', home_team: 'México',           away_team: 'Corea del Sur' },
  { id: 'g5',  group: 'A', jornada: 'J3', date: '24/06/2026', hora: '20:00', home_team: 'República Checa',  away_team: 'México' },
  { id: 'g6',  group: 'A', jornada: 'J3', date: '24/06/2026', hora: '20:00', home_team: 'Sudáfrica',        away_team: 'Corea del Sur' },

  // ── GRUPO B: Canadá, Bosnia y Herzegovina, Catar, Suiza ────────────────
  { id: 'g7',  group: 'B', jornada: 'J1', date: '12/06/2026', hora: '14:00', home_team: 'Canadá',           away_team: 'Bosnia y Herzegovina' },
  { id: 'g8',  group: 'B', jornada: 'J1', date: '13/06/2026', hora: '14:00', home_team: 'Catar',            away_team: 'Suiza' },
  { id: 'g9',  group: 'B', jornada: 'J2', date: '18/06/2026', hora: '14:00', home_team: 'Suiza',            away_team: 'Bosnia y Herzegovina' },
  { id: 'g10', group: 'B', jornada: 'J2', date: '18/06/2026', hora: '17:00', home_team: 'Canadá',           away_team: 'Catar' },
  { id: 'g11', group: 'B', jornada: 'J3', date: '24/06/2026', hora: '14:00', home_team: 'Suiza',            away_team: 'Canadá' },
  { id: 'g12', group: 'B', jornada: 'J3', date: '24/06/2026', hora: '14:00', home_team: 'Bosnia y Herzegovina', away_team: 'Catar' },

  // ── GRUPO C: Brasil, Marruecos, Haití, Escocia ─────────────────────────
  { id: 'g13', group: 'C', jornada: 'J1', date: '13/06/2026', hora: '17:00', home_team: 'Brasil',           away_team: 'Marruecos' },
  { id: 'g14', group: 'C', jornada: 'J1', date: '13/06/2026', hora: '20:00', home_team: 'Haití',            away_team: 'Escocia' },
  { id: 'g15', group: 'C', jornada: 'J2', date: '19/06/2026', hora: '17:00', home_team: 'Escocia',          away_team: 'Marruecos' },
  { id: 'g16', group: 'C', jornada: 'J2', date: '19/06/2026', hora: '19:30', home_team: 'Brasil',           away_team: 'Haití' },
  { id: 'g17', group: 'C', jornada: 'J3', date: '24/06/2026', hora: '17:00', home_team: 'Escocia',          away_team: 'Brasil' },
  { id: 'g18', group: 'C', jornada: 'J3', date: '24/06/2026', hora: '17:00', home_team: 'Marruecos',        away_team: 'Haití' },

  // ── GRUPO D: Estados Unidos, Paraguay, Australia, Turquía ──────────────
  { id: 'g19', group: 'D', jornada: 'J1', date: '12/06/2026', hora: '20:00', home_team: 'Estados Unidos',   away_team: 'Paraguay' },
  { id: 'g20', group: 'D', jornada: 'J1', date: '13/06/2026', hora: '23:00', home_team: 'Australia',        away_team: 'Turquía' },
  { id: 'g21', group: 'D', jornada: 'J2', date: '19/06/2026', hora: '14:00', home_team: 'Estados Unidos',   away_team: 'Australia' },
  { id: 'g22', group: 'D', jornada: 'J2', date: '19/06/2026', hora: '22:00', home_team: 'Turquía',          away_team: 'Paraguay' },
  { id: 'g23', group: 'D', jornada: 'J3', date: '25/06/2026', hora: '21:00', home_team: 'Turquía',          away_team: 'Estados Unidos' },
  { id: 'g24', group: 'D', jornada: 'J3', date: '25/06/2026', hora: '21:00', home_team: 'Paraguay',         away_team: 'Australia' },

  // ── GRUPO E: Alemania, Curazao, Costa de Marfil, Ecuador ───────────────
  { id: 'g25', group: 'E', jornada: 'J1', date: '14/06/2026', hora: '12:00', home_team: 'Alemania',         away_team: 'Curazao' },
  { id: 'g26', group: 'E', jornada: 'J1', date: '14/06/2026', hora: '18:00', home_team: 'Costa de Marfil',  away_team: 'Ecuador' },
  { id: 'g27', group: 'E', jornada: 'J2', date: '20/06/2026', hora: '15:00', home_team: 'Alemania',         away_team: 'Costa de Marfil' },
  { id: 'g28', group: 'E', jornada: 'J2', date: '20/06/2026', hora: '19:00', home_team: 'Ecuador',          away_team: 'Curazao' },
  { id: 'g29', group: 'E', jornada: 'J3', date: '25/06/2026', hora: '15:00', home_team: 'Curazao',          away_team: 'Costa de Marfil' },
  { id: 'g30', group: 'E', jornada: 'J3', date: '25/06/2026', hora: '15:00', home_team: 'Ecuador',          away_team: 'Alemania' },

  // ── GRUPO F: Países Bajos, Japón, Suecia, Túnez ────────────────────────
  { id: 'g31', group: 'F', jornada: 'J1', date: '14/06/2026', hora: '15:00', home_team: 'Países Bajos',     away_team: 'Japón' },
  { id: 'g32', group: 'F', jornada: 'J1', date: '14/06/2026', hora: '21:00', home_team: 'Suecia',           away_team: 'Túnez' },
  { id: 'g33', group: 'F', jornada: 'J2', date: '20/06/2026', hora: '12:00', home_team: 'Países Bajos',     away_team: 'Suecia' },
  { id: 'g34', group: 'F', jornada: 'J2', date: '20/06/2026', hora: '23:00', home_team: 'Túnez',            away_team: 'Japón' },
  { id: 'g35', group: 'F', jornada: 'J3', date: '25/06/2026', hora: '18:00', home_team: 'Japón',            away_team: 'Suecia' },
  { id: 'g36', group: 'F', jornada: 'J3', date: '25/06/2026', hora: '18:00', home_team: 'Túnez',            away_team: 'Países Bajos' },

  // ── GRUPO G: Bélgica, Egipto, Irán, Nueva Zelanda ──────────────────────
  { id: 'g37', group: 'G', jornada: 'J1', date: '15/06/2026', hora: '14:00', home_team: 'Bélgica',          away_team: 'Egipto' },
  { id: 'g38', group: 'G', jornada: 'J1', date: '15/06/2026', hora: '20:00', home_team: 'Irán',             away_team: 'Nueva Zelanda' },
  { id: 'g39', group: 'G', jornada: 'J2', date: '21/06/2026', hora: '14:00', home_team: 'Bélgica',          away_team: 'Irán' },
  { id: 'g40', group: 'G', jornada: 'J2', date: '21/06/2026', hora: '20:00', home_team: 'Nueva Zelanda',    away_team: 'Egipto' },
  { id: 'g41', group: 'G', jornada: 'J3', date: '26/06/2026', hora: '22:00', home_team: 'Egipto',           away_team: 'Irán' },
  { id: 'g42', group: 'G', jornada: 'J3', date: '26/06/2026', hora: '22:00', home_team: 'Nueva Zelanda',    away_team: 'Bélgica' },

  // ── GRUPO H: España, Cabo Verde, Arabia Saudita, Uruguay ───────────────
  { id: 'g43', group: 'H', jornada: 'J1', date: '15/06/2026', hora: '11:00', home_team: 'España',           away_team: 'Cabo Verde' },
  { id: 'g44', group: 'H', jornada: 'J1', date: '15/06/2026', hora: '17:00', home_team: 'Arabia Saudita',   away_team: 'Uruguay' },
  { id: 'g45', group: 'H', jornada: 'J2', date: '21/06/2026', hora: '11:00', home_team: 'España',           away_team: 'Arabia Saudita' },
  { id: 'g46', group: 'H', jornada: 'J2', date: '21/06/2026', hora: '17:00', home_team: 'Uruguay',          away_team: 'Cabo Verde' },
  { id: 'g47', group: 'H', jornada: 'J3', date: '26/06/2026', hora: '19:00', home_team: 'Cabo Verde',       away_team: 'Arabia Saudita' },
  { id: 'g48', group: 'H', jornada: 'J3', date: '26/06/2026', hora: '19:00', home_team: 'Uruguay',          away_team: 'España' },

  // ── GRUPO I: Francia, Senegal, Irak, Noruega ───────────────────────────
  { id: 'g49', group: 'I', jornada: 'J1', date: '16/06/2026', hora: '14:00', home_team: 'Francia',          away_team: 'Senegal' },
  { id: 'g50', group: 'I', jornada: 'J1', date: '16/06/2026', hora: '17:00', home_team: 'Irak',             away_team: 'Noruega' },
  { id: 'g51', group: 'I', jornada: 'J2', date: '22/06/2026', hora: '16:00', home_team: 'Francia',          away_team: 'Irak' },
  { id: 'g52', group: 'I', jornada: 'J2', date: '22/06/2026', hora: '19:00', home_team: 'Noruega',          away_team: 'Senegal' },
  { id: 'g53', group: 'I', jornada: 'J3', date: '26/06/2026', hora: '14:00', home_team: 'Noruega',          away_team: 'Francia' },
  { id: 'g54', group: 'I', jornada: 'J3', date: '26/06/2026', hora: '14:00', home_team: 'Senegal',          away_team: 'Irak' },

  // ── GRUPO J: Argentina, Argelia, Austria, Jordania ─────────────────────
  { id: 'g55', group: 'J', jornada: 'J1', date: '16/06/2026', hora: '20:00', home_team: 'Argentina',        away_team: 'Argelia' },
  { id: 'g56', group: 'J', jornada: 'J1', date: '16/06/2026', hora: '23:00', home_team: 'Austria',          away_team: 'Jordania' },
  { id: 'g57', group: 'J', jornada: 'J2', date: '22/06/2026', hora: '12:00', home_team: 'Argentina',        away_team: 'Austria' },
  { id: 'g58', group: 'J', jornada: 'J2', date: '22/06/2026', hora: '22:00', home_team: 'Jordania',         away_team: 'Argelia' },
  { id: 'g59', group: 'J', jornada: 'J3', date: '27/06/2026', hora: '21:00', home_team: 'Argelia',          away_team: 'Austria' },
  { id: 'g60', group: 'J', jornada: 'J3', date: '27/06/2026', hora: '21:00', home_team: 'Jordania',         away_team: 'Argentina' },

  // ── GRUPO K: Portugal, R.D. del Congo, Uzbekistán, Colombia ────────────
  { id: 'g61', group: 'K', jornada: 'J1', date: '17/06/2026', hora: '12:00', home_team: 'Portugal',         away_team: 'R.D. del Congo' },
  { id: 'g62', group: 'K', jornada: 'J1', date: '17/06/2026', hora: '21:00', home_team: 'Uzbekistán',       away_team: 'Colombia' },
  { id: 'g63', group: 'K', jornada: 'J2', date: '23/06/2026', hora: '12:00', home_team: 'Portugal',         away_team: 'Uzbekistán' },
  { id: 'g64', group: 'K', jornada: 'J2', date: '23/06/2026', hora: '21:00', home_team: 'Colombia',         away_team: 'R.D. del Congo' },
  { id: 'g65', group: 'K', jornada: 'J3', date: '27/06/2026', hora: '18:30', home_team: 'Colombia',         away_team: 'Portugal' },
  { id: 'g66', group: 'K', jornada: 'J3', date: '27/06/2026', hora: '18:30', home_team: 'R.D. del Congo',   away_team: 'Uzbekistán' },

  // ── GRUPO L: Inglaterra, Croacia, Ghana, Panamá ────────────────────────
  { id: 'g67', group: 'L', jornada: 'J1', date: '17/06/2026', hora: '15:00', home_team: 'Inglaterra',       away_team: 'Croacia' },
  { id: 'g68', group: 'L', jornada: 'J1', date: '17/06/2026', hora: '18:00', home_team: 'Ghana',            away_team: 'Panamá' },
  { id: 'g69', group: 'L', jornada: 'J2', date: '23/06/2026', hora: '15:00', home_team: 'Inglaterra',       away_team: 'Ghana' },
  { id: 'g70', group: 'L', jornada: 'J2', date: '23/06/2026', hora: '18:00', home_team: 'Panamá',           away_team: 'Croacia' },
  { id: 'g71', group: 'L', jornada: 'J3', date: '27/06/2026', hora: '16:00', home_team: 'Panamá',           away_team: 'Inglaterra' },
  { id: 'g72', group: 'L', jornada: 'J3', date: '27/06/2026', hora: '16:00', home_team: 'Croacia',          away_team: 'Ghana' },
]

async function main() {
  console.log(`Cargando ${MATCHES.length} partidos en Supabase...`)

  let ok = 0
  let errors = 0

  for (const m of MATCHES) {
    const { error } = await supabase
      .from('matches')
      .update({
        group:     m.group,
        jornada:   m.jornada,
        date:      m.date,
        hora:      m.hora,
        home_team: m.home_team,
        away_team: m.away_team,
        phase:     'groups',
        status:    'pending',
      })
      .eq('id', m.id)

    if (error) {
      console.error(`  ✗ ${m.id} (${m.home_team} vs ${m.away_team}):`, error.message)
      errors++
    } else {
      console.log(`  ✓ ${m.id} · ${m.group} ${m.jornada} · ${m.date} ${m.hora} · ${m.home_team} vs ${m.away_team}`)
      ok++
    }
  }

  console.log(`\nListo: ${ok} actualizados, ${errors} errores.`)
}

main().catch(console.error)
