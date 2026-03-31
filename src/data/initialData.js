export const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

// 12 grupos vacíos — se rellenan desde el panel Admin
export const DEFAULT_GROUPS = Object.fromEntries(
  GROUP_LETTERS.map(g => [g, ['', '', '', '']])
)

// Pares de partidos por jornada: [local_idx, visitante_idx]
// C(4,2) = 6 combinaciones
const MATCH_PAIRS = [
  [0, 1], [2, 3],
  [0, 2], [1, 3],
  [0, 3], [1, 2],
]

export function generateGroupMatches(groups = DEFAULT_GROUPS) {
  const matches = []
  GROUP_LETTERS.forEach(group => {
    const teams = groups[group] || ['', '', '', '']
    MATCH_PAIRS.forEach(([h, a], i) => {
      matches.push({
        id: `g${group}${i + 1}`,   // ej: gA1..gA6, gL1..gL6 (ordenable)
        phase: 'groups',
        group,
        homeTeam: teams[h] || '',
        awayTeam: teams[a] || '',
        date: '',
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

// Puntos por defecto — modificables desde Admin > Configuración
export const DEFAULT_PTS = {
  exacto:      3,  // Marcador exacto (score exacto)
  resultado:   1,  // Equipo ganador / empate correcto
  clasificado: 2,  // Clasificado correcto en bracket
  ordenGrupo:  1,  // Posición exacta en tabla de grupo (por equipo)
  goleador:    2,  // Goleador en la posición correcta (por posición)
}

export const DEFAULT_CONFIG = {
  name:           'Polla Mundial',
  tournamentName: 'Mundial 2026',
  year:           '2026',
  adminPassword:  'admin123',
  pts:            { ...DEFAULT_PTS },
}
