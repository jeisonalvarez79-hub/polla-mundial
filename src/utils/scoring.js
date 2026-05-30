import { DEFAULT_PTS, BRACKET_PTS, GROUP_LETTERS, R32_BRACKET_MAP } from '../data/initialData'

function pts(config) {
  return { ...DEFAULT_PTS, ...(config?.pts || {}) }
}

// Ordena una lista de equipos con criterios FIFA: puntos → h2h → DG → GF → alfabético
function sortGroupTeams(list, finished) {
  function h2h(names) {
    const stats = Object.fromEntries(names.map(n => [n, { Pts: 0, DG: 0, GF: 0 }]))
    finished
      .filter(m => names.includes(m.homeTeam) && names.includes(m.awayTeam))
      .forEach(m => {
        const h = stats[m.homeTeam], a = stats[m.awayTeam]
        if (!h || !a) return
        h.GF += m.homeScore; h.DG += m.homeScore - m.awayScore
        a.GF += m.awayScore; a.DG += m.awayScore - m.homeScore
        if (m.homeScore > m.awayScore)      h.Pts += 3
        else if (m.homeScore < m.awayScore) a.Pts += 3
        else                                { h.Pts += 1; a.Pts += 1 }
      })
    return stats
  }

  list.sort((a, b) => b.Pts - a.Pts)

  const result = []
  let i = 0
  while (i < list.length) {
    let j = i + 1
    while (j < list.length && list[j].Pts === list[i].Pts) j++
    const tied = list.slice(i, j)
    if (tied.length > 1) {
      const hh = h2h(tied.map(t => t.name))
      tied.sort((a, b) => {
        const ha = hh[a.name], hb = hh[b.name]
        if (hb.Pts !== ha.Pts) return hb.Pts - ha.Pts
        if (hb.DG  !== ha.DG)  return hb.DG  - ha.DG
        if (hb.GF  !== ha.GF)  return hb.GF  - ha.GF
        if (b.DG   !== a.DG)   return b.DG   - a.DG
        if (b.GF   !== a.GF)   return b.GF   - a.GF
        return a.name.localeCompare(b.name)
      })
    }
    result.push(...tied)
    i = j
  }
  return result
}

/**
 * Calcula la tabla de posiciones de un grupo con los resultados REALES (criterios FIFA 2026).
 */
export function calcGroupStandings(matches, group) {
  const groupMatches = matches.filter(m => m.group === group && m.phase === 'groups')
  const teams = {}

  groupMatches.forEach(m => {
    if (m.homeTeam && !teams[m.homeTeam]) teams[m.homeTeam] = { J: 0, G: 0, E: 0, P: 0, GF: 0, GC: 0 }
    if (m.awayTeam && !teams[m.awayTeam]) teams[m.awayTeam] = { J: 0, G: 0, E: 0, P: 0, GF: 0, GC: 0 }
  })

  const finished = groupMatches.filter(m => m.homeScore !== null && m.awayScore !== null)

  finished.forEach(m => {
    const h = teams[m.homeTeam], a = teams[m.awayTeam]
    if (!h || !a) return
    h.J++; a.J++
    h.GF += m.homeScore; h.GC += m.awayScore
    a.GF += m.awayScore; a.GC += m.homeScore
    if (m.homeScore > m.awayScore)      { h.G++; a.P++ }
    else if (m.homeScore < m.awayScore) { a.G++; h.P++ }
    else                                { h.E++; a.E++ }
  })

  const list = Object.entries(teams).map(([name, s]) => ({
    name, ...s, Pts: s.G * 3 + s.E, DG: s.GF - s.GC,
  }))

  return sortGroupTeams(list, finished)
}

/**
 * Calcula la tabla de un grupo usando los PRONÓSTICOS de un participante (no resultados reales).
 */
