import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  generateGroupMatches,
  generateBracketMatches,
  DEFAULT_CONFIG,
  DEFAULT_PTS,
  GROUP_LETTERS,
} from '../data/initialData'

const AppContext = createContext(null)

const EMPTY_STANDINGS = Object.fromEntries(GROUP_LETTERS.map(g => [g, ['', '', '', '']]))

// ─── Helpers de conversión DB ↔ App ──────────────────────────────────────────

function dbToMatch(row) {
  return {
    id:        row.id,
    phase:     row.phase,
    group:     row.group,
    homeTeam:  row.home_team,
    awayTeam:  row.away_team,
    date:      row.date,
    homeScore: row.home_score,
    awayScore: row.away_score,
    status:    row.status,
  }
}

function matchToDb(m) {
  return {
    id:         m.id,
    phase:      m.phase,
    group:      m.group,
    home_team:  m.homeTeam,
    away_team:  m.awayTeam,
    date:       m.date,
    home_score: m.homeScore,
    away_score: m.awayScore,
    status:     m.status,
  }
}

function matchUpdatesToDb(u) {
  const db = {}
  if (u.homeTeam  !== undefined) db.home_team  = u.homeTeam
  if (u.awayTeam  !== undefined) db.away_team  = u.awayTeam
  if (u.homeScore !== undefined) db.home_score = u.homeScore
  if (u.awayScore !== undefined) db.away_score = u.awayScore
  if (u.status    !== undefined) db.status     = u.status
  if (u.date      !== undefined) db.date       = u.date
  return db
}

function dbToBracket(row) {
  return {
    id:        row.id,
    round:     row.round,
    position:  row.position,
    label:     row.label,
    homeTeam:  row.home_team,
    awayTeam:  row.away_team,
    homeScore: row.home_score,
    awayScore: row.away_score,
    winner:    row.winner,
    status:    row.status,
  }
}

function bracketToDb(m) {
  return {
    id:         m.id,
    round:      m.round,
    position:   m.position,
    label:      m.label,
    home_team:  m.homeTeam,
    away_team:  m.awayTeam,
    home_score: m.homeScore,
    away_score: m.awayScore,
    winner:     m.winner,
    status:     m.status,
  }
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
  return {
    id:            row.id,
    participantId: row.participant_id,
    matchId:       row.match_id,
    homeScore:     row.home_score,
    awayScore:     row.away_score,
  }
}

function dbToBracketPrediction(row) {
  return {
    id:              row.id,
    participantId:   row.participant_id,
    bracketMatchId:  row.bracket_match_id,
    predictedWinner: row.predicted_winner,
  }
}

function dbToStandingsPrediction(row) {
  return {
    id:            row.id,
    participantId: row.participant_id,
    group:         row.group,
    standings:     row.standings,
  }
}

