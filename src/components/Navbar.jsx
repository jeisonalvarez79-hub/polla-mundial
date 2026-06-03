import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const NAV_LINKS = [
  { to: '/',            label: 'Inicio' },
  { to: '/registro',    label: 'Participantes' },
  { to: '/pronosticos', label: 'Pronósticos' },
  { to: '/bracket',     label: 'Llaves' },
  { to: '/tabla',       label: 'Tabla' },
  { to: '/admin',       label: 'Admin', adminOnly: true },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const {
    config, isAdmin, currentParticipant, logout,
    pollas, currentPollaId, setCurrentPolla,
    pendingSyncCount, syncPendingCache, refreshData,
  } = useApp()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await refreshData()
    setRefreshing(false)
  }

  const currentPolla = pollas.find(p => p.id === currentPollaId)

  return (
    <header className="bg-green-900 border-b border-green-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">

        {/* Top bar */}
        <div className="flex items-center justify-between py-3 gap-3 flex-wrap">

          {/* Logo */}
          <Link to="/" className="text-white font-bold text-xl flex items-center gap-2 shrink-0">
            <span className="text-2xl">⚽</span>
            <span className="hidden sm:inline">{config.name}</span>
          </Link>

          {/* Usuario + polla + salir */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Polla */}
            {isAdmin && pollas.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-green-400 text-xs hidden sm:inline font-semibold">Polla:</span>
                <select
                  value={currentPollaId || ''}
                  onChange={e => setCurrentPolla(e.target.value)}
                  className="bg-green-800 border border-green-600 text-white text-xs rounded px-2 py-1 max-w-[130px] font-medium focus:outline-none"
                >
                  {pollas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            ) : currentPolla ? (
              <span className="text-xs bg-green-800 border border-green-700 text-green-200 px-2 py-1 rounded font-medium max-w-[120px] truncate">
                {currentPolla.name}
              </span>
            ) : null}

            {/* Badge de rol */}
            {isAdmin ? (
              <span className="flex items-center gap-1 bg-yellow-900/50 border border-yellow-700 text-yellow-300 text-xs font-semibold px-2.5 py-1 rounded-full">
                🔒 Admin
              </span>
            ) : currentParticipant ? (
              <span className="flex items-center gap-1 bg-green-800/60 border border-green-700 text-green-200 text-xs font-semibold px-2.5 py-1 rounded-full max-w-[140px] truncate">
                👤 {currentParticipant.name}
              </span>
            ) : null}

            {/* Indicador de sincronización pendiente */}
            {pendingSyncCount > 0 && (
              <button
                onClick={syncPendingCache}
                title={`${pendingSyncCount} pronóstico(s) pendiente(s) de guardar en la nube. Toca para reintentar.`}
                className="flex items-center gap-1.5 text-xs bg-yellow-900/60 border border-yellow-600 text-yellow-300 hover:bg-yellow-800/60 px-2.5 py-1 rounded transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
                <span className="hidden sm:inline">{pendingSyncCount} pendiente{pendingSyncCount !== 1 ? 's' : ''}</span>
                <span className="sm:hidden">!</span>
              </button>
            )}

            {/* Actualizar datos */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Recargar datos desde la nube"
              className="text-xs text-green-300 hover:text-white border border-green-700 hover:border-green-500 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
            >
              {refreshing ? '...' : '↻'}
            </button>

            {/* Salir */}
            <button
              onClick={logout}
              className="text-xs text-green-300 hover:text-white border border-green-700 hover:border-green-500 px-2.5 py-1 rounded transition-colors"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex gap-1 pb-1 overflow-x-auto scrollbar-hide">
          {NAV_LINKS.filter(l => !l.adminOnly || isAdmin).map(({ to, label }) => (
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