export function calcPredictedGroupStandings(matches, predictions, participantId, group) {
  const groupMatches = matches.filter(m => m.group === group && m.phase === 'groups')
  const teams = {}

  groupMatches.forEach(m => {
    if (m.homeTeam && !teams[m.homeTeam]) teams[m.homeTeam] = { J: 0, G: 0, E: 0, P: 0, GF: 0, GC: 0 }
    if (m.awayTeam && !teams[m.awayTeam]) teams[m.awayTeam] = { J: 0, G: 0, E: 0, P: 0, GF: 0, GC: 0 }
  })

  // Reemplaza los marcadores reales con los pronosticados
  const withPreds = groupMatches.map(m => {
    const pred = predictions.find(p => p.participantId === participantId && p.matchId === m.id)
    return { ...m, homeScore: pred?.homeScore ?? null, awayScore: pred?.awayScore ?? null }
  })
  const finished = withPreds.filter(m => m.homeScore !== null && m.awayScore !== null)

  finished.forEach(m => {
    const h = teams[m.homeTeam], a = teams[m.awayTeam]
    if (!h || !a) return
    h.J++; a.J++
    h.GF += m.homeScore; h.GC += m.awayScore
    a.GF += m.awayScore; a.GC += m.homeScore
    if (m.homeScore > m.awayScore)      { h.G++; a.P++ }
    else if (m.homeScore < m.awayScore) { a.G++; h.P++ }
    else                                { h.E++; a.E++ }
  })

  const list = Object.entries(teams).map(([name, s]) => ({
    name, ...s, Pts: s.G * 3 + s.E, DG: s.GF - s.GC,
  }))

  return sortGroupTeams(list, finished)
}

/**
 * Calcula los 32 clasificados según los PRONÓSTICOS de un participante.
 * Retorna { '1A': 'España', '2B': 'Francia', 't1': 'Marruecos', ... }
 */
export function calcPredictedR32Qualifiers(matches, predictions, participantId) {
  const qualifiers = {}
  const thirdPlaceTeams = []

  GROUP_LETTERS.forEach(group => {
    const standings = calcPredictedGroupStandings(matches, predictions, participantId, group)
    if (standings[0]?.name) qualifiers[`1${group}`] = standings[0].name
    if (standings[1]?.name) qualifiers[`2${group}`] = standings[1].name
    if (standings[2]?.name) thirdPlaceTeams.push({ ...standings[2], group })
  })

  thirdPlaceTeams
    .sort((a, b) => {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts
      if (b.DG  !== a.DG)  return b.DG  - a.DG
      if (b.GF  !== a.GF)  return b.GF  - a.GF
      return a.name.localeCompare(b.name)
    })
    .slice(0, 8)
    .forEach((t, i) => { qualifiers[`t${i + 1}`] = t.name })

  return qualifiers
}

/**
 * Calcula los equipos que juegan en cada llave de la fase eliminatoria,
 * basándose en los PRONÓSTICOS del participante (cascada completa de fases).
 * adminBracket: bracket real del admin, usado como fallback para R32 cuando las
 * predicciones de grupos no son suficientes para calcular los clasificados.
 * Retorna { 'r32_1': { homeTeam, awayTeam }, 'r16_1': { homeTeam, awayTeam }, ... }
 */
