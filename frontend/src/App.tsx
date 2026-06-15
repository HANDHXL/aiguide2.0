import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import TouristChat from './pages/TouristChat'
import AdminDashboard from './pages/AdminDashboard'
import MotionTest from './pages/MotionTest'
import LoginPage from './pages/LoginPage'
import ProtectedRoute from './components/auth/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><TouristChat /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="/motions" element={<MotionTest />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}
