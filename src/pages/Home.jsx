import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { buildRanking } from '../utils/scoring'
import { BRACKET_ROUNDS } from '../data/initialData'

const MEDAL = ['🥇', '🥈', '🥉']

function fmt(n) {
  return Number(n || 0).toLocaleString('es-CO')
}

export default function Home() {
  const {
    config, participants, matches, predictions,
    bracketMatches, bracketPredictions,
    groupStandings, standingsPredictions,
    topScorers, scorerPredictions,
    currentParticipant, pollas, currentPollaId,
  } = useApp()

  const ranking = buildRanking(
    participants, matches, predictions,
    bracketMatches, bracketPredictions,
    groupStandings, standingsPredictions,
    topScorers, scorerPredictions,
    config
  )
  const top3 = ranking.slice(0, 3)
  const finishedGroups  = matches.filter(m => m.status === 'finished').length
  const finishedBracket = bracketMatches.filter(m => m.status === 'finished').length
  const finishedMatches = finishedGroups + finishedBracket
  const totalMatches    = matches.length + bracketMatches.length
  const pts = config?.pts

  // Premio
  const currentPolla  = pollas.find(p => p.id === currentPollaId)
  const valorPolla    = Number(currentPolla?.valor_polla) || 0
  const totalRecaudado = valorPolla * participants.length
  const premio1       = totalRecaudado * 0.70
  const premio2       = totalRecaudado * 0.30

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-10 bg-gradient-to-b from-green-900/40 to-transparent rounded-2xl">
        <div className="text-6xl mb-3">⚽</div>
        <h1 className="text-4xl font-bold text-black mb-2">{config.name}</h1>
        <p className="text-green-700 text-lg">{config.tournamentName}</p>
        {currentPolla && (
          <p className="text-green-600 text-sm mt-1 font-medium">{currentPolla.name}</p>
        )}
        {!currentParticipant && (
          <Link
            to="/registro"
            className="mt-6 inline-block bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Unirse al torneo →
          </Link>
        )}
        {currentParticipant && (
          <p className="mt-4 text-green-700">
            Bienvenido, <span className="font-bold text-black">{currentParticipant.name}</span> 👋
          </p>
        )}
      </div>

      {/* Premio de la polla */}
      {currentPolla && (
        <div className="bg-white border border-yellow-800/50 rounded-xl overflow-hidden">
          <div className="bg-yellow-50 px-5 py-3 border-b border-yellow-300 flex items-center gap-2">
            <span className="text-xl">💰</span>
            <h2 className="text-black font-bold">Premio — {currentPolla.name}</h2>
          </div>
          <div className="p-5 space-y-4">
            {/* Valor + Total */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-600 mb-1">Valor inscripción</p>
                {valorPolla > 0 ? (
                  <p className="text-xl font-bold text-green-600">${fmt(valorPolla)}</p>
                ) : (
                  <p className="text-sm text-gray-500 italic">Por definir</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Participantes</p>
                <p className="text-xl font-bold text-black">{participants.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Total recaudado</p>
                {totalRecaudado > 0 ? (
                  <p className="text-xl font-bold text-yellow-600">${fmt(totalRecaudado)}</p>
                ) : (
                  <p className="text-sm text-gray-500 italic">—</p>
                )}
              </div>
            </div>

            {/* Distribución de premios */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 text-center">
                <p className="text-yellow-600 font-bold text-sm mb-1">🥇 1er Puesto</p>
                <p className="text-xs text-yellow-600 mb-2">70% del total</p>
                {totalRecaudado > 0 ? (
                  <p className="text-2xl font-bold text-yellow-700">${fmt(premio1)}</p>
                ) : (
                  <p className="text-gray-500 text-sm italic">—</p>
                )}
                {ranking[0] && (
                  <p className="text-xs text-yellow-600 mt-2 truncate">
                    Líder: {ranking[0].participant.name}
                  </p>
                )}
              </div>
              <div className="bg-gray-200 border border-gray-300 rounded-xl p-4 text-center">
                <p className="text-gray-700 font-bold text-sm mb-1">🥈 2do Puesto</p>
                <p className="text-xs text-gray-500 mb-2">30% del total</p>
                {totalRecaudado > 0 ? (
                  <p className="text-2xl font-bold text-gray-800">${fmt(premio2)}</p>
                ) : (
                  <p className="text-gray-500 text-sm italic">—</p>
                )}
                {ranking[1] && (
                  <p className="text-xs text-gray-500 mt-2 truncate">
                    2do: {ranking[1].participant.name}
                  </p>
                )}
              </div>
            </div>

            {valorPolla === 0 && (
              <p className="text-xs text-gray-500 text-center">
                El administrador aún no ha configurado el valor de inscripción en Admin → Configuración.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Participantes',     value: participants.length,                  icon: '👥' },
          { label: 'Partidos jugados',  value: finishedMatches,                      icon: '✅' },
          { label: 'Por jugar',         value: totalMatches - finishedMatches,       icon: '🕐' },
          { label: 'Total partidos',    value: `${finishedMatches}/${totalMatches}`, icon: '🏆' },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-2xl font-bold text-black">{stat.value}</div>
            <div className="text-xs text-gray-600 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Top 3 */}
      {top3.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-black mb-4">🏆 Líderes</h2>
          <div className="space-y-2">
            {top3.map((entry, i) => (
              <div key={entry.participant.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{MEDAL[i]}</span>
                  <span className="font-medium text-black">{entry.participant.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  {totalRecaudado > 0 && i < 2 && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      i === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {i === 0 ? `$${fmt(premio1)}` : `$${fmt(premio2)}`}
                    </span>
                  )}
                  <div className="text-right">
                    <span className="text-2xl font-bold text-green-600">{entry.stats.total}</span>
                    <span className="text-gray-500 text-sm ml-1">pts</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link to="/tabla" className="block mt-3 text-center text-sm text-green-600 hover:text-green-700">
            Ver tabla completa →
          </Link>
        </div>
      )}

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-lg font-bold text-black mb-4">Accesos rápidos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { to: '/pronosticos', icon: '📝', label: 'Pronósticos',  desc: 'Grupos, tabla y goleadores' },
            { to: '/bracket',     icon: '🎯', label: 'Bracket',      desc: 'Fase eliminatoria' },
            { to: '/tabla',       icon: '📊', label: 'Tabla',        desc: 'Clasificación general' },
          ].map(card => (
            <Link key={card.to} to={card.to}
              className="bg-white border border-gray-200 hover:border-green-700 rounded-xl p-5 text-center transition-colors group"
            >
              <div className="text-3xl mb-2">{card.icon}</div>
              <div className="font-semibold text-black group-hover:text-green-600 transition-colors">{card.label}</div>
              <div className="text-xs text-gray-500 mt-1">{card.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Sistema de puntos */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-lg font-bold text-black mb-3">📋 Sistema de puntos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {[
            { pts: pts?.exacto,      label: 'Marcador exacto',                    color: 'text-yellow-600' },
            { pts: pts?.resultado,   label: 'Equipo ganador / empate correcto',   color: 'text-blue-600' },
            { pts: pts?.clasificado, label: `Clasificado a ${BRACKET_ROUNDS[0].label}`, color: 'text-green-600' },
            { pts: pts?.ordenGrupo,  label: 'Posición exacta en tabla de grupo',  color: 'text-purple-600' },
            { pts: pts?.goleador,    label: 'Goleador del torneo acertado',       color: 'text-orange-600' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3">
              <span className={`text-2xl font-bold w-8 shrink-0 ${item.color}`}>{item.pts}</span>
              <span className="text-gray-700">{item.label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">Los puntos son configurables desde el Panel de Admin.</p>
      </div>
    </div>
  )
}
