import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, isAuthenticated, logout } = useAuth()
  const isAdmin = pathname.startsWith('/admin')
  const isLogin = pathname === '/login'

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-900 via-purple-800 to-indigo-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-indigo-900 font-bold text-sm">
              灵
            </div>
            <h1 className="text-lg font-semibold tracking-wide">
              AI数字人导游 · 灵山胜境
            </h1>
          </div>
          <nav className="flex gap-1 text-sm items-center">
            {!isLogin && (
              <>
                <Link
                  to="/"
                  className={`px-4 py-1.5 rounded-lg transition-colors ${
                    !isAdmin ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white'
                  }`}
                >
                  游客端
                </Link>
                <Link
                  to="/admin"
                  className={`px-4 py-1.5 rounded-lg transition-colors ${
                    isAdmin ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white'
                  }`}
                >
                  管理后台
                </Link>
              </>
            )}
            {isAuthenticated && (
              <div className="flex items-center gap-3 ml-3 pl-3 border-l border-white/20">
                <span className="text-xs text-white/70">{user?.username}</span>
                <button
                  onClick={() => { logout(); navigate('/login') }}
                  className="text-xs text-white/50 hover:text-white transition-colors"
                >
                  退出
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
