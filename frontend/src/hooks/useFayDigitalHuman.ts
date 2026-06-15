import { useRef, useState, useEffect, useCallback } from 'react'

interface VisemeItem {
  Lip: string
  Time: number // ms
}

interface FayMessage {
  Topic?: string
  Data?: {
    Key?: string
    HttpValue?: string
    Value?: string
    Text?: string
    Lips?: VisemeItem[]
    IsFirst?: number
    IsEnd?: number
  }
}

const FAY_WS_URL = 'ws://127.0.0.1:10002'

// OVR LipSync viseme → mouth animation parameters
const visemeMap: Record<string, { upper: number; lower: number; width: number }> = {
  sil: { upper: 0.0, lower: 0.0, width: 1.0 },
  PP: { upper: 0.02, lower: -0.03, width: 0.85 },
  FF: { upper: 0.04, lower: -0.06, width: 0.85 },
  TH: { upper: 0.03, lower: -0.04, width: 0.75 },
  DD: { upper: 0.05, lower: -0.07, width: 0.8 },
  kk: { upper: 0.04, lower: -0.08, width: 0.65 },
  CH: { upper: 0.06, lower: -0.1, width: 0.55 },
  SS: { upper: 0.05, lower: -0.06, width: 0.7 },
  nn: { upper: 0.03, lower: -0.04, width: 0.9 },
  RR: { upper: 0.06, lower: -0.09, width: 0.75 },
  aa: { upper: 0.08, lower: -0.12, width: 1.0 },
  E: { upper: 0.03, lower: -0.06, width: 1.2 },
  ih: { upper: 0.04, lower: -0.05, width: 1.1 },
  oh: { upper: 0.06, lower: -0.1, width: 0.65 },
  ou: { upper: 0.02, lower: -0.07, width: 0.45 },
}

export interface MouthTarget {
  upper: number
  lower: number
  width: number
}

export function useFayDigitalHuman() {
  const wsRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const visemeTimeline = useRef<VisemeItem[]>([])
  const visemeStartTime = useRef(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [mouthTarget, setMouthTarget] = useState<MouthTarget>(visemeMap.sil)
  const [currentText, setCurrentText] = useState('')
  const [connected, setConnected] = useState(false)
  const rafRef = useRef(0)

  // Drive viseme animation based on audio playback position
  const driveViseme = useCallback(() => {
    const audio = audioRef.current
    const timeline = visemeTimeline.current

    if (!audio || audio.paused || timeline.length === 0) {
      // Audio ended or no viseme data
      if (!audio || audio.ended) {
        setIsSpeaking(false)
        setMouthTarget(visemeMap.sil)
      }
      rafRef.current = requestAnimationFrame(driveViseme)
      return
    }

    setIsSpeaking(true)
    const elapsed = (performance.now() - visemeStartTime.current)
    let accum = 0
    let currentViseme = 'sil'

    for (const v of timeline) {
      accum += v.Time
      if (elapsed <= accum) {
        currentViseme = v.Lip
        break
      }
    }

    // If we've passed all visemes, use sil
    if (elapsed > accum) {
      currentViseme = 'sil'
    }

    setMouthTarget(visemeMap[currentViseme] || visemeMap.sil)
    rafRef.current = requestAnimationFrame(driveViseme)
  }, [])

  useEffect(() => {
    const ws = new WebSocket(FAY_WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      // Register as digital human client
      ws.send(JSON.stringify({ Username: 'User', Output: true }))
    }

    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (event) => {
      try {
        const msg: FayMessage = JSON.parse(event.data)

        if (msg.Topic !== 'human') return
        if (!msg.Data) return

        const data = msg.Data

        // Handle text-only messages
        if (data.Key === 'log' || data.Key === 'text') {
          if (data.Text) setCurrentText(data.Text)
          return
        }

        // Handle audio messages
        if (data.Key === 'audio' && data.HttpValue) {
          const audioUrl = data.HttpValue
          const lips = data.Lips || []
          const text = data.Text || ''

          if (text) setCurrentText(text)

          // Play audio
          if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current = null
          }

          const audio = new Audio(audioUrl)
          audioRef.current = audio
          visemeTimeline.current = lips

          audio.onplay = () => {
            visemeStartTime.current = performance.now()
            setIsSpeaking(true)
            rafRef.current = requestAnimationFrame(driveViseme)
          }

          audio.onended = () => {
            setIsSpeaking(false)
            setMouthTarget(visemeMap.sil)
            cancelAnimationFrame(rafRef.current)
          }

          audio.onerror = () => {
            setIsSpeaking(false)
            setMouthTarget(visemeMap.sil)
          }

          audio.play().catch(() => {
            setIsSpeaking(false)
          })
        }
      } catch {
        // Ignore parse errors
      }
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      ws.close()
      wsRef.current = null
    }
  }, [driveViseme])

  return { isSpeaking, mouthTarget, currentText, connected }
}
