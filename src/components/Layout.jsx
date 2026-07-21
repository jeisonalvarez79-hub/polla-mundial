import Navbar from './Navbar'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-gray-200 text-center text-gray-500 text-xs py-4">
        Polla Mundial — todos los pronósticos se guardan localmente en tu navegador
      </footer>
    </div>
  )
}
