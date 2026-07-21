import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { buildRanking, calcGroupScore, calcBracketScoreAll, calcStandingsScore, calcClasificadoScore, calcScorerScore, calcGroupStandings, calcPredictedGroupStandings, calcR32Qualifiers, calcPredictedR32Qualifiers } from '../utils/scoring'
import { GROUP_LETTERS, BRACKET_ROUNDS, BRACKET_PAIRING_PTS, BRACKET_TEAM_PTS, BONUS_PTS, TOTAL_QUALIFIERS } from '../data/initialData'

const SEED_ROUND_LABEL = BRACKET_ROUNDS[0].label

const MEDAL = ['🥇', '🥈', '🥉']

function ParticipantDetail({
  participant, matches, predictions,
  bracketMatches, bracketPredictions,
  groupStandings, standingsPredictions,
  topScorers, scorerPredictions,
  config,
}) {
  const pid = participant.id
  const finishedGroups = matches.filter(m => m.status === 'finished' && m.phase === 'groups')
  const finishedBracket = bracketMatches.filter(m => m.winner)
  const pts = config?.pts

  return (
    <div className="mt-3 bg-gray-100 rounded-lg p-4 space-y-4 text-sm">

      {/* Fase de grupos */}
      {finishedGroups.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Partidos de grupos</p>
          {finishedGroups.map(match => {
            const pred = predictions.find(p => p.participantId === pid && p.matchId === match.id)
            const score = calcGroupScore(pred, match, config)
            const ptEx = pts?.exacto ?? 3
            return (
              <div key={match.id} className="flex items-center justify-between py-1 border-b border-gray-200 last:border-0">
                <span className="text-gray-700 text-xs">
                  {match.homeTeam} {match.homeScore}-{match.awayScore} {match.awayTeam}
                </span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-gray-500 text-xs">
                    {pred ? `(${pred.homeScore}-${pred.awayScore})` : '—'}
                  </span>
                  <span className={`w-8 text-center font-bold text-sm ${
                    score === ptEx ? 'text-yellow-800' : score > 0 ? 'text-blue-800' : 'text-gray-500'
                  }`}>{score}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Clasificación de grupos: posición exacta */}
      {(() => {
        const completedGroups = GROUP_LETTERS.filter(g => {
          const gm = matches.filter(m => m.group === g && m.phase === 'groups')
          return gm.length > 0 && gm.every(m => m.homeScore !== null && m.awayScore !== null)
        })
        if (!completedGroups.length) return null
        return (
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Posición exacta por grupo</p>
            {completedGroups.map(group => {
              const actual = calcGroupStandings(matches, group).map(t => t.name)
              const pred   = calcPredictedGroupStandings(matches, predictions, pid, group).map(t => t.name)
              const score  = calcStandingsScore(pred, actual, config)
              return (
                <div key={group} className="flex items-center justify-between py-1 border-b border-gray-200 last:border-0">
                  <span className="text-gray-700 text-xs">Grupo {group}</span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-gray-500 text-xs">{pred.filter(Boolean).join(' · ')}</span>
                    <span className={`w-8 text-center font-bold text-sm ${score > 0 ? 'text-purple-800' : 'text-gray-500'}`}>
                      {score}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Clasificados a la primera ronda eliminatoria: conjunto completo (top-2 + mejores terceros si aplica) */}
      {(() => {
        const groupMatches = matches.filter(m => m.phase === 'groups')
        const allFinished = groupMatches.length > 0 && groupMatches.every(m => m.homeScore !== null && m.awayScore !== null)
        if (!allFinished) return null

        const score = calcClasificadoScore(matches, predictions, pid, config)
        const actualSet = new Set(Object.values(calcR32Qualifiers(matches)).filter(Boolean))
        const predictedQualifiers = calcPredictedR32Qualifiers(matches, predictions, pid)
        const aciertos = Object.values(predictedQualifiers).filter(t => t && actualSet.has(t))

        return (
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Clasificados a {SEED_ROUND_LABEL} ({TOTAL_QUALIFIERS})</p>
            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 text-xs">{aciertos.length}/{TOTAL_QUALIFIERS} equipos acertados</span>
              <span className={`w-8 text-center font-bold text-sm ${score > 0 ? 'text-purple-800' : 'text-gray-500'}`}>
                {score}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Bracket */}
      {(() => {
        const { ptsPairing, ptsTeam, ptsBonus } = calcBracketScoreAll(
          pid, bracketMatches, bracketPredictions, matches, predictions
        )
        const hasBracketData = bracketMatches.some(m => m.homeTeam && m.awayTeam)
        if (!hasBracketData) return null

        // Resumen por categoría
        const totalBracket = ptsPairing + ptsTeam + ptsBonus
        return (
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Bracket</p>
            <div className="space-y-1">
              <div className="flex justify-between py-1 border-b border-gray-200">
                <span className="text-gray-600 text-xs">Llaves acertadas (ambos equipos)</span>
                <span className={`font-bold text-sm ${ptsPairing > 0 ? 'text-green-800' : 'text-gray-500'}`}>{ptsPairing}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200">
                <span className="text-gray-600 text-xs">Equipos clasificados por ronda</span>
                <span className={`font-bold text-sm ${ptsTeam > 0 ? 'text-cyan-800' : 'text-gray-500'}`}>{ptsTeam}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200">
                <span className="text-gray-600 text-xs">Bonus (campeón / subcampeón / 3ro / 4to)</span>
                <span className={`font-bold text-sm ${ptsBonus > 0 ? 'text-orange-800' : 'text-gray-500'}`}>{ptsBonus}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-700 text-xs font-semibold">Total bracket</span>
                <span className={`font-bold text-sm ${totalBracket > 0 ? 'text-black' : 'text-gray-500'}`}>{totalBracket}</span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Goleadores */}
      {topScorers?.some(s => s) && (
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Goleadores</p>
          {(() => {
            const pred = scorerPredictions.find(p => p.participantId === pid)
            const score = calcScorerScore(pred?.scorers, topScorers, config)
            return (
              <div className="flex items-center justify-between py-1">
                <span className="text-gray-700 text-xs">
                  {pred ? pred.scorers.filter(Boolean).join(' · ') : '—'}
                </span>
                <span className={`w-8 text-center font-bold text-sm ${score > 0 ? 'text-orange-800' : 'text-gray-500'}`}>
                  {score}
                </span>
              </div>
            )
          })()}
        </div>
      )}

      {finishedGroups.length === 0 && finishedBracket.length === 0 && (
        <p className="text-gray-500 text-center py-2">Aún no hay partidos finalizados.</p>
      )}
    </div>
  )
}

export default function Tabla() {
  const {
    participants, matches, predictions,
    bracketMatches, bracketPredictions,
    groupStandings, standingsPredictions,
    topScorers, scorerPredictions,
    currentParticipant, config, refreshData,
  } = useApp()

  const [expanded, setExpanded] = useState(null)

  // Asegura que los puntajes se calculen con los pronósticos más recientes
  useEffect(() => { refreshData() }, [refreshData])

  const ranking = buildRanking(
    participants, matches, predictions,
    bracketMatches, bracketPredictions,
    groupStandings, standingsPredictions,
    topScorers, scorerPredictions,
    config
  )

  const finishedGroups  = matches.filter(m => m.status === 'finished').length
  const finishedBracket = bracketMatches.filter(m => m.winner).length
  const pts = config?.pts

  if (participants.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <div className="text-5xl mb-4">📊</div>
        <p className="text-lg">No hay participantes todavía.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-black mb-1">Tabla de Puntuaciones</h1>
        <p className="text-gray-600 text-sm">
          {finishedGroups} partido{finishedGroups !== 1 ? 's' : ''} de grupos · {finishedBracket} resultado{finishedBracket !== 1 ? 's' : ''} de bracket
        </p>
      </div>

      {/* Leyenda de puntos */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Sistema de puntos</p>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Fase de grupos</p>
          <div className="flex flex-wrap gap-4 text-xs">
            {[
              { label: 'Marcador exacto',        value: pts?.exacto,      color: 'text-yellow-800' },
              { label: 'Resultado correcto',      value: pts?.resultado,   color: 'text-blue-800' },
              { label: `Clasificado a ${SEED_ROUND_LABEL}`, value: pts?.clasificado, color: 'text-purple-800' },
              { label: 'Posición exacta grupo',   value: pts?.ordenGrupo,  color: 'text-purple-800' },
            ].map(item => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className={`font-bold text-sm ${item.color}`}>{item.value}</span>
                <span className="text-gray-600">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Bracket — llaves acertadas (ambos equipos)</p>
          <div className="flex flex-wrap gap-4 text-xs">
            {BRACKET_ROUNDS
              .filter(r => BRACKET_PAIRING_PTS[r.pairingPtsKey || r.id] != null)
              .map(r => ({
                label: `${r.shortLabel || r.label} llave`,
                value: BRACKET_PAIRING_PTS[r.pairingPtsKey || r.id],
                color: 'text-green-800',
              })).map(item => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className={`font-bold text-sm ${item.color}`}>{item.value}</span>
                <span className="text-gray-600">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Bracket — equipo clasificado por ronda (acumulativo)</p>
          <div className="flex flex-wrap gap-4 text-xs">
            {BRACKET_ROUNDS
              .filter(r => !r.qualifierMap && r.id !== 'third' && r.id !== 'final' && BRACKET_TEAM_PTS[r.teamPtsKey || r.id] != null)
              .map(r => ({
                label: `Equipo en ${(r.shortLabel || r.label).toLowerCase()}`,
                value: BRACKET_TEAM_PTS[r.teamPtsKey || r.id],
                color: 'text-cyan-800',
              }))
              .concat(BRACKET_TEAM_PTS.finalFour != null
                ? [{ label: 'Equipo final/3er puesto', value: BRACKET_TEAM_PTS.finalFour, color: 'text-cyan-800' }]
                : [])
              .map(item => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className={`font-bold text-sm ${item.color}`}>{item.value}</span>
                <span className="text-gray-600">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Bonus final</p>
          <div className="flex flex-wrap gap-4 text-xs">
            {[
              { label: 'Campeón',     value: BONUS_PTS.champion,    color: 'text-orange-800' },
              { label: 'Subcampeón',  value: BONUS_PTS.runnerUp,    color: 'text-orange-800' },
              { label: '3er puesto',  value: BONUS_PTS.thirdPlace,  color: 'text-orange-800' },
              { label: '4to puesto',  value: BONUS_PTS.fourthPlace, color: 'text-orange-800' },
              { label: 'Goleador',    value: pts?.goleador,         color: 'text-orange-800' },
            ].map(item => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className={`font-bold text-sm ${item.color}`}>{item.value}</span>
                <span className="text-gray-600">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Podio */}
      {ranking.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {[ranking[1], ranking[0], ranking[2]].map((entry, i) => {
            const realPos = i === 0 ? 1 : i === 1 ? 0 : 2
            const posLabel = realPos === 0 ? '🥇' : realPos === 1 ? '🥈' : '🥉'
            const height = realPos === 0 ? 'pt-0' : realPos === 1 ? 'pt-4' : 'pt-8'
            return (
              <div key={entry.participant.id} className={`text-center ${height}`}>
                <div className="text-2xl mb-1">{posLabel}</div>
                <div className={`rounded-xl p-3 ${
                  realPos === 0 ? 'bg-white border-2 border-yellow-800' :
                  realPos === 1 ? 'bg-gray-200 border border-gray-300' :
                  'bg-white border-2 border-orange-800'
                }`}>
                  <p className="font-bold text-black text-sm truncate">{entry.participant.name}</p>
                  <p className={`text-xl font-bold mt-1 ${realPos === 0 ? 'text-yellow-800' : 'text-gray-700'}`}>
                    {entry.stats.total}
                  </p>
                  <p className="text-xs text-gray-500">pts</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tabla completa */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem_3.5rem_3.5rem_3.5rem_4.5rem] gap-1 px-4 py-3 bg-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          <span>#</span>
          <span>Nombre</span>
          <span className="text-center text-yellow-800">Exact.</span>
          <span className="text-center text-blue-800">Resul.</span>
          <span className="text-center text-green-800">Brack.</span>
          <span className="text-center text-purple-800">Grupos</span>
          <span className="text-center text-orange-800">Goles</span>
          <span className="text-center text-black">Total</span>
        </div>

        {ranking.map(({ participant, stats, position }) => {
          const isMe = participant.id === currentParticipant?.id
          const isOpen = expanded === participant.id
          return (
            <div key={participant.id}>
              <button
                onClick={() => setExpanded(prev => prev === participant.id ? null : participant.id)}
                className={`w-full grid grid-cols-[2rem_1fr_3.5rem_3.5rem_3.5rem_3.5rem_3.5rem_4.5rem] gap-1 px-4 py-3 border-t border-gray-200 text-left transition-colors ${
                  isMe ? 'border-l-4 border-green-800 hover:bg-gray-50' : 'hover:bg-gray-100'
                }`}
              >
                <span className="text-gray-500 text-sm self-center">{MEDAL[position - 1] ?? position}</span>
                <span className={`font-medium self-center truncate ${isMe ? 'text-green-800' : 'text-black'}`}>
                  {participant.name}
                  {isMe && <span className="ml-1 text-xs text-green-800">(tú)</span>}
                </span>
                <span className="text-center text-yellow-800 font-bold self-center">{stats.ptsExacto}</span>
                <span className="text-center text-blue-800 font-bold self-center">{stats.ptsResultado}</span>
                <span className="text-center text-green-800 font-bold self-center">{stats.ptsBracket}</span>
                <span className="text-center text-purple-800 font-bold self-center">{stats.ptsStandings}</span>
                <span className="text-center text-orange-800 font-bold self-center">{stats.ptsScorers}</span>
                <span className="text-center text-black text-lg font-bold self-center">{stats.total}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-gray-200">
                  <ParticipantDetail
                    participant={participant}
                    matches={matches}
                    predictions={predictions}
                    bracketMatches={bracketMatches}
                    bracketPredictions={bracketPredictions}
                    groupStandings={groupStandings}
                    standingsPredictions={standingsPredictions}
                    topScorers={topScorers}
                    scorerPredictions={scorerPredictions}
                    config={config}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-center text-xs text-gray-500">
        Haz clic en un participante para ver el desglose de puntos por categoría
      </p>
    </div>
  )
}
