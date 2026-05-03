import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

// Layout principal con navbar y área de contenido
export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
      <footer className="text-center text-xs text-gray-400 py-4 border-t border-gray-200">
        GraduaciónApp © {new Date().getFullYear()}
      </footer>
    </div>
  )
}
