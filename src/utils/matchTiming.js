// Bloqueo automático de pronósticos por horario del partido: se puede
// pronosticar hasta MINUTOS_ANTES_DEL_BLOQUEO minutos antes de la hora de
// inicio; pasado ese punto se bloquea la edición del marcador.
export const LOCK_MINUTES_BEFORE_KICKOFF = 10

// Formatos esperados: date = "DD/MM/YYYY", hora = "HH:mm" (24h). Si falta
// alguno de los dos, o no son parseables, retorna null (no se puede calcular
// el bloqueo por horario — el partido sigue rigiéndose solo por los
// bloqueos manuales del admin).
export function parseMatchKickoff(match) {
  if (!match?.date || !match?.hora) return null
  const dateParts = match.date.split('/').map(Number)
  const timeParts = match.hora.split(':').map(Number)
  if (dateParts.length !== 3 || timeParts.length < 2) return null
  const [day, month, year] = dateParts
  const [hour, minute] = timeParts
  if (!day || !month || !year || Number.isNaN(hour) || Number.isNaN(minute)) return null
  const d = new Date(year, month - 1, day, hour, minute, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

// ¿Ya pasó el punto de bloqueo (kickoff - 10 min) para este partido?
// Si no hay fecha/hora válida, retorna false (no bloquea automáticamente).
export function isLockedByKickoff(match, minutesBefore = LOCK_MINUTES_BEFORE_KICKOFF) {
  const kickoff = parseMatchKickoff(match)
  if (!kickoff) return false
  const lockAt = kickoff.getTime() - minutesBefore * 60000
  return Date.now() >= lockAt
}
