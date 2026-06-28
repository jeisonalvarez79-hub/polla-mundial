import { DEFAULT_PTS, BRACKET_PAIRING_PTS, BRACKET_TEAM_PTS, BONUS_PTS, GROUP_LETTERS, R32_BRACKET_MAP } from '../data/initialData'

function pts(config) {
  return { ...DEFAULT_PTS, ...(config?.pts || {}) }
}

// Ordena equipos con criterios FIFA 2026:
// Pts → DG general → GF general → H2H Pts → H2H DG → H2H GF → alfabético
function sortGroupTeams(list, finished) {
  function calcH2H(names) {
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

  // Para equipos empatados en Pts: DG general → GF general → H2H (solo entre aún empatados)
  function resolveGroup(group) {
    if (group.length <= 1) return group
    group.sort((a, b) => b.DG - a.DG || b.GF - a.GF)
    const result = []
    let i = 0
    while (i < group.length) {
      let j = i + 1
      while (j < group.length && group[j].DG === group[i].DG && group[j].GF === group[i].GF) j++
      const sub = group.slice(i, j)
      if (sub.length > 1) {
        const hh = calcH2H(sub.map(t => t.name))
        sub.sort((a, b) => {
          const ha = hh[a.name], hb = hh[b.name]
          return hb.Pts - ha.Pts || hb.DG - ha.DG || hb.GF - ha.GF || a.name.localeCompare(b.name)
        })
      }
      result.push(...sub)
      i = j
    }
    return result
  }

  list.sort((a, b) => b.Pts - a.Pts)

  const result = []
  let i = 0
  while (i < list.length) {
    let j = i + 1
    while (j < list.length && list[j].Pts === list[i].Pts) j++
    result.push(...resolveGroup(list.slice(i, j)))
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
 * Compatibilidad con Admin/Bracket — el nuevo sistema no da pts por ganador individual;
 * el puntaje real está en calcBracketScoreAll (por ronda). Retorna 0 siempre.
 */
export function calcBracketScore(_prediction, _match, _config) {
  return 0
}

/**
 * Calcula todos los puntos de bracket para un participante.
 *
 * R32  → 3 pts por llave acertada (ambos equipos, sin importar orden)
 * R16  → 2 pts/equipo clasificado + 4 pts/llave acertada
 * QF   → 4 pts/equipo clasificado + 8 pts/llave acertada
 * SF   → 4 pts/equipo clasificado + 8 pts/llave acertada
 * Final four (4 equipos: 2 finalistas + 2 de 3er puesto):
 *        8 pts/equipo + 8 pts llave 3er puesto + 12 pts llave final
 * Bonus → campeón 15, subcampeón 10, 3ro 8, 4to 6
 *
 * Los equipos son acumulativos: si un equipo avanza varias rondas
 * da puntos en cada ronda que el participante acertó.
 */
export function calcBracketScoreAll(participantId, bracketMatches, bracketPredictions, matches, predictions) {
  let ptsPairing = 0
  let ptsTeam    = 0
  let ptsBonus   = 0

  const predTeamMap = calcPredictedBracketTeams(
    matches, predictions, bracketPredictions, participantId, bracketMatches
  )

  // ¿Los 2 equipos de una llave coinciden sin importar orden?
  function pairsMatch(ph, pa, ah, aa) {
    if (!ph || !pa || !ah || !aa) return false
    return (ph === ah && pa === aa) || (ph === aa && pa === ah)
  }

  // Todos los equipos registrados en una ronda real (flat set)
  function actualTeamsSet(round) {
    return new Set(
      bracketMatches
        .filter(m => m.round === round)
        .flatMap(m => [m.homeTeam, m.awayTeam])
        .filter(Boolean)
    )
  }

  // Todos los equipos predichos para una lista de IDs de llave
  function predTeamsSet(ids) {
    return new Set(
      ids.flatMap(id => [predTeamMap[id]?.homeTeam, predTeamMap[id]?.awayTeam])
         .filter(Boolean)
    )
  }

  // ── R32: solo llave acertada (3 pts) ───────────────────────────────────────
  for (let i = 1; i <= 16; i++) {
    const bm = bracketMatches.find(m => m.id === `r32_${i}`)
    const pm = predTeamMap[`r32_${i}`]
    if (!bm?.homeTeam || !bm?.awayTeam || !pm?.homeTeam || !pm?.awayTeam) continue
    if (pairsMatch(pm.homeTeam, pm.awayTeam, bm.homeTeam, bm.awayTeam)) ptsPairing += BRACKET_PAIRING_PTS.r32
  }

  // ── R16: 2 pts/equipo + 4 pts/llave ───────────────────────────────────────
  const aR16 = actualTeamsSet('r16')
  if (aR16.size > 0) {
    const pR16 = predTeamsSet(Array.from({ length: 8 }, (_, i) => `r16_${i + 1}`))
    for (const t of pR16) if (aR16.has(t)) ptsTeam += BRACKET_TEAM_PTS.r16
    for (let i = 1; i <= 8; i++) {
      const bm = bracketMatches.find(m => m.id === `r16_${i}`)
      const pm = predTeamMap[`r16_${i}`]
      if (!bm?.homeTeam || !bm?.awayTeam || !pm?.homeTeam || !pm?.awayTeam) continue
      if (pairsMatch(pm.homeTeam, pm.awayTeam, bm.homeTeam, bm.awayTeam)) ptsPairing += BRACKET_PAIRING_PTS.r16
    }
  }

  // ── QF: 4 pts/equipo + 8 pts/llave ────────────────────────────────────────
  const aQF = actualTeamsSet('qf')
  if (aQF.size > 0) {
    const pQF = predTeamsSet(['qf_1', 'qf_2', 'qf_3', 'qf_4'])
    for (const t of pQF) if (aQF.has(t)) ptsTeam += BRACKET_TEAM_PTS.qf
    for (let i = 1; i <= 4; i++) {
      const bm = bracketMatches.find(m => m.id === `qf_${i}`)
      const pm = predTeamMap[`qf_${i}`]
      if (!bm?.homeTeam || !bm?.awayTeam || !pm?.homeTeam || !pm?.awayTeam) continue
      if (pairsMatch(pm.homeTeam, pm.awayTeam, bm.homeTeam, bm.awayTeam)) ptsPairing += BRACKET_PAIRING_PTS.qf
    }
  }

  // ── SF: 4 pts/equipo + 8 pts/llave ────────────────────────────────────────
  const aSF = actualTeamsSet('sf')
  if (aSF.size > 0) {
    const pSF = predTeamsSet(['sf_1', 'sf_2'])
    for (const t of pSF) if (aSF.has(t)) ptsTeam += BRACKET_TEAM_PTS.sf
    for (let i = 1; i <= 2; i++) {
      const bm = bracketMatches.find(m => m.id === `sf_${i}`)
      const pm = predTeamMap[`sf_${i}`]
      if (!bm?.homeTeam || !bm?.awayTeam || !pm?.homeTeam || !pm?.awayTeam) continue
      if (pairsMatch(pm.homeTeam, pm.awayTeam, bm.homeTeam, bm.awayTeam)) ptsPairing += BRACKET_PAIRING_PTS.sf
    }
  }

  // ── Final four: 8 pts/equipo (2 finalistas + 2 de 3er puesto) ─────────────
  const bmFinal = bracketMatches.find(m => m.id === 'final_1')
  const bmThird = bracketMatches.find(m => m.id === 'third_1')
  const aFF = new Set([
    bmFinal?.homeTeam, bmFinal?.awayTeam,
    bmThird?.homeTeam, bmThird?.awayTeam,
  ].filter(Boolean))

  if (aFF.size > 0) {
    const pmFinal = predTeamMap['final_1']
    const pmThird = predTeamMap['third_1']
    const pFF = new Set([
      pmFinal?.homeTeam, pmFinal?.awayTeam,
      pmThird?.homeTeam, pmThird?.awayTeam,
    ].filter(Boolean))
    for (const t of pFF) if (aFF.has(t)) ptsTeam += BRACKET_TEAM_PTS.finalFour

    // Llave 3er puesto (8 pts)
    if (bmThird?.homeTeam && bmThird?.awayTeam && pmThird?.homeTeam && pmThird?.awayTeam)
      if (pairsMatch(pmThird.homeTeam, pmThird.awayTeam, bmThird.homeTeam, bmThird.awayTeam))
        ptsPairing += BRACKET_PAIRING_PTS.third

    // Llave final (12 pts)
    if (bmFinal?.homeTeam && bmFinal?.awayTeam && pmFinal?.homeTeam && pmFinal?.awayTeam)
      if (pairsMatch(pmFinal.homeTeam, pmFinal.awayTeam, bmFinal.homeTeam, bmFinal.awayTeam))
        ptsPairing += BRACKET_PAIRING_PTS.final
  }

  // ── Bonus: campeón (15), subcampeón (10), 3ro (8), 4to (6) ────────────────
  if (bmFinal?.winner) {
    const predWinner = bracketPredictions.find(
      p => p.participantId === participantId && p.bracketMatchId === 'final_1'
    )?.predictedWinner
    const pmFinal = predTeamMap['final_1']

    if (predWinner && predWinner === bmFinal.winner) ptsBonus += BONUS_PTS.champion

    const actualRU = bmFinal.homeTeam === bmFinal.winner ? bmFinal.awayTeam : bmFinal.homeTeam
    const predRU   = pmFinal?.homeTeam === predWinner    ? pmFinal?.awayTeam : pmFinal?.homeTeam
    if (predRU && actualRU && predRU === actualRU) ptsBonus += BONUS_PTS.runnerUp
  }

  if (bmThird?.winner) {
    const predWinner = bracketPredictions.find(
      p => p.participantId === participantId && p.bracketMatchId === 'third_1'
    )?.predictedWinner
    const pmThird = predTeamMap['third_1']

    if (predWinner && predWinner === bmThird.winner) ptsBonus += BONUS_PTS.thirdPlace

    const actualFourth = bmThird.homeTeam === bmThird.winner ? bmThird.awayTeam : bmThird.homeTeam
    const predFourth   = pmThird?.homeTeam === predWinner    ? pmThird?.awayTeam : pmThird?.homeTeam
    if (predFourth && actualFourth && predFourth === actualFourth) ptsBonus += BONUS_PTS.fourthPlace
  }

  return { ptsPairing, ptsTeam, ptsBonus, total: ptsPairing + ptsTeam + ptsBonus }
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

  // --- Clasificación de grupos ---
  for (const group of GROUP_LETTERS) {
    const groupMatches = matches.filter(m => m.group === group && m.phase === 'groups')
    if (!groupMatches.length) continue
    const allFinished = groupMatches.every(m => m.homeScore !== null && m.awayScore !== null)
    if (!allFinished) continue
    const actual    = calcGroupStandings(matches, group).map(t => t.name)
    const predicted = calcPredictedGroupStandings(matches, predictions, participantId, group).map(t => t.name)
    if (!actual.length || !predicted.length) continue
    ptsStandings += calcStandingsScore(predicted, actual, config)
  }

  // --- Bracket ---
  const { total: bracketTotal } = calcBracketScoreAll(
    participantId, bracketMatches, bracketPredictions, matches, predictions
  )
  ptsBracket = bracketTotal

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
