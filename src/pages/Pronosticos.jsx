import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { calcGroupScore } from '../utils/scoring'
import { GROUP_LETTERS } from '../data/initialData'

// ─── Tab: Partidos de Grupos ──────────────────────────────────────────────────

const STATUS_LABEL = {
  pending:  { label: 'Pendiente',   cls: 'bg-gray-700 text-gray-300' },
  live:     { label: 'En juego',    cls: 'bg-yellow-700 text-yellow-200' },
  finished: { label: 'Finalizado',  cls: 'bg-green-900 text-green-300' },
}

function ScoreInput({ value, onChange, disabled }) {
  return (
    <input
      type="number" min="0" max="99"
      value={value === null || value === undefined ? '' : value}
      onChange={e => onChange(e.target.value === '' ? null : parseInt(e.target.value))}
      disabled={disabled}
      className="w-12 text-center bg-gray-800 border border-gray-700 text-white rounded py-1 text-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-green-500"
    />
  )
}

function MatchCard({ match, participantId, prediction, config, onSave }) {
  const [home, setHome] = useState(prediction?.homeScore ?? null)
  const [away, setAway] = useState(prediction?.awayScore ?? null)
  const locked = match.status !== 'pending'
  const hasPred = prediction !== null
  const pts = config?.pts

  const score = match.status === 'finished' && hasPred
    ? calcGroupScore(prediction, match, config)
    : null

  const ptExacto    = pts?.exacto    ?? 3
  const ptResultado = pts?.resultado ?? 1

  function handleSave() {
    if (home !== null && away !== null) onSave(match.id, home, away)
  }

  const changed = home !== (prediction?.homeScore ?? null) || away !== (prediction?.awayScore ?? null)

  return (
    <div className={`bg-gray-900 border rounded-xl p-4 ${
      match.status === 'live'     ? 'border-yellow-700' :
      match.status === 'finished' ? 'border-gray-700'   : 'border-gray-800'
    }`}>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABEL[match.status]?.cls ?? ''}`}>
          {STATUS_LABEL[match.status]?.label}
        </span>
        {match.date && <span className="text-xs text-gray-500">{match.date}</span>}
        {score !== null && (
          <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
            score === ptExacto    ? 'bg-yellow-700 text-yellow-200' :
            score === ptResultado ? 'bg-blue-900 text-blue-300'     :
            'bg-gray-800 text-gray-500'
          }`}>
            {score} {score === 1 ? 'pt' : 'pts'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 text-right">
          <p className="font-semibold text-white text-sm leading-tight">{match.homeTeam || '—'}</p>
          {match.status === 'finished' && <p className="text-2xl font-bold text-white">{match.homeScore}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ScoreInput value={home} onChange={setHome} disabled={locked || !participantId} />
          <span className="text-gray-500 font-bold">-</span>
          <ScoreInput value={away} onChange={setAway} disabled={locked || !participantId} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white text-sm leading-tight">{match.awayTeam || '—'}</p>
          {match.status === 'finished' && <p className="text-2xl font-bold text-white">{match.awayScore}</p>}
        </div>
      </div>

      {match.status === 'finished' && (
        <div className="mt-2 text-center text-xs text-gray-500">
          Resultado: {match.homeScore} - {match.awayScore}
          {hasPred && (
            <span className="ml-2 text-gray-400">
              | Tu pronóstico: {prediction.homeScore} - {prediction.awayScore}
            </span>
          )}
        </div>
      )}

      {!locked && participantId && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={handleSave}
            disabled={home === null || away === null || !changed}
            className="text-sm bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-1.5 rounded-lg transition-colors"
          >
            {hasPred ? 'Actualizar' : 'Guardar'}
          </button>
        </div>
      )}

      {!participantId && match.status === 'pending' && (
        <p className="mt-2 text-center text-xs text-gray-600">Selecciona un participante para pronosticar</p>
      )}
    </div>
  )
}

