import React, { useRef, useState, useEffect, Suspense, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useFayDigitalHuman, MouthTarget } from '../hooks/useFayDigitalHuman'

const GREETINGS = [
  '您好！欢迎来到灵山胜境！',
  '我是您的AI导游小灵，请问有什么可以帮您？',
  '您可以问我关于景点历史、文化故事、游览路线等问题。',
]

function AvatarScene({ isSpeaking, mouthTarget }: { isSpeaking: boolean; mouthTarget: MouthTarget }) {
  const groupRef = useRef<THREE.Group>(null!)
  const upperLipRef = useRef<THREE.Mesh>(null!)
  const lowerLipRef = useRef<THREE.Mesh>(null!)
  const leftEyelidRef = useRef<THREE.Mesh>(null!)
  const rightEyelidRef = useRef<THREE.Mesh>(null!)
  const headRef = useRef<THREE.Group>(null!)
  const blinkTimer = useRef(2 + Math.random())
  const blinkStage = useRef(0)
  const blinkT = useRef(0)
  const targetLip = useRef({ upper: 0, lower: 0, width: 1 })
  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f5d5c0', roughness: 0.38, metalness: 0.02,
  }), [])
  const lipMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c9706a', roughness: 0.3, metalness: 0.05,
  }), [])
  const hairMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a1525', roughness: 0.35, metalness: 0.08,
  }), [])

  useFrame((_, delta) => {
    const t = performance.now() * 0.001

    // Smooth mouth target following
    const mt = targetLip.current
    const lerp = delta * 16
    mt.upper += (mouthTarget.upper - mt.upper) * lerp
    mt.lower += (mouthTarget.lower - mt.lower) * lerp
    mt.width += (mouthTarget.width - mt.width) * lerp

    if (upperLipRef.current) {
      upperLipRef.current.rotation.x = mt.upper
      upperLipRef.current.scale.x = mt.width
    }
    if (lowerLipRef.current) {
      lowerLipRef.current.rotation.x = mt.lower
      lowerLipRef.current.scale.x = mt.width
    }

    // Blink
    blinkTimer.current -= delta
    if (blinkStage.current === 0) {
      if (blinkTimer.current <= 0) { blinkStage.current = 1; blinkT.current = 0 }
    } else if (blinkStage.current === 1) {
      blinkT.current += delta * 10
      if (blinkT.current >= 1) { blinkStage.current = 2; blinkT.current = 1; blinkTimer.current = 0.05 }
    } else if (blinkStage.current === 2) {
      if (blinkTimer.current <= 0) { blinkStage.current = 3; blinkT.current = 1 }
    } else if (blinkStage.current === 3) {
      blinkT.current -= delta * 10
      if (blinkT.current <= 0) { blinkStage.current = 0; blinkTimer.current = 1.8 + Math.random() * 3 }
    }
    const blink = blinkStage.current === 0 ? 0 : blinkStage.current === 2 ? 1 : blinkT.current

    if (leftEyelidRef.current) {
      leftEyelidRef.current.scale.y = 1 - blink * 0.92
    }
    if (rightEyelidRef.current) {
      rightEyelidRef.current.scale.y = 1 - blink * 0.92
    }

    // Head sway + speaking energy
    if (headRef.current) {
      const amp = isSpeaking ? 0.05 : 0.02
      const freq = isSpeaking ? 1.8 : 1.0
      headRef.current.position.y = Math.sin(t * freq) * amp
      headRef.current.rotation.y = Math.sin(t * 0.7) * (isSpeaking ? 0.08 : 0.04)
      headRef.current.rotation.x = Math.sin(t * 1.2 + 1) * (isSpeaking ? 0.04 : 0.015)
    }
  })

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} color="#fff5f0" />
      <directionalLight position={[-3, 2, 2]} intensity={0.5} color="#ffe0d0" />
      <pointLight position={[-2, 3, 3]} intensity={0.5} color="#fbbf24" />
      <pointLight position={[2, 0, 3]} intensity={0.4} color="#f59e0b" />
      <spotLight position={[0, 6, 2]} intensity={0.6} angle={0.4} penumbra={0.5} color="#ffffff" />

      <group ref={headRef}>
        {/* Neck */}
        <mesh position={[0, -0.28, 0]}>
          <cylinderGeometry args={[0.14, 0.17, 0.32, 24]} />
          <meshStandardMaterial color="#e8c4a2" roughness={0.55} metalness={0.04} />
        </mesh>

        {/* Body / shoulders */}
        <mesh position={[0, -0.52, 0.02]}>
          <sphereGeometry args={[0.44, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.38]} />
          <meshStandardMaterial color="#f0d5b8" roughness={0.55} metalness={0.03} />
        </mesh>

        {/* Outfit */}
        <mesh position={[0, -0.46, 0.06]}>
          <sphereGeometry args={[0.46, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.35]} />
          <meshStandardMaterial color="#2d2d4a" roughness={0.45} metalness={0.12} />
        </mesh>
        {/* Collar */}
        <mesh position={[0, -0.28, 0.16]}>
          <torusGeometry args={[0.2, 0.035, 8, 28, Math.PI]} />
          <meshStandardMaterial color="#e8d5b7" roughness={0.35} metalness={0.18} />
        </mesh>
        {/* Brooch badge */}
        <mesh position={[0, -0.32, 0.18]}>
          <circleGeometry args={[0.04, 16]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.2} metalness={0.6} emissive="#fbbf24" emissiveIntensity={0.3} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.27, 52, 52, 0, Math.PI * 2, 0, Math.PI * 0.78]} />
          <primitive object={skinMat} attach="material" />
        </mesh>
        {/* Chin / jaw fill */}
        <mesh position={[0, -0.02, -0.05]}>
          <sphereGeometry args={[0.255, 36, 36, 0, Math.PI * 2, 0, Math.PI * 0.43]} />
          <primitive object={skinMat} attach="material" />
        </mesh>

        {/* Hair — back dome */}
        <mesh position={[0, 0.13, -0.06]}>
          <sphereGeometry args={[0.29, 44, 44, 0, Math.PI * 2, 0.25, Math.PI * 0.7]} />
          <meshStandardMaterial color="#1a1525" roughness={0.3} metalness={0.1} />
        </mesh>
        {/* Hair — top dome */}
        <mesh position={[0, 0.26, -0.04]} scale={[1, 0.55, 1]}>
          <sphereGeometry args={[0.27, 44, 24]} />
          <primitive object={hairMat} attach="material" />
        </mesh>
        {/* Hair — front bangs */}
        <mesh position={[0, 0.31, 0.2]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.38, 0.06, 0.14]} />
          <primitive object={hairMat} attach="material" />
        </mesh>
        {/* Hair — left side */}
        <mesh position={[-0.26, 0.05, 0]} rotation={[0, 0, 0.25]}>
          <boxGeometry args={[0.05, 0.22, 0.08]} />
          <primitive object={hairMat} attach="material" />
        </mesh>
        {/* Hair — right side */}
        <mesh position={[0.26, 0.05, 0]} rotation={[0, 0, -0.25]}>
          <boxGeometry args={[0.05, 0.22, 0.08]} />
          <primitive object={hairMat} attach="material" />
        </mesh>

        {/* Eyes — whites */}
        <mesh position={[-0.08, 0.07, 0.24]}>
          <sphereGeometry args={[0.048, 24, 24]} />
          <meshStandardMaterial color="#ffffff" roughness={0.05} />
        </mesh>
        <mesh position={[0.08, 0.07, 0.24]}>
          <sphereGeometry args={[0.048, 24, 24]} />
          <meshStandardMaterial color="#ffffff" roughness={0.05} />
        </mesh>
        {/* Irises */}
        <mesh position={[-0.08, 0.07, 0.28]}>
          <sphereGeometry args={[0.026, 20, 20]} />
          <meshStandardMaterial color="#3a2818" roughness={0.15} />
        </mesh>
        <mesh position={[0.08, 0.07, 0.28]}>
          <sphereGeometry args={[0.026, 20, 20]} />
          <meshStandardMaterial color="#3a2818" roughness={0.15} />
        </mesh>
        {/* Pupils */}
        <mesh position={[-0.08, 0.07, 0.295]}>
          <sphereGeometry args={[0.013, 12, 12]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        <mesh position={[0.08, 0.07, 0.295]}>
          <sphereGeometry args={[0.013, 12, 12]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        {/* Iris highlights */}
        <mesh position={[-0.074, 0.08, 0.30]}>
          <sphereGeometry args={[0.006, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.086, 0.08, 0.30]}>
          <sphereGeometry args={[0.006, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>

        {/* Eyelids */}
        <mesh ref={leftEyelidRef} position={[-0.08, 0.07, 0.24]}>
          <sphereGeometry args={[0.051, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
          <meshStandardMaterial color="#ecc8a8" roughness={0.5} metalness={0.03} />
        </mesh>
        <mesh ref={rightEyelidRef} position={[0.08, 0.07, 0.24]}>
          <sphereGeometry args={[0.051, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
          <meshStandardMaterial color="#ecc8a8" roughness={0.5} metalness={0.03} />
        </mesh>

        {/* Eyebrows */}
        <mesh position={[-0.08, 0.12, 0.23]} rotation={[0, 0, 0.1]}>
          <boxGeometry args={[0.095, 0.014, 0.03]} />
          <meshStandardMaterial color="#1a1008" roughness={0.55} />
        </mesh>
        <mesh position={[0.08, 0.12, 0.23]} rotation={[0, 0, -0.1]}>
          <boxGeometry args={[0.095, 0.014, 0.03]} />
          <meshStandardMaterial color="#1a1008" roughness={0.55} />
        </mesh>

        {/* Nose base */}
        <mesh position={[0, -0.01, 0.26]}>
          <sphereGeometry args={[0.028, 16, 16]} />
          <meshStandardMaterial color="#ecc8a8" roughness={0.5} metalness={0.03} />
        </mesh>
        {/* Nose bridge */}
        <mesh position={[0, 0.04, 0.25]} scale={[0.036, 0.08, 0.036]}>
          <sphereGeometry args={[1, 20, 10]} />
          <meshStandardMaterial color="#ecc8a8" roughness={0.5} metalness={0.03} />
        </mesh>

        {/* Upper lip */}
        <mesh ref={upperLipRef} position={[0, -0.04, 0.26]}>
          <boxGeometry args={[0.065, 0.018, 0.022]} />
          <primitive object={lipMat} attach="material" />
        </mesh>
        {/* Lower lip */}
        <mesh ref={lowerLipRef} position={[0, -0.055, 0.26]}>
          <boxGeometry args={[0.065, 0.018, 0.022]} />
          <primitive object={lipMat} attach="material" />
        </mesh>

        {/* Ears */}
        <mesh position={[-0.26, 0.05, 0]} rotation={[0, 0, -0.15]}>
          <sphereGeometry args={[0.058, 20, 14, 0, Math.PI, 0, Math.PI]} />
          <meshStandardMaterial color="#e8c4a2" roughness={0.5} metalness={0.03} />
        </mesh>
        <mesh position={[0.26, 0.05, 0]} rotation={[0, 0, 0.15]}>
          <sphereGeometry args={[0.058, 20, 14, 0, Math.PI, 0, Math.PI]} />
          <meshStandardMaterial color="#e8c4a2" roughness={0.5} metalness={0.03} />
        </mesh>

        {/* Tour guide earpiece */}
        <mesh position={[-0.2, -0.12, 0.2]} rotation={[0, 0, 0.1]}>
          <torusGeometry args={[0.04, 0.008, 8, 16]} />
          <meshStandardMaterial color="#222" roughness={0.15} metalness={0.8} />
        </mesh>
        <mesh position={[-0.2, -0.24, 0.16]}>
          <cylinderGeometry args={[0.006, 0.006, 0.12, 8]} />
          <meshStandardMaterial color="#333" roughness={0.2} metalness={0.7} />
        </mesh>
      </group>
    </>
  )
}

function LoadingDots() {
  const ref = useRef<THREE.Group>(null!)
  useFrame((_, delta) => { ref.current.rotation.y += delta * 1.2 })
  return (
    <group ref={ref}>
      <mesh>
        <torusGeometry args={[0.4, 0.04, 8, 32]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.3} metalness={0.5} />
      </mesh>
    </group>
  )
}

export default function DigitalHuman() {
  const [greeting, setGreeting] = useState(0)
  const [error, setError] = useState(false)
  const { isSpeaking, mouthTarget, currentText, connected } = useFayDigitalHuman()

  useEffect(() => {
    const timer = setInterval(() => {
      setGreeting(prev => (prev + 1) % GREETINGS.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const displayText = currentText || GREETINGS[greeting]

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <div className="relative mb-2 w-full h-64">
        {error ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-orange-400 flex items-center justify-center shadow-2xl">
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-indigo-800 to-purple-700 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-20 h-20">
                  <circle cx="50" cy="45" r="30" fill="#fbbf24" opacity="0.3" />
                  <ellipse cx="40" cy="40" rx="5" ry="6" fill="#e2e8f0" />
                  <ellipse cx="60" cy="40" rx="5" ry="6" fill="#e2e8f0" />
                  <circle cx="50" cy="55" r="8" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <ErrorCatcher onError={() => setError(true)}>
            <Canvas
              camera={{ position: [0, 0.05, 1.8], fov: 32 }}
              gl={{ antialias: true, alpha: true }}
              style={{ background: 'transparent' }}
            >
              <Suspense fallback={<LoadingDots />}>
                <AvatarScene isSpeaking={isSpeaking} mouthTarget={mouthTarget} />
              </Suspense>
            </Canvas>
          </ErrorCatcher>
        )}
      </div>

      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-white text-lg font-medium">小灵</h3>
        {connected && (
          <span className="w-2 h-2 rounded-full bg-green-400" title="已连接Fay服务器" />
        )}
      </div>
      <p className="text-white/60 text-sm mb-3">AI智能导游</p>

      <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 text-center text-white/90 text-sm max-w-[220px] transition-all duration-500 min-h-[48px]">
        {displayText}
      </div>

      {isSpeaking && (
        <div className="mt-4 flex items-center gap-1">
          <span className="w-1.5 h-4 bg-amber-400 rounded-full animate-pulse" />
          <span className="w-1.5 h-6 bg-amber-400 rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
          <span className="w-1.5 h-3 bg-amber-400 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
          <span className="text-white/60 text-xs ml-2">正在讲解...</span>
        </div>
      )}
    </div>
  )
}

class ErrorCatcher extends React.Component<{
  children: React.ReactNode
  onError: () => void
}> {
  componentDidCatch(err: Error) {
    console.error('3D Error:', err)
    this.props.onError()
  }
  render() {
    return this.props.children as React.ReactElement
  }
}
