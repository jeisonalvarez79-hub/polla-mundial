import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { localCache } from '../lib/localCache'
import {
  generateGroupMatches,
  generateBracketMatches,
  DEFAULT_CONFIG,
  DEFAULT_PTS,
  DEFAULT_LOCKS,
  GROUP_LETTERS,
  R32_BRACKET_MAP,
} from '../data/initialData'
import { calcR32Qualifiers, calcPredictedGroupStandings } from '../utils/scoring'

const AppContext = createContext(null)

// ─── Credenciales de administradores (acceso local directo) ──────────────────
// NOTA: esta contraseña es visible en el bundle JS — no reutilices en otros servicios
export const ADMIN_EMAILS = [
  'jeisonalvarez79@gmail.com',
  'andres858@gmail.com',
]
const ADMIN_PASSWORD = 'Mundial2026*'  // ← Cambia por la contraseña que prefieras

const EMPTY_STANDINGS = Object.fromEntries(GROUP_LETTERS.map(g => [g, ['', '', '', '']]))

function dbToMatch(row) {
  return { id: row.id, phase: row.phase, group: row.group, homeTeam: row.home_team, awayTeam: row.away_team, date: row.date, hora: row.hora || '', jornada: row.jornada || '', homeScore: row.home_score, awayScore: row.away_score, status: row.status }
}
function matchToDb(m) {
  return { id: m.id, phase: m.phase, group: m.group, home_team: m.homeTeam, away_team: m.awayTeam, date: m.date, hora: m.hora || '', jornada: m.jornada || '', home_score: m.homeScore, away_score: m.awayScore, status: m.status }
}
function matchUpdatesToDb(u) {
  const db = {}
  if (u.homeTeam  !== undefined) db.home_team  = u.homeTeam
  if (u.awayTeam  !== undefined) db.away_team  = u.awayTeam
  if (u.homeScore !== undefined) db.home_score = u.homeScore
  if (u.awayScore !== undefined) db.away_score = u.awayScore
  if (u.status    !== undefined) db.status     = u.status
  if (u.date      !== undefined) db.date       = u.date
  if (u.hora      !== undefined) db.hora       = u.hora
  if (u.jornada   !== undefined) db.jornada    = u.jornada
  return db
}
function dbToBracket(row) {
  return { id: row.id, round: row.round, position: row.position, label: row.label, homeTeam: row.home_team, awayTeam: row.away_team, homeScore: row.home_score, awayScore: row.away_score, winner: row.winner, status: row.status }
}
function bracketToDb(m) {
  return { id: m.id, round: m.round, position: m.position, label: m.label, home_team: m.homeTeam, away_team: m.awayTeam, home_score: m.homeScore, away_score: m.awayScore, winner: m.winner, status: m.status }
}
function bracketUpdatesToDb(u) {
  const db = {}
  if (u.homeTeam  !== undefined) db.home_team  = u.homeTeam
  if (u.awayTeam  !== undefined) db.away_team  = u.awayTeam
  if (u.homeScore !== undefined) db.home_score = u.homeScore
  if (u.awayScore !== undefined) db.away_score = u.awayScore
  if (u.winner    !== undefined) db.winner     = u.winner
  if (u.status    !== undefined) db.status     = u.status
  return db
}
function dbToPrediction(row) {
  return { id: row.id, participantId: row.participant_id, matchId: row.match_id, homeScore: row.home_score, awayScore: row.away_score }
}
function encodeBracketPred(winner, homeScore, awayScore) {
  const w = winner || ''
  if (homeScore !== null && awayScore !== null) return `${w}|${homeScore}|${awayScore}`
  return w || null
}
function decodeBracketPred(raw) {
  if (!raw) return { predictedWinner: null, predictedHomeScore: null, predictedAwayScore: null }
  const parts = raw.split('|')
  const predictedWinner = parts[0] || null
  const predictedHomeScore = parts.length > 1 && parts[1] !== '' ? Number(parts[1]) : null
  const predictedAwayScore = parts.length > 2 && parts[2] !== '' ? Number(parts[2]) : null
  return { predictedWinner, predictedHomeScore, predictedAwayScore }
}
function dbToBracketPrediction(row) {
  return {
    id: row.id,
    participantId: row.participant_id,
    bracketMatchId: row.bracket_match_id,
    ...decodeBracketPred(row.predicted_winner),
  }
}
function dbToStandingsPrediction(row) {
  return { id: row.id, participantId: row.participant_id, group: row.group, standings: row.standings }
}
function dbToScorerPrediction(row) {
  return { id: row.id, participantId: row.participant_id, scorers: row.scorers }
}

// Combina datos de Supabase con items pendientes del cache local.
// Los items locales pendientes toman precedencia (son más recientes).
function mergePendingPredictions(fromDB, pending) {
  const map = new Map(fromDB.map(p => [`${p.participantId}:${p.matchId}`, p]))
  pending.forEach(item => {
    map.set(`${item.participantId}:${item.matchId}`, {
      participantId: item.participantId,
      matchId: item.matchId,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
    })
  })
  return [...map.values()]
}

function mergePendingBracket(fromDB, pending) {
  const map = new Map(fromDB.map(p => [`${p.participantId}:${p.bracketMatchId}`, p]))
  pending.forEach(item => {
    map.set(`${item.participantId}:${item.bracketMatchId}`, {
      participantId: item.participantId,
      bracketMatchId: item.bracketMatchId,
      ...decodeBracketPred(encodeBracketPred(item.winner, item.homeScore, item.awayScore)),
    })
  })
  return [...map.values()]
}

function mergePendingStandings(fromDB, pending) {
  const map = new Map(fromDB.map(p => [`${p.participantId}:${p.group}`, p]))
  pending.forEach(item => {
    map.set(`${item.participantId}:${item.group}`, {
      participantId: item.participantId,
      group: item.group,
      standings: item.standings,
    })
  })
  return [...map.values()]
}

