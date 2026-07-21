export const GROUP_LETTERS = ['A', 'B', 'C', 'D']

// Grupos vacíos — se rellenan desde el panel Admin
export const DEFAULT_GROUPS = Object.fromEntries(
  GROUP_LETTERS.map(g => [g, ['', '', '', '']])
)

// Pares de partidos por jornada: [local_idx, visitante_idx]
// C(4,2) = 6 combinaciones — índices 0-1 = J1, 2-3 = J2, 4-5 = J3
export const MATCH_PAIRS = [
  [0, 1], [2, 3],
  [0, 2], [1, 3],
  [0, 3], [1, 2],
]
const JORNADAS = ['J1', 'J1', 'J2', 'J2', 'J3', 'J3']

// Cuántos equipos clasifican por grupo (siempre 2: 1° y 2°) y cuántos "mejores
// terceros" adicionales se suman entre todos los grupos (Mundial 2026: 8; en
// formatos sin mejores terceros, como Copa América, este valor es 0).
export const QUALIFIER_RULES = {
  directPerGroup: 2,
  bestThirds: 0,
}
export const TOTAL_QUALIFIERS = GROUP_LETTERS.length * QUALIFIER_RULES.directPerGroup + QUALIFIER_RULES.bestThirds
export const TOTAL_GROUP_MATCHES = GROUP_LETTERS.length * MATCH_PAIRS.length

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

// Mapa de llaves para Cuartos de Final según el cruce oficial de Copa América
// (confirmado contra Copa América 2024: 1° de un grupo enfrenta al 2° del
// grupo "pareja" — 1A-2B, 1B-2A, 1C-2D, 1D-2C — no al 2° de su propio grupo).
// "1A"=1°GrupoA  "2A"=2°GrupoA. Este formato no usa "mejores terceros"
// (QUALIFIER_RULES.bestThirds = 0): los 8 cupos a cuartos salen directo del
// top-2 de los 4 grupos.
export const QF_BRACKET_MAP = [
  { pos: 1, home: '1A', away: '2B' },
  { pos: 2, home: '1B', away: '2A' },
  { pos: 3, home: '1C', away: '2D' },
  { pos: 4, home: '1D', away: '2C' },
]

// Cruce oficial de semifinales (confirmado contra Copa América 2024: SF1 =
// ganador QF1 vs ganador QF2, SF2 = ganador QF3 vs ganador QF4 — adyacente,
// a diferencia del cruce del Mundial que salta una posición para no mezclar
// mitades de un cuadro de 8 cuartos).
export const SF_FROM_QF = [
  ['qf_1', 'qf_2'],  // sf_1
  ['qf_3', 'qf_4'],  // sf_2
]

// ─── Fuente única de verdad del bracket eliminatorio ───────────────────────────
// Reemplaza los `if/else if` por ronda que solían vivir repartidos en
// AppContext.jsx (bracket real) y scoring.js (pronósticos) — ambos consumen
// esta misma lista, así que "quién juega contra quién" nunca puede
// desincronizarse entre el bracket real y los pronósticos (ver bug corregido
// 2026-07-21: calcPredictedBracketTeams usaba pairing lineal mientras
// AppContext.jsx usaba el fixture oficial).
//
// Cada entrada:
//   id            - prefijo de los partidos de esta ronda (`${id}_${n}`)
//   label/shortLabel - texto para UI
//   count         - número de llaves en la ronda
//   qualifierMap  - SOLO en la ronda semilla: de dónde sale cada llave a
//                   partir de los clasificados de grupos ('1A'/'2B'/'tN')
//   pairing       - [[idPartidoA, idPartidoB], ...] cuyos GANADORES arman
//                   cada llave de esta ronda (longitud === count)
//   losersPairing - igual que `pairing` pero con los PERDEDORES (solo 3er lugar)
//   teamPtsKey/pairingPtsKey - claves en BRACKET_TEAM_PTS/BRACKET_PAIRING_PTS
//                   (por defecto, el propio `id`; final/third usan 'finalFour'
//                   para los puntos de equipo, ya que ambos son "el final four")
export const BRACKET_ROUNDS = [
  { id: 'qf',    label: 'Cuartos de Final',        shortLabel: 'Cuartos', count: 4, qualifierMap: QF_BRACKET_MAP },
  { id: 'sf',    label: 'Semifinal',               shortLabel: 'Semis',   count: 2, pairing: SF_FROM_QF },
  { id: 'third', label: 'Tercer Lugar',            shortLabel: '3er Lugar', count: 1, losersPairing: [['sf_1', 'sf_2']], teamPtsKey: 'finalFour' },
  { id: 'final', label: 'Final',                   shortLabel: 'Final',   count: 1, pairing: [['sf_1', 'sf_2']], teamPtsKey: 'finalFour' },
]

export const ROUND_ORDER = BRACKET_ROUNDS.map(r => r.id)
export const ROUND_LABEL = Object.fromEntries(BRACKET_ROUNDS.map(r => [r.id, r.label]))

export function generateBracketMatches() {
  const matches = []
  BRACKET_ROUNDS.forEach(({ id: round, label, count }) => {
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

// Puntos por defecto — fase de grupos (modificables desde Admin > Configuración)
export const DEFAULT_PTS = {
  exacto:      3,  // Marcador exacto
  resultado:   1,  // Equipo ganador / empate correcto
  clasificado: 2,  // Clasificado a 2da ronda (top 2 de grupo, independiente de posición)
  ordenGrupo:  1,  // Posición exacta en tabla de grupo (por equipo)
  goleador:   10,  // Goleador correcto
}

// Puntos por llave acertada (ambos equipos correctos, sin importar orden).
// Mismos valores que se usaban en el Mundial 2026 para estas rondas — no se
// rebalancean por tener un bracket más corto (decisión explícita).
export const BRACKET_PAIRING_PTS = {
  qf:    8,   // Cuartos
  sf:    8,   // Semis
  third: 8,   // 3er y 4to puesto
  final: 12,  // Final
}

// Puntos por equipo correctamente clasificado a cada ronda (acumulativos).
// La ronda semilla (qf) no otorga puntos de "equipo avanzado" — llegar ahí
// ya se premia con "clasificado" (ver calcClasificadoScore).
export const BRACKET_TEAM_PTS = {
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
  qf:     false,
  sf:     false,
  third:  false,
  final:  false,
}

export const DEFAULT_CONFIG = {
  name:           'Polla Copa América',
  tournamentName: 'Copa América',
  year:           '',
  pts:            { ...DEFAULT_PTS },
  locks:          { ...DEFAULT_LOCKS },
}
