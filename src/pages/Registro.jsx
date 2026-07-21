import { useApp } from '../context/AppContext'
import { buildRanking } from '../utils/scoring'

export default function Registro() {
  const {
    participants, currentParticipant,
    matches, predictions, bracketMatches, bracketPredictions,
    groupStandings, standingsPredictions,
    topScorers, scorerPredictions,
    config, pollas, currentPollaId,
  } = useApp()

  const ranking = buildRanking(
    participants, matches, predictions,
    bracketMatches, bracketPredictions,
    groupStandings, standingsPredictions,
    topScorers, scorerPredictions,
    config
  )

  const currentPolla = pollas.find(p => p.id === currentPollaId)

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-black mb-1">Participantes</h1>
        {currentPolla && <p className="text-gray-600 text-sm">{currentPolla.name}</p>}
      </div>

      {currentParticipant && (
        <div className="bg-white border-2 border-green-800 rounded-xl px-5 py-3 flex items-center gap-2">
          <span className="text-green-800 text-sm font-medium">
            Participando como: <strong>{currentParticipant.name}</strong>
          </span>
          {currentPolla && (
            <span className="ml-auto text-xs text-green-800">{currentPolla.name}</span>
          )}
        </div>
      )}

      {participants.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-5xl mb-4">👥</div>
          <p className="text-lg">No hay participantes en esta polla.</p>
          <p className="text-xs mt-2 text-gray-300">El administrador debe agregarlos desde el Panel Admin.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-100 px-5 py-3">
            <p className="text-black font-semibold text-sm">
              Clasificación · {participants.length} participante{participants.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="divide-y divide-gray-800">
            {ranking.map(({ participant, stats, position }) => {
              const isMe = participant.id === currentParticipant?.id
              return (
                <div
                  key={participant.id}
                  className={`flex items-center gap-3 px-5 py-3 ${isMe ? 'border-l-4 border-green-800' : ''}`}
                >
                  <span className="text-gray-500 text-sm w-5 text-center shrink-0">{position}</span>
                  <span className={`font-medium flex-1 ${isMe ? 'text-green-800' : 'text-black'}`}>
                    {participant.name}
                    {isMe && <span className="ml-2 text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded-full">Tú</span>}
                  </span>
                  <span className="text-green-800 font-bold text-sm shrink-0">{stats.total} pts</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