export function calcPredictedBracketTeams(matches, predictions, bracketPredictions, participantId, adminBracket = []) {
  const qualifiers = calcPredictedR32Qualifiers(matches, predictions, participantId)
  const teamMap = {}

  // R32: equipos según pronósticos de grupos; si no hay, usa el bracket del admin como fallback
  R32_BRACKET_MAP.forEach(({ pos, home, away }) => {
    const admin = adminBracket.find(m => m.id === `r32_${pos}`)
    teamMap[`r32_${pos}`] = {
      homeTeam: qualifiers[home] || admin?.homeTeam || '',
      awayTeam: qualifiers[away] || admin?.awayTeam || '',
    }
  })

  // Retorna el ganador pronosticado de una llave, validando que sea uno de los equipos
  // que realmente juegan ese partido según los pronósticos del participante.
  function getPredWinner(matchId) {
    const pred = bracketPredictions.find(
      p => p.participantId === participantId && p.bracketMatchId === matchId
    )
    if (!pred?.predictedWinner) return ''
    const teams = teamMap[matchId]
    if (!teams || (!teams.homeTeam && !teams.awayTeam)) return ''
    // Acepta el ganador si coincide con al menos uno de los equipos conocidos
    if (
      (teams.homeTeam && teams.homeTeam === pred.predictedWinner) ||
      (teams.awayTeam && teams.awayTeam === pred.predictedWinner)
    ) {
      return pred.predictedWinner
    }
    return ''
  }

  function getLoser(matchId) {
    const winner = getPredWinner(matchId)
    if (!winner) return ''
    const teams = teamMap[matchId]
    return teams.homeTeam === winner ? teams.awayTeam : teams.homeTeam
  }

  // R16: ganador de r32_(2n-1) vs ganador de r32_(2n)
  for (let pos = 1; pos <= 8; pos++) {
    teamMap[`r16_${pos}`] = {
      homeTeam: getPredWinner(`r32_${pos * 2 - 1}`),
      awayTeam: getPredWinner(`r32_${pos * 2}`),
    }
  }

  // Cuartos de Final
  for (let pos = 1; pos <= 4; pos++) {
    teamMap[`qf_${pos}`] = {
      homeTeam: getPredWinner(`r16_${pos * 2 - 1}`),
      awayTeam: getPredWinner(`r16_${pos * 2}`),
    }
  }

  // Semifinal
  for (let pos = 1; pos <= 2; pos++) {
    teamMap[`sf_${pos}`] = {
      homeTeam: getPredWinner(`qf_${pos * 2 - 1}`),
      awayTeam: getPredWinner(`qf_${pos * 2}`),
    }
  }

  // Tercer lugar: perdedores de las semis
  teamMap['third_1'] = {
    homeTeam: getLoser('sf_1'),
    awayTeam: getLoser('sf_2'),
  }

  // Final
  teamMap['final_1'] = {
    homeTeam: getPredWinner('sf_1'),
    awayTeam: getPredWinner('sf_2'),
  }

  return teamMap
}

/**
 * Determina los 32 clasificados al R32 (24 líderes + subcampeones + 8 mejores 3eros).
 * Retorna un mapa { '1A': 'España', '2B': 'Francia', 't1': 'Marruecos', ... }
 */
export function calcR32Qualifiers(matches) {
  const qualifiers = {}
  const thirdPlaceTeams = []

  GROUP_LETTERS.forEach(group => {
    const standings = calcGroupStandings(matches, group)
    if (standings[0]?.name) qualifiers[`1${group}`] = standings[0].name
    if (standings[1]?.name) qualifiers[`2${group}`] = standings[1].name
    if (standings[2]?.name) thirdPlaceTeams.push({ ...standings[2], group })
  })

  thirdPlaceTeams
    .sort((a, b) => {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts
      if (b.DG  !== a.DG)  return b.DG  - a.DG
      if (b.GF  !== a.GF)  return b.GF  - a.GF
      return a.name.localeCompare(b.name)
    })
    .slice(0, 8)
    .forEach((t, i) => { qualifiers[`t${i + 1}`] = t.name })

  return qualifiers
}

/**
 * Puntaje por partido de grupo.
 * 3 pts marcador exacto / 1 pt ganador o empate correcto.
 */
export function calcGroupScore(prediction, match, config) {
  if (match.homeScore === null || match.awayScore === null) return 0
  if (!prediction || prediction.homeScore === null || prediction.awayScore === null) return 0

  const p = pts(config)
  const rH = match.homeScore, rA = match.awayScore
  const pH = prediction.homeScore, pA = prediction.awayScore

  if (pH === rH && pA === rA) return p.exacto

  const result = rH > rA ? 'H' : rA > rH ? 'A' : 'D'
  const pred   = pH > pA ? 'H' : pA > pH ? 'A' : 'D'
  if (result === pred) return p.resultado

  return 0
}

/**
 * Puntaje por llave en fase eliminatoria.
 * Los puntos dependen de la ronda (hardcoded según reglamento).
 */
export function calcBracketScore(prediction, bracketMatch, config) {
  if (!bracketMatch.winner || !prediction) return 0
  if (prediction.predictedWinner !== bracketMatch.winner) return 0
  return BRACKET_PTS[bracketMatch.round] ?? 0
}

