import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface LayoutProps {
  children: ReactNode
  appType?: 'tourist' | 'admin'
}

export default function Layout({ children, appType = 'tourist' }: LayoutProps) {
  const navigate = useNavigate()
  const { user, isAuthenticated, logout } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-gray-950 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-gray-950 font-bold text-sm">
              灵
            </div>
            <h1 className="text-lg font-semibold tracking-wide">
              {appType === 'admin' ? '管理后台' : 'AI数字人导游 · 灵山胜境'}
            </h1>
          </div>
          <nav className="flex gap-1 text-sm items-center">
            {isAuthenticated && (
              <div className="flex items-center gap-3">
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
