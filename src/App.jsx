import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Registro from './pages/Registro'
import Pronosticos from './pages/Pronosticos'
import Bracket from './pages/Bracket'
import Tabla from './pages/Tabla'
import Admin from './pages/Admin'

function AppContent() {
  const { loading } = useApp()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-7xl mb-4 animate-bounce">⚽</div>
          <p className="text-white text-2xl font-bold">Polla Mundial</p>
          <p className="text-gray-400 mt-3">Cargando datos...</p>
          <div className="mt-4 flex justify-center gap-1">
            {[0,1,2].map(i => (
              <div key={i}
                className="w-2 h-2 bg-green-500 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"            element={<Home />} />
          <Route path="/registro"    element={<Registro />} />
          <Route path="/pronosticos" element={<Pronosticos />} />
          <Route path="/bracket"     element={<Bracket />} />
          <Route path="/tabla"       element={<Tabla />} />
          <Route path="/admin"       element={<Admin />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