function mergePendingScorers(fromDB, pending) {
  const map = new Map(fromDB.map(p => [p.participantId, p]))
  pending.forEach(item => {
    map.set(item.participantId, { participantId: item.participantId, scorers: item.scorers })
  })
  return [...map.values()]
}

export function AppProvider({ children }) {
  const [loading, setLoading]   = useState(true)
  const [config, setConfig]     = useState({ ...DEFAULT_CONFIG, pts: { ...DEFAULT_PTS }, locks: { ...DEFAULT_LOCKS } })
  const [pollas, setPollas]     = useState([])
  const [allParticipants, setAllParticipants] = useState([])
  const [isAdmin, setIsAdmin]   = useState(false)
  const [currentParticipantId, setCurrentParticipantIdState] = useState(() => {
    try { return localStorage.getItem('pm_current_participant') } catch { return null }
  })
  const [currentPollaId, setCurrentPollaIdState] = useState(() => {
    try { return localStorage.getItem('pm_current_polla') } catch { return null }
  })
  const [matches, setMatches]                   = useState([])
  const [predictions, setPredictions]           = useState([])
  const [bracketMatches, setBracketMatches]     = useState([])
  const [bracketPredictions, setBracketPredictions] = useState([])
  const [groupStandings, setGroupStandings]     = useState(EMPTY_STANDINGS)
  const [standingsPredictions, setStandingsPredictions] = useState([])
  const [topScorers, setTopScorers]             = useState(['', '', ''])
  const [scorerPredictions, setScorerPredictions] = useState([])

  // Conteo de pronósticos pendientes de sincronizar con Supabase
  const [pendingSyncCount, setPendingSyncCount] = useState(() => localCache.getPendingCount())

  // Escuchar cambios de sesión Supabase Auth (admin)
  useEffect(() => {
    // Restaurar sesión local de admin (bypass) si existe
    if (sessionStorage.getItem('pm_admin_bypass') === '1') {
      setIsAdmin(true)
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const email = session?.user?.email?.toLowerCase()
        if (!!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)) {
          setIsAdmin(true)
        }
      })
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // No sobreescribir si hay bypass local activo
      if (sessionStorage.getItem('pm_admin_bypass') === '1') return
      const email = session?.user?.email?.toLowerCase()
      setIsAdmin(!!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email))
    })
    return () => subscription.unsubscribe()
  }, [])

  // Suscripción real-time: cualquier cambio en bracket_matches o matches se refleja
  // en todos los navegadores sin necesidad de recargar la página.
  useEffect(() => {
    const channel = supabase
      .channel('db-realtime')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bracket_matches' },
        (payload) => {
          setBracketMatches(prev => prev.map(m =>
            m.id === payload.new.id ? dbToBracket(payload.new) : m
          ))
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          setMatches(prev => prev.map(m =>
            m.id === payload.new.id ? dbToMatch(payload.new) : m
          ))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => { loadAll() }, [])

  // Participants filtered by current polla (falls back to all if no polla system yet)
  const hasPollaData = allParticipants.some(p => p.polla_id)
  const participants = (currentPollaId && pollas.length > 0 && hasPollaData)
    ? allParticipants.filter(p => p.polla_id === currentPollaId)
    : allParticipants

  const currentParticipant = allParticipants.find(p => p.id === currentParticipantId) || null

  async function loadAll() {
    setLoading(true)
    try {
      await Promise.all([
        loadConfig(), loadAllParticipants(),
        loadPredictions(), loadBracketPredictions(),
        loadGroupStandings(), loadStandingsPredictions(),
        loadTopScorers(), loadScorerPredictions(),
      ])
      await loadMatches()
      await loadBracketMatches()
    } finally {
      setLoading(false)
    }
  }

  async function loadConfig() {
    const { data } = await supabase.from('config').select('*').eq('id', 1).single()
    if (data) {
      const { phase_locks, ...ptValues } = data.pts || {}
      setConfig({
        name: data.name,
        tournamentName: data.tournament_name,
        year: data.year,
        pts: { ...DEFAULT_PTS, ...ptValues },
        locks: { ...DEFAULT_LOCKS, ...(phase_locks || {}) },
      })
      // Pollas se guardan en config.pollas (JSONB array)
      const pollasData = Array.isArray(data.pollas) ? data.pollas : []
      setPollas(pollasData)
      if (pollasData.length > 0) {
        const saved = (() => { try { return localStorage.getItem('pm_current_polla') } catch { return null } })()
        if (!saved || !pollasData.find(p => p.id === saved)) {
          setCurrentPollaIdState(pollasData[0].id)
          localStorage.setItem('pm_current_polla', pollasData[0].id)
        }
      }
    }
  }

  async function loadAllParticipants() {
    const { data } = await supabase.from('participants').select('*').order('created_at')
    if (data) setAllParticipants(data)
    return data || []
  }

  async function loadMatches() {
    const { data } = await supabase.from('matches').select('*').order('id')
    if (data && data.length > 0) {
      const fromDB = data.map(dbToMatch)
      const pending = localCache.getPendingMatchUpdates()
      if (pending.length > 0) {
        const map = new Map(fromDB.map(m => [m.id, m]))
        pending.forEach(item => {
          const existing = map.get(item.matchId)
          if (existing) {
            const { matchId, synced, ts, ...delta } = item
            map.set(matchId, { ...existing, ...delta })
          }
        })
        setMatches([...map.values()])
      } else {
        setMatches(fromDB)
      }
    } else {
      const initial = generateGroupMatches().map(matchToDb)
      const { data: seeded } = await supabase.from('matches').insert(initial).select()
      if (seeded) setMatches(seeded.map(dbToMatch))
    }
  }

  async function loadBracketMatches() {
    const { data } = await supabase.from('bracket_matches').select('*').order('id')
    if (data && data.length > 0) {
      const fromDB = data.map(dbToBracket)
      const pending = localCache.getPendingBracketMatchUpdates()
      if (pending.length > 0) {
        const map = new Map(fromDB.map(m => [m.id, m]))
        pending.forEach(item => {
          const existing = map.get(item.bracketMatchId)
          if (existing) {
            const { bracketMatchId, synced, ts, ...delta } = item
            map.set(bracketMatchId, { ...existing, ...delta })
          }
        })
        setBracketMatches([...map.values()])
      } else {
        setBracketMatches(fromDB)
      }
    } else {
      const initial = generateBracketMatches().map(bracketToDb)
      const { data: seeded } = await supabase.from('bracket_matches').insert(initial).select()
      if (seeded) setBracketMatches(seeded.map(dbToBracket))
    }
  }

  async function fetchAllRows(table) {
    const PAGE = 1000
    const all = []
    let from = 0
    while (true) {
      const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      all.push(...data)
      if (data.length < PAGE) break
      from += PAGE
    }
    return all
  }

  async function loadPredictions() {
    const rows = await fetchAllRows('predictions')
    const fromDB = rows.map(dbToPrediction)
    const pending = localCache.getPendingPredictions()
    const result = pending.length > 0 ? mergePendingPredictions(fromDB, pending) : fromDB
    setPredictions(result)
    return result
  }

  async function loadBracketPredictions() {
    const rows = await fetchAllRows('bracket_predictions')
    const fromDB = rows.map(dbToBracketPrediction)
    const pending = localCache.getPendingBracketPredictions()
    const result = pending.length > 0 ? mergePendingBracket(fromDB, pending) : fromDB
    setBracketPredictions(result)
    return result
  }

  async function loadGroupStandings() {
    const { data } = await supabase.from('group_standings').select('*')
    const s = { ...EMPTY_STANDINGS }
    if (data && data.length > 0) {
      data.forEach(row => { s[row.group] = row.standings })
    }
    setGroupStandings(s)
    return s
  }

  async function loadStandingsPredictions() {
    const rows = await fetchAllRows('standings_predictions')
    const fromDB = rows.map(dbToStandingsPrediction)
    const pending = localCache.getPendingStandingsPredictions()
    const result = pending.length > 0 ? mergePendingStandings(fromDB, pending) : fromDB
    setStandingsPredictions(result)
    return result
  }

  async function loadTopScorers() {
    const { data } = await supabase.from('top_scorers').select('*').eq('id', 1).single()
    const result = data?.scorers || ['', '', '']
    setTopScorers(result)
    return result
  }

  async function loadScorerPredictions() {
    const rows = await fetchAllRows('scorer_predictions')
    const fromDB = rows.map(dbToScorerPrediction)
    const pending = localCache.getPendingScorerPredictions()
    const result = pending.length > 0 ? mergePendingScorers(fromDB, pending) : fromDB
    setScorerPredictions(result)
    return result
  }

  // ─── Recargar todos los datos desde Supabase ─────────────────────────────────
  const refreshData = useCallback(async () => {
    const [
      allParticipants, predictions, bracketPredictions,
      groupStandings, standingsPredictions, topScorers, scorerPredictions,
    ] = await Promise.all([
      loadAllParticipants(),
      loadPredictions(),
      loadBracketPredictions(),
      loadGroupStandings(),
      loadStandingsPredictions(),
      loadTopScorers(),
      loadScorerPredictions(),
    ])
    // Refrescar también resultados de partidos y bracket para que los puntajes
    // reflejen los últimos datos del admin sin necesidad de recargar la página.
    await loadMatches()
    await loadBracketMatches()
    return { allParticipants, predictions, bracketPredictions, groupStandings, standingsPredictions, topScorers, scorerPredictions }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Sincronizar cache local pendiente con Supabase ───────────────────────────
  // Se llama automáticamente al reconectar internet y al cargar la app.

  const syncPendingCache = useCallback(async () => {
    let synced = false

    for (const item of localCache.getPendingPredictions()) {
      const { data, error } = await supabase.from('predictions')
        .upsert({ participant_id: item.participantId, match_id: item.matchId, home_score: item.homeScore, away_score: item.awayScore }, { onConflict: 'participant_id,match_id' }).select().single()
      if (!error && data) {
        localCache.markPredictionSynced(item.participantId, item.matchId)
        setPredictions(prev => [...prev.filter(p => !(p.participantId === item.participantId && p.matchId === item.matchId)), dbToPrediction(data)])
        synced = true
      }
    }

    for (const item of localCache.getPendingBracketPredictions()) {
      const encoded = encodeBracketPred(item.winner, item.homeScore, item.awayScore)
      const { data, error } = await supabase.from('bracket_predictions')
        .upsert({ participant_id: item.participantId, bracket_match_id: item.bracketMatchId, predicted_winner: encoded }, { onConflict: 'participant_id,bracket_match_id' }).select().single()
      if (!error && data) {
        localCache.markBracketPredictionSynced(item.participantId, item.bracketMatchId)
        setBracketPredictions(prev => [...prev.filter(p => !(p.participantId === item.participantId && p.bracketMatchId === item.bracketMatchId)), dbToBracketPrediction(data)])
        synced = true
      }
    }

    for (const item of localCache.getPendingStandingsPredictions()) {
      const { data } = await supabase.from('standings_predictions')
        .upsert({ participant_id: item.participantId, group: item.group, standings: item.standings }, { onConflict: 'participant_id,group' }).select().single()
      if (data) {
        localCache.markStandingsPredictionSynced(item.participantId, item.group)
        setStandingsPredictions(prev => [...prev.filter(p => !(p.participantId === item.participantId && p.group === item.group)), dbToStandingsPrediction(data)])
        synced = true
      }
    }

    for (const item of localCache.getPendingScorerPredictions()) {
      const { data } = await supabase.from('scorer_predictions')
        .upsert({ participant_id: item.participantId, scorers: item.scorers }, { onConflict: 'participant_id' }).select().single()
      if (data) {
        localCache.markScorerPredictionSynced(item.participantId)
        setScorerPredictions(prev => [...prev.filter(p => p.participantId !== item.participantId), dbToScorerPrediction(data)])
        synced = true
      }
    }

    // Resultados reales de partidos (admin)
    for (const item of localCache.getPendingMatchUpdates()) {
      const { matchId, synced: _s, ts: _t, ...delta } = item
      const { error } = await supabase.from('matches').update(matchUpdatesToDb(delta)).eq('id', matchId)
      if (!error) {
        localCache.markMatchUpdateSynced(matchId)
        setMatches(prev => prev.map(m => m.id === matchId ? { ...m, ...delta } : m))
        synced = true
      }
    }

    // Resultados reales de bracket (admin)
    for (const item of localCache.getPendingBracketMatchUpdates()) {
      const { bracketMatchId, synced: _s, ts: _t, ...delta } = item
      const { error } = await supabase.from('bracket_matches').update(bracketUpdatesToDb(delta)).eq('id', bracketMatchId)
      if (!error) {
        localCache.markBracketMatchUpdateSynced(bracketMatchId)
        setBracketMatches(prev => prev.map(m => m.id === bracketMatchId ? { ...m, ...delta } : m))
        synced = true
      }
    }

    if (synced) setPendingSyncCount(localCache.getPendingCount())
    return synced
  }, [])

  // Al recuperar internet → sincronizar automáticamente
  useEffect(() => {
    const handleOnline = () => { syncPendingCache() }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [syncPendingCache])

  // Después de la carga inicial → sincronizar pendientes + limpiar cache viejo
  useEffect(() => {
    if (!loading) {
      syncPendingCache()
      localCache.cleanup()
    }
  }, [loading, syncPendingCache])

  // Reintento periódico cada 30 s mientras haya pendientes.
  // Cubre el caso donde Supabase estaba caído pero el internet seguía activo
  // (el evento 'online' no dispara en ese escenario).
  // El intervalo solo existe cuando hay pendientes; cuando llega a 0 se cancela.
  const hasPendingSync = pendingSyncCount > 0
  useEffect(() => {
    if (!hasPendingSync) return
    const interval = setInterval(() => { syncPendingCache() }, 30_000)
    return () => clearInterval(interval)
  }, [hasPendingSync, syncPendingCache])

  // ─── Pollas ───────────────────────────────────────────────────────────────────

  const setCurrentPolla = useCallback((id) => {
    setCurrentPollaIdState(id)
    if (id) localStorage.setItem('pm_current_polla', id)
    else localStorage.removeItem('pm_current_polla')
    // Deselect current participant if they don't belong to the new polla
    if (id && currentParticipantId) {
      const inNewPolla = allParticipants.find(p => p.id === currentParticipantId && p.polla_id === id)
      if (!inNewPolla) {
        setCurrentParticipantIdState(null)
        localStorage.removeItem('pm_current_participant')
      }
    }
  }, [allParticipants, currentParticipantId])

  // Guarda el array de pollas en config.pollas (JSONB)
  async function savePollasToConfig(updatedPollas) {
    const { error } = await supabase.from('config').update({ pollas: updatedPollas }).eq('id', 1)
    return error
  }

  const addPolla = useCallback(async (name) => {
    const trimmed = name.trim()
    if (!trimmed) return { data: null, error: 'El nombre no puede estar vacío' }
    const newP = { id: `polla_${Date.now()}`, name: trimmed, valor_polla: 0 }
    const updatedPollas = [...pollas, newP]
    const error = await savePollasToConfig(updatedPollas)
    if (error) return { data: null, error: error.message }
    setPollas(updatedPollas)
    return { data: newP, error: null }
  }, [pollas])

  const updatePolla = useCallback(async (id, name, valorPolla) => {
    const trimmed = name?.trim() || ''
    if (!trimmed) return
    const updatedPollas = pollas.map(p =>
      p.id === id ? { ...p, name: trimmed, valor_polla: Number(valorPolla) || 0 } : p
    )
    await savePollasToConfig(updatedPollas)
    setPollas(updatedPollas)
  }, [pollas])

  const deletePolla = useCallback(async (id) => {
    const hasParticipants = allParticipants.some(p => p.polla_id === id)
    if (hasParticipants) return 'La polla tiene participantes activos'
    const updatedPollas = pollas.filter(p => p.id !== id)
    const error = await savePollasToConfig(updatedPollas)
    if (error) return 'Error al eliminar la polla'
    setPollas(updatedPollas)
    if (currentPollaId === id) {
      const next = updatedPollas[0]
      setCurrentPollaIdState(next?.id ?? null)
      if (next) localStorage.setItem('pm_current_polla', next.id)
      else localStorage.removeItem('pm_current_polla')
    }
    return null
  }, [pollas, allParticipants, currentPollaId])

  // ─── Participantes ────────────────────────────────────────────────────────────

  // ─── Auth ────────────────────────────────────────────────────────────────────

  const isAuthenticated = isAdmin || !!currentParticipantId

  const loginParticipant = useCallback(async (participantId, pin) => {
    const participant = allParticipants.find(p => p.id === participantId)
    if (!participant) return false
    const { data: valid, error } = await supabase.rpc('verify_participant_pin', {
      p_participant_id: participantId,
      p_pin: String(pin),
    })
    if (error || !valid) return false
    setCurrentParticipantIdState(participantId)
    localStorage.setItem('pm_current_participant', participantId)
    if (participant.polla_id) {
      setCurrentPollaIdState(participant.polla_id)
      localStorage.setItem('pm_current_polla', participant.polla_id)
    }
    return true
  }, [allParticipants])

  const loginAdmin = useCallback(async (email, password) => {
    const emailLower = email.toLowerCase().trim()

    // ── Bypass local: correo autorizado + contraseña maestra ──────────────────
    if (
      ADMIN_EMAILS.map(e => e.toLowerCase()).includes(emailLower) &&
      password === ADMIN_PASSWORD
    ) {
      sessionStorage.setItem('pm_admin_bypass', '1')
      setIsAdmin(true)
      return true
    }

    // ── Fallback: Supabase Auth (si ya tienen cuenta confirmada) ───────────────
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error && data.user) {
        if (ADMIN_EMAILS.map(e => e.toLowerCase()).includes(data.user.email.toLowerCase())) {
          return true
        }
        await supabase.auth.signOut()
      }
    } catch { /* Supabase Auth no disponible — bypass local ya cubrió el caso */ }

    return false
  }, [])

  const logout = useCallback(async () => {
    sessionStorage.removeItem('pm_admin_bypass')
    setIsAdmin(false)
    await supabase.auth.signOut()
    setCurrentParticipantIdState(null)
    localStorage.removeItem('pm_current_participant')
  }, [])

  // ─── Participantes ────────────────────────────────────────────────────────────

  // Solo el Admin llama esta función; targetPollaId indica la polla destino
  const addParticipant = useCallback(async (name, targetPollaId, pin) => {
    const trimmed = name.trim().replace(/^[,;\s]+|[,;\s]+$/g, '')
    if (!trimmed) return null
    const pollaId = targetPollaId || currentPollaId || null

    // Duplicado solo dentro de la misma polla
    const hasPollaCol = allParticipants.some(p => p.polla_id)
    const dupeList = hasPollaCol
      ? allParticipants.filter(p => p.polla_id === pollaId)
      : []
    if (dupeList.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      return { error: 'duplicate' }
    }

    const id = `p_${Date.now()}`
    const { data, error } = await supabase.from('participants')
      .insert({ id, name: trimmed, polla_id: pollaId, pin: pin || null })
      .select().single()

    if (error) {
      console.error('Error creando participante:', error.message)
      return { error: error.message || 'db_error' }
    }
    if (!data) return { error: 'no_data' }
    setAllParticipants(prev => [...prev, data])
    return data
  }, [allParticipants, currentPollaId])

  // Asignar o reasignar un participante a una polla (fix de orphans)
  const assignParticipantPolla = useCallback(async (participantId, pollaId) => {
    const { error } = await supabase.from('participants')
      .update({ polla_id: pollaId }).eq('id', participantId)
    if (!error) {
      setAllParticipants(prev =>
        prev.map(p => p.id === participantId ? { ...p, polla_id: pollaId } : p)
      )
    }
    return !error
  }, [])

  const updateParticipantPin = useCallback(async (participantId, newPin) => {
    const { error } = await supabase.from('participants')
      .update({ pin: newPin }).eq('id', participantId)
    if (!error) {
      setAllParticipants(prev =>
        prev.map(p => p.id === participantId ? { ...p, pin: newPin } : p)
      )
    }
    return !error
  }, [])

  const updateParticipantName = useCallback(async (participantId, newName) => {
    const trimmed = newName.trim().replace(/^[,;\s]+|[,;\s]+$/g, '')
    if (!trimmed) return false
    const { error } = await supabase.from('participants')
      .update({ name: trimmed }).eq('id', participantId)
    if (!error) {
      setAllParticipants(prev =>
        prev.map(p => p.id === participantId ? { ...p, name: trimmed } : p)
      )
    }
    return !error
  }, [])

  const setCurrentParticipant = useCallback((id) => {
    setCurrentParticipantIdState(id)
    if (id) {
      localStorage.setItem('pm_current_participant', id)
      // Auto-switch to the participant's polla so they only see their group
      const participant = allParticipants.find(p => p.id === id)
      if (participant?.polla_id) {
        setCurrentPollaIdState(participant.polla_id)
        localStorage.setItem('pm_current_polla', participant.polla_id)
      }
    } else {
      localStorage.removeItem('pm_current_participant')
    }
  }, [allParticipants])

  const removeParticipant = useCallback(async (id) => {
    await supabase.from('predictions').delete().eq('participant_id', id)
    await supabase.from('bracket_predictions').delete().eq('participant_id', id)
    await supabase.from('standings_predictions').delete().eq('participant_id', id)
    await supabase.from('scorer_predictions').delete().eq('participant_id', id)
    await supabase.from('participants').delete().eq('id', id)
    setAllParticipants(prev => prev.filter(p => p.id !== id))
    setPredictions(prev => prev.filter(p => p.participantId !== id))
    setBracketPredictions(prev => prev.filter(p => p.participantId !== id))
    setStandingsPredictions(prev => prev.filter(p => p.participantId !== id))
    setScorerPredictions(prev => prev.filter(p => p.participantId !== id))
    if (currentParticipantId === id) {
      setCurrentParticipantIdState(null)
      localStorage.removeItem('pm_current_participant')
    }
  }, [currentParticipantId])

  // ─── Pronósticos ──────────────────────────────────────────────────────────────

  const savePrediction = useCallback(async (participantId, matchId, homeScore, awayScore) => {
    // 1. Guardar en localStorage de forma inmediata (nunca falla, funciona sin internet)
    localCache.savePrediction(participantId, matchId, homeScore, awayScore)
    // 2. Actualización optimista del estado React (UI muestra el valor aunque Supabase falle)
    setPredictions(prev => [
      ...prev.filter(p => !(p.participantId === participantId && p.matchId === matchId)),
      { participantId, matchId, homeScore, awayScore },
    ])
    setPendingSyncCount(localCache.getPendingCount())
    // 3. Intentar guardar en Supabase
    const { data, error } = await supabase.from('predictions')
      .upsert({ participant_id: participantId, match_id: matchId, home_score: homeScore, away_score: awayScore }, { onConflict: 'participant_id,match_id' }).select().single()
    if (error) {
      console.error('Error guardando pronóstico:', error.message)
      return false
    }
    if (data) {
      localCache.markPredictionSynced(participantId, matchId)
      setPredictions(prev => [...prev.filter(p => !(p.participantId === participantId && p.matchId === matchId)), dbToPrediction(data)])
      setPendingSyncCount(localCache.getPendingCount())
    }
    return !!data
  }, [])

  const getPrediction = useCallback((participantId, matchId) =>
    predictions.find(p => p.participantId === participantId && p.matchId === matchId) || null
  , [predictions])

  const saveBracketPrediction = useCallback(async (participantId, bracketMatchId, predictedWinner, homeScore = null, awayScore = null) => {
    // 1. Guardar en localStorage de forma inmediata
    localCache.saveBracketPrediction(participantId, bracketMatchId, predictedWinner, homeScore, awayScore)
    // 2. Actualización optimista
    setBracketPredictions(prev => [
      ...prev.filter(p => !(p.participantId === participantId && p.bracketMatchId === bracketMatchId)),
      {
        participantId,
        bracketMatchId,
        ...decodeBracketPred(encodeBracketPred(predictedWinner, homeScore, awayScore)),
      },
    ])
    setPendingSyncCount(localCache.getPendingCount())
    // 3. Intentar guardar en Supabase
    const encoded = encodeBracketPred(predictedWinner, homeScore, awayScore)
    const { data, error } = await supabase.from('bracket_predictions')
      .upsert({
        participant_id: participantId,
        bracket_match_id: bracketMatchId,
        predicted_winner: encoded,
      }, { onConflict: 'participant_id,bracket_match_id' }).select().single()
    if (error) {
      console.error('Error guardando pronóstico bracket:', error.message)
      return false
    }
    if (data) {
      localCache.markBracketPredictionSynced(participantId, bracketMatchId)
      setBracketPredictions(prev => [
        ...prev.filter(p => !(p.participantId === participantId && p.bracketMatchId === bracketMatchId)),
        dbToBracketPrediction(data),
      ])
      setPendingSyncCount(localCache.getPendingCount())
    }
    return !!data
  }, [])

  const getBracketPrediction = useCallback((participantId, bracketMatchId) =>
    bracketPredictions.find(p => p.participantId === participantId && p.bracketMatchId === bracketMatchId) || null
  , [bracketPredictions])

  const updateGroupStandings = useCallback(async (group, standings) => {
    await supabase.from('group_standings').upsert({ group, standings }, { onConflict: 'group' })
    setGroupStandings(prev => ({ ...prev, [group]: standings }))
  }, [])

  const saveStandingsPrediction = useCallback(async (participantId, group, standings) => {
    // 1. Guardar en localStorage de forma inmediata
    localCache.saveStandingsPrediction(participantId, group, standings)
    // 2. Actualización optimista
    setStandingsPredictions(prev => [
      ...prev.filter(p => !(p.participantId === participantId && p.group === group)),
      { participantId, group, standings },
    ])
    setPendingSyncCount(localCache.getPendingCount())
    // 3. Intentar Supabase
    const { data, error } = await supabase.from('standings_predictions')
      .upsert({ participant_id: participantId, group, standings }, { onConflict: 'participant_id,group' }).select().single()
    if (error) {
      console.error('Error guardando posiciones de grupo:', error.message)
      return false
    }
    if (data) {
      localCache.markStandingsPredictionSynced(participantId, group)
      setStandingsPredictions(prev => [...prev.filter(p => !(p.participantId === participantId && p.group === group)), dbToStandingsPrediction(data)])
      setPendingSyncCount(localCache.getPendingCount())
    }
    return !!data
  }, [])

  const getStandingsPrediction = useCallback((participantId, group) =>
    standingsPredictions.find(p => p.participantId === participantId && p.group === group) || null
  , [standingsPredictions])

  const updateTopScorers = useCallback(async (scorers) => {
    await supabase.from('top_scorers').upsert({ id: 1, scorers })
    setTopScorers(scorers)
  }, [])

  const saveScorerPrediction = useCallback(async (participantId, scorers) => {
    // 1. Guardar en localStorage de forma inmediata
    localCache.saveScorerPrediction(participantId, scorers)
    // 2. Actualización optimista
    setScorerPredictions(prev => [
      ...prev.filter(p => p.participantId !== participantId),
      { participantId, scorers },
    ])
    setPendingSyncCount(localCache.getPendingCount())
    // 3. Intentar Supabase
    const { data, error } = await supabase.from('scorer_predictions')
      .upsert({ participant_id: participantId, scorers }, { onConflict: 'participant_id' }).select().single()
    if (error) {
      console.error('Error guardando pronóstico de goleador:', error.message)
      return false
    }
    if (data) {
      localCache.markScorerPredictionSynced(participantId)
      setScorerPredictions(prev => [...prev.filter(p => p.participantId !== participantId), dbToScorerPrediction(data)])
      setPendingSyncCount(localCache.getPendingCount())
    }
    return !!data
  }, [])

  const getScorerPrediction = useCallback((participantId) =>
    scorerPredictions.find(p => p.participantId === participantId) || null
  , [scorerPredictions])

  // ─── Partidos ─────────────────────────────────────────────────────────────────

  const updateMatch = useCallback(async (matchId, updates) => {
    // 1. Guardar en localStorage (acumula con updates previos del mismo partido)
    localCache.saveMatchUpdate(matchId, updates)
    // 2. Actualización optimista
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, ...updates } : m))
    setPendingSyncCount(localCache.getPendingCount())
    // 3. Intentar Supabase
    const { error } = await supabase.from('matches').update(matchUpdatesToDb(updates)).eq('id', matchId)
    if (error) {
      console.error('Error actualizando partido:', error.message)
      return false
    }
    localCache.markMatchUpdateSynced(matchId)
    setPendingSyncCount(localCache.getPendingCount())
    return true
  }, [])

  const updateGroupTeams = useCallback(async (group, teams) => {
    const PAIRS = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]]
    const groupMatches = matches.filter(m => m.group === group).sort((a, b) => a.id.localeCompare(b.id))
    await Promise.all(groupMatches.map((m, i) =>
      supabase.from('matches').update({ home_team: teams[PAIRS[i][0]] || '', away_team: teams[PAIRS[i][1]] || '' }).eq('id', m.id)
    ))
    setMatches(prev => prev.map(m => {
      if (m.group !== group) return m
      const idx = groupMatches.findIndex(gm => gm.id === m.id)
      if (idx < 0) return m
      return { ...m, homeTeam: teams[PAIRS[idx][0]] || '', awayTeam: teams[PAIRS[idx][1]] || '' }
    }))
  }, [matches])

  const updateBracketMatch = useCallback(async (bracketMatchId, updates) => {
    // 1. Guardar en localStorage
    localCache.saveBracketMatchUpdate(bracketMatchId, updates)
    // 2. Actualización optimista
    setBracketMatches(prev => prev.map(m => m.id === bracketMatchId ? { ...m, ...updates } : m))
    setPendingSyncCount(localCache.getPendingCount())
    // 3. Intentar Supabase
    const { error } = await supabase.from('bracket_matches').update(bracketUpdatesToDb(updates)).eq('id', bracketMatchId)
    if (error) {
      console.error('Error actualizando bracket:', error.message)
      return false
    }
    localCache.markBracketMatchUpdateSynced(bracketMatchId)
    setPendingSyncCount(localCache.getPendingCount())
    return true
  }, [])

  const updateConfig = useCallback(async (updates) => {
    const next = { ...config, ...updates }
    if (updates.pts) next.pts = { ...config.pts, ...updates.pts }
    const ptsToSave = { ...next.pts, phase_locks: next.locks || config.locks }
    await supabase.from('config').update({
      name: next.name,
      tournament_name: next.tournamentName,
      year: next.year,
      pts: ptsToSave,
    }).eq('id', 1)
    setConfig(next)
  }, [config])

  const updateLocks = useCallback(async (newLocks) => {
    const merged = { ...DEFAULT_LOCKS, ...newLocks }
    const ptsToSave = { ...config.pts, phase_locks: merged }
    await supabase.from('config').update({ pts: ptsToSave }).eq('id', 1)
    setConfig(prev => ({ ...prev, locks: merged }))
  }, [config.pts])

  // Recalcula y guarda standings_predictions para todos los participantes
  // desde sus pronósticos de partidos existentes. Útil para sincronizar
  // participantes que llenaron antes de que existiera el auto-guardado.
  const syncAllStandingsPredictions = useCallback(async () => {
    const rows = []
    for (const participant of allParticipants) {
      for (const group of GROUP_LETTERS) {
        const groupMatches = matches.filter(m => m.group === group && m.phase === 'groups')
        if (!groupMatches.length) continue
        const hasPreds = groupMatches.some(m =>
          predictions.find(p => p.participantId === participant.id && p.matchId === m.id)
        )
        if (!hasPreds) continue
        const standings = calcPredictedGroupStandings(matches, predictions, participant.id, group)
        rows.push({ participant_id: participant.id, group, standings: standings.map(t => t.name) })
      }
    }
    if (rows.length > 0) {
      await supabase.from('standings_predictions')
        .upsert(rows, { onConflict: 'participant_id,group' })
    }
    const fresh = await fetchAllRows('standings_predictions')
    setStandingsPredictions(fresh.map(dbToStandingsPrediction))
    return rows.length
  }, [allParticipants, matches, predictions])

  const generateBracket = useCallback(async () => {
    const qualifiers = calcR32Qualifiers(matches)
    const updates = R32_BRACKET_MAP.map(({ pos, home, away }) => ({
      id: `r32_${pos}`,
      homeTeam: qualifiers[home] || '',
      awayTeam: qualifiers[away] || '',
    }))
    await Promise.all(updates.map(u =>
      supabase.from('bracket_matches').update({ home_team: u.homeTeam, away_team: u.awayTeam }).eq('id', u.id)
    ))
    setBracketMatches(prev => prev.map(m => {
      const upd = updates.find(u => u.id === m.id)
      return upd ? { ...m, homeTeam: upd.homeTeam, awayTeam: upd.awayTeam } : m
    }))
    return qualifiers
  }, [matches])

  const propagateBracketRound = useCallback(async (toRound) => {
    const updates = []
    if (toRound === 'r16') {
      for (let pos = 1; pos <= 8; pos++) {
        const m1 = bracketMatches.find(m => m.id === `r32_${pos * 2 - 1}`)
        const m2 = bracketMatches.find(m => m.id === `r32_${pos * 2}`)
        updates.push({ id: `r16_${pos}`, homeTeam: m1?.winner || '', awayTeam: m2?.winner || '' })
      }
    } else if (toRound === 'qf') {
      for (let pos = 1; pos <= 4; pos++) {
        const m1 = bracketMatches.find(m => m.id === `r16_${pos * 2 - 1}`)
        const m2 = bracketMatches.find(m => m.id === `r16_${pos * 2}`)
        updates.push({ id: `qf_${pos}`, homeTeam: m1?.winner || '', awayTeam: m2?.winner || '' })
      }
    } else if (toRound === 'sf') {
      for (let pos = 1; pos <= 2; pos++) {
        const m1 = bracketMatches.find(m => m.id === `qf_${pos * 2 - 1}`)
        const m2 = bracketMatches.find(m => m.id === `qf_${pos * 2}`)
        updates.push({ id: `sf_${pos}`, homeTeam: m1?.winner || '', awayTeam: m2?.winner || '' })
      }
    } else if (toRound === 'final') {
      const sf1 = bracketMatches.find(m => m.id === 'sf_1')
      const sf2 = bracketMatches.find(m => m.id === 'sf_2')
      const loser1 = sf1?.winner ? (sf1.homeTeam === sf1.winner ? sf1.awayTeam : sf1.homeTeam) : ''
      const loser2 = sf2?.winner ? (sf2.homeTeam === sf2.winner ? sf2.awayTeam : sf2.homeTeam) : ''
      updates.push({ id: 'third_1', homeTeam: loser1, awayTeam: loser2 })
      updates.push({ id: 'final_1', homeTeam: sf1?.winner || '', awayTeam: sf2?.winner || '' })
    }
    if (!updates.length) return
    await Promise.all(updates.map(u =>
      supabase.from('bracket_matches').update({ home_team: u.homeTeam, away_team: u.awayTeam }).eq('id', u.id)
    ))
    // Limpiar entradas pendientes del localCache para estos partidos, para que
    // al recargar la página no sobreescriban los equipos recién propagados.
    updates.forEach(u => localCache.markBracketMatchUpdateSynced(u.id))
    setBracketMatches(prev => prev.map(m => {
      const upd = updates.find(u => u.id === m.id)
      return upd ? { ...m, homeTeam: upd.homeTeam, awayTeam: upd.awayTeam } : m
    }))
    return updates
  }, [bracketMatches])

  const resetTournament = useCallback(async () => {
    await supabase.from('predictions').delete().neq('id', 0)
    await supabase.from('bracket_predictions').delete().neq('id', 0)
    await supabase.from('standings_predictions').delete().neq('id', 0)
    await supabase.from('scorer_predictions').delete().neq('id', 0)
    await supabase.from('participants').delete().neq('id', '')
    await supabase.from('group_standings').delete().neq('group', '')
    await supabase.from('top_scorers').update({ scorers: ['', '', ''] }).eq('id', 1)
    await supabase.from('matches').delete().neq('id', '')
    await supabase.from('bracket_matches').delete().neq('id', '')
    const newMatches = generateGroupMatches()
    const newBracket = generateBracketMatches()
    await supabase.from('matches').insert(newMatches.map(matchToDb))
    await supabase.from('bracket_matches').insert(newBracket.map(bracketToDb))
    setAllParticipants([])
    setCurrentParticipantIdState(null)
    localStorage.removeItem('pm_current_participant')
    setPredictions([]); setBracketPredictions([]); setGroupStandings(EMPTY_STANDINGS)
    setStandingsPredictions([]); setTopScorers(['', '', '']); setScorerPredictions([])
    setMatches(newMatches); setBracketMatches(newBracket)
  }, [])

  // ─── Importar backup CSV ──────────────────────────────────────────────────────

  async function importCSVBackup(sections) {
    if (sections.pollas && sections.pollas.length > 0) {
      const imported = sections.pollas
        .filter(p => p.id && p.name)
        .map(p => ({ id: p.id, name: p.name, valor_polla: Number(p.valor_polla) || 0 }))
      // Merge: keep existing pollas not in the CSV, add new ones from CSV
      const merged = [...pollas]
      for (const ip of imported) {
        const idx = merged.findIndex(p => p.id === ip.id)
        if (idx >= 0) merged[idx] = { ...merged[idx], ...ip }
        else merged.push(ip)
      }
      await supabase.from('config').update({ pollas: merged }).eq('id', 1)
    }
    if (sections.participants) {
      for (const p of sections.participants) {
        if (p.id && p.name) {
          await supabase.from('participants').upsert(
            { id: p.id, name: p.name, polla_id: p.polla_id || null, pin: p.pin || null },
            { onConflict: 'id' }
          )
        }
      }
    }
    if (sections.predictions) {
      for (const p of sections.predictions) {
        if (p.participant_id && p.match_id) {
          await supabase.from('predictions').upsert({
            participant_id: p.participant_id,
            match_id: p.match_id,
            home_score: p.home_score !== '' ? parseInt(p.home_score) : null,
            away_score: p.away_score !== '' ? parseInt(p.away_score) : null,
          }, { onConflict: 'participant_id,match_id' })
        }
      }
    }
    if (sections.bracket_predictions) {
      for (const p of sections.bracket_predictions) {
        if (p.participant_id && p.bracket_match_id) {
          const encoded = encodeBracketPred(
            p.predicted_winner || null,
            p.home_score !== '' ? parseInt(p.home_score) : null,
            p.away_score !== '' ? parseInt(p.away_score) : null,
          )
          await supabase.from('bracket_predictions').upsert({
            participant_id: p.participant_id,
            bracket_match_id: p.bracket_match_id,
            predicted_winner: encoded,
          }, { onConflict: 'participant_id,bracket_match_id' })
        }
      }
    }
    if (sections.standings_predictions) {
      for (const p of sections.standings_predictions) {
        if (p.participant_id && p.group) {
          await supabase.from('standings_predictions').upsert({
            participant_id: p.participant_id,
            group: p.group,
            standings: [p.pos1 || '', p.pos2 || '', p.pos3 || '', p.pos4 || ''],
          }, { onConflict: 'participant_id,group' })
        }
      }
    }
    if (sections.scorer_predictions) {
      for (const p of sections.scorer_predictions) {
        if (p.participant_id) {
          await supabase.from('scorer_predictions').upsert({
            participant_id: p.participant_id,
            scorers: [p.scorer || ''],
          }, { onConflict: 'participant_id' })
        }
      }
    }
    if (sections.top_scorers && sections.top_scorers.length > 0) {
      const row = sections.top_scorers[0]
      await supabase.from('top_scorers').upsert({
        id: 1,
        scorers: [row.scorer1 || ''],
      })
    }
    if (sections.group_standings) {
      for (const row of sections.group_standings) {
        if (row.group) {
          await supabase.from('group_standings').upsert({
            group: row.group,
            standings: [row.pos1 || '', row.pos2 || '', row.pos3 || '', row.pos4 || ''],
          }, { onConflict: 'group' })
        }
      }
    }
    await loadAll()
  }

  return (
    <AppContext.Provider value={{
      loading, config,
      isAdmin, isAuthenticated, loginParticipant, loginAdmin, logout,
      pollas, currentPollaId, setCurrentPolla, addPolla, updatePolla, deletePolla,
      participants, allParticipants, currentParticipant, currentParticipantId,
      matches, predictions, bracketMatches, bracketPredictions,
      groupStandings, standingsPredictions, topScorers, scorerPredictions,
      addParticipant, setCurrentParticipant, removeParticipant, assignParticipantPolla, updateParticipantPin, updateParticipantName,
      savePrediction, getPrediction, saveBracketPrediction, getBracketPrediction,
      updateGroupStandings, saveStandingsPrediction, getStandingsPrediction,
      updateTopScorers, saveScorerPrediction, getScorerPrediction,
      updateMatch, updateGroupTeams, updateBracketMatch,
      updateConfig, updateLocks, resetTournament, generateBracket, propagateBracketRound, syncAllStandingsPredictions,
      importCSVBackup,
      pendingSyncCount, syncPendingCache, refreshData,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
