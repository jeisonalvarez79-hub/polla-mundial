import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { calcBracketScore } from '../utils/scoring'

const ROUND_LABEL = {
  r32:   'Dieciseisavos de Final',
  r16:   'Octavos de Final',
  qf:    'Cuartos de Final',
  sf:    'Semifinal',
  third: 'Tercer Lugar',
  final: 'Final',
}

const ROUND_ORDER = ['r32', 'r16', 'qf', 'sf', 'third', 'final']

function TeamRow({ team, isWinner, isPredicted, isFinished, canPredict, onPredict }) {
  return (
    <button
      onClick={canPredict ? onPredict : undefined}
      disabled={!canPredict}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        isWinner
          ? 'bg-green-800 text-green-200 border border-green-600'
          : isPredicted && !isFinished
          ? 'bg-blue-900/40 text-blue-300 border border-blue-700'
          : isPredicted && isFinished
          ? 'bg-gray-800 text-gray-400 border border-gray-700 line-through'
          : canPredict
          ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 hover:border-gray-500 cursor-pointer'
          : 'bg-gray-800/50 text-gray-400 border border-gray-800 cursor-default'
      }`}
    >
      <div className="flex items-center justify-between">
        <span>{team}</span>
        <span>
          {isWinner && '✅'}
          {isPredicted && !isWinner && !isFinished && '★'}
          {isPredicted && isFinished && !isWinner && '✗'}
        </span>
      </div>
    </button>
  )
}

function BracketCard({ match, participantId, prediction, config, onPredict }) {
  const locked = match.status !== 'pending'
  const empty = !match.homeTeam && !match.awayTeam
  const score = match.winner && prediction
    ? calcBracketScore(prediction, match, config)
    : null
  const ptClasificado = config?.pts?.clasificado ?? 2

  if (empty) {
    return (
      <div className="bg-gray-900/50 border border-dashed border-gray-800 rounded-xl p-4 min-w-[200px]">
        <p className="text-xs text-gray-600 text-center font-medium">{match.label}</p>
        <p className="text-xs text-gray-700 text-center mt-1">Por definir</p>
      </div>
    )
  }

  return (
    <div className={`bg-gray-900 border rounded-xl p-4 min-w-[200px] ${
      match.round === 'final'     ? 'border-yellow-700 shadow-lg shadow-yellow-900/20' :
      match.status === 'finished' ? 'border-gray-700'   :
      match.status === 'live'     ? 'border-yellow-700' : 'border-gray-800'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium">{match.label}</p>
        {score !== null && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
            score > 0 ? 'bg-green-800 text-green-300' : 'bg-gray-800 text-gray-500'
          }`}>
            {score} pts
          </span>
        )}
      </div>

      <TeamRow
        team={match.homeTeam}
        isWinner={match.winner === match.homeTeam}
        isPredicted={prediction?.predictedWinner === match.homeTeam}
        isFinished={match.status === 'finished'}
        canPredict={!locked && !!participantId && !empty}
        onPredict={() => onPredict(match.id, match.homeTeam)}
      />

      <div className="text-center text-gray-700 text-xs my-1">vs</div>

      <TeamRow
        team={match.awayTeam}
        isWinner={match.winner === match.awayTeam}
        isPredicted={prediction?.predictedWinner === match.awayTeam}
        isFinished={match.status === 'finished'}
        canPredict={!locked && !!participantId && !empty}
        onPredict={() => onPredict(match.id, match.awayTeam)}
      />

      {match.status === 'finished' && match.homeScore !== null && (
        <p className="text-xs text-gray-600 text-center mt-2">
          {match.homeScore} - {match.awayScore}
        </p>
      )}

      {!participantId && !locked && !empty && (
        <p className="text-xs text-gray-700 text-center mt-2">Selecciona un jugador</p>
      )}
    </div>
  )
}

export default function Bracket() {
  const { bracketMatches, bracketPredictions, currentParticipant, saveBracketPrediction, config } = useApp()

  function getPrediction(bracketMatchId) {
    if (!currentParticipant) return null
    return bracketPredictions.find(
      p => p.participantId === currentParticipant.id && p.bracketMatchId === bracketMatchId
    ) || null
  }

  function handlePredict(bracketMatchId, team) {
    if (!currentParticipant) return
    saveBracketPrediction(currentParticipant.id, bracketMatchId, team)
  }

  const byRound = ROUND_ORDER.reduce((acc, r) => {
    acc[r] = bracketMatches.filter(m => m.round === r)
    return acc
  }, {})

  const myPredCount = currentParticipant
    ? bracketPredictions.filter(p => p.participantId === currentParticipant.id).length : 0
  const totalWithTeams = bracketMatches.filter(m => m.homeTeam && m.awayTeam).length
  const ptClasificado = config?.pts?.clasificado ?? 2

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Bracket · Fase Eliminatoria</h1>
          <p className="text-gray-400 text-sm">
            Haz clic en un equipo para pronosticarlo como clasificado.
            <span className="text-green-400 ml-1">{ptClasificado} pts por acierto.</span>
          </p>
        </div>
        {currentParticipant && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm">
            <span className="text-gray-400">Jugando como: </span>
            <span className="font-semibold text-white">{currentParticipant.name}</span>
            <span className="ml-3 text-green-400">{myPredCount}/{totalWithTeams} pronosticados</span>
          </div>
        )}
      </div>

      {!currentParticipant && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 text-yellow-300 text-sm">
          ⚠️ Selecciona o{' '}
          <Link to="/registro" className="underline hover:text-yellow-200">registra un participante</Link>
          {' '}para pronosticar el bracket.
        </div>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-900/40 border border-blue-700 inline-block" />
          Tu pronóstico (pendiente)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-800 border border-green-600 inline-block" />
          Clasificado real
        </span>
      </div>

      {/* Rondas */}
      {ROUND_ORDER.map(round => {
        const roundMatches = byRound[round]
        if (!roundMatches?.length) return null
        return (
          <div key={round}>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              {round === 'final' && '🏆 '}
              {round === 'third' && '🥉 '}
              {ROUND_LABEL[round]}
            </h2>
            <div className="flex flex-wrap gap-4">
              {roundMatches.map(match => (
                <BracketCard
                  key={match.id}
                  match={match}
                  participantId={currentParticipant?.id}
                  prediction={getPrediction(match.id)}
                  config={config}
                  onPredict={handlePredict}
                />
              ))}
            </div>
          </div>
        )
      })}

      {bracketMatches.every(m => !m.homeTeam) && (
        <div className="text-center py-16 text-gray-600">
          <div className="text-5xl mb-4">🎯</div>
          <p className="text-lg">El bracket aún no está disponible.</p>
          <p className="text-sm mt-2">El administrador debe cargar los equipos clasificados en cada fase.</p>
        </div>
      )}
    </div>
  )
}
