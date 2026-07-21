import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { calcBracketScore, calcPredictedBracketTeams } from '../utils/scoring'
import { BRACKET_PAIRING_PTS, BRACKET_ROUNDS, ROUND_LABEL, ROUND_ORDER } from '../data/initialData'

// ── BracketCard ───────────────────────────────────────────────────────────────

function BracketCard({ match, homeTeam, awayTeam, participantId, prediction, config, onSave, adminLocked }) {
  const locked   = match.status !== 'pending' || !!adminLocked
  const hasHome  = !!homeTeam
  const hasAway  = !!awayTeam
  const empty    = !hasHome && !hasAway
  const canScore = !locked && !!participantId && hasHome && hasAway

  // ── estado local de marcadores ──
  const [localHome, setLocalHome] = useState(prediction?.predictedHomeScore ?? null)
  const [localAway, setLocalAway] = useState(prediction?.predictedAwayScore ?? null)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  // Refs — evitan closures obsoletos en callbacks asíncronos
  const homeRef          = useRef(localHome)
  const awayRef          = useRef(localAway)
  const htRef            = useRef(homeTeam)
  const atRef            = useRef(awayTeam)
  const onSaveRef        = useRef(onSave)
  const participantIdRef = useRef(participantId)
  const hasPendingRef    = useRef(false) // true solo si hay cambios sin guardar
  useEffect(() => { homeRef.current          = localHome    }, [localHome])
  useEffect(() => { awayRef.current          = localAway    }, [localAway])
  useEffect(() => { htRef.current            = homeTeam     }, [homeTeam])
  useEffect(() => { atRef.current            = awayTeam     }, [awayTeam])
  useEffect(() => { onSaveRef.current        = onSave       }, [onSave])
  useEffect(() => { participantIdRef.current = participantId }, [participantId])

  const timerRef = useRef(null)

  // Al desmontar: solo vaciar el timer pendiente si había cambios reales
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      if (!hasPendingRef.current) return
      const pid = participantIdRef.current
      const h = homeRef.current
      const a = awayRef.current
      if (pid && h !== null && a !== null) {
        const winner = h !== a ? (h > a ? htRef.current : atRef.current) : null
        onSaveRef.current(match.id, winner, h, a)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── estado derivado ──
  const bothFilled    = localHome !== null && localAway !== null
  const isTied        = bothFilled && localHome === localAway
  const derivedWinner = bothFilled && !isTied
    ? (localHome > localAway ? homeTeam : awayTeam)
    : null

  // Ganador a mostrar: derivado del marcador > guardado en BD
  const displayWinner = derivedWinner || prediction?.predictedWinner || null

  // ── funciones de guardado ──
  const doSave = useCallback(async (winner, home, away) => {
    if (!participantId) return
    setSaving(true)
    setSaved(false)
    try {
      const ok = await onSaveRef.current(match.id, winner, home, away)
      // Solo marcar como "sin pendientes" si el guardado fue exitoso;
      // si falló, hasPendingRef queda true para que el flush al desmontar reintente.
      if (ok !== false) {
        hasPendingRef.current = false
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }, [participantId, match.id])

  // Auto-guardado 700 ms después del último cambio de marcador
  function triggerAutoSave() {
    hasPendingRef.current = true
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const h = homeRef.current
      const a = awayRef.current
      if (h === null || a === null) return
      // Para empates guardamos los scores con winner=null; el ganador se elige con el botón de desempate
      const winner = h !== a ? (h > a ? htRef.current : atRef.current) : null
      doSave(winner, h, a)
    }, 700)
  }

  function handleHome(val) { setLocalHome(val); triggerAutoSave() }
  function handleAway(val) { setLocalAway(val); triggerAutoSave() }

  // Guardado inmediato al perder el foco (clave en móvil)
  function handleBlur() {
    if (!hasPendingRef.current) return
    clearTimeout(timerRef.current)
    const h = homeRef.current
    const a = awayRef.current
    if (h === null || a === null) return
    const winner = h !== a ? (h > a ? htRef.current : atRef.current) : null
    doSave(winner, h, a)
  }

  // Guardado inmediato al elegir ganador en empate
  function handleTieWinner(team) {
    clearTimeout(timerRef.current)
    doSave(team, homeRef.current, awayRef.current)
  }

  // Botón Guardar explícito
  function handleSaveBtn() {
    clearTimeout(timerRef.current)
    const h = homeRef.current
    const a = awayRef.current
    const winner = h !== null && a !== null && h !== a
      ? (h > a ? htRef.current : atRef.current)
      : (isTied ? (prediction?.predictedWinner || null) : null)
    doSave(winner, h, a)
  }

  const realScore = match.winner && prediction
    ? calcBracketScore(prediction, match, config) : null

  // ── helpers de estilo ──
  const rowBg = (team) =>
    match.winner === team   ? 'bg-white border-2 border-green-600' :
    displayWinner === team  ? 'bg-white border-2 border-blue-600'   : 'bg-gray-100 border-gray-300'

  const nameColor = (team) =>
    match.winner === team   ? 'text-green-700' :
    displayWinner === team  ? 'text-blue-700'  : 'text-gray-700'

  if (empty) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 min-w-[220px]">
        <p className="text-xs text-gray-500 text-center font-medium">{match.label}</p>
        <p className="text-xs text-gray-300 text-center mt-1">Pendiente de ronda anterior</p>
      </div>
    )
  }

  return (
    <div className={`bg-white border rounded-xl p-4 min-w-[220px] ${
      match.round === 'final'     ? 'border-yellow-700 shadow-lg shadow-yellow-900/20' :
      match.status === 'finished' ? 'border-gray-300' :
      match.status === 'live'     ? 'border-yellow-700' : 'border-gray-200'
    }`}>

      {/* Encabezado */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 font-medium">{match.label}</p>
        <div className="flex items-center gap-1.5">
          {saving && <span className="text-xs text-gray-500">guardando…</span>}
          {saved && !saving && <span className="text-xs text-green-600">✓</span>}
          {realScore !== null && realScore > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-green-800 text-green-300">
              {realScore} pts
            </span>
          )}
        </div>
      </div>

      {/* Equipo local */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-1 ${rowBg(homeTeam)}`}>
        <span className={`flex-1 text-sm font-medium truncate ${nameColor(homeTeam)}`}>{homeTeam}</span>
        {match.winner === homeTeam  && <span className="shrink-0 text-xs">✅</span>}
        {displayWinner === homeTeam && !match.winner && <span className="text-blue-600 shrink-0 text-xs">★</span>}
        {canScore ? (
          <input
            type="number" min="0" max="99"
            inputMode="numeric"
            value={localHome ?? ''}
            onChange={e => handleHome(e.target.value === '' ? null : Number(e.target.value))}
            onBlur={handleBlur}
            className="w-9 shrink-0 text-center bg-gray-100 border border-gray-300 text-black rounded py-1 text-sm font-bold focus:outline-none focus:border-blue-500"
          />
        ) : (
          localHome !== null && <span className="text-sm font-bold text-gray-600 shrink-0">{localHome}</span>
        )}
      </div>

      {/* Separador */}
      <div className="flex items-center gap-2 my-1.5 text-xs text-gray-500">
        <span className="flex-1 border-t border-gray-200" />
        <span>vs</span>
        {match.homeScore !== null && (
          <span className="text-yellow-600 font-bold ml-1">({match.homeScore}–{match.awayScore} real)</span>
        )}
        <span className="flex-1 border-t border-gray-200" />
      </div>

      {/* Equipo visitante */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${rowBg(awayTeam)}`}>
        {canScore ? (
          <input
            type="number" min="0" max="99"
            inputMode="numeric"
            value={localAway ?? ''}
            onChange={e => handleAway(e.target.value === '' ? null : Number(e.target.value))}
            onBlur={handleBlur}
            className="w-9 shrink-0 text-center bg-gray-100 border border-gray-300 text-black rounded py-1 text-sm font-bold focus:outline-none focus:border-blue-500"
          />
        ) : (
          localAway !== null && <span className="text-sm font-bold text-gray-600 shrink-0">{localAway}</span>
        )}
        <span className={`flex-1 text-sm font-medium truncate ${nameColor(awayTeam)}`}>{awayTeam}</span>
        {match.winner === awayTeam  && <span className="shrink-0 text-xs">✅</span>}
        {displayWinner === awayTeam && !match.winner && <span className="text-blue-600 shrink-0 text-xs">★</span>}
      </div>

      {/* Desempate */}
      {canScore && isTied && (
        <div className="mt-3 pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-1.5 text-center">Empate — ¿Quién avanza? (penales)</p>
          <div className="flex gap-2">
            {[homeTeam, awayTeam].map(team => (
              <button
                key={team}
                onClick={() => handleTieWinner(team)}
                className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${
                  prediction?.predictedWinner === team
                    ? 'bg-blue-700 border-blue-600 text-white'
                    : 'bg-gray-100 border-gray-300 text-gray-600 hover:border-blue-600 hover:text-blue-700'
                }`}
              >
                {team}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Botón guardar */}
      {canScore && (
        <button
          onClick={handleSaveBtn}
          disabled={saving || (!bothFilled && !prediction?.predictedWinner)}
          className={`mt-2 w-full text-xs py-1.5 rounded-lg font-medium transition-colors ${
            saving
              ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
              : saved
              ? 'bg-green-800 text-green-300'
              : 'bg-green-700 hover:bg-green-600 text-white'
          }`}
        >
          {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
        </button>
      )}
    </div>
  )
}

// ── Bracket page ──────────────────────────────────────────────────────────────

export default function Bracket() {
  const {
    bracketMatches, bracketPredictions,
    currentParticipant, saveBracketPrediction, config,
    matches, predictions,
  } = useApp()

  const predictedTeamMap = useMemo(() => {
    if (!currentParticipant) return null
    return calcPredictedBracketTeams(
      matches, predictions, bracketPredictions, currentParticipant.id, bracketMatches
    )
  }, [matches, predictions, bracketPredictions, currentParticipant, bracketMatches])

  function getPrediction(bracketMatchId) {
    if (!currentParticipant) return null
    return bracketPredictions.find(
      p => p.participantId === currentParticipant.id && p.bracketMatchId === bracketMatchId
    ) || null
  }

  const handleSave = useCallback(async (bracketMatchId, winner, homeScore, awayScore) => {
    if (!currentParticipant) return
    await saveBracketPrediction(currentParticipant.id, bracketMatchId, winner, homeScore, awayScore)
  }, [currentParticipant, saveBracketPrediction])

  function getTeams(match) {
    if (predictedTeamMap) {
      const t = predictedTeamMap[match.id]
      if (t) return t
    }
    return { homeTeam: match.homeTeam, awayTeam: match.awayTeam }
  }

  const byRound = ROUND_ORDER.reduce((acc, r) => {
    acc[r] = bracketMatches.filter(m => m.round === r)
    return acc
  }, {})

  const myPredCount = currentParticipant
    ? bracketPredictions.filter(p => p.participantId === currentParticipant.id).length : 0

  const totalWithTeams = predictedTeamMap
    ? Object.values(predictedTeamMap).filter(t => t.homeTeam && t.awayTeam).length
    : bracketMatches.filter(m => m.homeTeam && m.awayTeam).length

  const groupPredCount = currentParticipant
    ? predictions.filter(p => p.participantId === currentParticipant.id).length : 0

  // Campeón pronosticado: ganador de la Final
  const champion = useMemo(() => {
    if (!currentParticipant || !predictedTeamMap) return null
    const finalTeams = predictedTeamMap['final_1']
    if (!finalTeams?.homeTeam || !finalTeams?.awayTeam) return null
    const finalPred = bracketPredictions.find(
      p => p.participantId === currentParticipant.id && p.bracketMatchId === 'final_1'
    )
    if (!finalPred) return null
    // Derivar ganador desde marcadores si están disponibles
    if (finalPred.predictedHomeScore !== null && finalPred.predictedAwayScore !== null) {
      if (finalPred.predictedHomeScore !== finalPred.predictedAwayScore) {
        return finalPred.predictedHomeScore > finalPred.predictedAwayScore
          ? finalTeams.homeTeam : finalTeams.awayTeam
      }
      // Empate en final → ganador explícito (penales)
      return finalPred.predictedWinner || null
    }
    return finalPred.predictedWinner || null
  }, [currentParticipant, predictedTeamMap, bracketPredictions])

  return (
    <div className="space-y-8">

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-black mb-1">Llaves · Fase Eliminatoria</h1>
          <p className="text-gray-600 text-sm">
            Ingresa el marcador de cada llave. El ganador pasa automáticamente a la siguiente fase.
          </p>
          <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
            {BRACKET_ROUNDS
              .filter(r => r.id !== 'third' && BRACKET_PAIRING_PTS[r.pairingPtsKey || r.id] != null)
              .map(r => (
                <span key={r.id} className="bg-gray-100 px-2 py-1 rounded">
                  {r.shortLabel || r.label}: <span className="text-green-600 font-semibold">{BRACKET_PAIRING_PTS[r.pairingPtsKey || r.id]}pts</span>
                </span>
              ))}
          </div>
        </div>
        {currentParticipant && (
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm">
            <span className="text-gray-600">Jugando como: </span>
            <span className="font-semibold text-black">{currentParticipant.name}</span>
            <span className="ml-3 text-green-600">{myPredCount}/{totalWithTeams} guardados</span>
          </div>
        )}
      </div>

      {/* Instrucciones */}
      {currentParticipant && (
        <div className="bg-white border-2 border-blue-600 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">¿Cómo funciona?</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-600 ml-2 text-xs">
            <li>Los equipos de la primera ronda eliminatoria vienen de tus <Link to="/pronosticos" className="underline">pronósticos de grupos</Link> (o del sorteo real si aún no los llenaste).</li>
            <li>Ingresa el marcador (goles) de cada llave. Si no hay empate, el ganador (★) pasa automáticamente a la siguiente ronda. El auto-guardado se activa 700 ms después de ingresar ambos goles.</li>
            <li>Si hay empate, elige quién avanza (penales). Ese equipo pasa a la siguiente ronda.</li>
            <li>Usa el botón <strong>Guardar</strong> para guardar en cualquier momento.</li>
          </ol>
          {groupPredCount > 0 && (
            <p className="text-green-600 mt-2 text-xs">
              ✓ {groupPredCount} partido(s) de grupos pronosticado(s) — la primera ronda eliminatoria se calcula automáticamente.
            </p>
          )}
        </div>
      )}

      {!currentParticipant && (
        <div className="bg-white border-2 border-yellow-600 rounded-xl p-4 text-yellow-800 text-sm">
          ⚠️ Selecciona o{' '}
          <Link to="/registro" className="underline hover:text-yellow-700">registra un participante</Link>
          {' '}para pronosticar el bracket.
        </div>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-700 inline-block" />
          Pronóstico ganador (★)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-800 border border-green-700 inline-block" />
          Clasificado real (✅)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-50 border border-dashed border-gray-300 inline-block" />
          Pendiente de ronda anterior
        </span>
      </div>

      {/* Rondas */}
      {ROUND_ORDER.map(round => {
        const roundMatches = byRound[round]
        if (!roundMatches?.length) return null
        const roundLocked = config.locks?.[round] ?? false
        return (
          <div key={round}>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h2 className="text-lg font-bold text-black flex items-center gap-2">
                {round === 'final' && '🏆 '}
                {round === 'third' && '🥉 '}
                {ROUND_LABEL[round]}
              </h2>
              {roundLocked && (
                <span className="text-xs bg-red-700 text-white px-2 py-0.5 rounded-full font-medium">
                  🔒 Bloqueado por admin
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              {roundMatches.map(match => {
                const { homeTeam, awayTeam } = getTeams(match)
                return (
                  <BracketCard
                    key={`${match.id}-${currentParticipant?.id || 'none'}`}
                    match={match}
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    participantId={currentParticipant?.id}
                    prediction={getPrediction(match.id)}
                    config={config}
                    onSave={handleSave}
                    adminLocked={roundLocked}
                  />
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Campeón pronosticado */}
      {currentParticipant && champion && (
        <div className="bg-white border-2 border-yellow-600 rounded-2xl p-8 text-center">
          <p className="text-yellow-600 text-xs uppercase tracking-widest font-bold mb-3">
            Tu Campeón Pronosticado
          </p>
          <p className="text-4xl font-black text-yellow-700">🏆 {champion}</p>
        </div>
      )}

      {/* Estado vacío */}
      {!currentParticipant && bracketMatches.every(m => !m.homeTeam) && (
        <div className="text-center py-16 text-gray-500">
          <div className="text-5xl mb-4">🎯</div>
          <p className="text-lg font-medium">El bracket aún no está disponible.</p>
          <p className="text-sm mt-2">Selecciona un participante, o el admin debe cargar el sorteo.</p>
        </div>
      )}

      {currentParticipant && totalWithTeams === 0 && groupPredCount === 0 && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-5xl mb-4">⚽</div>
          <p className="text-lg font-medium">Tu bracket está vacío.</p>
          <p className="text-sm mt-2">
            <Link to="/pronosticos" className="text-green-600 hover:text-green-600 underline">
              Pronóstica los partidos de grupos
            </Link>
            {' '}para que los clasificados aparezcan aquí, o pide al admin que cargue el sorteo.
          </p>
        </div>
      )}
    </div>
  )
}
