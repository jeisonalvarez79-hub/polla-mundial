export const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

// 12 grupos vacíos — se rellenan desde el panel Admin
export const DEFAULT_GROUPS = Object.fromEntries(
  GROUP_LETTERS.map(g => [g, ['', '', '', '']])
)

// Pares de partidos por jornada: [local_idx, visitante_idx]
// C(4,2) = 6 combinaciones — índices 0-1 = J1, 2-3 = J2, 4-5 = J3
const MATCH_PAIRS = [
  [0, 1], [2, 3],
  [0, 2], [1, 3],
  [0, 3], [1, 2],
]
const JORNADAS = ['J1', 'J1', 'J2', 'J2', 'J3', 'J3']

export function generateGroupMatches(groups = DEFAULT_GROUPS) {
  const matches = []
  let seq = 1
  GROUP_LETTERS.forEach(group => {
    const teams = groups[group] || ['', '', '', '']
    MATCH_PAIRS.forEach(([h, a], pairIdx) => {
      matches.push({
        id: `g${seq++}`,
        phase: 'groups',
        group,
        homeTeam: teams[h] || '',
        awayTeam: teams[a] || '',
        date: '',
        hora: '',
        jornada: JORNADAS[pairIdx],
        homeScore: null,
        awayScore: null,
        status: 'pending',
      })
    })
  })
  return matches
}

export function generateBracketMatches() {
  const rounds = [
    { round: 'r32',   label: 'Dieciseisavos de Final', count: 16 },
    { round: 'r16',   label: 'Octavos de Final',        count: 8 },
    { round: 'qf',    label: 'Cuartos de Final',         count: 4 },
    { round: 'sf',    label: 'Semifinal',                count: 2 },
    { round: 'third', label: 'Tercer Lugar',             count: 1 },
    { round: 'final', label: 'Final',                   count: 1 },
  ]
  const matches = []
  rounds.forEach(({ round, label, count }) => {
    for (let i = 1; i <= count; i++) {
      matches.push({
        id: `${round}_${i}`,
        round,
        position: i,
        label: count > 1 ? `${label} ${i}` : label,
        homeTeam: '',
        awayTeam: '',
        homeScore: null,
        awayScore: null,
        winner: null,
        status: 'pending',
      })
    }
  })
  return matches
}

// Mapa de llaves para el R32 según sorteo oficial FIFA 2026 (M73–M88)
// "1A"=1°GrupoA  "2A"=2°GrupoA  "t1"–"t8"=mejores 3eros (por ranking)
// Los "t" se asignan por ranking entre los 8 mejores 3eros; el mapa exacto
// de qué grupo va a qué partido depende de la tabla de 495 combinaciones
// de FIFA (Anexo C). El admin puede ajustar manualmente si lo necesita.
export const R32_BRACKET_MAP = [
  { pos: 1,  home: '2A', away: '2B' },  // M73
  { pos: 2,  home: '1E', away: 't1' },  // M74
  { pos: 3,  home: '1F', away: '2C' },  // M75
  { pos: 4,  home: '1C', away: '2F' },  // M76
  { pos: 5,  home: '1I', away: 't2' },  // M77
  { pos: 6,  home: '2E', away: '2I' },  // M78
  { pos: 7,  home: '1A', away: 't3' },  // M79
  { pos: 8,  home: '1L', away: 't4' },  // M80
  { pos: 9,  home: '1D', away: 't5' },  // M81
  { pos: 10, home: '1G', away: 't6' },  // M82
  { pos: 11, home: '2K', away: '2L' },  // M83
  { pos: 12, home: '1H', away: '2J' },  // M84
  { pos: 13, home: '1B', away: 't7' },  // M85
  { pos: 14, home: '1J', away: '2H' },  // M86
  { pos: 15, home: '1K', away: 't8' },  // M87
  { pos: 16, home: '2D', away: '2G' },  // M88
]

// Mapeo oficial FIFA 2026: qué partidos de R32 forman cada llave de octavos (R16).
// [homeId, awayId] = los IDs de bracket_matches del R32 que se enfrentan.
// Orden según el fixture oficial: llaves 1-2 → octavos 1, llaves 3-4 → octavos 2, etc.
export const R16_FROM_R32 = [
  ['r32_1',  'r32_3'],  // Octavos 1: llaves 1 y 2  (Sudáfrica-Canadá  vs  Países Bajos-Marruecos)
  ['r32_2',  'r32_5'],  // Octavos 2: llaves 3 y 4  (Alemania-Paraguay  vs  Francia-Suecia)
  ['r32_10', 'r32_9'],  // Octavos 3: llaves 5 y 6  (Bélgica-Senegal  vs  EEUU-Bosnia)
  ['r32_12', 'r32_11'], // Octavos 4: llaves 7 y 8  (España-Austria  vs  Portugal-Croacia)
  ['r32_4',  'r32_6'],  // Octavos 5: llaves 9 y 10 (Brasil-Japón  vs  Costa Marfil-Noruega)
  ['r32_7',  'r32_8'],  // Octavos 6: llaves 11 y 12 (México-Ecuador  vs  Inglaterra-RD Congo)
  ['r32_13', 'r32_15'], // Octavos 7: llaves 13 y 14 (Suiza-Argelia  vs  Colombia-Ghana)
  ['r32_16', 'r32_14'], // Octavos 8: llaves 15 y 16 (Australia-Egipto  vs  Argentina-Cabo Verde)
]

// Puntos por defecto — fase de grupos (modificables desde Admin > Configuración)
export const DEFAULT_PTS = {
  exacto:      3,  // Marcador exacto
  resultado:   1,  // Equipo ganador / empate correcto
  clasificado: 2,  // Clasificado a 2da ronda (top 2 de grupo, independiente de posición)
  ordenGrupo:  1,  // Posición exacta en tabla de grupo (por equipo)
  goleador:   10,  // Goleador correcto
}

// Alias legacy (usado en Bracket.jsx y Admin.jsx para display)
export const BRACKET_PTS = {
  r32:   3,
  r16:   4,
  qf:    8,
  sf:    8,
  third: 8,
  final: 12,
}

// Puntos por llave acertada (ambos equipos correctos, sin importar orden)
export const BRACKET_PAIRING_PTS = {
  r32:   3,   // 16avos
  r16:   4,   // Octavos
  qf:    8,   // Cuartos
  sf:    8,   // Semis
  third: 8,   // 3er y 4to puesto
  final: 12,  // Final
}

// Puntos por equipo correctamente clasificado a cada ronda (acumulativos)
export const BRACKET_TEAM_PTS = {
  r16:       2,  // por equipo que llegó a octavos
  qf:        4,  // por equipo que llegó a cuartos
  sf:        4,  // por equipo que llegó a semis
  finalFour: 8,  // por equipo en la final o partido de 3er puesto (los 4 restantes)
}

// Puntos bonus por posición final (derivados del bracket del participante)
export const BONUS_PTS = {
  champion:    15,
  runnerUp:    10,
  thirdPlace:  8,
  fourthPlace: 6,
}

// Bloqueos por fase: false = abierto, true = bloqueado
export const DEFAULT_LOCKS = {
  scorer: false,
  groups: false,
  r32:    false,
  r16:    false,
  qf:     false,
  sf:     false,
  third:  false,
  final:  false,
}

export const DEFAULT_CONFIG = {
  name:           'Polla Mundial',
  tournamentName: 'Mundial 2026',
  year:           '2026',
  pts:            { ...DEFAULT_PTS },
  locks:          { ...DEFAULT_LOCKS },
}