function dbToScorerPrediction(row) {
  return {
    id:            row.id,
    participantId: row.participant_id,
    scorers:       row.scorers,
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG, pts: { ...DEFAULT_PTS } })
  const [participants, setParticipants] = useState([])
  const [currentParticipantId, setCurrentParticipantIdState] = useState(() => {
    try { return localStorage.getItem('pm_current_participant') } catch { return null }
  })
  const [matches, setMatches] = useState([])
  const [predictions, setPredictions] = useState([])
  const [bracketMatches, setBracketMatches] = useState([])
  const [bracketPredictions, setBracketPredictions] = useState([])
  const [groupStandings, setGroupStandings] = useState(EMPTY_STANDINGS)
  const [standingsPredictions, setStandingsPredictions] = useState([])
  const [topScorers, setTopScorers] = useState(['', '', ''])
  const [scorerPredictions, setScorerPredictions] = useState([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      await Promise.all([
        loadConfig(),
        loadParticipants(),
        loadPredictions(),
        loadBracketPredictions(),
        loadGroupStandings(),
        loadStandingsPredictions(),
        loadTopScorers(),
        loadScorerPredictions(),
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
      setConfig({
        name:           data.name,
        tournamentName: data.tournament_name,
        year:           data.year,
        adminPassword:  data.admin_password,
        pts:            { ...DEFAULT_PTS, ...(data.pts || {}) },
      })
    }
  }

  async function loadParticipants() {
    const { data } = await supabase.from('participants').select('*').order('created_at')
    if (data) setParticipants(data)
  }

  async function loadMatches() {
    const { data } = await supabase.from('matches').select('*').order('id')
    if (data && data.length > 0) {
      setMatches(data.map(dbToMatch))
    } else {
      const initial = generateGroupMatches().map(matchToDb)
      const { data: seeded } = await supabase.from('matches').insert(initial).select()
      if (seeded) setMatches(seeded.map(dbToMatch))
    }
  }

  async function loadBracketMatches() {
    const { data } = await supabase.from('bracket_matches').select('*').order('id')
    if (data && data.length > 0) {
      setBracketMatches(data.map(dbToBracket))
    } else {
      const initial = generateBracketMatches().map(bracketToDb)
      const { data: seeded } = await supabase.from('bracket_matches').insert(initial).select()
      if (seeded) setBracketMatches(seeded.map(dbToBracket))
    }
  }

  async function loadPredictions() {
    const { data } = await supabase.from('predictions').select('*')
    if (data) setPredictions(data.map(dbToPrediction))
  }

  async function loadBracketPredictions() {
    const { data } = await supabase.from('bracket_predictions').select('*')
    if (data) setBracketPredictions(data.map(dbToBracketPrediction))
  }

  async function loadGroupStandings() {
    const { data } = await supabase.from('group_standings').select('*')
    if (data && data.length > 0) {
      const standings = { ...EMPTY_STANDINGS }
      data.forEach(row => { standings[row.group] = row.standings })
      setGroupStandings(standings)
    }
  }

  async function loadStandingsPredictions() {
    const { data } = await supabase.from('standings_predictions').select('*')
    if (data) setStandingsPredictions(data.map(dbToStandingsPrediction))
  }

  async function loadTopScorers() {
    const { data } = await supabase.from('top_scorers').select('*').eq('id', 1).single()
    if (data) setTopScorers(data.scorers || ['', '', ''])
  }

  async function loadScorerPredictions() {
    const { data } = await supabase.from('scorer_predictions').select('*')
    if (data) setScorerPredictions(data.map(dbToScorerPrediction))
  }

  const currentParticipant = participants.find(p => p.id === currentParticipantId) || null

  // ─── Participantes ──────────────────────────────────────────────────────────

  const addParticipant = useCallback(async (name) => {
    const trimmed = name.trim()
    if (!trimmed) return null
    if (participants.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) return null
    const newP = { id: `p_${Date.now()}`, name: trimmed }
    const { data, error } = await supabase.from('participants').insert(newP).select().single()
    if (error || !data) return null
    setParticipants(prev => [...prev, data])
    setCurrentParticipantIdState(data.id)
    localStorage.setItem('pm_current_participant', data.id)
    return data
  }, [participants])

  const setCurrentParticipant = useCallback((id) => {
    setCurrentParticipantIdState(id)
    if (id) localStorage.setItem('pm_current_participant', id)
    else localStorage.removeItem('pm_current_participant')
  }, [])

  const removeParticipant = useCallback(async (id) => {
    await supabase.from('predictions').delete().eq('participant_id', id)
    await supabase.from('bracket_predictions').delete().eq('participant_id', id)
    await supabase.from('standings_predictions').delete().eq('participant_id', id)
    await supabase.from('scorer_predictions').delete().eq('participant_id', id)
    await supabase.from('participants').delete().eq('id', id)
    setParticipants(prev => prev.filter(p => p.id !== id))
    setPredictions(prev => prev.filter(p => p.participantId !== id))
    setBracketPredictions(prev => prev.filter(p => p.participantId !== id))
    setStandingsPredictions(prev => prev.filter(p => p.participantId !== id))
    setScorerPredictions(prev => prev.filter(p => p.participantId !== id))
    if (currentParticipantId === id) {
      setCurrentParticipantIdState(null)
      localStorage.removeItem('pm_current_participant')
    }
  }, [currentParticipantId])

  // ─── Pronósticos ────────────────────────────────────────────────────────────

  const savePrediction = useCallback(async (participantId, matchId, homeScore, awayScore) => {
    const row = { participant_id: participantId, match_id: matchId, home_score: homeScore, away_score: awayScore }
    const { data } = await supabase.from('predictions')
      .upsert(row, { onConflict: 'participant_id,match_id' }).select().single()
    if (data) {
      setPredictions(prev => {
        const filtered = prev.filter(p => !(p.participantId === participantId && p.matchId === matchId))
        return [...filtered, dbToPrediction(data)]
      })
    }
  }, [])

  const getPrediction = useCallback((participantId, matchId) =>
    predictions.find(p => p.participantId === participantId && p.matchId === matchId) || null
  , [predictions])

  const saveBracketPrediction = useCallback(async (participantId, bracketMatchId, predictedWinner) => {
    const row = { participant_id: participantId, bracket_match_id: bracketMatchId, predicted_winner: predictedWinner }
    const { data } = await supabase.from('bracket_predictions')
      .upsert(row, { onConflict: 'participant_id,bracket_match_id' }).select().single()
    if (data) {
      setBracketPredictions(prev => {
        const filtered = prev.filter(p => !(p.participantId === participantId && p.bracketMatchId === bracketMatchId))
        return [...filtered, dbToBracketPrediction(data)]
      })
    }
  }, [])

  const getBracketPrediction = useCallback((participantId, bracketMatchId) =>
    bracketPredictions.find(p => p.participantId === participantId && p.bracketMatchId === bracketMatchId) || null
  , [bracketPredictions])

  // ─── Clasificación de grupos ────────────────────────────────────────────────

  const updateGroupStandings = useCallback(async (group, standings) => {
    await supabase.from('group_standings').upsert({ group, standings }, { onConflict: 'group' })
    setGroupStandings(prev => ({ ...prev, [group]: standings }))
  }, [])

  const saveStandingsPrediction = useCallback(async (participantId, group, standings) => {
    const row = { participant_id: participantId, group, standings }
    const { data } = await supabase.from('standings_predictions')
      .upsert(row, { onConflict: 'participant_id,group' }).select().single()
    if (data) {
      setStandingsPredictions(prev => {
        const filtered = prev.filter(p => !(p.participantId === participantId && p.group === group))
        return [...filtered, dbToStandingsPrediction(data)]
      })
    }
  }, [])

  const getStandingsPrediction = useCallback((participantId, group) =>
    standingsPredictions.find(p => p.participantId === participantId && p.group === group) || null
  , [standingsPredictions])

  // ─── Goleadores ─────────────────────────────────────────────────────────────

  const updateTopScorers = useCallback(async (scorers) => {
    await supabase.from('top_scorers').upsert({ id: 1, scorers })
    setTopScorers(scorers)
  }, [])

  const saveScorerPrediction = useCallback(async (participantId, scorers) => {
    const row = { participant_id: participantId, scorers }
    const { data } = await supabase.from('scorer_predictions')
      .upsert(row, { onConflict: 'participant_id' }).select().single()
    if (data) {
      setScorerPredictions(prev => {
        const filtered = prev.filter(p => p.participantId !== participantId)
        return [...filtered, dbToScorerPrediction(data)]
      })
    }
  }, [])

  const getScorerPrediction = useCallback((participantId) =>
    scorerPredictions.find(p => p.participantId === participantId) || null
  , [scorerPredictions])

  // ─── Admin ──────────────────────────────────────────────────────────────────

  const updateMatch = useCallback(async (matchId, updates) => {
    await supabase.from('matches').update(matchUpdatesToDb(updates)).eq('id', matchId)
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, ...updates } : m))
  }, [])

  const updateGroupTeams = useCallback(async (group, teams) => {
    const PAIRS = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]]
    const groupMatches = matches
      .filter(m => m.group === group)
      .sort((a, b) => a.id.localeCompare(b.id))
    await Promise.all(groupMatches.map((m, i) =>
      supabase.from('matches').update({
        home_team: teams[PAIRS[i][0]] || '',
        away_team: teams[PAIRS[i][1]] || '',
      }).eq('id', m.id)
    ))
    setMatches(prev => prev.map(m => {
      if (m.group !== group) return m
      const idx = groupMatches.findIndex(gm => gm.id === m.id)
      if (idx < 0) return m
      return { ...m, homeTeam: teams[PAIRS[idx][0]] || '', awayTeam: teams[PAIRS[idx][1]] || '' }
    }))
  }, [matches])

  const updateBracketMatch = useCallback(async (bracketMatchId, updates) => {
    await supabase.from('bracket_matches').update(bracketUpdatesToDb(updates)).eq('id', bracketMatchId)
    setBracketMatches(prev => prev.map(m => m.id === bracketMatchId ? { ...m, ...updates } : m))
  }, [])

  const updateConfig = useCallback(async (updates) => {
    const next = { ...config, ...updates }
    if (updates.pts) next.pts = { ...config.pts, ...updates.pts }
    await supabase.from('config').update({
      name:            next.name,
      tournament_name: next.tournamentName,
      year:            next.year,
      admin_password:  next.adminPassword,
      pts:             next.pts,
    }).eq('id', 1)
    setConfig(next)
  }, [config])

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
    setParticipants([])
    setCurrentParticipantIdState(null)
    localStorage.removeItem('pm_current_participant')
    setPredictions([])
    setBracketPredictions([])
    setGroupStandings(EMPTY_STANDINGS)
    setStandingsPredictions([])
    setTopScorers(['', '', ''])
    setScorerPredictions([])
    setMatches(newMatches)
    setBracketMatches(newBracket)
  }, [])

  return (
    <AppContext.Provider value={{
      loading,
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
