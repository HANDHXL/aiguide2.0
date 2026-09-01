import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegister) {
        await register(username, password)
      } else {
        await login(username, password)
      }
      navigate('/')
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center bg-gray-50">
      <div className="stat-card w-full max-w-sm">
        <h2 className="text-lg font-semibold text-gray-800 text-center mb-6">
          {isRegister ? '注册账号' : '登录'}
        </h2>
        {error && (
          <div className="mb-4 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-700">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text" value={username} onChange={e => setUsername(e.target.value)}
            placeholder="用户名" required minLength={2}
            className="w-full h-10 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-500"
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="密码" required minLength={4}
            className="w-full h-10 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-500"
          />
          <button
            type="submit" disabled={loading}
            className="w-full h-10 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? '请稍候...' : isRegister ? '注册' : '登录'}
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">
          {isRegister ? '已有账号？' : '没有账号？'}
          <button onClick={() => setIsRegister(!isRegister)} className="text-primary-600 hover:underline ml-1">
            {isRegister ? '去登录' : '去注册'}
          </button>
        </p>
      </div>
    </div>
  )
}