function PartidosTab() {
  const { matches, predictions, currentParticipant, savePrediction, config } = useApp()
  const [activeGroup, setActiveGroup] = useState('A')

  const groups = [...new Set(matches.filter(m => m.phase === 'groups').map(m => m.group))].sort()
  const groupMatches = matches.filter(m => m.group === activeGroup)

  const getPred = useCallback((matchId) => {
    if (!currentParticipant) return null
    return predictions.find(p => p.participantId === currentParticipant.id && p.matchId === matchId) || null
  }, [predictions, currentParticipant])

  function handleSave(matchId, homeScore, awayScore) {
    if (!currentParticipant) return
    savePrediction(currentParticipant.id, matchId, homeScore, awayScore)
  }

  const myPredCount = currentParticipant
    ? predictions.filter(p => p.participantId === currentParticipant.id).length : 0

  return (
    <div className="space-y-5">
      {currentParticipant && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm inline-flex items-center gap-3">
          <span className="text-gray-400">Jugando como:</span>
          <span className="font-semibold text-white">{currentParticipant.name}</span>
          <span className="text-green-400">{myPredCount}/{matches.length} pronosticados</span>
        </div>
      )}

      {/* Tabs de grupos */}
      <div className="flex gap-1 flex-wrap">
        {groups.map(g => (
          <button key={g} onClick={() => setActiveGroup(g)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeGroup === g ? 'bg-green-700 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            Grupo {g}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {groupMatches.map(match => (
          <MatchCard key={match.id} match={match}
            participantId={currentParticipant?.id}
            prediction={getPred(match.id)}
            config={config}
            onSave={handleSave}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Tab: Tabla de Grupos ─────────────────────────────────────────────────────

function TablaGruposTab() {
  const {
    matches, groupStandings,
    currentParticipant, saveStandingsPrediction, getStandingsPrediction,
    config,
  } = useApp()
  const [activeGroup, setActiveGroup] = useState('A')

  function getGroupTeams(group) {
    const gm = matches.filter(m => m.group === group)
    const all = gm.flatMap(m => [m.homeTeam, m.awayTeam]).filter(Boolean)
    return [...new Set(all)]
  }

  const teams = getGroupTeams(activeGroup)
  const actual = groupStandings?.[activeGroup] || ['', '', '', '']
  const pred = currentParticipant
    ? (getStandingsPrediction(currentParticipant.id, activeGroup) || null)
    : null

  const [standings, setStandings] = useState(pred?.standings || ['', '', '', ''])

  // Reset cuando cambia de grupo
  function handleGroupChange(g) {
    setActiveGroup(g)
    const p = currentParticipant
      ? getStandingsPrediction(currentParticipant.id, g) : null
    setStandings(p?.standings || ['', '', '', ''])
  }

  function handleSelect(pos, team) {
    setStandings(prev => {
      const next = [...prev]
      // Remover el equipo si ya estaba en otra posición
      for (let i = 0; i < 4; i++) {
        if (i !== pos && next[i] === team) next[i] = ''
      }
      next[pos] = team
      return next
    })
  }

  function handleSave() {
    if (!currentParticipant) return
    saveStandingsPrediction(currentParticipant.id, activeGroup, standings)
  }

  const allFilled = standings.every(t => t)
  const changed = JSON.stringify(standings) !== JSON.stringify(pred?.standings || ['', '', '', ''])
  const pts = config?.pts?.ordenGrupo ?? 1

  return (
    <div className="space-y-5">
      <div className="bg-blue-950/30 border border-blue-900 rounded-xl p-4 text-sm text-blue-300">
        <strong>¿Cómo funciona?</strong> Predice el orden final de cada grupo (1°, 2°, 3°, 4°).
        Ganas <strong>{pts} punto{pts !== 1 ? 's' : ''}</strong> por cada equipo que quede exactamente en la posición que pronosticaste.
      </div>

      {!currentParticipant && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 text-yellow-300 text-sm">
          ⚠️ Selecciona o{' '}
          <Link to="/registro" className="underline hover:text-yellow-200">registra un participante</Link>
          {' '}para guardar pronósticos.
        </div>
      )}

      {/* Tabs de grupos */}
      <div className="flex gap-1 flex-wrap">
        {GROUP_LETTERS.map(g => {
          const gPred = currentParticipant
            ? getStandingsPrediction(currentParticipant.id, g) : null
          return (
            <button key={g} onClick={() => handleGroupChange(g)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors relative ${
                activeGroup === g ? 'bg-green-700 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              {g}
              {gPred?.standings?.every(t => t) && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Mi pronóstico */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Mi pronóstico · Grupo {activeGroup}</h3>

          {teams.length === 0 ? (
            <p className="text-gray-600 text-sm py-4 text-center">
              Los equipos del Grupo {activeGroup} aún no están configurados.
            </p>
          ) : (
            <div className="space-y-2">
              {[0,1,2,3].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm font-medium w-5 shrink-0">{i+1}°</span>
                  <select
                    value={standings[i]}
                    onChange={e => handleSelect(i, e.target.value)}
                    disabled={!currentParticipant}
                    className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-600 disabled:opacity-50"
                  >
                    <option value="">— Seleccionar —</option>
                    {teams.map(team => (
                      <option key={team} value={team}
                        disabled={standings.includes(team) && standings[i] !== team}>
                        {team}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              {currentParticipant && (
                <button
                  onClick={handleSave}
                  disabled={!allFilled || !changed}
                  className="mt-3 w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm py-2 rounded-lg transition-colors"
                >
                  {pred ? 'Actualizar pronóstico' : 'Guardar pronóstico'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Clasificación real */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Clasificación real · Grupo {activeGroup}</h3>
          {actual.some(t => t) ? (
            <div className="space-y-2">
              {actual.map((team, i) => {
                const correct = pred?.standings?.[i] === team && team
                return (
                  <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
                    correct ? 'bg-green-900/30 border-green-700' : 'bg-gray-800 border-gray-700'
                  }`}>
                    <span className="text-gray-400 text-sm font-medium w-5">{i+1}°</span>
                    <span className="text-white font-medium flex-1">{team || '—'}</span>
                    {correct && <span className="text-green-400 text-xs font-bold">+{pts}pt</span>}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-600 text-sm py-4 text-center">
              Aún no hay clasificación oficial para el Grupo {activeGroup}.
            </p>
          )}
        </div>
      </div>
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
  const [local, setLocal] = useState(pred?.scorers || ['', '', ''])
  const pts = config?.pts?.goleador ?? 2

  function handleSave(e) {
    e.preventDefault()
    if (!currentParticipant) return
    saveScorerPrediction(currentParticipant.id, local)
  }

  const changed = JSON.stringify(local) !== JSON.stringify(pred?.scorers || ['', '', ''])

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-blue-950/30 border border-blue-900 rounded-xl p-4 text-sm text-blue-300">
        <strong>¿Cómo funciona?</strong> Predice los 3 máximos goleadores del torneo y el orden exacto (1°, 2°, 3°).
        Ganas <strong>{pts} punto{pts !== 1 ? 's' : ''}</strong> por cada goleador en la posición exacta.
      </div>

      {!currentParticipant && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 text-yellow-300 text-sm">
          ⚠️ Selecciona o{' '}
          <Link to="/registro" className="underline hover:text-yellow-200">registra un participante</Link>
          {' '}para guardar pronósticos.
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Mi pronóstico */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Mi pronóstico · Top 3 Goleadores</h3>
          <form onSubmit={handleSave} className="space-y-3">
            {[0,1,2].map(i => (
              <div key={i}>
                <label className="text-xs text-gray-400 mb-1 block">
                  {['🥇 1° Goleador','🥈 2° Goleador','🥉 3° Goleador'][i]}
                </label>
                <input
                  type="text"
                  value={local[i] || ''}
                  onChange={e => setLocal(prev => { const c=[...prev]; c[i]=e.target.value; return c })}
                  disabled={!currentParticipant}
                  placeholder={`Nombre del ${i+1}° goleador`}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-600 disabled:opacity-50"
                />
              </div>
            ))}
            {currentParticipant && (
              <button
                type="submit"
                disabled={!changed}
                className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm py-2 rounded-lg mt-2 transition-colors"
              >
                {pred ? 'Actualizar pronóstico' : 'Guardar pronóstico'}
              </button>
            )}
          </form>
        </div>

        {/* Goleadores reales */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Top 3 Goleadores Reales</h3>
          {topScorers.some(s => s) ? (
            <div className="space-y-2">
              {topScorers.map((scorer, i) => {
                const correct = pred?.scorers?.[i] === scorer && scorer
                return (
                  <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
                    correct ? 'bg-green-900/30 border-green-700' : 'bg-gray-800 border-gray-700'
                  }`}>
                    <span className="text-lg">{['🥇','🥈','🥉'][i]}</span>
                    <span className="text-white font-medium flex-1">{scorer || '—'}</span>
                    {correct && <span className="text-green-400 text-xs font-bold">+{pts}pt</span>}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-600 text-sm py-8 text-center">
              Aún no hay goleadores registrados por el administrador.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'partidos',  label: '⚽ Partidos de Grupos' },
  { id: 'tabla',     label: '📊 Tabla de Grupos' },
  { id: 'goleadores',label: '⭐ Goleadores' },
]

export default function Pronosticos() {
  const [tab, setTab] = useState('partidos')
  const { currentParticipant } = useApp()

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Pronósticos</h1>
          <p className="text-gray-400 text-sm">
            Partidos de grupos, clasificación de grupos y goleadores.
          </p>
        </div>
        {currentParticipant && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
            <span className="text-gray-400">Jugando como:</span>
            <span className="font-semibold text-white">{currentParticipant.name}</span>
          </div>
        )}
      </div>

      {!currentParticipant && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 text-yellow-300 text-sm">
          ⚠️ Selecciona o{' '}
          <Link to="/registro" className="underline hover:text-yellow-200">registra un participante</Link>
          {' '}para poder guardar pronósticos.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-green-500 text-green-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'partidos'   && <PartidosTab />}
      {tab === 'tabla'      && <TablaGruposTab />}
      {tab === 'goleadores' && <GoleadoresTab />}
    </div>
  )
}
