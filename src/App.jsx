import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Registro from './pages/Registro'
import Pronosticos from './pages/Pronosticos'
import Bracket from './pages/Bracket'
import Tabla from './pages/Tabla'
import Admin from './pages/Admin'

export default function App() {
  return (
    <AppProvider>
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
    </AppProvider>
  )
}
