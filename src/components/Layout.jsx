import Navbar from './Navbar'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-gray-800 text-center text-gray-600 text-xs py-4">
        Polla Mundial — todos los pronósticos se guardan localmente en tu navegador
      </footer>
    </div>
  )
}
