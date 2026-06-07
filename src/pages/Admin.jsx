import { useState, useRef, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { GROUP_LETTERS, R32_BRACKET_MAP, DEFAULT_LOCKS, BRACKET_PTS } from '../data/initialData'
import { buildRanking, calcGroupScore, calcBracketScore, calcPredictedBracketTeams } from '../utils/scoring'

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function csvEscape(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function parseCSVLine(line) {
  const cells = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1, val = ''
      while (j < line.length) {
        if (line[j] === '"' && line[j + 1] === '"') { val += '"'; j += 2 }
        else if (line[j] === '"') { j++; break }
        else { val += line[j]; j++ }
      }
      cells.push(val)
      i = j
      if (i < line.length && line[i] === ',') i++
    } else {
      const end = line.indexOf(',', i)
      if (end === -1) { cells.push(line.slice(i)); break }
      cells.push(line.slice(i, end))
      i = end + 1
    }
  }
  return cells
}

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const sections = {}
  let currentSection = null, headers = null
  for (const line of lines) {
    if (line.startsWith('SECTION,')) {
      currentSection = line.slice(8)
      headers = null
      sections[currentSection] = []
      continue
    }
    if (!currentSection) continue
    const cells = parseCSVLine(line)
    if (!headers) { headers = cells; continue }
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cells[i] !== undefined ? cells[i] : '' })
    sections[currentSection].push(obj)
  }
  return sections
}

function generateCSV({ pollas, participants, predictions, bracketPredictions, standingsPredictions, scorerPredictions, topScorers, groupStandings, matches, bracketMatches }) {
  const E = csvEscape
  const rows = []

  rows.push('SECTION,exportedAt', new Date().toISOString(), '')

  rows.push('SECTION,pollas', 'id,name,valor_polla')
  pollas.forEach(p => rows.push(`${E(p.id)},${E(p.name)},${p.valor_polla ?? 0}`))
  rows.push('')

  rows.push('SECTION,participants', 'id,name,polla_id,pin')
  participants.forEach(p => rows.push(`${E(p.id)},${E(p.name)},${E(p.polla_id || '')},${E(p.pin || '')}`))
  rows.push('')

  // Resultados reales de partidos de grupos (ingresados por el admin)
  rows.push('SECTION,matches', 'id,group,home_team,away_team,home_score,away_score,status,date,hora,jornada')
  ;(matches || []).forEach(m => rows.push(
    `${E(m.id)},${E(m.group || '')},${E(m.homeTeam || '')},${E(m.awayTeam || '')},${m.homeScore ?? ''},${m.awayScore ?? ''},${E(m.status || '')},${E(m.date || '')},${E(m.hora || '')},${E(m.jornada || '')}`
  ))
  rows.push('')

  // Resultados reales del bracket (ingresados por el admin)
  rows.push('SECTION,bracket_matches', 'id,round,position,label,home_team,away_team,home_score,away_score,winner,status')
  ;(bracketMatches || []).forEach(m => rows.push(
    `${E(m.id)},${E(m.round || '')},${m.position ?? ''},${E(m.label || '')},${E(m.homeTeam || '')},${E(m.awayTeam || '')},${m.homeScore ?? ''},${m.awayScore ?? ''},${E(m.winner || '')},${E(m.status || '')}`
  ))
  rows.push('')

  rows.push('SECTION,predictions', 'participant_id,match_id,home_score,away_score')
  predictions.forEach(p => rows.push(`${E(p.participantId)},${E(p.matchId)},${p.homeScore ?? ''},${p.awayScore ?? ''}`))
  rows.push('')

  rows.push('SECTION,bracket_predictions', 'participant_id,bracket_match_id,predicted_winner,home_score,away_score')
  bracketPredictions.forEach(p => rows.push(`${E(p.participantId)},${E(p.bracketMatchId)},${E(p.predictedWinner || '')},${p.predictedHomeScore ?? ''},${p.predictedAwayScore ?? ''}`))
  rows.push('')

  rows.push('SECTION,standings_predictions', 'participant_id,group,pos1,pos2,pos3,pos4')
  standingsPredictions.forEach(p => {
    const s = p.standings || ['', '', '', '']
    rows.push(`${E(p.participantId)},${E(p.group)},${E(s[0])},${E(s[1])},${E(s[2])},${E(s[3])}`)
  })
  rows.push('')

  rows.push('SECTION,scorer_predictions', 'participant_id,scorer')
  scorerPredictions.forEach(p => rows.push(`${E(p.participantId)},${E((p.scorers || [])[0] || '')}`))
  rows.push('')

  rows.push('SECTION,top_scorers', 'scorer1')
  rows.push(`${E(topScorers[0] || '')}`)
  rows.push('')

  rows.push('SECTION,group_standings', 'group,pos1,pos2,pos3,pos4')
  Object.entries(groupStandings).forEach(([group, s]) => {
    s = s || ['', '', '', '']
    rows.push(`${E(group)},${E(s[0])},${E(s[1])},${E(s[2])},${E(s[3])}`)
  })

  return rows.join('\n')
}

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

// LoginForm removido — el acceso Admin ahora es por Supabase Auth en /Login

// ─── Tab: Equipos & Partidos ──────────────────────────────────────────────────

