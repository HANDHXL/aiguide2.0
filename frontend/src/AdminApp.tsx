import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import AdminDashboard from './pages/AdminDashboard'
import LoginPage from './pages/LoginPage'
import ProtectedRoute from './components/auth/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'

export default function AdminApp() {
  return (
    <AuthProvider>
      <Layout appType="admin">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}
