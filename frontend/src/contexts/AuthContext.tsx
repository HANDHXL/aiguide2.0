import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

interface UserInfo {
  user_id: number
  username: string
}

interface AuthState {
  token: string | null
  user: UserInfo | null
  isAuthenticated: boolean
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<UserInfo | null>(() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    // @ts-ignore set auth token on api module
    import('../api').then(m => m.api.setAuthToken(token))
  }, [token])

  const login = useCallback(async (username: string, password: string) => {
    const { api } = await import('../api')
    const data = await api.auth.login({ username, password })
    setToken(data.token)
    setUser({ user_id: data.user_id, username: data.username })
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify({ user_id: data.user_id, username: data.username }))
  }, [])

  const register = useCallback(async (username: string, password: string) => {
    const { api } = await import('../api')
    const data = await api.auth.register({ username, password })
    setToken(data.token)
    setUser({ user_id: data.user_id, username: data.username })
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify({ user_id: data.user_id, username: data.username }))
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated: !!token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
