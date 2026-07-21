import { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function Login() {
  const { pollas, allParticipants, loginParticipant, loginAdmin, config } = useApp()

  const [tab, setTab]           = useState('participante')

  // Participante
  const [pollaId, setPollaId]           = useState(pollas[0]?.id || '')
  const [participantId, setParticipantId] = useState('')
  const [pin, setPin]                   = useState('')
  const [loginError, setLoginError]     = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Admin
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)

  const pollaParticipants = allParticipants.filter(p => p.polla_id === pollaId)

  async function handleParticipantLogin(e) {
    e.preventDefault()
    if (!participantId || pin.length !== 4) return
    setLoginLoading(true)
    setLoginError('')
    const ok = await loginParticipant(participantId, pin)
    if (!ok) setLoginError('PIN incorrecto. Verifica con el administrador.')
    setLoginLoading(false)
  }

  async function handleAdminLogin(e) {
    e.preventDefault()
    if (!email || !password) return
    setAdminLoading(true)
    setAdminError('')
    const ok = await loginAdmin(email, password)
    if (!ok) setAdminError('Credenciales incorrectas o sin permisos de administrador.')
    setAdminLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo / Hero */}
        <div className="text-center">
          <div className="text-7xl mb-4">⚽</div>
          <h1 className="text-3xl font-bold text-black">{config?.name || 'Polla Mundial'}</h1>
          <p className="text-green-700 mt-1 text-sm">
            {config?.tournamentName} {config?.year}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xl">

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => { setTab('participante'); setLoginError('') }}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                tab === 'participante'
                  ? 'bg-gray-100 text-green-600 border-b-2 border-green-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              👤 Participante
            </button>
            <button
              onClick={() => { setTab('admin'); setAdminError('') }}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                tab === 'admin'
                  ? 'bg-gray-100 text-green-600 border-b-2 border-green-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🔒 Administrador
            </button>
          </div>

          {/* Tab: Participante */}
          {tab === 'participante' && (
            <form onSubmit={handleParticipantLogin} className="p-6 space-y-4">
              {/* Polla */}
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block font-medium">
                  1. Selecciona tu polla
                </label>
                <select
                  value={pollaId}
                  onChange={e => {
                    setPollaId(e.target.value)
                    setParticipantId('')
                    setPin('')
                    setLoginError('')
                  }}
                  className="w-full bg-gray-100 border border-gray-300 text-black rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-600"
                >
                  <option value="">— Seleccionar polla —</option>
                  {pollas.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Nombre */}
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block font-medium">
                  2. Selecciona tu nombre
                </label>
                <select
                  value={participantId}
                  onChange={e => { setParticipantId(e.target.value); setPin(''); setLoginError('') }}
                  disabled={!pollaId}
                  className="w-full bg-gray-100 border border-gray-300 text-black rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">— Seleccionar nombre —</option>
                  {pollaParticipants.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {pollaId && pollaParticipants.length === 0 && (
                  <p className="text-yellow-600 text-xs mt-1">
                    No hay participantes en esta polla aún.
                  </p>
                )}
              </div>

              {/* PIN */}
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block font-medium">
                  3. Ingresa tu PIN de 4 dígitos
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={e => {
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                    setLoginError('')
                  }}
                  disabled={!participantId}
                  placeholder="••••"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  className="w-full bg-gray-100 border border-gray-300 text-black rounded-lg px-3 py-3 text-center text-3xl tracking-[1em] font-bold focus:outline-none focus:border-green-600 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>

              {loginError && (
                <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-2.5 text-red-700 text-sm text-center">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading || !participantId || pin.length !== 4}
                className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors text-sm"
              >
                {loginLoading ? 'Verificando...' : 'Ingresar →'}
              </button>
            </form>
          )}

          {/* Tab: Admin */}
          {tab === 'admin' && (
            <form onSubmit={handleAdminLogin} className="p-6 space-y-4">
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block font-medium">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setAdminError('') }}
                  placeholder="admin@ejemplo.com"
                  autoComplete="email"
                  className="w-full bg-gray-100 border border-gray-300 text-black rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-600"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block font-medium">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setAdminError('') }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-gray-100 border border-gray-300 text-black rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-600"
                />
              </div>

              {adminError && (
                <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-2.5 text-red-700 text-sm text-center">
                  {adminError}
                </div>
              )}

              <button
                type="submit"
                disabled={adminLoading || !email || !password}
                className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors text-sm"
              >
                {adminLoading ? 'Autenticando...' : 'Acceder como Admin →'}
              </button>

              <p className="text-xs text-gray-300 text-center">
                Acceso restringido. Requiere cuenta en Supabase Auth y correo autorizado.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
