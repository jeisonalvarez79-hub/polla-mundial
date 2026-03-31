import { DEFAULT_PTS } from '../data/initialData'

function pts(config) {
  return { ...DEFAULT_PTS, ...(config?.pts || {}) }
}

/**
 * Puntaje por partido de grupo.
 * Usa config.pts.exacto y config.pts.resultado (configurables).
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
 * Puntaje por clasificado en bracket.
 * Usa config.pts.clasificado (configurable).
 */
export function calcBracketScore(prediction, bracketMatch, config) {
  if (!bracketMatch.winner || !prediction) return 0
  const p = pts(config)
  return prediction.predictedWinner === bracketMatch.winner ? p.clasificado : 0
}

/**
 * Puntaje por clasificación de grupo.
 * Un punto (config.pts.ordenGrupo) por cada equipo correctamente ubicado.
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
 * Puntaje por goleadores.
 * Un punto (config.pts.goleador) por cada posición correcta (1°, 2°, 3°).
 */
export function calcScorerScore(predScorers, actualScorers, config) {
  if (!predScorers || !actualScorers) return 0
  const p = pts(config)
  let score = 0
  for (let i = 0; i < 3; i++) {
    if (predScorers[i] && actualScorers[i] && predScorers[i] === actualScorers[i]) {
      score += p.goleador
    }
  }
  return score
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
  let ptsExacto = 0
  let ptsResultado = 0
  let ptsBracket = 0
  let ptsStandings = 0
  let ptsScorers = 0
  const p = pts(config)

  // --- Partidos de grupos ---
  const finishedGroups = matches.filter(m => m.status === 'finished' && m.phase === 'groups')
  for (const match of finishedGroups) {
    const pred = predictions.find(pr => pr.participantId === participantId && pr.matchId === match.id)
    const score = calcGroupScore(pred, match, config)
    if (score === p.exacto)    ptsExacto += score
    else if (score > 0)        ptsResultado += score
  }

  // --- Clasificación de grupos ---
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
