import { DEFAULT_PTS, BRACKET_PAIRING_PTS, BRACKET_TEAM_PTS, BONUS_PTS, GROUP_LETTERS, BRACKET_ROUNDS, QUALIFIER_RULES } from '../data/initialData.js'

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
 * Calcula los clasificados a la ronda semilla del bracket según los PRONÓSTICOS
 * de un participante (TOTAL_QUALIFIERS equipos: top-2 por grupo + mejores
 * terceros si el formato los usa).
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

  if (QUALIFIER_RULES.bestThirds > 0) {
    thirdPlaceTeams
      .sort((a, b) => {
        if (b.Pts !== a.Pts) return b.Pts - a.Pts
        if (b.DG  !== a.DG)  return b.DG  - a.DG
        if (b.GF  !== a.GF)  return b.GF  - a.GF
        return a.name.localeCompare(b.name)
      })
      .slice(0, QUALIFIER_RULES.bestThirds)
      .forEach((t, i) => { qualifiers[`t${i + 1}`] = t.name })
  }

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

  // Misma fuente de verdad (BRACKET_ROUNDS) que usa el bracket real del admin
  // (AppContext.jsx propagateBracketRound) — ver comentario en initialData.js.
  BRACKET_ROUNDS.forEach(roundDef => {
    if (roundDef.qualifierMap) {
      // Ronda semilla: equipos según pronósticos de grupos; si no hay,
      // usa el bracket del admin como fallback.
      roundDef.qualifierMap.forEach(({ pos, home, away }) => {
        const id = `${roundDef.id}_${pos}`
        const admin = adminBracket.find(m => m.id === id)
        teamMap[id] = {
          homeTeam: qualifiers[home] || admin?.homeTeam || '',
          awayTeam: qualifiers[away] || admin?.awayTeam || '',
        }
      })
    } else if (roundDef.pairing) {
      roundDef.pairing.forEach(([id1, id2], i) => {
        teamMap[`${roundDef.id}_${i + 1}`] = {
          homeTeam: getPredWinner(id1),
          awayTeam: getPredWinner(id2),
        }
      })
    } else if (roundDef.losersPairing) {
      roundDef.losersPairing.forEach(([id1, id2], i) => {
        teamMap[`${roundDef.id}_${i + 1}`] = {
          homeTeam: getLoser(id1),
          awayTeam: getLoser(id2),
        }
      })
    }
  })

  return teamMap
}

