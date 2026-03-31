import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { buildRanking, calcGroupScore, calcBracketScore, calcStandingsScore, calcScorerScore } from '../utils/scoring'

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
    <div className="mt-3 bg-gray-800 rounded-lg p-4 space-y-4 text-sm">

      {/* Fase de grupos */}
      {finishedGroups.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Partidos de grupos</p>
          {finishedGroups.map(match => {
            const pred = predictions.find(p => p.participantId === pid && p.matchId === match.id)
            const score = calcGroupScore(pred, match, config)
            const ptEx = pts?.exacto ?? 3
            return (
              <div key={match.id} className="flex items-center justify-between py-1 border-b border-gray-700/50 last:border-0">
                <span className="text-gray-300 text-xs">
                  {match.homeTeam} {match.homeScore}-{match.awayScore} {match.awayTeam}
                </span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-gray-500 text-xs">
                    {pred ? `(${pred.homeScore}-${pred.awayScore})` : '—'}
                  </span>
                  <span className={`w-8 text-center font-bold text-sm ${
                    score === ptEx ? 'text-yellow-400' : score > 0 ? 'text-blue-400' : 'text-gray-600'
                  }`}>{score}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Clasificación de grupos */}
      {Object.entries(groupStandings || {}).some(([, a]) => a?.some(t => t)) && (
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Clasificación de grupos</p>
          {Object.entries(groupStandings).map(([group, actual]) => {
            if (!actual?.some(t => t)) return null
            const pred = standingsPredictions.find(p => p.participantId === pid && p.group === group)
            const score = calcStandingsScore(pred?.standings, actual, config)
            return (
              <div key={group} className="flex items-center justify-between py-1 border-b border-gray-700/50 last:border-0">
                <span className="text-gray-300 text-xs">Grupo {group}</span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-gray-500 text-xs">
                    {pred ? pred.standings.filter(Boolean).join(' · ') : '—'}
                  </span>
                  <span className={`w-8 text-center font-bold text-sm ${score > 0 ? 'text-purple-400' : 'text-gray-600'}`}>
                    {score}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Bracket */}
      {finishedBracket.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Bracket</p>
          {finishedBracket.map(bm => {
            const pred = bracketPredictions.find(p => p.participantId === pid && p.bracketMatchId === bm.id)
            const score = calcBracketScore(pred, bm, config)
            return (
              <div key={bm.id} className="flex items-center justify-between py-1 border-b border-gray-700/50 last:border-0">
                <span className="text-gray-300 text-xs">{bm.label}</span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-gray-500 text-xs">
                    {pred ? pred.predictedWinner : '—'} → <span className="text-green-400">{bm.winner}</span>
                  </span>
                  <span className={`w-8 text-center font-bold text-sm ${score > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                    {score}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Goleadores */}
      {topScorers?.some(s => s) && (
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Goleadores</p>
          {(() => {
            const pred = scorerPredictions.find(p => p.participantId === pid)
            const score = calcScorerScore(pred?.scorers, topScorers, config)
            return (
              <div className="flex items-center justify-between py-1">
                <span className="text-gray-300 text-xs">
                  {pred ? pred.scorers.filter(Boolean).join(' · ') : '—'}
                </span>
                <span className={`w-8 text-center font-bold text-sm ${score > 0 ? 'text-orange-400' : 'text-gray-600'}`}>
                  {score}
                </span>
              </div>
            )
          })()}
        </div>
      )}

      {finishedGroups.length === 0 && finishedBracket.length === 0 && (
        <p className="text-gray-600 text-center py-2">Aún no hay partidos finalizados.</p>
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
    currentParticipant, config,
  } = useApp()

  const [expanded, setExpanded] = useState(null)

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
      <div className="text-center py-20 text-gray-600">
        <div className="text-5xl mb-4">📊</div>
        <p className="text-lg">No hay participantes todavía.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Tabla de Puntuaciones</h1>
        <p className="text-gray-400 text-sm">
          {finishedGroups} partido{finishedGroups !== 1 ? 's' : ''} de grupos · {finishedBracket} resultado{finishedBracket !== 1 ? 's' : ''} de bracket
        </p>
      </div>

      {/* Leyenda de puntos */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Sistema de puntos actual</p>
        <div className="flex flex-wrap gap-4 text-xs">
          {[
            { label: 'Marcador exacto',    value: pts?.exacto,      color: 'text-yellow-400' },
            { label: 'Resultado correcto', value: pts?.resultado,    color: 'text-blue-400' },
            { label: 'Bracket correcto',   value: pts?.clasificado,  color: 'text-green-400' },
            { label: 'Posición en grupo',  value: pts?.ordenGrupo,   color: 'text-purple-400' },
            { label: 'Goleador exacto',    value: pts?.goleador,     color: 'text-orange-400' },
          ].map(item => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span className={`font-bold text-sm ${item.color}`}>{item.value}</span>
              <span className="text-gray-400">{item.label}</span>
            </span>
          ))}
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
                  realPos === 0 ? 'bg-yellow-900/30 border border-yellow-700' :
                  realPos === 1 ? 'bg-gray-700/30 border border-gray-600' :
                  'bg-orange-900/20 border border-orange-900'
                }`}>
                  <p className="font-bold text-white text-sm truncate">{entry.participant.name}</p>
                  <p className={`text-xl font-bold mt-1 ${realPos === 0 ? 'text-yellow-400' : 'text-gray-300'}`}>
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem_3.5rem_3.5rem_3.5rem_4.5rem] gap-1 px-4 py-3 bg-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wide">
          <span>#</span>
          <span>Nombre</span>
          <span className="text-center text-yellow-500">Exact.</span>
          <span className="text-center text-blue-400">Resul.</span>
          <span className="text-center text-green-400">Brack.</span>
          <span className="text-center text-purple-400">Grupos</span>
          <span className="text-center text-orange-400">Goles</span>
          <span className="text-center text-white">Total</span>
        </div>

        {ranking.map(({ participant, stats, position }) => {
          const isMe = participant.id === currentParticipant?.id
          const isOpen = expanded === participant.id
          return (
            <div key={participant.id}>
              <button
                onClick={() => setExpanded(prev => prev === participant.id ? null : participant.id)}
                className={`w-full grid grid-cols-[2rem_1fr_3.5rem_3.5rem_3.5rem_3.5rem_3.5rem_4.5rem] gap-1 px-4 py-3 border-t border-gray-800 text-left transition-colors ${
                  isMe ? 'bg-green-900/20 hover:bg-green-900/30' : 'hover:bg-gray-800/50'
                }`}
              >
                <span className="text-gray-500 text-sm self-center">{MEDAL[position - 1] ?? position}</span>
                <span className={`font-medium self-center truncate ${isMe ? 'text-green-400' : 'text-white'}`}>
                  {participant.name}
                  {isMe && <span className="ml-1 text-xs text-green-600">(tú)</span>}
                </span>
                <span className="text-center text-yellow-400 font-bold self-center">{stats.ptsExacto}</span>
                <span className="text-center text-blue-400 font-bold self-center">{stats.ptsResultado}</span>
                <span className="text-center text-green-400 font-bold self-center">{stats.ptsBracket}</span>
                <span className="text-center text-purple-400 font-bold self-center">{stats.ptsStandings}</span>
                <span className="text-center text-orange-400 font-bold self-center">{stats.ptsScorers}</span>
                <span className="text-center text-white text-lg font-bold self-center">{stats.total}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-gray-800">
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

      <p className="text-center text-xs text-gray-600">
        Haz clic en un participante para ver el desglose de puntos por categoría
      </p>
    </div>
  )
}