/**
 * Puntaje por clasificación de grupo.
 * - 2 pts por cada equipo del top-2 pronosticado que realmente clasificó (independiente de posición).
 * - 1 pt adicional por cada posición exacta en el grupo.
 */
export function calcStandingsScore(predStandings, actualStandings, config) {
  if (!predStandings || !actualStandings) return 0
  const p = pts(config)
  let score = 0

  // 2 pts por clasificado a 2da ronda (top 2), independiente de posición
  const actualTop2 = actualStandings.slice(0, 2).filter(Boolean)
  const predTop2   = predStandings.slice(0, 2).filter(Boolean)
  for (const team of predTop2) {
    if (actualTop2.includes(team)) score += p.clasificado
  }

  // 1 pt por posición exacta en el grupo
  for (let i = 0; i < 4; i++) {
    if (predStandings[i] && actualStandings[i] && predStandings[i] === actualStandings[i]) {
      score += p.ordenGrupo
    }
  }

  return score
}

/**
 * Puntaje por goleador (participante predice 1, gana puntos si aparece en el top oficial).
 */
export function calcScorerScore(predScorers, actualScorers, config) {
  if (!predScorers || !actualScorers) return 0
  const p = pts(config)
  const pred = predScorers[0]
  if (!pred) return 0
  if (actualScorers.some(s => s && s === pred)) return p.goleador
  return 0
}

/**
 * Estadísticas completas de un participante con puntos desglosados.
 */
export function calcParticipantStats(
  participantId,
  matches, predictions,
  bracketMatches, bracketPredictions,
  groupStandings, standingsPredictions,
  topScorers, scorerPredictions,
  config
) {
  let ptsExacto     = 0
  let ptsResultado  = 0
  let ptsBracket    = 0
  let ptsStandings  = 0
  let ptsScorers    = 0
  const p = pts(config)

  // --- Partidos de grupos ---
  const finishedGroups = matches.filter(m => m.status === 'finished' && m.phase === 'groups')
  for (const match of finishedGroups) {
    const pred = predictions.find(pr => pr.participantId === participantId && pr.matchId === match.id)
    const score = calcGroupScore(pred, match, config)
    if (score === p.exacto) ptsExacto    += score
    else if (score > 0)     ptsResultado += score
  }

  // --- Clasificación de grupos (clasificado + posición exacta) ---
  for (const group of Object.keys(groupStandings || {})) {
    const actual = groupStandings[group]
    if (!actual || actual.every(t => !t)) continue
    const pred = (standingsPredictions || []).find(
      pr => pr.participantId === participantId && pr.group === group
    )
    ptsStandings += calcStandingsScore(pred?.standings, actual, config)
  }

  // --- Bracket ---
  const finishedBracket = bracketMatches.filter(m => m.winner)
  for (const bm of finishedBracket) {
    const pred = bracketPredictions.find(
      pr => pr.participantId === participantId && pr.bracketMatchId === bm.id
    )
    ptsBracket += calcBracketScore(pred, bm, config)
  }

  // --- Goleadores ---
  if (topScorers && topScorers.some(s => s)) {
    const pred = (scorerPredictions || []).find(pr => pr.participantId === participantId)
    ptsScorers += calcScorerScore(pred?.scorers, topScorers, config)
  }

  return {
    ptsExacto,
    ptsResultado,
    ptsBracket,
    ptsStandings,
    ptsScorers,
    total: ptsExacto + ptsResultado + ptsBracket + ptsStandings + ptsScorers,
  }
}

/**
 * Ranking completo ordenado por puntos totales.
 */
export function buildRanking(
  participants,
  matches, predictions,
  bracketMatches, bracketPredictions,
  groupStandings, standingsPredictions,
  topScorers, scorerPredictions,
  config
) {
  return participants
    .map(p => ({
      participant: p,
      stats: calcParticipantStats(
        p.id,
        matches, predictions,
        bracketMatches, bracketPredictions,
        groupStandings, standingsPredictions,
        topScorers, scorerPredictions,
        config
      ),
    }))
    .sort((a, b) => b.stats.total - a.stats.total)
    .map((entry, i) => ({ ...entry, position: i + 1 }))
}