/**
 * Determina los clasificados a la ronda semilla del bracket (líderes + subcampeones
 * de cada grupo, más los mejores terceros si el formato los usa — QUALIFIER_RULES.bestThirds).
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

  if (QUALIFIER_RULES.bestThirds > 0) {
    thirdPlaceTeams
      .sort((a, b) => {
        if (b.Pts !== a.Pts) return b.Pts - a.Pts
        if (b.DG  !== a.DG)  return b.DG  - a.DG
        if (b.GF  !== a.GF)  return b.GF  - a.GF
        return a.name.localeCompare(b.name)
      })
      .slice(0, QUALIFIER_RULES.bestThirds)
      .forEach((t, i) => { qualifiers[`t${i + 1}`] = t.name })
  }

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

  // Construye un Set de llaves reales de una ronda para comparación sin importar slot.
  // Cada llave se representa como "equipoA|equipoB" con los equipos ordenados alfabéticamente.
  function actualPairingsSet(round) {
    const s = new Set()
    bracketMatches
      .filter(m => m.round === round && m.homeTeam && m.awayTeam)
      .forEach(m => s.add([m.homeTeam, m.awayTeam].sort().join('|')))
    return s
  }

  // ── Por cada ronda del bracket (misma fuente BRACKET_ROUNDS que usa el
  // bracket real): puntos por equipo clasificado + puntos por llave acertada,
  // siempre comparando por CONJUNTO de equipos, no por slot/posición. La
  // ronda semilla (qualifierMap, ej. R32) no da puntos de "equipo avanzado"
  // — llegar ahí ya se premia aparte con calcClasificadoScore.
  BRACKET_ROUNDS.forEach(roundDef => {
    const ids = Array.from({ length: roundDef.count }, (_, i) => `${roundDef.id}_${i + 1}`)

    const teamPtsKey = roundDef.teamPtsKey || roundDef.id
    if (!roundDef.qualifierMap && BRACKET_TEAM_PTS[teamPtsKey] != null) {
      const actualTeams = actualTeamsSet(roundDef.id)
      if (actualTeams.size > 0) {
        const predTeams = predTeamsSet(ids)
        for (const t of predTeams) if (actualTeams.has(t)) ptsTeam += BRACKET_TEAM_PTS[teamPtsKey]
      }
    }

    const pairingPtsKey = roundDef.pairingPtsKey || roundDef.id
    if (BRACKET_PAIRING_PTS[pairingPtsKey] != null) {
      const actualPairings = actualPairingsSet(roundDef.id)
      const usedPairings = new Set()
      ids.forEach(id => {
        const pm = predTeamMap[id]
        if (!pm?.homeTeam || !pm?.awayTeam) return
        const key = [pm.homeTeam, pm.awayTeam].sort().join('|')
        if (actualPairings.has(key) && !usedPairings.has(key)) {
          ptsPairing += BRACKET_PAIRING_PTS[pairingPtsKey]
          usedPairings.add(key)
        }
      })
    }
  })

  // ── Bonus: campeón (15), subcampeón (10), 3ro (8), 4to (6) — 'final'/'third'
  // son conceptos permanentes en cualquier formato, se dejan explícitos ──────
  const bmFinal = bracketMatches.find(m => m.id === 'final_1')
  const bmThird = bracketMatches.find(m => m.id === 'third_1')

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
 * Puntaje por posición exacta en la tabla de un grupo (1 pt por cada posición
 * 1°-4° pronosticada que coincida con la real). El puntaje de "clasificado"
 * (llegar a dieciseisavos) NO se calcula acá — ver calcClasificadoScore, porque
 * los "mejores terceros" se comparan entre los 12 grupos, no dentro de uno solo.
 */
export function calcStandingsScore(predStandings, actualStandings, config) {
  if (!predStandings || !actualStandings) return 0
  const p = pts(config)
  let score = 0

  for (let i = 0; i < 4; i++) {
    if (predStandings[i] && actualStandings[i] && predStandings[i] === actualStandings[i]) {
      score += p.ordenGrupo
    }
  }

  return score
}

/**
 * Puntaje por equipos clasificados a dieciseisavos (2 pts por equipo), comparando
 * el conjunto completo de 32 clasificados reales vs los 32 predichos por el
 * participante — sin importar si quedó 1°, 2°, 3° o 4° de su grupo. Un equipo
 * pronosticado como 3° que en la realidad clasificó como "mejor tercero" (o
 * viceversa) también cuenta, porque sí llegó a dieciseisavos en ambos casos.
 * Solo puede calcularse con certeza cuando toda la fase de grupos terminó,
 * porque los "mejores terceros" se rankean entre los 12 grupos.
 */
export function calcClasificadoScore(matches, predictions, participantId, config) {
  const groupMatches = matches.filter(m => m.phase === 'groups')
  if (!groupMatches.length) return 0
  const allFinished = groupMatches.every(m => m.homeScore !== null && m.awayScore !== null)
  if (!allFinished) return 0

  const p = pts(config)
  const actualQualifiers    = calcR32Qualifiers(matches)
  const predictedQualifiers = calcPredictedR32Qualifiers(matches, predictions, participantId)
  const actualSet = new Set(Object.values(actualQualifiers).filter(Boolean))

  let score = 0
  for (const team of Object.values(predictedQualifiers)) {
    if (team && actualSet.has(team)) score += p.clasificado
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

  // --- Clasificación de grupos: posición exacta (por grupo) ---
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

  // --- Clasificación de grupos: equipos clasificados a dieciseisavos (conjunto de 32) ---
  ptsStandings += calcClasificadoScore(matches, predictions, participantId, config)

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
