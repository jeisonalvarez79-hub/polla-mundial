import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const NAV_LINKS = [
  { to: '/',            label: 'Inicio' },
  { to: '/registro',    label: 'Participantes' },
  { to: '/pronosticos', label: 'Pronósticos' },
  { to: '/bracket',     label: 'Bracket' },
  { to: '/tabla',       label: 'Tabla' },
  { to: '/admin',       label: 'Admin' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const { participants, currentParticipant, setCurrentParticipant, config } = useApp()

  return (
    <header className="bg-green-900 border-b border-green-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between py-3 gap-4">
          <Link to="/" className="text-white font-bold text-xl flex items-center gap-2 shrink-0">
            <span className="text-2xl">⚽</span>
            <span className="hidden sm:inline">{config.name}</span>
          </Link>

          {/* Selector de participante */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-green-300 text-sm hidden sm:inline shrink-0">Jugador:</span>
            <select
              value={currentParticipant?.id || ''}
              onChange={e => setCurrentParticipant(e.target.value || null)}
              className="bg-green-800 border border-green-700 text-white text-sm rounded px-2 py-1 max-w-[160px] truncate"
            >
              <option value="">— Sin seleccionar —</option>
              {participants.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {!currentParticipant && (
              <Link
                to="/registro"
                className="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded shrink-0"
              >
                Unirse
              </Link>
            )}
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex gap-1 pb-1 overflow-x-auto scrollbar-hide">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`px-3 py-1.5 rounded-t text-sm font-medium whitespace-nowrap transition-colors ${
                pathname === to
                  ? 'bg-gray-950 text-green-400'
                  : 'text-green-200 hover:text-white hover:bg-green-800'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