function EquiposTab() {
  const { matches, updateMatch, updateGroupTeams } = useApp()
  const [activeGroup, setActiveGroup] = useState('A')
  const [teamInputs, setTeamInputs] = useState({})
  const [matchEdits, setMatchEdits] = useState({})
  const [savingAll, setSavingAll] = useState(false)

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
    const homeScore = ed.homeScore !== undefined ? ed.homeScore : match.homeScore
    const awayScore = ed.awayScore !== undefined ? ed.awayScore : match.awayScore
    const rawStatus = ed.status !== undefined ? ed.status : match.status
    const status = homeScore !== null && awayScore !== null && rawStatus === 'pending'
      ? 'finished'
      : rawStatus
    updateMatch(match.id, {
      homeScore,
      awayScore,
      status,
      date: ed.date !== undefined ? ed.date : match.date,
      hora: ed.hora !== undefined ? ed.hora : match.hora,
    })
    setMatchEdits(prev => { const c = { ...prev }; delete c[match.id]; return c })
  }

  async function saveAllEdits() {
    setSavingAll(true)
    const dirtyMatches = matches.filter(m => matchEdits[m.id] && Object.keys(matchEdits[m.id]).length > 0)
    await Promise.all(dirtyMatches.map(m => {
      const ed = matchEdits[m.id] || {}
      const homeScore = ed.homeScore !== undefined ? ed.homeScore : m.homeScore
      const awayScore = ed.awayScore !== undefined ? ed.awayScore : m.awayScore
      const rawStatus = ed.status !== undefined ? ed.status : m.status
      const status = homeScore !== null && awayScore !== null && rawStatus === 'pending'
        ? 'finished'
        : rawStatus
      return updateMatch(m.id, { homeScore, awayScore, status, date: ed.date !== undefined ? ed.date : m.date, hora: ed.hora !== undefined ? ed.hora : m.hora })
    }))
    setMatchEdits({})
    setSavingAll(false)
  }

  const totalDirty = Object.keys(matchEdits).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-gray-400 text-sm">
          Configura los equipos de cada grupo y registra los resultados de los partidos.
        </p>
        {totalDirty > 0 && (
          <button
            onClick={saveAllEdits}
            disabled={savingAll}
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {savingAll ? 'Guardando...' : `Guardar todos (${totalDirty} cambio${totalDirty !== 1 ? 's' : ''})`}
          </button>
        )}
      </div>

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

          const hr = getME(match.id, 'hora', match.hora)
          return (
            <div key={match.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              {/* Jornada */}
              <p className="text-xs text-blue-400 font-semibold">
                {match.jornada || '—'} &nbsp;·&nbsp; {match.homeTeam || '—'} vs {match.awayTeam || '—'}
              </p>

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

              {/* Fecha y Hora */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-10 shrink-0">Fecha:</span>
                  <Input value={dt} onChange={val => setME(match.id, 'date', val)}
                    placeholder="ej. 11/06/2026" className="flex-1" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-10 shrink-0">Hora:</span>
                  <Input value={hr} onChange={val => setME(match.id, 'hora', val)}
                    placeholder="ej. 21:00" className="flex-1" />
                </div>
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

// Etiquetas legibles para los slots del bracket
const SLOT_LABEL = Object.fromEntries([
  ...GROUP_LETTERS.flatMap(g => [
    [`1${g}`, `1° Grupo ${g}`],
    [`2${g}`, `2° Grupo ${g}`],
  ]),
  ...Array.from({ length: 8 }, (_, i) => [`t${i + 1}`, `${i + 1}° mejor 3°`]),
])

const R32_SLOT_BY_POS = Object.fromEntries(
  R32_BRACKET_MAP.map(({ pos, home, away }) => [`r32_${pos}`, { home, away }])
)

// Configuración de auto-propagación por ronda
const PROPAGATE_CONFIG = {
  r16:   { label: '⚡ Poblar Octavos desde 16avos',          toRound: 'r16',   fromLabel: '16avos' },
  qf:    { label: '⚡ Poblar Cuartos desde Octavos',          toRound: 'qf',    fromLabel: 'Octavos' },
  sf:    { label: '⚡ Poblar Semis desde Cuartos',            toRound: 'sf',    fromLabel: 'Cuartos' },
  third: { label: '⚡ Poblar Final y 3° Lugar desde Semis',   toRound: 'final', fromLabel: 'Semis' },
}

function BracketTab() {
  const { bracketMatches, updateBracketMatch, generateBracket, propagateBracketRound } = useApp()
  const [edits, setEdits] = useState({})
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState(null)
  const [propagating, setPropagating] = useState(null)

  async function handleGenerateBracket() {
    if (!window.confirm('¿Generar las llaves del R32 automáticamente desde los resultados de grupos? Esto sobreescribirá los equipos actuales del R32.')) return
    setGenerating(true)
    const qualifiers = await generateBracket()
    setGenResult(qualifiers)
    setGenerating(false)
  }

  async function handlePropagate(toRound, fromLabel) {
    if (!window.confirm(`¿Poblar los equipos de esta ronda automáticamente desde los ganadores de ${fromLabel}? Sobreescribirá los equipos actuales.`)) return
    setPropagating(toRound)
    await propagateBracketRound(toRound)
    setPropagating(null)
  }

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
      <div className="flex items-start justify-between flex-wrap gap-4">
        <p className="text-gray-400 text-sm max-w-lg">
          Carga los equipos clasificados de cada fase y registra los resultados.
          El campo "Ganador / Clasificado" es lo que se usa para calcular los puntos del bracket.
        </p>
        <button
          onClick={handleGenerateBracket}
          disabled={generating}
          className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          {generating ? 'Generando...' : '⚡ Generar R32 desde Grupos'}
        </button>
      </div>

      {genResult && (
        <div className="bg-green-950/40 border border-green-800 rounded-xl p-4 text-sm text-green-300">
          ✓ Llaves del R32 generadas. Se encontraron {Object.keys(genResult).length} clasificados.
          Revisa el bracket a continuación.
        </div>
      )}

      {ROUND_ORDER.map(round => (
        <div key={round}>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h3 className="text-white font-semibold flex items-center gap-2">
              {round === 'final' && '🏆 '}
              {round === 'third' && '🥉 '}
              {ROUND_LABEL[round]}
              <span className="text-xs text-gray-600 font-normal">
                ({byRound[round]?.length} partido{byRound[round]?.length !== 1 ? 's' : ''})
              </span>
            </h3>
            {PROPAGATE_CONFIG[round] && (
              <button
                onClick={() => handlePropagate(PROPAGATE_CONFIG[round].toRound, PROPAGATE_CONFIG[round].fromLabel)}
                disabled={propagating === PROPAGATE_CONFIG[round].toRound}
                className="text-xs bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 rounded-lg transition-colors whitespace-nowrap"
              >
                {propagating === PROPAGATE_CONFIG[round].toRound ? 'Actualizando...' : PROPAGATE_CONFIG[round].label}
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {byRound[round]?.map(bm => {
              const hT = getE(bm.id, 'homeTeam', bm.homeTeam)
              const aT = getE(bm.id, 'awayTeam', bm.awayTeam)
              const hS = getE(bm.id, 'homeScore', bm.homeScore)
              const aS = getE(bm.id, 'awayScore', bm.awayScore)
              const wn = getE(bm.id, 'winner',    bm.winner)
              const st = getE(bm.id, 'status',    bm.status)
              const dirty = !!edits[bm.id] && Object.keys(edits[bm.id]).length > 0

              const slots = R32_SLOT_BY_POS[bm.id]
              return (
                <div key={bm.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-gray-500 font-medium">{bm.label}</p>
                    {slots && (
                      <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full">
                        {SLOT_LABEL[slots.home]} vs {SLOT_LABEL[slots.away]}
                      </span>
                    )}
                  </div>

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
  const [local, setLocal] = useState(topScorers[0] || '')
  const [saved, setSaved] = useState(false)

  function handleSave(e) {
    e.preventDefault()
    updateTopScorers([local.trim()])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const changed = local.trim() !== (topScorers[0] || '')

  return (
    <div className="max-w-md space-y-5">
      <p className="text-gray-400 text-sm">
        Ingresa el máximo goleador del torneo. Los participantes que lo acertaron ganan puntos.
      </p>

      <form onSubmit={handleSave} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Goleador del torneo</label>
          <Input
            value={local}
            onChange={setLocal}
            placeholder="Nombre del goleador"
            className="w-full"
          />
        </div>
        <button
          type="submit"
          disabled={!changed || !local.trim()}
          className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-semibold py-2 rounded-lg transition-colors"
        >
          {saved ? '✓ Guardado' : 'Guardar goleador'}
        </button>
      </form>

      {topScorers[0] && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Goleador actual</p>
          <div className="flex items-center gap-3 py-1.5">
            <span className="text-lg">🥇</span>
            <span className="text-white font-medium">{topScorers[0]}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Bloqueos ────────────────────────────────────────────────────────────

const PHASE_INFO = [
  { id: 'groups', label: 'Fase de Grupos',        desc: '72 partidos de grupos · Pronósticos de marcadores y tabla' },
  { id: 'r32',    label: 'Dieciseisavos de Final', desc: 'Bracket · 16 llaves' },
  { id: 'r16',    label: 'Octavos de Final',        desc: 'Bracket · 8 llaves' },
  { id: 'qf',     label: 'Cuartos de Final',        desc: 'Bracket · 4 llaves' },
  { id: 'sf',     label: 'Semifinal',               desc: 'Bracket · 2 llaves' },
  { id: 'third',  label: 'Tercer Lugar',            desc: 'Bracket · 1 llave' },
  { id: 'final',  label: 'Final',                  desc: 'Bracket · 1 llave' },
]

function BloqueosTab() {
  const {
    config, updateLocks,
    allParticipants, predictions, bracketPredictions,
    standingsPredictions, scorerPredictions, topScorers,
    matches, bracketMatches, groupStandings, pollas,
    importCSVBackup, syncAllStandingsPredictions,
  } = useApp()
  const locks = config.locks || DEFAULT_LOCKS
  const [saving, setSaving]           = useState(null)
  const [backupDone, setBackupDone]   = useState(false)
  const [importing, setImporting]     = useState(false)
  const [importResult, setImportResult] = useState('')
  const [syncing, setSyncing]         = useState(false)
  const [syncResult, setSyncResult]   = useState('')
  const fileInputRef = useRef(null)

  async function toggleLock(phaseId) {
    setSaving(phaseId)
    await updateLocks({ ...locks, [phaseId]: !locks[phaseId] })
    setSaving(null)
  }

  async function lockAll() {
    setSaving('all')
    await updateLocks(Object.fromEntries(PHASE_INFO.map(p => [p.id, true])))
    setSaving(null)
  }

  async function unlockAll() {
    setSaving('all')
    await updateLocks(Object.fromEntries(PHASE_INFO.map(p => [p.id, false])))
    setSaving(null)
  }

  function downloadBackupCSV() {
    const csv = generateCSV({
      pollas,
      participants: allParticipants,
      predictions,
      bracketPredictions,
      standingsPredictions,
      scorerPredictions,
      topScorers,
      groupStandings,
      matches,
      bracketMatches,
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backup-polla-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setBackupDone(true)
    setTimeout(() => setBackupDone(false), 3000)
  }

  async function handleSyncStandings() {
    if (!window.confirm(`¿Sincronizar posiciones de grupo para los ${allParticipants.length} participantes?\nSe calcularán automáticamente desde sus pronósticos de partidos existentes.`)) return
    setSyncing(true)
    setSyncResult('')
    const count = await syncAllStandingsPredictions()
    setSyncResult(`✓ ${count} grupos sincronizados (${allParticipants.length} participantes)`)
    setSyncing(false)
    setTimeout(() => setSyncResult(''), 6000)
  }

  async function handleImportCSV(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!window.confirm('¿Importar datos desde CSV? Esto actualizará participantes y pronósticos existentes.')) {
      e.target.value = ''
      return
    }
    setImporting(true)
    setImportResult('')
    try {
      const text = await file.text()
      const sections = parseCSV(text)
      await importCSVBackup(sections)
      setImportResult('✓ Datos importados correctamente')
    } catch (err) {
      setImportResult('Error al importar: ' + (err.message || 'archivo inválido'))
    }
    setImporting(false)
    e.target.value = ''
    setTimeout(() => setImportResult(''), 6000)
  }

  const lockedCount   = PHASE_INFO.filter(p => locks[p.id]).length
  const unlockedCount = PHASE_INFO.length - lockedCount

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{lockedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Fase(s) bloqueada(s)</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-400">{unlockedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Fase(s) abierta(s)</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-400">{allParticipants.length}</p>
          <p className="text-xs text-gray-500 mt-1">Participante(s) totales</p>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={lockAll}
          disabled={saving === 'all'}
          className="flex items-center gap-2 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          🔒 Bloquear todas las fases
        </button>
        <button
          onClick={unlockAll}
          disabled={saving === 'all'}
          className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          🔓 Abrir todas las fases
        </button>
        <button
          onClick={downloadBackupCSV}
          className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
            backupDone
              ? 'bg-blue-800 text-blue-200'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}
        >
          {backupDone ? '✓ CSV descargado' : '📥 Exportar backup CSV'}
        </button>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCSV}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 bg-purple-800 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {importing ? 'Importando...' : '📤 Cargar backup CSV'}
          </button>
        </div>
        <button
          onClick={handleSyncStandings}
          disabled={syncing}
          className="flex items-center gap-2 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {syncing ? 'Sincronizando...' : '🔄 Sincronizar posiciones de grupo'}
        </button>
      </div>

      {syncResult && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-xl px-4 py-3 text-sm font-medium">
          {syncResult}
        </div>
      )}

      {importResult && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          importResult.startsWith('✓') ? 'bg-green-900/40 border border-green-700 text-green-300' : 'bg-red-900/40 border border-red-700 text-red-300'
        }`}>
          {importResult}
        </div>
      )}

      {/* Control por fase */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="bg-gray-800 px-4 py-3">
          <p className="text-white font-semibold text-sm">Control de fases</p>
          <p className="text-gray-400 text-xs mt-0.5">
            Cuando una fase está <span className="text-red-400 font-medium">Bloqueada</span>, los participantes no pueden ingresar ni modificar pronósticos.
            Cuando está <span className="text-green-400 font-medium">Abierta</span>, pueden hacerlo libremente.
          </p>
        </div>
        <div className="divide-y divide-gray-800">
          {PHASE_INFO.map(phase => {
            const isLocked = locks[phase.id] ?? false
            const isSaving = saving === phase.id
            return (
              <div key={phase.id} className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{phase.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      isLocked
                        ? 'bg-red-900/50 text-red-400'
                        : 'bg-green-900/50 text-green-400'
                    }`}>
                      {isLocked ? '🔒 Bloqueado' : '🔓 Abierto'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{phase.desc}</p>
                </div>
                <button
                  onClick={() => toggleLock(phase.id)}
                  disabled={isSaving}
                  className={`shrink-0 text-xs font-semibold px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                    isLocked
                      ? 'bg-green-900/30 border-green-700 text-green-400 hover:bg-green-800'
                      : 'bg-red-900/30 border-red-700 text-red-400 hover:bg-red-800'
                  }`}
                >
                  {isSaving ? '...' : isLocked ? 'Abrir' : 'Bloquear'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Info del backup */}
      <div className="bg-blue-950/30 border border-blue-900 rounded-xl p-4 text-sm text-blue-300">
        <p className="font-semibold mb-1">📥 Sobre el backup CSV</p>
        <p className="text-xs text-blue-400">
          El backup exporta en formato CSV todas las pollas, participantes y pronósticos (grupos, bracket, tabla, goleadores).
          El CSV puede abrirse en Excel para consulta. Para restaurar, usa <strong>Cargar backup CSV</strong> — importa los datos de vuelta a la base de datos.
          Se recomienda exportar <strong>antes de bloquear</strong> cada fase.
        </p>
      </div>
    </div>
  )
}

// ─── Tab: Participantes (solo admin) ─────────────────────────────────────────

const APP_URL = 'https://polla-mundial-bice.vercel.app'

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function ParticipantRow({ p, index, pollas, onRemove, onWhatsApp: getWAUrl, onAssign, onUpdatePin }) {
  const pollaName = pollas.find(x => x.id === p.polla_id)?.name
  const isOrphan  = !p.polla_id || !pollaName
  const [assignId, setAssignId]   = useState('')
  const [editingPin, setEditingPin] = useState(false)
  const [pinInput, setPinInput]     = useState(p.pin || '')
  const [savingPin, setSavingPin]   = useState(false)

  async function handleSavePin() {
    if (pinInput.length !== 4) return
    setSavingPin(true)
    await onUpdatePin(p.id, pinInput)
    setSavingPin(false)
    setEditingPin(false)
  }

  return (
    <div className={`flex items-center gap-2 px-4 py-3 flex-wrap text-sm ${isOrphan ? 'bg-red-950/20' : ''}`}>
      <span className="text-gray-600 w-5 shrink-0 text-center">{index + 1}</span>
      <span className="text-white font-medium flex-1 min-w-[80px]">{p.name}</span>

      {/* Polla badge */}
      {pollaName ? (
        <span className="text-xs bg-green-900/30 border border-green-800 text-green-400 px-2 py-0.5 rounded-full shrink-0">
          {pollaName}
        </span>
      ) : (
        <span className="text-xs bg-red-900/30 border border-red-800 text-red-400 px-2 py-0.5 rounded-full shrink-0">
          ⚠ Sin polla
        </span>
      )}

      {/* PIN editable */}
      {editingPin ? (
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="text"
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            maxLength={4}
            inputMode="numeric"
            autoFocus
            className="w-14 text-center bg-gray-800 border border-yellow-600 text-yellow-400 rounded px-1 py-0.5 text-xs font-mono tracking-widest focus:outline-none"
          />
          <button
            onClick={handleSavePin}
            disabled={pinInput.length !== 4 || savingPin}
            className="text-xs bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white px-2 py-0.5 rounded"
          >
            {savingPin ? '…' : 'OK'}
          </button>
          <button
            onClick={() => { setEditingPin(false); setPinInput(p.pin || '') }}
            className="text-xs text-gray-500 hover:text-gray-300 px-1"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditingPin(true)}
          title="Editar PIN"
          className="font-mono bg-gray-800 border border-gray-700 text-yellow-400 hover:border-yellow-600 px-2 py-0.5 rounded text-xs tracking-widest shrink-0 transition-colors"
        >
          {p.pin || 'Sin PIN'}
        </button>
      )}

      {/* Asignar polla (orphan) */}
      {isOrphan && (
        <div className="flex gap-1 items-center shrink-0">
          <select
            value={assignId}
            onChange={e => setAssignId(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded px-2 py-0.5 text-xs"
          >
            <option value="">Asignar polla...</option>
            {pollas.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
          </select>
          <button
            onClick={() => { if (assignId) onAssign(p.id, assignId) }}
            disabled={!assignId}
            className="text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white px-2 py-0.5 rounded transition-colors"
          >
            OK
          </button>
        </div>
      )}

      {/* WhatsApp — usa <a> nativo para evitar bloqueo de popups */}
      <a
        href={getWAUrl(p)}
        target="_blank"
        rel="noopener noreferrer"
        title="Enviar acceso por WhatsApp"
        className="text-base hover:scale-110 transition-transform shrink-0 select-none"
      >
        💬
      </a>

      {/* Eliminar */}
      <button
        onClick={() => onRemove(p)}
        title="Eliminar participante"
        className="text-xs text-red-600 hover:text-red-400 border border-red-900/40 hover:border-red-700 px-2.5 py-1 rounded-lg transition-colors shrink-0"
      >
        🗑 Eliminar
      </button>
    </div>
  )
}

function ParticipantesTab() {
  const {
    allParticipants, pollas, currentPollaId,
    addParticipant, removeParticipant, assignParticipantPolla, updateParticipantPin,
  } = useApp()

  const defaultPolla = currentPollaId || pollas[0]?.id || ''
  const [nombre, setNombre]           = useState('')
  const [pollaId, setPollaId]         = useState(defaultPolla)
  const [pin, setPin]                 = useState(generatePin)
  const [filterPolla, setFilterPolla] = useState('')   // '' = mostrar todos
  const [adding, setAdding]           = useState(false)
  const [addError, setAddError]       = useState('')
  const [addSuccess, setAddSuccess]   = useState('')

  // Derived
  const knownPollaIds = new Set(pollas.map(p => p.id))
  const orphans = allParticipants.filter(p => !p.polla_id || !knownPollaIds.has(p.polla_id))

  const displayList = filterPolla === '__orphan__'
    ? orphans
    : filterPolla
      ? allParticipants.filter(p => p.polla_id === filterPolla)
      : allParticipants   // sin filtro → todos

  async function handleAdd(e) {
    e.preventDefault()
    if (!nombre.trim() || !pollaId || pin.length !== 4) return
    setAdding(true)
    setAddError('')
    const result = await addParticipant(nombre.trim(), pollaId, pin)
    if (!result || result.error) {
      if (result?.error === 'duplicate') {
        setAddError(`"${nombre.trim()}" ya existe en esa polla (nombre duplicado).`)
      } else if (result?.error) {
        setAddError(`Error al guardar en la base de datos: ${result.error}`)
      } else {
        setAddError(`No se pudo guardar "${nombre.trim()}". Intenta de nuevo.`)
      }
    } else {
      const pollaName = pollas.find(p => p.id === pollaId)?.name || ''
      setAddSuccess(`${result.name} agregado a "${pollaName}" · PIN: ${pin}`)
      setNombre('')
      setPin(generatePin())
      setTimeout(() => setAddSuccess(''), 5000)
    }
    setAdding(false)
  }

  function handleRemove(p) {
    if (!window.confirm(`¿Eliminar a "${p.name}" y todos sus pronósticos?\nEsta acción no se puede deshacer.`)) return
    removeParticipant(p.id)
  }

  function getWhatsAppUrl(p) {
    const pollaName = pollas.find(x => x.id === p.polla_id)?.name || 'la polla'
    const msg = `¡Hola ${p.name}! Ya estás activo en la ${pollaName} 🏆. Puedes ingresar a meter tus marcadores aquí: ${APP_URL}. Tu PIN de acceso exclusivo es: ${p.pin || '----'} 🔑. ¡Muchos éxitos!`
    return `https://wa.me/?text=${encodeURIComponent(msg)}`
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {pollas.length === 0 && (
        <div className="bg-yellow-950/30 border border-yellow-800 rounded-xl p-4 text-yellow-300 text-sm">
          Primero crea al menos una polla desde el panel superior de Administración.
        </div>
      )}

      {/* Formulario de alta */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h3 className="text-white font-semibold">Agregar participante</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nombre</label>
              <Input value={nombre} onChange={setNombre} placeholder="Nombre del participante" className="w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Polla destino</label>
              <select
                value={pollaId}
                onChange={e => setPollaId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-600"
              >
                <option value="">— Selecciona polla —</option>
                {pollas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">PIN de acceso (4 dígitos — auto-generado)</label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                inputMode="numeric"
                className="w-24 text-center bg-gray-800 border border-gray-700 text-yellow-400 rounded-lg px-3 py-1.5 text-lg font-bold font-mono tracking-widest focus:outline-none focus:border-green-600"
              />
              <button type="button" onClick={() => setPin(generatePin())}
                className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors">
                🔀 Nuevo PIN
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={adding || !nombre.trim() || !pollaId || pin.length !== 4}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {adding ? 'Agregando...' : '+ Agregar participante'}
          </button>
          {addError   && <p className="text-red-400 text-sm">{addError}</p>}
          {addSuccess && <p className="text-green-400 text-sm">✓ {addSuccess}</p>}
        </form>
      </div>

      {/* Lista de todos los participantes */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Header con filtro */}
        <div className="bg-gray-800 px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-white font-semibold text-sm shrink-0">
            Participantes ({allParticipants.length} total)
          </span>
          <select
            value={filterPolla}
            onChange={e => setFilterPolla(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none flex-1 min-w-[160px]"
          >
            <option value="">🌐 Todos ({allParticipants.length})</option>
            {pollas.map(p => {
              const cnt = allParticipants.filter(x => x.polla_id === p.id).length
              return <option key={p.id} value={p.id}>{p.name} ({cnt})</option>
            })}
            {orphans.length > 0 && (
              <option value="__orphan__">⚠ Sin polla asignada ({orphans.length})</option>
            )}
          </select>
          <span className="text-gray-500 text-xs shrink-0">
            {displayList.length} mostrado{displayList.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Alerta de orphans */}
        {orphans.length > 0 && filterPolla !== '__orphan__' && (
          <div className="bg-red-950/30 border-b border-red-900 px-4 py-2 flex items-center gap-2">
            <span className="text-red-400 text-xs">
              ⚠ {orphans.length} participante{orphans.length > 1 ? 's' : ''} sin polla asignada.
            </span>
            <button onClick={() => setFilterPolla('__orphan__')}
              className="text-xs text-red-300 underline hover:text-red-200">
              Ver y corregir
            </button>
          </div>
        )}

        {displayList.length === 0 ? (
          <p className="text-gray-600 text-sm p-6 text-center">
            {filterPolla ? 'No hay participantes en esta sección.' : 'No hay participantes registrados aún.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {displayList.map((p, i) => (
              <ParticipantRow
                key={p.id}
                p={p}
                index={i}
                pollas={pollas}
                onRemove={handleRemove}
                onWhatsApp={getWhatsAppUrl}
                onAssign={assignParticipantPolla}
                onUpdatePin={updateParticipantPin}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Componente: fila de polla ────────────────────────────────────────────────

function PollaRow({ polla, isActive, participantCount, onUpdate, onDelete, onSelect }) {
  const [editing, setEditing] = useState(false)
  const [name, setName]       = useState(polla.name)
  const [valor, setValor]     = useState(polla.valor_polla ?? 0)
  const [delErr, setDelErr]   = useState('')

  async function handleSave() {
    if (!name.trim()) return
    await onUpdate(polla.id, name.trim(), valor)
    setEditing(false)
  }

  async function handleDelete() {
    if (!window.confirm(`¿Eliminar la polla "${polla.name}"? Solo se puede si no tiene participantes.`)) return
    const err = await onDelete(polla.id)
    if (err) { setDelErr(err); setTimeout(() => setDelErr(''), 4000) }
  }

  const fmt = v => Number(v || 0).toLocaleString('es-CO')

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isActive ? 'bg-green-900/20 border-green-700' : 'bg-gray-800 border-gray-700'}`}>
      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 w-14 shrink-0">Nombre:</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              className="flex-1 bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-green-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 w-14 shrink-0">Valor ($):</label>
            <input
              type="number"
              min="0"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="Ej: 50000"
              className="flex-1 bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-green-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setEditing(false); setName(polla.name); setValor(polla.valor_polla ?? 0) }}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1">Cancelar</button>
            <button onClick={handleSave}
              className="text-xs bg-green-700 hover:bg-green-600 text-white font-semibold px-3 py-1 rounded">Guardar</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-white font-medium text-sm">{polla.name}</span>
            {isActive && (
              <span className="ml-2 text-xs bg-green-700 text-green-200 px-1.5 py-0.5 rounded-full">Activa</span>
            )}
            <span className="ml-2 text-xs text-gray-500">
              {participantCount} participante{participantCount !== 1 ? 's' : ''}
            </span>
            {polla.valor_polla > 0 && (
              <span className="ml-2 text-xs text-yellow-400 font-medium">
                · ${fmt(polla.valor_polla)} c/u
              </span>
            )}
          </div>
          {!isActive && (
            <button onClick={() => onSelect(polla.id)}
              className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 px-2 py-1 rounded transition-colors">
              Activar
            </button>
          )}
          <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-white px-2 py-1">Editar</button>
          <button onClick={handleDelete} className="text-xs text-red-600 hover:text-red-400 px-2 py-1">✕</button>
        </div>
      )}
      {delErr && <p className="text-red-400 text-xs">{delErr}</p>}
    </div>
  )
}

// ─── Tab: Configuración ───────────────────────────────────────────────────────

function ConfigTab() {
  const { config, updateConfig, resetTournament, pollas, currentPollaId, setCurrentPolla, addPolla, updatePolla, deletePolla, allParticipants } = useApp()
  const [form, setForm] = useState({
    name:           config.name,
    tournamentName: config.tournamentName,
    year:           config.year,
  })
  const [pts, setPts]       = useState({ ...config.pts })
  const [saved, setSaved]   = useState(false)
  const [newPollaName, setNewPollaName] = useState('')
  const [addingPolla, setAddingPolla]   = useState(false)

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
    { key: 'exacto',      label: 'Marcador exacto',                                  color: 'text-yellow-400' },
    { key: 'resultado',   label: 'Ganador o empate correcto',                        color: 'text-blue-400' },
    { key: 'clasificado', label: 'Clasificado a 2da ronda (top-2, sin importar posición)', color: 'text-green-400' },
    { key: 'ordenGrupo',  label: 'Posición exacta en tabla de grupo',                color: 'text-purple-400' },
    { key: 'goleador',    label: 'Goleador en posición exacta',                      color: 'text-orange-400' },
  ]

  async function handleAddPolla(e) {
    e.preventDefault()
    if (!newPollaName.trim()) return
    setAddingPolla(true)
    const { data, error } = await addPolla(newPollaName.trim())
    if (data) {
      setCurrentPolla(data.id)
      setNewPollaName('')
    }
    if (error) console.error('addPolla error:', error)
    setAddingPolla(false)
  }

  return (
    <div className="space-y-6 max-w-md">

      {/* Pollas */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h3 className="text-white font-semibold">Pollas</h3>
        <p className="text-gray-500 text-xs">
          Crea grupos de participantes independientes. Cada polla tiene su propio ranking.
          El selector de polla aparece en la barra de navegación.
        </p>

        {pollas.length === 0 ? (
          <p className="text-gray-600 text-sm py-2">
            No hay pollas creadas aún. Ejecuta la migración SQL v2 en Supabase y luego crea tu primera polla.
          </p>
        ) : (
          <div className="space-y-2">
            {pollas.map(polla => (
              <PollaRow
                key={polla.id}
                polla={polla}
                isActive={polla.id === currentPollaId}
                participantCount={allParticipants.filter(p => p.polla_id === polla.id).length}
                onUpdate={updatePolla}
                onDelete={deletePolla}
                onSelect={setCurrentPolla}
              />
            ))}
          </div>
        )}

        <form onSubmit={handleAddPolla} className="flex gap-2 pt-1">
          <input
            value={newPollaName}
            onChange={e => setNewPollaName(e.target.value)}
            placeholder="Nombre de la nueva polla..."
            maxLength={50}
            className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-600 placeholder-gray-600"
          />
          <button
            type="submit"
            disabled={addingPolla || !newPollaName.trim()}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            + Nueva polla
          </button>
        </form>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Torneo */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Torneo</h3>
          {[
            { id: 'name',           label: 'Nombre de la app',    placeholder: 'Polla Mundial' },
            { id: 'tournamentName', label: 'Nombre del torneo',   placeholder: 'Mundial 2026' },
            { id: 'year',           label: 'Año',                 placeholder: '2026' },
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

      {/* Puntos fijos por fase eliminatoria */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h3 className="text-white font-semibold">Puntos fase eliminatoria (fijos)</h3>
        <p className="text-gray-500 text-xs">Estos valores están fijos según el reglamento del torneo.</p>
        {[
          { label: '16avos de Final — llave acertada', pts: 3 },
          { label: 'Octavos de Final — llave acertada', pts: 4 },
          { label: 'Cuartos de Final — llave acertada', pts: 8 },
          { label: 'Semifinal — finalista acertado', pts: 8 },
          { label: 'Tercer lugar — llave acertada', pts: 8 },
          { label: 'Final — acertada completamente', pts: 12 },
        ].map(f => (
          <div key={f.label} className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-400 flex-1">{f.label}</span>
            <span className="w-16 text-center text-lg font-bold text-green-400">{f.pts}</span>
          </div>
        ))}
      </div>

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

// ─── Ver Pronósticos (admin read-only) ───────────────────────────────────────

const ROUND_LABEL_ADMIN = {
  r32: '16avos de Final', r16: 'Octavos de Final', qf: 'Cuartos de Final',
  sf: 'Semifinal', third: 'Tercer Lugar', final: 'Final',
}
const ROUND_ORDER_ADMIN = ['r32', 'r16', 'qf', 'sf', 'third', 'final']

function VerPronosticosTab() {
  const {
    allParticipants, pollas, currentPollaId,
    matches, predictions,
    bracketMatches, bracketPredictions,
    topScorers, scorerPredictions,
    config,
  } = useApp()

  const [selectedPollaId, setSelectedPollaId]     = useState(currentPollaId || pollas[0]?.id || '')
  const [selectedParticipantId, setSelectedParticipantId] = useState('')
  const [viewTab, setViewTab]   = useState('partidos')
  const [activeGroup, setActiveGroup] = useState('A')

  const pollaParticipants = selectedPollaId
    ? allParticipants.filter(p => p.polla_id === selectedPollaId)
    : allParticipants

  const participant = allParticipants.find(p => p.id === selectedParticipantId) || null

  const groups = [...new Set(matches.filter(m => m.phase === 'groups').map(m => m.group))].sort()

  const groupMatches = matches
    .filter(m => m.group === activeGroup)
    .sort((a, b) => {
      const ja = parseInt((a.jornada || '0').replace(/\D/g, '')) || 0
      const jb = parseInt((b.jornada || '0').replace(/\D/g, '')) || 0
      return ja - jb
    })

  function getPred(matchId) {
    if (!participant) return null
    return predictions.find(p => p.participantId === participant.id && p.matchId === matchId) || null
  }

  const ptExacto    = config?.pts?.exacto    ?? 3
  const ptResultado = config?.pts?.resultado ?? 1
  const ptGoleador  = config?.pts?.goleador  ?? 10

  const predCount        = participant ? predictions.filter(p => p.participantId === participant.id).length : 0
  const bracketPredCount = participant ? bracketPredictions.filter(p => p.participantId === participant.id).length : 0
  const scorerPred       = participant ? (scorerPredictions.find(p => p.participantId === participant.id) || null) : null

  const predictedTeamMap = useMemo(() => {
    if (!participant) return null
    return calcPredictedBracketTeams(matches, predictions, bracketPredictions, participant.id, bracketMatches)
  }, [matches, predictions, bracketPredictions, participant, bracketMatches])

  const byRound = ROUND_ORDER_ADMIN.reduce((acc, r) => {
    acc[r] = bracketMatches.filter(m => m.round === r)
    return acc
  }, {})

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Selectores */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-wrap gap-4 items-end">
        {pollas.length > 1 && (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Polla</label>
            <select
              value={selectedPollaId}
              onChange={e => { setSelectedPollaId(e.target.value); setSelectedParticipantId('') }}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
            >
              {pollas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-gray-400 mb-1 block">Participante</label>
          <select
            value={selectedParticipantId}
            onChange={e => setSelectedParticipantId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
          >
            <option value="">— Selecciona un participante —</option>
            {pollaParticipants
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(p => <option key={p.id} value={p.id}>{p.name}</option>)
            }
          </select>
        </div>
      </div>

      {!participant && (
        <p className="text-gray-600 text-sm text-center py-8">Selecciona un participante para ver sus pronósticos.</p>
      )}

      {participant && (
        <>
          {/* Cabecera del participante */}
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-white font-bold text-lg">{participant.name}</h3>
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">
              Grupos: {predCount}/{matches.filter(m => m.phase === 'groups').length} pronosticados
            </span>
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">
              Llaves: {bracketPredCount} guardados
            </span>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 border-b border-gray-800">
            {[
              { id: 'partidos',  label: '⚽ Partidos de Grupos' },
              { id: 'llaves',    label: '🎯 Llaves' },
              { id: 'goleador',  label: '⭐ Goleador' },
            ].map(t => (
              <button key={t.id} onClick={() => setViewTab(t.id)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  viewTab === t.id
                    ? 'border-green-500 text-green-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Tab Partidos de Grupos ── */}
          {viewTab === 'partidos' && (
            <div className="space-y-4">
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
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800 text-gray-400 text-xs">
                        <th className="text-left px-3 py-2 font-semibold">Jor.</th>
                        <th className="text-right px-3 py-2 font-semibold">Local</th>
                        <th className="text-center px-2 py-2 font-semibold text-blue-400">Pred.</th>
                        <th className="text-center px-2 py-2 font-semibold text-blue-400">Pred.</th>
                        <th className="text-left px-3 py-2 font-semibold">Visitante</th>
                        <th className="text-center px-2 py-2 font-semibold text-yellow-400">Real</th>
                        <th className="text-center px-2 py-2 font-semibold text-green-400">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupMatches.map((match, idx) => {
                        const pred     = getPred(match.id)
                        const hasResult = match.homeScore !== null && match.awayScore !== null
                        const score    = hasResult && pred ? calcGroupScore(pred, match, config) : null
                        return (
                          <tr key={match.id} className={`border-b border-gray-800 last:border-0 ${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/60'}`}>
                            <td className="px-3 py-2">
                              <span className="text-xs font-semibold text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded">
                                {match.jornada || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-medium text-white text-xs whitespace-nowrap">{match.homeTeam || '—'}</span>
                            </td>
                            <td className="px-2 py-2 text-center">
                              {pred ? (
                                <span className="font-bold text-blue-300 text-sm">{pred.homeScore ?? '?'}</span>
                              ) : (
                                <span className="text-gray-700 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {pred ? (
                                <span className="font-bold text-blue-300 text-sm">{pred.awayScore ?? '?'}</span>
                              ) : (
                                <span className="text-gray-700 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <span className="font-medium text-white text-xs whitespace-nowrap">{match.awayTeam || '—'}</span>
                            </td>
                            <td className="px-2 py-2 text-center text-xs text-yellow-400 font-bold">
                              {hasResult ? `${match.homeScore}–${match.awayScore}` : '—'}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {score !== null ? (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                  score === ptExacto    ? 'bg-yellow-700 text-yellow-200' :
                                  score === ptResultado ? 'bg-blue-900 text-blue-300' :
                                  'bg-gray-800 text-gray-500'
                                }`}>+{score}</span>
                              ) : (
                                <span className="text-gray-700 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab Llaves ── */}
          {viewTab === 'llaves' && (
            <div className="space-y-6">
              {ROUND_ORDER_ADMIN.map(round => {
                const roundMatches = byRound[round]
                if (!roundMatches?.length) return null
                return (
                  <div key={round}>
                    <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                      {round === 'final' && '🏆 '}{round === 'third' && '🥉 '}
                      {ROUND_LABEL_ADMIN[round]}
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {roundMatches.map(match => {
                        const teams = predictedTeamMap?.[match.id]
                        const homeTeam = teams?.homeTeam || match.homeTeam || ''
                        const awayTeam = teams?.awayTeam || match.awayTeam || ''
                        const pred = participant
                          ? bracketPredictions.find(p => p.participantId === participant.id && p.bracketMatchId === match.id) || null
                          : null
                        const score = match.winner && pred ? calcBracketScore(pred, match, config) : null
                        if (!homeTeam && !awayTeam) {
                          return (
                            <div key={match.id} className="bg-gray-900/50 border border-dashed border-gray-800 rounded-xl p-3 min-w-[200px]">
                              <p className="text-xs text-gray-600 text-center">{match.label}</p>
                              <p className="text-xs text-gray-700 text-center mt-1">Pendiente</p>
                            </div>
                          )
                        }
                        return (
                          <div key={match.id} className={`bg-gray-900 border rounded-xl p-3 min-w-[200px] ${round === 'final' ? 'border-yellow-700' : 'border-gray-800'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-500">{match.label}</span>
                              {score !== null && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${score > 0 ? 'bg-green-800 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
                                  {score} pts
                                </span>
                              )}
                            </div>
                            {[
                              { team: homeTeam, predScore: pred?.predictedHomeScore, realScore: match.homeScore },
                              { team: awayTeam, predScore: pred?.predictedAwayScore, realScore: match.awayScore },
                            ].map(({ team, predScore, realScore }) => (
                              <div key={team} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border mb-1 ${
                                match.winner === team   ? 'bg-green-800/30 border-green-700' :
                                pred?.predictedWinner === team ? 'bg-blue-900/30 border-blue-700' :
                                'bg-gray-800/50 border-gray-700'
                              }`}>
                                <span className="flex-1 text-xs font-medium text-white truncate">{team}</span>
                                {predScore !== null && predScore !== undefined && (
                                  <span className="text-xs font-bold text-blue-300 shrink-0">{predScore}</span>
                                )}
                                {realScore !== null && realScore !== undefined && (
                                  <span className="text-xs text-yellow-400 shrink-0">({realScore})</span>
                                )}
                                {match.winner === team && <span className="text-xs shrink-0">✅</span>}
                                {pred?.predictedWinner === team && !match.winner && <span className="text-blue-400 text-xs shrink-0">★</span>}
                              </div>
                            ))}
                            {!pred && (
                              <p className="text-xs text-gray-700 text-center mt-1">Sin pronóstico</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Tab Goleador ── */}
          {viewTab === 'goleador' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 max-w-sm space-y-3">
              <h3 className="text-white font-semibold">Pronóstico Goleador</h3>
              <div>
                <p className="text-xs text-gray-500 mb-1">Pronóstico de {participant.name}</p>
                {scorerPred?.scorers?.[0] ? (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    scorerPred.scorers[0] === topScorers?.[0]
                      ? 'bg-green-900/30 border-green-700'
                      : 'bg-gray-800 border-gray-700'
                  }`}>
                    <span className="text-white font-medium flex-1">{scorerPred.scorers[0]}</span>
                    {scorerPred.scorers[0] === topScorers?.[0] && (
                      <span className="text-green-400 text-xs font-bold">+{ptGoleador}pt</span>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm">Sin pronóstico de goleador.</p>
                )}
              </div>
              {topScorers?.[0] && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Goleador oficial</p>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-yellow-900/20 border-yellow-700">
                    <span className="text-lg">🥇</span>
                    <span className="text-white font-medium">{topScorers[0]}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Admin principal ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'participantes',  label: '👥 Participantes' },
  { id: 'ver',            label: '🔍 Ver Pronósticos' },
  { id: 'equipos',        label: '⚽ Equipos & Partidos' },
  { id: 'clasificacion',  label: '📊 Clasificación Grupos' },
  { id: 'bracket',        label: '🎯 Bracket' },
  { id: 'goleadores',     label: '⭐ Goleadores' },
  { id: 'bloqueos',       label: '🔒 Bloqueos' },
  { id: 'config',         label: '⚙️ Configuración' },
]

export default function Admin() {
  const [tab, setTab]                   = useState('participantes')
  const [newPollaName, setNewPollaName] = useState('')
  const [pollaError, setPollaError]     = useState('')
  const [addingPolla, setAddingPolla]   = useState(false)
  const { pollas, currentPollaId, setCurrentPolla, addPolla, allParticipants, isAdmin } = useApp()

  if (!isAdmin) {
    return (
      <div className="text-center py-24 space-y-4">
        <div className="text-6xl">🔒</div>
        <h2 className="text-xl font-bold text-white">Acceso restringido</h2>
        <p className="text-gray-400 text-sm">
          Debes iniciar sesión como administrador desde la pantalla de login.
        </p>
      </div>
    )
  }

  async function handleCreatePolla(e) {
    e.preventDefault()
    if (!newPollaName.trim()) return
    setAddingPolla(true)
    setPollaError('')
    const { data, error } = await addPolla(newPollaName.trim())
    if (error) {
      setPollaError(
        error.includes('relation "pollas" does not exist') || error.includes('does not exist')
          ? 'La tabla "pollas" no existe en Supabase. Ejecuta la migración SQL v2 desde el archivo setup.sql.'
          : 'Error: ' + error
      )
    } else if (data) {
      setCurrentPolla(data.id)
      setNewPollaName('')
    }
    setAddingPolla(false)
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-white">Panel de Administración</h1>
        <p className="text-gray-400 text-sm">Gestiona participantes, equipos, resultados y configuración.</p>
      </div>

      {/* ── Panel de Pollas ─────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-green-400 font-semibold text-sm shrink-0">Pollas:</span>

          {/* Selector de polla activa */}
          {pollas.length > 0 ? (
            <select
              value={currentPollaId || ''}
              onChange={e => setCurrentPolla(e.target.value)}
              className="bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-1.5 text-sm min-w-[160px] focus:outline-none focus:border-green-500"
            >
              {pollas.map(p => {
                const count = allParticipants.filter(x => x.polla_id === p.id).length
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} ({count} participante{count !== 1 ? 's' : ''})
                  </option>
                )
              })}
            </select>
          ) : (
            <span className="text-yellow-400 text-xs bg-yellow-900/20 border border-yellow-800 px-3 py-1.5 rounded-lg">
              Sin pollas — crea la primera a continuación
            </span>
          )}

          {/* Crear nueva polla */}
          <form onSubmit={handleCreatePolla} className="flex gap-2 items-center">
            <input
              value={newPollaName}
              onChange={e => { setNewPollaName(e.target.value); setPollaError('') }}
              placeholder="Nombre de la nueva polla..."
              maxLength={50}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-green-600 placeholder-gray-600"
            />
            <button
              type="submit"
              disabled={addingPolla || !newPollaName.trim()}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap"
            >
              {addingPolla ? 'Creando...' : '+ Nueva polla'}
            </button>
          </form>
        </div>

        {pollaError && (
          <div className="bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-xs text-red-300">
            {pollaError}
          </div>
        )}

        {pollas.length > 0 && (
          <p className="text-gray-600 text-xs">
            Administrando: <span className="text-gray-400 font-medium">{pollas.find(p => p.id === currentPollaId)?.name ?? '—'}</span>
            &nbsp;· Renombrar o eliminar pollas en <button onClick={() => setTab('config')} className="underline text-gray-500 hover:text-gray-300">Configuración</button>
          </p>
        )}
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

      {tab === 'participantes' && <ParticipantesTab />}
      {tab === 'ver'           && <VerPronosticosTab />}
      {tab === 'equipos'       && <EquiposTab />}
      {tab === 'clasificacion' && <ClasificacionTab />}
      {tab === 'bracket'       && <BracketTab />}
      {tab === 'goleadores'    && <GoleadoresTab />}
      {tab === 'bloqueos'      && <BloqueosTab />}
      {tab === 'config'        && <ConfigTab />}
    </div>
  )
}
