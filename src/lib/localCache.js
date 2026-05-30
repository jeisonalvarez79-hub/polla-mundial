/**
 * Cache local en localStorage.
 * Actúa como buffer de escritura: los datos se guardan aquí primero
 * (instantáneo, sin red) y luego se sincronizan con Supabase.
 * Si Supabase falla, los items quedan marcados como pendientes y
 * se reintenta al recuperar la conexión.
 *
 * Cubre tanto acciones de participantes (pronósticos) como del admin
 * (resultados reales de partidos y bracket).
 */

const KEYS = {
  predictions:          'pm_cache_predictions',
  bracketPredictions:   'pm_cache_bracket',
  standingsPredictions: 'pm_cache_standings',
  scorerPredictions:    'pm_cache_scorers',
  matchUpdates:         'pm_cache_match_updates',
  bracketMatchUpdates:  'pm_cache_bracket_match_updates',
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} }
}
function write(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* localStorage lleno o deshabilitado */ }
}

export const localCache = {
  // ── Predictions de grupos ─────────────────────────────────────────────────
  savePrediction(participantId, matchId, homeScore, awayScore) {
    const cache = read(KEYS.predictions)
    cache[`${participantId}:${matchId}`] = { participantId, matchId, homeScore, awayScore, synced: false, ts: Date.now() }
    write(KEYS.predictions, cache)
  },
  markPredictionSynced(participantId, matchId) {
    const cache = read(KEYS.predictions)
    const k = `${participantId}:${matchId}`
    if (cache[k]) { cache[k].synced = true; write(KEYS.predictions, cache) }
  },
  getPendingPredictions() {
    return Object.values(read(KEYS.predictions)).filter(v => !v.synced)
  },

  // ── Bracket predictions ───────────────────────────────────────────────────
  saveBracketPrediction(participantId, bracketMatchId, winner, homeScore, awayScore) {
    const cache = read(KEYS.bracketPredictions)
    cache[`${participantId}:${bracketMatchId}`] = { participantId, bracketMatchId, winner, homeScore, awayScore, synced: false, ts: Date.now() }
    write(KEYS.bracketPredictions, cache)
  },
  markBracketPredictionSynced(participantId, bracketMatchId) {
    const cache = read(KEYS.bracketPredictions)
    const k = `${participantId}:${bracketMatchId}`
    if (cache[k]) { cache[k].synced = true; write(KEYS.bracketPredictions, cache) }
  },
  getPendingBracketPredictions() {
    return Object.values(read(KEYS.bracketPredictions)).filter(v => !v.synced)
  },

  // ── Standings predictions ─────────────────────────────────────────────────
  saveStandingsPrediction(participantId, group, standings) {
    const cache = read(KEYS.standingsPredictions)
    cache[`${participantId}:${group}`] = { participantId, group, standings, synced: false, ts: Date.now() }
    write(KEYS.standingsPredictions, cache)
  },
  markStandingsPredictionSynced(participantId, group) {
    const cache = read(KEYS.standingsPredictions)
    const k = `${participantId}:${group}`
    if (cache[k]) { cache[k].synced = true; write(KEYS.standingsPredictions, cache) }
  },
  getPendingStandingsPredictions() {
    return Object.values(read(KEYS.standingsPredictions)).filter(v => !v.synced)
  },

  // ── Scorer predictions ────────────────────────────────────────────────────
  saveScorerPrediction(participantId, scorers) {
    const cache = read(KEYS.scorerPredictions)
    cache[participantId] = { participantId, scorers, synced: false, ts: Date.now() }
    write(KEYS.scorerPredictions, cache)
  },
  markScorerPredictionSynced(participantId) {
    const cache = read(KEYS.scorerPredictions)
    if (cache[participantId]) { cache[participantId].synced = true; write(KEYS.scorerPredictions, cache) }
  },
  getPendingScorerPredictions() {
    return Object.values(read(KEYS.scorerPredictions)).filter(v => !v.synced)
  },

  // ── Resultados reales de partidos (admin) ─────────────────────────────────
  // Acumula campos de actualización; si el admin hace varios cambios al mismo
  // partido, se fusionan en una sola entrada pendiente.
  saveMatchUpdate(matchId, updates) {
    const cache = read(KEYS.matchUpdates)
    const prev = cache[matchId] || {}
    cache[matchId] = { ...prev, ...updates, matchId, synced: false, ts: Date.now() }
    write(KEYS.matchUpdates, cache)
  },
  markMatchUpdateSynced(matchId) {
    const cache = read(KEYS.matchUpdates)
    if (cache[matchId]) { cache[matchId].synced = true; write(KEYS.matchUpdates, cache) }
  },
  getPendingMatchUpdates() {
    return Object.values(read(KEYS.matchUpdates)).filter(v => !v.synced)
  },

  // ── Resultados reales de bracket (admin) ──────────────────────────────────
  saveBracketMatchUpdate(bracketMatchId, updates) {
    const cache = read(KEYS.bracketMatchUpdates)
    const prev = cache[bracketMatchId] || {}
    cache[bracketMatchId] = { ...prev, ...updates, bracketMatchId, synced: false, ts: Date.now() }
    write(KEYS.bracketMatchUpdates, cache)
  },
  markBracketMatchUpdateSynced(bracketMatchId) {
    const cache = read(KEYS.bracketMatchUpdates)
    if (cache[bracketMatchId]) { cache[bracketMatchId].synced = true; write(KEYS.bracketMatchUpdates, cache) }
  },
  getPendingBracketMatchUpdates() {
    return Object.values(read(KEYS.bracketMatchUpdates)).filter(v => !v.synced)
  },

  // ── Conteo total de pendientes (participantes + admin) ────────────────────
  getPendingCount() {
    return (
      this.getPendingPredictions().length +
      this.getPendingBracketPredictions().length +
      this.getPendingStandingsPredictions().length +
      this.getPendingScorerPredictions().length +
      this.getPendingMatchUpdates().length +
      this.getPendingBracketMatchUpdates().length
    )
  },

  // ── Limpiar items ya sincronizados de más de N días ───────────────────────
  cleanup(daysOld = 3) {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000
    Object.values(KEYS).forEach(key => {
      const cache = read(key)
      const cleaned = Object.fromEntries(
        Object.entries(cache).filter(([, v]) => !v.synced || v.ts > cutoff)
      )
      write(key, cleaned)
    })
  },
}
