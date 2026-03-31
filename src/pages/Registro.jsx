import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { buildRanking } from '../utils/scoring'

export default function Registro() {
  const {
    participants, currentParticipant, addParticipant,
    setCurrentParticipant, removeParticipant,
    matches, predictions, bracketMatches, bracketPredictions,
    groupStandings, standingsPredictions,
    topScorers, scorerPredictions,
    config,
  } = useApp()

  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const ranking = buildRanking(
    participants, matches, predictions,
    bracketMatches, bracketPredictions,
    groupStandings, standingsPredictions,
    topScorers, scorerPredictions,
    config
  )

  function handleAdd(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    const result = addParticipant(nombre)
    if (!result) {
      setError('El nombre ya existe o está vacío.')
    } else {
      setSuccess(`¡${result.name} se unió! Ahora puedes hacer pronósticos.`)
      setNombre('')
    }
  }

  function handleSelect(id) {
    setCurrentParticipant(id)
    setSuccess('')
  }

  function handleRemove(id, name) {
    if (window.confirm(`¿Eliminar a ${name} y todos sus pronósticos?`)) {
      removeParticipant(id)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Participantes</h1>
        <p className="text-gray-400 text-sm">
          Añade tu nombre para empezar a hacer pronósticos. Puedes cambiar de jugador en cualquier momento desde la barra de navegación.
        </p>
      </div>

      {/* Formulario */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-4">Unirse al torneo</h2>
        <form onSubmit={handleAdd} className="flex gap-3">
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Tu nombre..."
            maxLength={30}
            className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 placeholder-gray-500 focus:outline-none focus:border-green-600"
          />
          <button type="submit"
            className="bg-green-600 hover:bg-green-500 text-white font-semibold px-5 py-2 rounded-lg transition-colors">
            Unirse
          </button>
        </form>
        {error   && <p className="text-red-400 text-sm mt-2">{error}</p>}
        {success && <p className="text-green-400 text-sm mt-2">✓ {success}</p>}
      </div>

      {/* Lista de participantes */}
      {participants.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Participantes ({participants.length})</h2>
          <div className="space-y-2">
            {ranking.map(({ participant, stats, position }) => {
              const isMe = participant.id === currentParticipant?.id
              return (
                <div key={participant.id}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 border transition-colors ${
                    isMe ? 'bg-green-900/30 border-green-700' : 'bg-gray-800 border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm w-5 text-center">{position}</span>
                    <div>
                      <span className="font-medium text-white">{participant.name}</span>
                      {isMe && (
                        <span className="ml-2 text-xs bg-green-700 text-green-200 px-2 py-0.5 rounded-full">Tú</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-green-400 font-bold">{stats.total} pts</span>
                    {!isMe && (
                      <button onClick={() => handleSelect(participant.id)}
                        className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 px-2 py-1 rounded transition-colors">
                        Seleccionar
                      </button>
                    )}
                    <button onClick={() => handleRemove(participant.id, participant.name)}
                      className="text-xs text-red-600 hover:text-red-400 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {participants.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <div className="text-4xl mb-3">👥</div>
          <p>Todavía no hay participantes. ¡Sé el primero!</p>
        </div>
      )}
    </div>
  )
}
