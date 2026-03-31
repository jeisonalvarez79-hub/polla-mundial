import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  generateGroupMatches,
  generateBracketMatches,
  DEFAULT_CONFIG,
  DEFAULT_PTS,
  GROUP_LETTERS,
} from '../data/initialData'

const AppContext = createContext(null)

const KEYS = {
  participants:         'pm_participants',
  currentParticipant:   'pm_current_participant',
  matches:              'pm_matches',
  predictions:          'pm_predictions',
  bracketMatches:       'pm_bracket',
  bracketPredictions:   'pm_bracket_predictions',
  groupStandings:       'pm_group_standings',
  standingsPredictions: 'pm_standings_predictions',
  topScorers:           'pm_top_scorers',
  scorerPredictions:    'pm_scorer_predictions',
  config:               'pm_config',
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

const EMPTY_STANDINGS = Object.fromEntries(GROUP_LETTERS.map(g => [g, ['', '', '', '']]))

export function AppProvider({ children }) {
  // Config con merge de pts para migración
  const [config, setConfigState] = useState(() => {
    const saved = load(KEYS.config, DEFAULT_CONFIG)
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      pts: { ...DEFAULT_PTS, ...(saved.pts || {}) },
    }
  })

  const [participants, setParticipantsState] = useState(() =>
    load(KEYS.participants, [])
  )
  const [currentParticipantId, setCurrentParticipantIdState] = useState(() =>
    load(KEYS.currentParticipant, null)
  )

  // Matches con migración: añade grupos I-L si faltan
  const [matches, setMatchesState] = useState(() => {
    const saved = load(KEYS.matches, null)
    if (!saved) return generateGroupMatches()
    const savedGroups = new Set(saved.map(m => m.group))
    const missing = GROUP_LETTERS.filter(g => !savedGroups.has(g))
    if (missing.length === 0) return saved
    const maxId = saved.reduce((mx, m) => {
      const n = parseInt(m.id.replace('g', ''))
      return isNaN(n) ? mx : Math.max(mx, n)
    }, 0)
    let seq = maxId + 1
    const newMatches = []
    missing.forEach(group => {
      const PAIRS = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]]
      PAIRS.forEach(([h, a]) => {
        newMatches.push({
          id: `g${seq++}`, phase: 'groups', group,
          homeTeam: '', awayTeam: '', date: '',
          homeScore: null, awayScore: null, status: 'pending',
        })
      })
    })
    return [...saved, ...newMatches]
  })

  const [predictions, setPredictionsState] = useState(() =>
    load(KEYS.predictions, [])
  )

  // Bracket con migración: añade r32 si falta
  const [bracketMatches, setBracketMatchesState] = useState(() => {
    const saved = load(KEYS.bracketMatches, null)
    if (!saved) return generateBracketMatches()
    if (saved.some(m => m.round === 'r32')) return saved
    const r32 = generateBracketMatches().filter(m => m.round === 'r32')
    return [...r32, ...saved]
  })

  const [bracketPredictions, setBracketPredictionsState] = useState(() =>
    load(KEYS.bracketPredictions, [])
  )

  // Clasificación real de grupos (1°, 2°, 3°, 4° de cada grupo — la pone el admin)
  const [groupStandings, setGroupStandingsState] = useState(() =>
    load(KEYS.groupStandings, EMPTY_STANDINGS)
  )

  // Pronósticos de clasificación de grupos por participante
  const [standingsPredictions, setStandingsPredictionsState] = useState(() =>
    load(KEYS.standingsPredictions, [])
  )

  // Goleadores reales (top 3 en orden — los pone el admin)
  const [topScorers, setTopScorersState] = useState(() =>
    load(KEYS.topScorers, ['', '', ''])
  )

  // Pronósticos de goleadores por participante
  const [scorerPredictions, setScorerPredictionsState] = useState(() =>
    load(KEYS.scorerPredictions, [])
  )

  // Persistencia
  useEffect(() => { save(KEYS.config,               config)               }, [config])
  useEffect(() => { save(KEYS.participants,          participants)          }, [participants])
  useEffect(() => { save(KEYS.currentParticipant,    currentParticipantId)  }, [currentParticipantId])
  useEffect(() => { save(KEYS.matches,               matches)               }, [matches])
  useEffect(() => { save(KEYS.predictions,           predictions)           }, [predictions])
  useEffect(() => { save(KEYS.bracketMatches,        bracketMatches)        }, [bracketMatches])
  useEffect(() => { save(KEYS.bracketPredictions,    bracketPredictions)    }, [bracketPredictions])
  useEffect(() => { save(KEYS.groupStandings,        groupStandings)        }, [groupStandings])
  useEffect(() => { save(KEYS.standingsPredictions,  standingsPredictions)  }, [standingsPredictions])
  useEffect(() => { save(KEYS.topScorers,            topScorers)            }, [topScorers])
  useEffect(() => { save(KEYS.scorerPredictions,     scorerPredictions)     }, [scorerPredictions])

  const currentParticipant = participants.find(p => p.id === currentParticipantId) || null

  // --- Participantes ---
  const addParticipant = useCallback((name) => {
    const trimmed = name.trim()
    if (!trimmed) return null
    if (participants.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) return null
    const newP = { id: `p_${Date.now()}`, name: trimmed }
    setParticipantsState(prev => [...prev, newP])
    setCurrentParticipantIdState(newP.id)
    return newP
  }, [participants])

  const setCurrentParticipant = useCallback((id) => {
    setCurrentParticipantIdState(id)
  }, [])

  const removeParticipant = useCallback((id) => {
    setParticipantsState(prev => prev.filter(p => p.id !== id))
    setPredictionsState(prev => prev.filter(p => p.participantId !== id))
    setBracketPredictionsState(prev => prev.filter(p => p.participantId !== id))
    setStandingsPredictionsState(prev => prev.filter(p => p.participantId !== id))
    setScorerPredictionsState(prev => prev.filter(p => p.participantId !== id))
    setCurrentParticipantIdState(prev => prev === id ? null : prev)
  }, [])

  // --- Pronósticos de grupos ---
  const savePrediction = useCallback((participantId, matchId, homeScore, awayScore) => {
    setPredictionsState(prev => {
      const filtered = prev.filter(
        p => !(p.participantId === participantId && p.matchId === matchId)
      )
      return [...filtered, { participantId, matchId, homeScore, awayScore }]
    })
  }, [])

  const getPrediction = useCallback((participantId, matchId) =>
    predictions.find(p => p.participantId === participantId && p.matchId === matchId) || null
  , [predictions])

  // --- Pronósticos de bracket ---
  const saveBracketPrediction = useCallback((participantId, bracketMatchId, predictedWinner) => {
    setBracketPredictionsState(prev => {
      const filtered = prev.filter(
        p => !(p.participantId === participantId && p.bracketMatchId === bracketMatchId)
      )
      return [...filtered, { participantId, bracketMatchId, predictedWinner }]
    })
  }, [])

  const getBracketPrediction = useCallback((participantId, bracketMatchId) =>
    bracketPredictions.find(
      p => p.participantId === participantId && p.bracketMatchId === bracketMatchId
    ) || null
  , [bracketPredictions])

  // --- Clasificación de grupos ---
  const updateGroupStandings = useCallback((group, standings) => {
    setGroupStandingsState(prev => ({ ...prev, [group]: standings }))
  }, [])

  const saveStandingsPrediction = useCallback((participantId, group, standings) => {
    setStandingsPredictionsState(prev => {
      const filtered = prev.filter(
        p => !(p.participantId === participantId && p.group === group)
      )
      return [...filtered, { participantId, group, standings }]
    })
  }, [])

  const getStandingsPrediction = useCallback((participantId, group) =>
    standingsPredictions.find(
      p => p.participantId === participantId && p.group === group
    ) || null
  , [standingsPredictions])

  // --- Goleadores ---
  const updateTopScorers = useCallback((scorers) => {
    setTopScorersState(scorers)
  }, [])

  const saveScorerPrediction = useCallback((participantId, scorers) => {
    setScorerPredictionsState(prev => {
      const filtered = prev.filter(p => p.participantId !== participantId)
      return [...filtered, { participantId, scorers }]
    })
  }, [])

  const getScorerPrediction = useCallback((participantId) =>
    scorerPredictions.find(p => p.participantId === participantId) || null
  , [scorerPredictions])

  // --- Admin: partidos de grupos ---
  const updateMatch = useCallback((matchId, updates) => {
    setMatchesState(prev => prev.map(m => m.id === matchId ? { ...m, ...updates } : m))
  }, [])

  const updateGroupTeams = useCallback((group, teams) => {
    setMatchesState(prev => {
      const PAIRS = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]]
      const others = prev.filter(m => m.group !== group)
      const grouped = prev.filter(m => m.group === group)
      const updated = grouped.map((m, i) => ({
        ...m,
        homeTeam: teams[PAIRS[i][0]] || '',
        awayTeam: teams[PAIRS[i][1]] || '',
      }))
      return [...others, ...updated].sort((a, b) => {
        const na = parseInt(a.id.replace('g', ''))
        const nb = parseInt(b.id.replace('g', ''))
        return na - nb
      })
    })
  }, [])

  // --- Admin: bracket ---
  const updateBracketMatch = useCallback((bracketMatchId, updates) => {
    setBracketMatchesState(prev =>
      prev.map(m => m.id === bracketMatchId ? { ...m, ...updates } : m)
    )
  }, [])

  // --- Admin: config (con merge de pts) ---
  const updateConfig = useCallback((updates) => {
    setConfigState(prev => {
      const next = { ...prev, ...updates }
      if (updates.pts) next.pts = { ...prev.pts, ...updates.pts }
      return next
    })
  }, [])

  // --- Reset completo ---
  const resetTournament = useCallback(() => {
    setMatchesState(generateGroupMatches())
    setBracketMatchesState(generateBracketMatches())
    setPredictionsState([])
    setBracketPredictionsState([])
    setParticipantsState([])
    setCurrentParticipantIdState(null)
    setGroupStandingsState(EMPTY_STANDINGS)
    setStandingsPredictionsState([])
    setTopScorersState(['', '', ''])
    setScorerPredictionsState([])
  }, [])

  return (
    <AppContext.Provider value={{
      config,
      participants,
      currentParticipant,
      currentParticipantId,
      matches,
      predictions,
      bracketMatches,
      bracketPredictions,
      groupStandings,
      standingsPredictions,
      topScorers,
      scorerPredictions,
      addParticipant,
      setCurrentParticipant,
      removeParticipant,
      savePrediction,
      getPrediction,
      saveBracketPrediction,
      getBracketPrediction,
      updateGroupStandings,
      saveStandingsPrediction,
      getStandingsPrediction,
      updateTopScorers,
      saveScorerPrediction,
      getScorerPrediction,
      updateMatch,
      updateGroupTeams,
      updateBracketMatch,
      updateConfig,
      resetTournament,
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
