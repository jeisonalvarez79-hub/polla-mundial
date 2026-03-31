import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { GROUP_LETTERS } from '../data/initialData'

// ─── Utilidades ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'pending',  label: 'Pendiente' },
  { value: 'live',     label: 'En juego' },
  { value: 'finished', label: 'Finalizado' },
]

function StatusBadge({ value, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
        active
          ? 'bg-green-700 border-green-600 text-white'
          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
      }`}
    >
      {STATUS_OPTIONS.find(s => s.value === value)?.label ?? value}
    </button>
  )
}

function Input({ value, onChange, placeholder, className = '', type = 'text', min, max }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      min={min}
      max={max}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-600 ${className}`}
    />
  )
}

// ─── Login ───────────────────────────────────────────────────────────────────

function LoginForm({ onLogin }) {
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const { config } = useApp()

  function handleSubmit(e) {
    e.preventDefault()
    if (pwd === config.adminPassword) {
      onLogin()
    } else {
      setErr('Contraseña incorrecta.')
      setPwd('')
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-5">
        <div className="text-5xl">🔒</div>
        <h2 className="text-xl font-bold text-white">Panel de Administración</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            placeholder="Contraseña de administrador..."
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2.5 text-center tracking-widest focus:outline-none focus:border-green-600"
          />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button
            type="submit"
            className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>

      {/* Hint visible */}
      <div className="bg-yellow-950 border border-yellow-700 rounded-xl p-4 text-center">
        <p className="text-yellow-400 text-xs mb-1 font-semibold uppercase tracking-wide">Contraseña por defecto</p>
        <p className="text-yellow-200 text-2xl font-mono font-bold tracking-widest">admin123</p>
        <p className="text-yellow-600 text-xs mt-2">Puedes cambiarla en la pestaña Configuración</p>
      </div>
    </div>
  )
}

// ─── Tab: Equipos & Partidos ──────────────────────────────────────────────────

function EquiposTab() {
  const { matches, updateMatch, updateGroupTeams } = useApp()
  const [activeGroup, setActiveGroup] = useState('A')
  const [teamInputs, setTeamInputs] = useState({})
  const [matchEdits, setMatchEdits] = useState({})

  const groupMatches = matches.filter(m => m.group === activeGroup)

  // Derivar los 4 equipos del grupo a partir de las primeras 2 jornadas
  function getGroupTeams(group) {
    const gm = matches.filter(m => m.group === group)
    if (!gm.length) return ['', '', '', '']
    return [
      gm[0]?.homeTeam || '',
      gm[0]?.awayTeam || '',
      gm[1]?.homeTeam || '',
      gm[1]?.awayTeam || '',
    ]
  }

  const currentTeams = teamInputs[activeGroup] ?? getGroupTeams(activeGroup)

  function setTeam(i, val) {
    setTeamInputs(prev => ({
      ...prev,
      [activeGroup]: currentTeams.map((t, idx) => idx === i ? val : t),
    }))
  }

  function saveTeams() {
    updateGroupTeams(activeGroup, currentTeams)
    setTeamInputs(prev => { const c = { ...prev }; delete c[activeGroup]; return c })
  }

  const teamsChanged = JSON.stringify(currentTeams) !== JSON.stringify(getGroupTeams(activeGroup))

  // Match edits
  function getME(id, field, fallback) {
    return matchEdits[id]?.[field] !== undefined ? matchEdits[id][field] : fallback
  }
  function setME(id, field, value) {
    setMatchEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }))
  }
  function saveME(match) {
    const ed = matchEdits[match.id] || {}
    updateMatch(match.id, {
      homeScore: ed.homeScore !== undefined ? ed.homeScore : match.homeScore,
      awayScore: ed.awayScore !== undefined ? ed.awayScore : match.awayScore,
      status:    ed.status    !== undefined ? ed.status    : match.status,
      date:      ed.date      !== undefined ? ed.date      : match.date,
    })
    setMatchEdits(prev => { const c = { ...prev }; delete c[match.id]; return c })
  }

  return (
    <div className="space-y-5">
      <p className="text-gray-400 text-sm">
        Configura los equipos de cada grupo y registra los resultados de los partidos.
      </p>

      {/* Tabs de grupos */}
      <div className="flex gap-1 flex-wrap">
        {GROUP_LETTERS.map(g => (
          <button key={g}
            onClick={() => setActiveGroup(g)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeGroup === g ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Grupo {g}
          </button>
        ))}
      </div>

      {/* Equipos del grupo */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-3">Equipos del Grupo {activeGroup}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {[0,1,2,3].map(i => (
            <div key={i}>
              <label className="text-xs text-gray-500 mb-1 block">{i+1}° equipo</label>
              <Input
                value={currentTeams[i]}
                onChange={val => setTeam(i, val)}
                placeholder={`Equipo ${i+1}`}
                className="w-full"
              />
            </div>
          ))}
        </div>
        <button
          onClick={saveTeams}
          disabled={!teamsChanged}
          className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm px-5 py-1.5 rounded-lg transition-colors"
        >
          Actualizar equipos en partidos
        </button>
      </div>

      {/* Partidos */}
      <div className="space-y-3">
        {groupMatches.map(match => {
          const hS = getME(match.id, 'homeScore', match.homeScore)
          const aS = getME(match.id, 'awayScore', match.awayScore)
          const st = getME(match.id, 'status',    match.status)
          const dt = getME(match.id, 'date',      match.date)
          const dirty = !!matchEdits[match.id] && Object.keys(matchEdits[match.id]).length > 0

          return (
            <div key={match.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              {/* Estado */}
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map(opt => (
                  <StatusBadge key={opt.value} value={opt.label}
                    active={st === opt.value}
                    onClick={() => setME(match.id, 'status', opt.value)}
                  />
                ))}
              </div>

              {/* Equipos + marcador */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex-1 min-w-[80px] text-sm font-medium text-white truncate">
                  {match.homeTeam || '—'}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <input type="number" min="0" max="99"
                    value={hS ?? ''}
                    onChange={e => setME(match.id, 'homeScore', e.target.value === '' ? null : parseInt(e.target.value))}
                    className="w-12 text-center bg-gray-800 border border-gray-700 text-white rounded py-1 text-lg font-bold focus:outline-none focus:border-green-600"
                    placeholder="-"
                  />
                  <span className="text-gray-600">-</span>
                  <input type="number" min="0" max="99"
                    value={aS ?? ''}
                    onChange={e => setME(match.id, 'awayScore', e.target.value === '' ? null : parseInt(e.target.value))}
                    className="w-12 text-center bg-gray-800 border border-gray-700 text-white rounded py-1 text-lg font-bold focus:outline-none focus:border-green-600"
                    placeholder="-"
                  />
                </div>
                <span className="flex-1 min-w-[80px] text-sm font-medium text-white truncate text-right">
                  {match.awayTeam || '—'}
                </span>
              </div>

              {/* Fecha */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-12 shrink-0">Fecha:</span>
                <Input value={dt} onChange={val => setME(match.id, 'date', val)}
                  placeholder="ej. 14 Jun · 18:00" className="flex-1" />
              </div>

              {dirty && (
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setMatchEdits(prev => { const c={...prev}; delete c[match.id]; return c })}
                    className="text-sm text-gray-500 hover:text-gray-300 px-3 py-1">
                    Cancelar
                  </button>
                  <button onClick={() => saveME(match)}
                    className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-1 rounded-lg">
                    Guardar
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab: Clasificación de Grupos ─────────────────────────────────────────────

function ClasificacionTab() {
  const { matches, groupStandings, updateGroupStandings } = useApp()
  const [edits, setEdits] = useState({})
  const [saved, setSaved] = useState({})

  function getGroupTeams(group) {
    const gm = matches.filter(m => m.group === group)
    const all = gm.flatMap(m => [m.homeTeam, m.awayTeam]).filter(Boolean)
    return [...new Set(all)]
  }

  function getVal(group, pos) {
    return edits[group]?.[pos] !== undefined ? edits[group][pos] : (groupStandings[group]?.[pos] ?? '')
  }
  function setVal(group, pos, val) {
    setEdits(prev => ({
      ...prev,
      [group]: { ...(prev[group] || {}), [pos]: val },
    }))
  }
  function saveGroup(group) {
    const standings = [0,1,2,3].map(i => getVal(group, i))
    updateGroupStandings(group, standings)
    setEdits(prev => { const c={...prev}; delete c[group]; return c })
    setSaved(prev => ({ ...prev, [group]: true }))
    setTimeout(() => setSaved(prev => ({ ...prev, [group]: false })), 1500)
  }

  return (
    <div className="space-y-5">
      <p className="text-gray-400 text-sm">
        Ingresa la clasificación final de cada grupo (1°, 2°, 3°, 4°).
        Esto se usa para calcular puntos de pronósticos de tabla.
        Usa el desplegable si los equipos ya están cargados, o escribe directamente.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROUP_LETTERS.map(group => {
          const teams = getGroupTeams(group)
          const isDirty = !!edits[group] && Object.keys(edits[group]).length > 0
          return (
            <div key={group} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-3">Grupo {group}</h3>
              <div className="space-y-2">
                {[0,1,2,3].map(i => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm w-5 shrink-0">{i+1}°</span>
                    {teams.length > 0 ? (
                      <select
                        value={getVal(group, i)}
                        onChange={e => setVal(group, i, e.target.value)}
                        className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-green-600"
                      >
                        <option value="">— Seleccionar —</option>
                        {teams.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={getVal(group, i)}
                        onChange={val => setVal(group, i, val)}
                        placeholder="Nombre equipo"
                        className="flex-1"
                      />
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => saveGroup(group)}
                disabled={!isDirty}
                className={`mt-3 w-full text-sm py-1.5 rounded-lg transition-colors ${
                  saved[group]
                    ? 'bg-green-800 text-green-300'
                    : isDirty
                    ? 'bg-green-700 hover:bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                }`}
              >
                {saved[group] ? '✓ Guardado' : 'Guardar Grupo ' + group}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab: Bracket ─────────────────────────────────────────────────────────────

const ROUND_ORDER = ['r32', 'r16', 'qf', 'sf', 'third', 'final']
const ROUND_LABEL = {
  r32:   'Dieciseisavos de Final',
  r16:   'Octavos de Final',
  qf:    'Cuartos de Final',
  sf:    'Semifinal',
  third: 'Tercer Lugar',
  final: 'Final',
}

function BracketTab() {
  const { bracketMatches, updateBracketMatch } = useApp()
  const [edits, setEdits] = useState({})

  function getE(id, field, fallback) {
    return edits[id]?.[field] !== undefined ? edits[id][field] : fallback
  }
  function setE(id, field, value) {
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }))
  }
  function saveMatch(bm) {
    const ed = edits[bm.id] || {}
    updateBracketMatch(bm.id, {
      homeTeam:  ed.homeTeam  ?? bm.homeTeam,
      awayTeam:  ed.awayTeam  ?? bm.awayTeam,
      homeScore: ed.homeScore ?? bm.homeScore,
      awayScore: ed.awayScore ?? bm.awayScore,
      winner:    ed.winner    ?? bm.winner,
      status:    ed.status    ?? bm.status,
    })
    setEdits(prev => { const c={...prev}; delete c[bm.id]; return c })
  }

  const byRound = ROUND_ORDER.reduce((acc, r) => {
    acc[r] = bracketMatches.filter(m => m.round === r)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <p className="text-gray-400 text-sm">
        Carga los equipos clasificados de cada fase y registra los resultados.
        El campo "Ganador / Clasificado" es lo que se usa para calcular los puntos del bracket.
      </p>

      {ROUND_ORDER.map(round => (
        <div key={round}>
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            {round === 'final' && '🏆 '}
            {round === 'third' && '🥉 '}
            {ROUND_LABEL[round]}
            <span className="text-xs text-gray-600 font-normal">
              ({byRound[round]?.length} partido{byRound[round]?.length !== 1 ? 's' : ''})
            </span>
          </h3>

          <div className="grid gap-3 sm:grid-cols-2">
            {byRound[round]?.map(bm => {
              const hT = getE(bm.id, 'homeTeam', bm.homeTeam)
              const aT = getE(bm.id, 'awayTeam', bm.awayTeam)
              const hS = getE(bm.id, 'homeScore', bm.homeScore)
              const aS = getE(bm.id, 'awayScore', bm.awayScore)
              const wn = getE(bm.id, 'winner',    bm.winner)
              const st = getE(bm.id, 'status',    bm.status)
              const dirty = !!edits[bm.id] && Object.keys(edits[bm.id]).length > 0

              return (
                <div key={bm.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                  <p className="text-xs text-gray-500 font-medium">{bm.label}</p>

                  {/* Estado */}
                  <div className="flex gap-2 flex-wrap">
                    {STATUS_OPTIONS.map(opt => (
                      <StatusBadge key={opt.value} value={opt.label}
                        active={st === opt.value}
                        onClick={() => setE(bm.id, 'status', opt.value)}
                      />
                    ))}
                  </div>

                  {/* Equipos + marcador */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input value={hT} onChange={v => setE(bm.id, 'homeTeam', v)}
                      placeholder="Equipo 1" className="flex-1 min-w-[90px]" />
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" min="0" value={hS ?? ''}
                        onChange={e => setE(bm.id, 'homeScore', e.target.value==='' ? null : parseInt(e.target.value))}
                        className="w-10 text-center bg-gray-800 border border-gray-700 text-white rounded py-1 text-base font-bold focus:outline-none"
                        placeholder="-" />
                      <span className="text-gray-600">-</span>
                      <input type="number" min="0" value={aS ?? ''}
                        onChange={e => setE(bm.id, 'awayScore', e.target.value==='' ? null : parseInt(e.target.value))}
                        className="w-10 text-center bg-gray-800 border border-gray-700 text-white rounded py-1 text-base font-bold focus:outline-none"
                        placeholder="-" />
                    </div>
                    <Input value={aT} onChange={v => setE(bm.id, 'awayTeam', v)}
                      placeholder="Equipo 2" className="flex-1 min-w-[90px]" />
                  </div>

                  {/* Ganador / Clasificado */}
                  {(hT || aT) && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Ganador / Clasificado:</p>
                      <div className="flex gap-2 flex-wrap">
                        {[hT, aT].filter(Boolean).map(team => (
                          <button key={team}
                            onClick={() => setE(bm.id, 'winner', wn === team ? null : team)}
                            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                              wn === team
                                ? 'bg-green-700 border-green-600 text-white font-semibold'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {team} {wn === team && '✓'}
                          </button>
                        ))}
                        {wn && (
                          <button onClick={() => setE(bm.id, 'winner', null)}
                            className="text-sm text-gray-600 hover:text-gray-400 px-2">
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {dirty && (
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEdits(prev => { const c={...prev}; delete c[bm.id]; return c })}
                        className="text-sm text-gray-500 hover:text-gray-300 px-3 py-1">
                        Cancelar
                      </button>
                      <button onClick={() => saveMatch(bm)}
                        className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-1 rounded-lg">
                        Guardar
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Goleadores ──────────────────────────────────────────────────────────

function GoleadoresTab() {
  const { topScorers, updateTopScorers } = useApp()
  const [local, setLocal] = useState([...topScorers])
  const [saved, setSaved] = useState(false)

  function handleSave(e) {
    e.preventDefault()
    updateTopScorers(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const changed = JSON.stringify(local) !== JSON.stringify(topScorers)

  return (
    <div className="max-w-md space-y-5">
      <p className="text-gray-400 text-sm">
        Ingresa los 3 máximos goleadores del torneo en orden (1°, 2°, 3°).
        Los participantes que aciertan la posición exacta ganan puntos.
      </p>

      <form onSubmit={handleSave} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        {[0, 1, 2].map(i => (
          <div key={i}>
            <label className="text-xs text-gray-400 block mb-1">{i+1}° Goleador</label>
            <Input
              value={local[i] || ''}
              onChange={val => setLocal(prev => { const c=[...prev]; c[i]=val; return c })}
              placeholder={`Nombre del ${i+1}° goleador`}
              className="w-full"
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={!changed}
          className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-semibold py-2 rounded-lg transition-colors"
        >
          {saved ? '✓ Guardado' : 'Guardar goleadores'}
        </button>
      </form>

      {topScorers.some(s => s) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Goleadores actuales</p>
          {topScorers.map((s, i) => s ? (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-800 last:border-0">
              <span className="text-lg">{['🥇','🥈','🥉'][i]}</span>
              <span className="text-white font-medium">{s}</span>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Configuración ───────────────────────────────────────────────────────

function ConfigTab() {
  const { config, updateConfig, resetTournament } = useApp()
  const [form, setForm] = useState({
    name:           config.name,
    tournamentName: config.tournamentName,
    year:           config.year,
    adminPassword:  config.adminPassword,
  })
  const [pts, setPts] = useState({ ...config.pts })
  const [saved, setSaved] = useState(false)

  function handleSave(e) {
    e.preventDefault()
    updateConfig({ ...form, pts })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    if (window.confirm('¿Reiniciar TODOS los datos? Se perderán participantes, pronósticos y resultados. Esta acción no se puede deshacer.')) {
      resetTournament()
      window.location.href = '/'
    }
  }

  const PT_FIELDS = [
    { key: 'exacto',      label: 'Marcador exacto (puntos)',           color: 'text-yellow-400' },
    { key: 'resultado',   label: 'Equipo ganador / empate correcto',   color: 'text-blue-400' },
    { key: 'clasificado', label: 'Clasificado correcto en bracket',    color: 'text-green-400' },
    { key: 'ordenGrupo',  label: 'Posición exacta en tabla de grupo',  color: 'text-purple-400' },
    { key: 'goleador',    label: 'Goleador en posición correcta',      color: 'text-orange-400' },
  ]

  return (
    <div className="space-y-6 max-w-md">
      <form onSubmit={handleSave} className="space-y-5">
        {/* Torneo */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Torneo</h3>
          {[
            { id: 'name',           label: 'Nombre de la app',    placeholder: 'Polla Mundial' },
            { id: 'tournamentName', label: 'Nombre del torneo',   placeholder: 'Mundial 2026' },
            { id: 'year',           label: 'Año',                 placeholder: '2026' },
            { id: 'adminPassword',  label: 'Contraseña de admin', placeholder: 'admin123' },
          ].map(f => (
            <div key={f.id}>
              <label className="text-xs text-gray-400 mb-1 block">{f.label}</label>
              <Input
                value={form[f.id]}
                onChange={val => setForm(prev => ({ ...prev, [f.id]: val }))}
                placeholder={f.placeholder}
                className="w-full"
              />
            </div>
          ))}
        </div>

        {/* Puntos */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Puntos por categoría</h3>
          <p className="text-gray-500 text-xs">
            Modifica los puntos que se otorgan por cada tipo de acierto.
          </p>
          {PT_FIELDS.map(f => (
            <div key={f.key} className="flex items-center justify-between gap-4">
              <label className={`text-sm flex-1 ${f.color}`}>{f.label}</label>
              <input
                type="number"
                min="0"
                max="99"
                value={pts[f.key]}
                onChange={e => setPts(prev => ({ ...prev, [f.key]: parseInt(e.target.value) || 0 }))}
                className="w-16 text-center bg-gray-800 border border-gray-700 text-white rounded-lg py-1.5 text-lg font-bold focus:outline-none focus:border-green-600"
              />
            </div>
          ))}
        </div>

        <button
          type="submit"
          className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-2.5 rounded-xl transition-colors"
        >
          {saved ? '✓ Guardado' : 'Guardar configuración'}
        </button>
      </form>

      {/* Zona peligrosa */}
      <div className="bg-red-950/30 border border-red-900 rounded-xl p-5">
        <h3 className="text-red-400 font-semibold mb-2">Zona peligrosa</h3>
        <p className="text-gray-400 text-sm mb-4">
          Reinicia todos los datos: participantes, pronósticos, resultados y bracket.
        </p>
        <button
          onClick={handleReset}
          className="bg-red-800 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Reiniciar torneo completo
        </button>
      </div>
    </div>
  )
}

// ─── Admin principal ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'equipos',        label: '⚽ Equipos & Partidos' },
  { id: 'clasificacion',  label: '📊 Clasificación Grupos' },
  { id: 'bracket',        label: '🎯 Bracket' },
  { id: 'goleadores',     label: '⭐ Goleadores' },
  { id: 'config',         label: '⚙️ Configuración' },
]

export default function Admin() {
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState('equipos')

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Panel de Administración</h1>
          <p className="text-gray-400 text-sm">Gestiona equipos, resultados, bracket y configuración.</p>
        </div>
        <button
          onClick={() => setAuthed(false)}
          className="text-sm text-gray-500 hover:text-gray-300 border border-gray-700 px-3 py-1.5 rounded-lg"
        >
          Cerrar sesión
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 overflow-x-auto pb-0">
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

      {tab === 'equipos'       && <EquiposTab />}
      {tab === 'clasificacion' && <ClasificacionTab />}
      {tab === 'bracket'       && <BracketTab />}
      {tab === 'goleadores'    && <GoleadoresTab />}
      {tab === 'config'        && <ConfigTab />}
    </div>
  )
}
