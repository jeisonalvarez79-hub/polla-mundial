import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { buildRanking } from '../utils/scoring'

const MEDAL = ['🥇', '🥈', '🥉']

export default function Home() {
  const {
    config, participants, matches, predictions,
    bracketMatches, bracketPredictions,
    groupStandings, standingsPredictions,
    topScorers, scorerPredictions,
    currentParticipant,
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
  const totalMatches    = matches.length + bracketMatches.length  // 72 + 32 = 104
  const pts = config?.pts

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-10 bg-gradient-to-b from-green-900/40 to-transparent rounded-2xl">
        <div className="text-6xl mb-3">⚽</div>
        <h1 className="text-4xl font-bold text-white mb-2">{config.name}</h1>
        <p className="text-green-300 text-lg">{config.tournamentName} {config.year}</p>
        {!currentParticipant && (
          <Link
            to="/registro"
            className="mt-6 inline-block bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Unirse al torneo →
          </Link>
        )}
        {currentParticipant && (
          <p className="mt-4 text-green-200">
            Bienvenido, <span className="font-bold text-white">{currentParticipant.name}</span> 👋
          </p>
        )}
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Participantes',      value: participants.length,                icon: '👥' },
          { label: 'Partidos jugados',   value: finishedMatches,                    icon: '✅' },
          { label: 'Por jugar',          value: totalMatches - finishedMatches,     icon: '🕐' },
          { label: 'Total de partidos',  value: `${finishedMatches}/${totalMatches}`, icon: '🏆' },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-xs text-gray-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Top 3 */}
      {top3.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4">🏆 Líderes</h2>
          <div className="space-y-2">
            {top3.map((entry, i) => (
              <div key={entry.participant.id}
                className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{MEDAL[i]}</span>
                  <span className="font-medium text-white">{entry.participant.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-green-400">{entry.stats.total}</span>
                  <span className="text-gray-500 text-sm ml-1">pts</span>
                </div>
              </div>
            ))}
          </div>
          <Link to="/tabla" className="block mt-3 text-center text-sm text-green-400 hover:text-green-300">
            Ver tabla completa →
          </Link>
        </div>
      )}

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">Accesos rápidos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { to: '/pronosticos', icon: '📝', label: 'Pronósticos',  desc: 'Grupos, tabla y goleadores' },
            { to: '/bracket',     icon: '🎯', label: 'Bracket',      desc: 'Fase eliminatoria' },
            { to: '/tabla',       icon: '📊', label: 'Tabla',        desc: 'Clasificación general' },
          ].map(card => (
            <Link key={card.to} to={card.to}
              className="bg-gray-900 border border-gray-800 hover:border-green-700 rounded-xl p-5 text-center transition-colors group"
            >
              <div className="text-3xl mb-2">{card.icon}</div>
              <div className="font-semibold text-white group-hover:text-green-400 transition-colors">{card.label}</div>
              <div className="text-xs text-gray-500 mt-1">{card.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Sistema de puntos dinámico */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-bold text-white mb-3">📋 Sistema de puntos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {[
            { pts: pts?.exacto,      label: 'Marcador exacto',                    color: 'text-yellow-400' },
            { pts: pts?.resultado,   label: 'Equipo ganador / empate correcto',   color: 'text-blue-400' },
            { pts: pts?.clasificado, label: 'Clasificado correcto en bracket',    color: 'text-green-400' },
            { pts: pts?.ordenGrupo,  label: 'Posición exacta en tabla de grupo',  color: 'text-purple-400' },
            { pts: pts?.goleador,    label: 'Goleador en posición correcta',      color: 'text-orange-400' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3">
              <span className={`text-2xl font-bold w-8 shrink-0 ${item.color}`}>{item.pts}</span>
              <span className="text-gray-300">{item.label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-3">Los puntos son configurables desde el Panel de Admin.</p>
      </div>
    </div>
  )
}
