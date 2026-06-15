import { useEffect, useRef, useState } from 'react'
import { LAppSubdelegate } from '../live2d/lappsubdelegate'
import * as LAppDefine from '../live2d/lappdefine'
import { LAppPal } from '../live2d/lapppal'
import { CubismFramework, Option } from '../live2d/framework/live2dcubismframework'

let frameworkInitialized = false

export default function Live2DDigitalHuman() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const subdelegateRef = useRef<LAppSubdelegate | null>(null)
  const animFrameRef = useRef(0)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false

    try {
      // Initialize Cubism Framework (once globally)
      if (!frameworkInitialized) {
        LAppPal.updateTime()
        const option = new Option()
        option.logFunction = LAppPal.printMessage
        option.loggingLevel = LAppDefine.CubismLoggingLevel
        CubismFramework.startUp(option)
        CubismFramework.initialize()
        frameworkInitialized = true
      }

      // Create and initialize subdelegate
      const subdelegate = new LAppSubdelegate()
      if (!subdelegate.initialize(canvas)) {
        throw new Error('Failed to initialize Live2D')
      }
      subdelegateRef.current = subdelegate

      // Render loop
      const loop = () => {
        if (cancelled) return
        LAppPal.updateTime()
        subdelegate.update()
        animFrameRef.current = requestAnimationFrame(loop)
      }
      loop()

      // Hide loading after short delay
      const timer = setTimeout(() => setLoading(false), 1500)
      return () => {
        cancelled = true
        clearTimeout(timer)
        cancelAnimationFrame(animFrameRef.current)
        subdelegate.release()
        subdelegateRef.current = null
      }
    } catch (err) {
      console.error('Live2D initialization error:', err)
      setError(true)
      setLoading(false)
    }
  }, [])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
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
        <p className="text-white/60 text-sm mt-4">3D渲染不可用</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-12 h-12 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ background: 'transparent' }}
      />
    </div>
  )
}
