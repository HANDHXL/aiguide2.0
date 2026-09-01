import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import TouristChat from './pages/TouristChat'
import MapPage from './pages/MapPage'
import MotionTest from './pages/MotionTest'
import LoginPage from './pages/LoginPage'
import ProtectedRoute from './components/auth/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'

export default function App() {
  return (
    <AuthProvider>
      <Layout appType="tourist">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><TouristChat /></ProtectedRoute>} />
          <Route path="/map" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
          <Route path="/motions" element={<MotionTest />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}
