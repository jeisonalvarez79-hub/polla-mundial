import { useState, useCallback, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { calcGroupScore, calcGroupStandings, calcPredictedGroupStandings } from '../utils/scoring'
import { isLockedByKickoff, LOCK_MINUTES_BEFORE_KICKOFF } from '../utils/matchTiming'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Tab: Partidos de Grupos ──────────────────────────────────────────────────

const STATUS_DOT = {
  pending:  'bg-orange-400',
  live:     'bg-yellow-400 animate-pulse',
  finished: 'bg-green-500',
}

function ScoreInput({ value, onChange, onBlur, disabled }) {
  return (
    <input
      type="number" min="0" max="99"
      inputMode="numeric"
      value={value === null || value === undefined ? '' : value}
      onChange={e => onChange(e.target.value === '' ? null : parseInt(e.target.value))}
      onBlur={onBlur}
      disabled={disabled}
      className="w-10 text-center bg-gray-100 border border-gray-300 text-black rounded py-1 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-green-800"
    />
  )
}

function StandingsTable({ standings }) {
  if (!standings.length) {
    return <p className="text-gray-500 text-xs py-4 text-center">Sin resultados aún</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-600 border-b border-gray-300">
            <th className="text-left pb-2 pr-1 font-semibold w-6">Pos</th>
            <th className="text-left pb-2 font-semibold">Selección</th>
            <th className="text-center pb-2 px-1 font-semibold">Pts</th>
            <th className="text-center pb-2 px-1 font-semibold">J</th>
            <th className="text-center pb-2 px-1 font-semibold">G</th>
            <th className="text-center pb-2 px-1 font-semibold">E</th>
            <th className="text-center pb-2 px-1 font-semibold">P</th>
            <th className="text-center pb-2 px-1 font-semibold">GF</th>
            <th className="text-center pb-2 px-1 font-semibold">GC</th>
            <th className="text-center pb-2 pl-1 font-semibold">DG</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((t, i) => (
            <tr key={t.name} className={`border-b border-gray-200 ${i < 2 ? 'text-black' : 'text-gray-600'}`}>
              <td className="py-1.5 pr-1">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                  i === 0 ? 'bg-yellow-700 text-white' :
                  i === 1 ? 'bg-gray-500 text-white'   :
                  'bg-gray-100 text-gray-500'
                }`}>{i + 1}</span>
              </td>
              <td className="py-1.5 font-medium truncate max-w-[90px]">{t.name}</td>
              <td className="py-1.5 text-center px-1 font-bold text-green-800">{t.Pts}</td>
              <td className="py-1.5 text-center px-1">{t.J}</td>
              <td className="py-1.5 text-center px-1">{t.G}</td>
              <td className="py-1.5 text-center px-1">{t.E}</td>
              <td className="py-1.5 text-center px-1">{t.P}</td>
              <td className="py-1.5 text-center px-1">{t.GF}</td>
              <td className="py-1.5 text-center px-1">{t.GC}</td>
              <td className="py-1.5 text-center pl-1">{t.DG > 0 ? `+${t.DG}` : t.DG}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PartidosTab() {
  const { matches, predictions, currentParticipant, savePrediction, saveStandingsPrediction, config } = useApp()
  const [activeGroup, setActiveGroup] = useState('A')
  const [localScores, setLocalScores] = useState({})
  const [savingIds, setSavingIds] = useState(new Set())

  // Recalcula el bloqueo por horario (kickoff - 10 min) cada 30s, para que
  // un partido se bloquee solo en pantalla sin necesidad de recargar.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  // Refs para evitar closures obsoletos en los timers de auto-guardado
  const timerRef = useRef({})
  const predictionsRef = useRef(predictions)
  const participantRef = useRef(currentParticipant)
  const localRef = useRef(localScores)
  const savePredictionRef = useRef(savePrediction)
  const matchesRef = useRef(matches)
  const saveStandingsPredictionRef = useRef(saveStandingsPrediction)

  useEffect(() => { predictionsRef.current = predictions }, [predictions])
  useEffect(() => { participantRef.current = currentParticipant }, [currentParticipant])
  useEffect(() => { localRef.current = localScores }, [localScores])
  useEffect(() => { savePredictionRef.current = savePrediction }, [savePrediction])
  useEffect(() => { matchesRef.current = matches }, [matches])
  useEffect(() => { saveStandingsPredictionRef.current = saveStandingsPrediction }, [saveStandingsPrediction])

  // Recalcula y guarda la posición de grupo derivada de los pronósticos de partidos
  function autoSaveGroupStandings(matchId, participantId, homeScore, awayScore) {
    const match = matchesRef.current.find(m => m.id === matchId)
    if (!match?.group) return
    const updatedPreds = [
      ...predictionsRef.current.filter(p => !(p.participantId === participantId && p.matchId === matchId)),
      { participantId, matchId, homeScore, awayScore },
    ]
    const standings = calcPredictedGroupStandings(matchesRef.current, updatedPreds, participantId, match.group)
    saveStandingsPredictionRef.current(participantId, match.group, standings.map(t => t.name))
  }

  // Al desmontar: vaciar timers pendientes guardando inmediatamente los cambios locales
  useEffect(() => {
    return () => {
      const participant = participantRef.current
      // Cancelar todos los timers en vuelo
      Object.entries(timerRef.current).forEach(([, timer]) => clearTimeout(timer))
      if (!participant) return
      // Guardar inmediatamente cualquier cambio local pendiente
      Object.keys(timerRef.current).forEach(matchId => {
        const local = localRef.current[matchId]
        if (!local) return
        const pred = predictionsRef.current.find(
          p => p.participantId === participant.id && p.matchId === matchId
        )
        const home = local.home !== undefined ? local.home : (pred?.homeScore ?? null)
        const away = local.away !== undefined ? local.away : (pred?.awayScore ?? null)
        if (home !== null && away !== null) {
          savePredictionRef.current(participant.id, matchId, home, away)
          autoSaveGroupStandings(matchId, participant.id, home, away)
        }
      })
    }
  }, [])

  const groupsLocked = config?.locks?.groups ?? false

  const groups = [...new Set(matches.filter(m => m.phase === 'groups').map(m => m.group))].sort()
  const groupMatches = matches
    .filter(m => m.group === activeGroup)
    .sort((a, b) => {
      const ja = parseInt((a.jornada || '0').replace(/\D/g, '')) || 0
      const jb = parseInt((b.jornada || '0').replace(/\D/g, '')) || 0
      return ja - jb
    })
  const standings = calcGroupStandings(matches, activeGroup)

  // Tabla calculada con los pronósticos del participante actual
  const predictedStandings = currentParticipant
    ? calcPredictedGroupStandings(matches, predictions, currentParticipant.id, activeGroup)
    : []

  const ptExacto    = config?.pts?.exacto    ?? 3
  const ptResultado = config?.pts?.resultado ?? 1

  const getPred = useCallback((matchId) => {
    if (!currentParticipant) return null
    return predictions.find(p => p.participantId === currentParticipant.id && p.matchId === matchId) || null
  }, [predictions, currentParticipant])

  function getLocal(matchId, field, pred) {
    if (localScores[matchId]?.[field] !== undefined) return localScores[matchId][field]
    return field === 'home' ? (pred?.homeScore ?? null) : (pred?.awayScore ?? null)
  }

  function triggerAutoSave(matchId) {
    clearTimeout(timerRef.current[matchId])
    timerRef.current[matchId] = setTimeout(async () => {
      const participant = participantRef.current
      if (!participant) return
      const local = localRef.current[matchId] || {}
      const pred = predictionsRef.current.find(
        p => p.participantId === participant.id && p.matchId === matchId
      )
      const home = local.home !== undefined ? local.home : (pred?.homeScore ?? null)
      const away = local.away !== undefined ? local.away : (pred?.awayScore ?? null)
      if (home !== null && away !== null) {
        setSavingIds(s => new Set([...s, matchId]))
        const ok = await savePredictionRef.current(participant.id, matchId, home, away)
        setSavingIds(s => { const n = new Set(s); n.delete(matchId); return n })
        // Solo limpiar el estado local si el guardado fue exitoso;
        // si falló, el flush al desmontar puede reintentar.
        if (ok) {
          setLocalScores(prev => { const c = { ...prev }; delete c[matchId]; return c })
          autoSaveGroupStandings(matchId, participant.id, home, away)
        }
      }
    }, 700)
  }

  function setLocal(matchId, field, value) {
    setLocalScores(prev => ({ ...prev, [matchId]: { ...(prev[matchId] || {}), [field]: value } }))
    if (currentParticipant) triggerAutoSave(matchId)
  }

  function handleSave(matchId) {
    clearTimeout(timerRef.current[matchId])
    if (!currentParticipant) return
    const pred = getPred(matchId)
    const home = getLocal(matchId, 'home', pred)
    const away = getLocal(matchId, 'away', pred)
    if (home !== null && away !== null) {
      setSavingIds(s => new Set([...s, matchId]))
      savePrediction(currentParticipant.id, matchId, home, away).then((ok) => {
        setSavingIds(s => { const n = new Set(s); n.delete(matchId); return n })
        if (ok) {
          setLocalScores(prev => { const c = { ...prev }; delete c[matchId]; return c })
          autoSaveGroupStandings(matchId, currentParticipant.id, home, away)
        }
      })
    }
  }

  function handleGroupChange(g) {
    setActiveGroup(g)
    // No limpiar localScores — el auto-guardado persiste las ediciones entre grupos
  }

  const myPredCount = currentParticipant
    ? predictions.filter(p => p.participantId === currentParticipant.id).length : 0

  return (
    <div className="space-y-4">
      {/* Banner de fase bloqueada */}
      {groupsLocked && (
        <div className="bg-white border-2 border-red-800 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-800">
          <span className="text-xl">🔒</span>
          <div>
            <p className="font-semibold">Carga de pronósticos cerrada</p>
            <p className="text-xs text-red-800 mt-0.5">El administrador ha bloqueado los pronósticos de grupos. Solo lectura.</p>
          </div>
        </div>
      )}

      {currentParticipant && (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm inline-flex items-center gap-3">
          <span className="text-gray-600">Jugando como:</span>
          <span className="font-semibold text-black">{currentParticipant.name}</span>
          <span className="text-green-800">{myPredCount}/{matches.length} pronosticados</span>
        </div>
      )}

      {/* Tabs de grupos */}
      <div className="flex gap-1 flex-wrap">
        {groups.map(g => (
          <button key={g} onClick={() => handleGroupChange(g)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeGroup === g ? 'bg-green-800 text-white' : 'bg-white text-gray-600 hover:text-black border border-gray-200'
            }`}
          >
            Grupo {g}
          </button>
        ))}
      </div>

      {/* Contenido del grupo: partidos + tabla */}
      <div className="grid gap-4 xl:grid-cols-[1fr_auto]">

        {/* Tabla de partidos */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-xs">
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Fecha</th>
                  <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Hora</th>
                  <th className="text-left px-2 py-2 font-semibold">Jor.</th>
                  <th className="text-right px-3 py-2 font-semibold">Local</th>
                  <th className="text-center px-1 py-2 font-semibold text-blue-800">Pred.</th>
                  <th className="text-center px-1 py-2 font-semibold text-blue-800">Pred.</th>
                  <th className="text-left px-3 py-2 font-semibold">Visitante</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {groupMatches.map((match, idx) => {
                  const pred      = getPred(match.id)
                  const hasResult = match.homeScore !== null && match.awayScore !== null
                  const lockedByTime = isLockedByKickoff(match)
                  const locked    = match.status !== 'pending' || groupsLocked || lockedByTime
                  const homeVal   = getLocal(match.id, 'home', pred)
                  const awayVal   = getLocal(match.id, 'away', pred)
                  const changed   = homeVal !== (pred?.homeScore ?? null) || awayVal !== (pred?.awayScore ?? null)
                  const canSave   = !locked && currentParticipant && homeVal !== null && awayVal !== null && changed

                  const score = hasResult && pred
                    ? calcGroupScore(pred, match, config) : null

                  return (
                    <tr key={match.id}
                      className={`border-b border-gray-200 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                    >
                      {/* Fecha */}
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600 text-xs">
                        {match.date || '—'}
                      </td>
                      {/* Hora */}
                      <td className="px-2 py-2 whitespace-nowrap text-gray-600 text-xs">
                        {match.hora || '—'}
                        {lockedByTime && match.status === 'pending' && (
                          <span title={`Pronósticos cerrados: faltan ${LOCK_MINUTES_BEFORE_KICKOFF} min o menos para el inicio`} className="ml-1">🔒</span>
                        )}
                      </td>
                      {/* Jornada */}
                      <td className="px-2 py-2">
                        <span className="text-xs font-semibold text-white bg-blue-800 px-1.5 py-0.5 rounded">
                          {match.jornada || '—'}
                        </span>
                      </td>
                      {/* Local */}
                      <td className="px-3 py-2 text-right">
                        <span className="font-medium text-black text-xs whitespace-nowrap">{match.homeTeam || '—'}</span>
                        {match.homeScore !== null && (
                          <span className="ml-1 font-bold text-yellow-800 text-xs">({match.homeScore})</span>
                        )}
                      </td>
                      {/* Pred. local */}
                      <td className="px-1 py-2 text-center">
                        <ScoreInput
                          value={homeVal}
                          onChange={v => setLocal(match.id, 'home', v)}
                          onBlur={() => { if (localScores[match.id]) handleSave(match.id) }}
                          disabled={locked || !currentParticipant}
                        />
                      </td>
                      {/* Pred. visitante */}
                      <td className="px-1 py-2 text-center">
                        <ScoreInput
                          value={awayVal}
                          onChange={v => setLocal(match.id, 'away', v)}
                          onBlur={() => { if (localScores[match.id]) handleSave(match.id) }}
                          disabled={locked || !currentParticipant}
                        />
                      </td>
                      {/* Visitante */}
                      <td className="px-3 py-2">
                        <span className="font-medium text-black text-xs whitespace-nowrap">{match.awayTeam || '—'}</span>
                        {match.awayScore !== null && (
                          <span className="ml-1 font-bold text-yellow-800 text-xs">({match.awayScore})</span>
                        )}
                      </td>
                      {/* Estado / puntos / guardar */}
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          {score !== null && (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                              score === ptExacto    ? 'bg-yellow-800 text-yellow-200' :
                              score === ptResultado ? 'bg-blue-900 text-blue-300'     :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              +{score}pt
                            </span>
                          )}
                          {savingIds.has(match.id) ? (
                            <span className="text-xs text-gray-500 px-1">...</span>
                          ) : canSave ? (
                            <button
                              onClick={() => handleSave(match.id)}
                              className="text-xs bg-green-800 hover:bg-green-700 text-white px-2 py-1 rounded whitespace-nowrap"
                            >
                              {pred ? 'OK' : 'Guardar'}
                            </button>
                          ) : (
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[match.status] ?? 'bg-gray-300'}`} />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tablas de posiciones */}
        <div className="space-y-4 xl:min-w-[340px]">

          {/* Tabla pronosticada por el participante */}
          {currentParticipant && (
            <div className="bg-white border border-blue-900 rounded-xl p-4">
              <h3 className="text-black font-semibold text-sm mb-1">
                Mi pronóstico · Grupo {activeGroup}
              </h3>
              <p className="text-xs text-blue-800 mb-3">
                Calculada con tus marcadores pronosticados. Top 2 pasan al bracket.
              </p>
              {predictedStandings.length > 0 ? (
                <>
                  <StandingsTable standings={predictedStandings} />
                  <p className="text-xs text-gray-500 mt-2">* Top 2 clasifican a fase eliminatoria</p>
                  {predictedStandings.every(t => t.J === 0) && (
                    <p className="text-xs text-yellow-800 mt-2">
                      Aún no has pronosticado partidos de este grupo.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-gray-500 text-xs py-4 text-center">Sin pronósticos aún</p>
              )}
            </div>
          )}

          {/* Tabla real (admin) */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-black font-semibold text-sm mb-1">
              Tabla real · Grupo {activeGroup}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Basada en resultados reales <span className="text-yellow-800">(amarillo)</span> ingresados por el administrador.
            </p>
            <StandingsTable standings={standings} />
            {standings.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                * Top 2 clasifican a fase eliminatoria
              </p>
            )}
            {standings.every(t => t.J === 0) && standings.length > 0 && (
              <p className="text-xs text-yellow-800 mt-2">
                El administrador aún no ha ingresado resultados reales para este grupo.
              </p>
            )}
          </div>
        </div>
      </div>

      {!currentParticipant && (
        <p className="text-center text-xs text-gray-500 py-2">
          Selecciona o{' '}
          <Link to="/registro" className="underline hover:text-gray-600">registra un participante</Link>
          {' '}para pronosticar.
        </p>
      )}
    </div>
  )
}


// ─── Tab: Goleadores ──────────────────────────────────────────────────────────

function GoleadoresTab() {
  const {
    topScorers, scorerPredictions,
    currentParticipant, saveScorerPrediction, getScorerPrediction,
    config,
  } = useApp()

  const pred = currentParticipant ? getScorerPrediction(currentParticipant.id) : null
  const [local, setLocal] = useState(pred?.scorers?.[0] || '')
  const pts = config?.pts?.goleador ?? 10
  const scorerLocked = config?.locks?.scorer ?? false

  useEffect(() => { setLocal(pred?.scorers?.[0] || '') }, [pred])

  function handleSave(e) {
    e.preventDefault()
    if (!currentParticipant || scorerLocked) return
    saveScorerPrediction(currentParticipant.id, [local])
  }

  const changed = local.trim() !== (pred?.scorers?.[0] || '')

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-white border-2 border-blue-800 rounded-xl p-4 text-sm text-blue-800">
        <strong>¿Cómo funciona?</strong> Predice el máximo goleador del torneo.
        Ganas <strong>{pts} pts</strong> si aciertas el goleador registrado por el administrador.
      </div>

      {scorerLocked && (
        <div className="bg-white border-2 border-red-800 rounded-xl p-4 text-red-800 text-sm">
          🔒 El administrador ha bloqueado el pronóstico de goleador. Solo lectura.
        </div>
      )}

      {!currentParticipant && (
        <div className="bg-white border-2 border-yellow-800 rounded-xl p-4 text-yellow-800 text-sm">
          ⚠️ Selecciona o{' '}
          <Link to="/registro" className="underline hover:text-yellow-900">registra un participante</Link>
          {' '}para guardar pronósticos.
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Mi pronóstico */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-black font-semibold mb-4">Mi pronóstico · Goleador del torneo</h3>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Goleador del torneo</label>
              <input
                type="text"
                value={local}
                onChange={e => setLocal(e.target.value)}
                disabled={!currentParticipant || scorerLocked}
                placeholder="Nombre del goleador"
                className="w-full bg-gray-100 border border-gray-300 text-black rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-800 disabled:opacity-50"
              />
            </div>
            {currentParticipant && !scorerLocked && (
              <button
                type="submit"
                disabled={!changed || !local.trim()}
                className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-40 text-white text-sm py-2 rounded-lg mt-2 transition-colors"
              >
                {pred?.scorers?.[0] ? 'Actualizar pronóstico' : 'Guardar pronóstico'}
              </button>
            )}
          </form>
        </div>

        {/* Goleador real */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-black font-semibold mb-4">Goleador Oficial</h3>
          {topScorers[0] ? (
            <div className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
              pred?.scorers?.[0] === topScorers[0]
                ? 'bg-white border-2 border-green-800'
                : 'bg-gray-100 border-gray-300'
            }`}>
              <span className="text-lg">🥇</span>
              <span className="text-black font-medium flex-1">{topScorers[0]}</span>
              {pred?.scorers?.[0] === topScorers[0] && (
                <span className="text-green-800 text-xs font-bold">+{pts}pt</span>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-8 text-center">
              El administrador aún no ha registrado el goleador.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'partidos',   label: '⚽ Partidos de Grupos' },
  { id: 'goleadores', label: '⭐ Goleador' },
]

export default function Pronosticos() {
  const [tab, setTab] = useState('partidos')
  const { currentParticipant } = useApp()

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-black mb-1">Pronósticos</h1>
          <p className="text-gray-600 text-sm">
            Partidos de grupos, clasificación de grupos y goleadores.
          </p>
        </div>
        {currentParticipant && (
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
            <span className="text-gray-600">Jugando como:</span>
            <span className="font-semibold text-black">{currentParticipant.name}</span>
          </div>
        )}
      </div>

      {!currentParticipant && (
        <div className="bg-white border-2 border-yellow-800 rounded-xl p-4 text-yellow-800 text-sm">
          ⚠️ Selecciona o{' '}
          <Link to="/registro" className="underline hover:text-yellow-900">registra un participante</Link>
          {' '}para poder guardar pronósticos.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-green-800 text-green-800'
                : 'border-transparent text-gray-600 hover:text-black'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'partidos'   && <PartidosTab />}
      {tab === 'goleadores' && <GoleadoresTab />}
    </div>
  )
}
