import { useRef, useCallback, useState } from 'react'

type WSCallback = (data: any) => void

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const callbacksRef = useRef<Map<string, WSCallback>>(new Map())

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = localStorage.getItem('auth_token')
    const tokenParam = token ? `?token=${token}` : ''
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws${tokenParam}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        callbacksRef.current.forEach((cb) => cb(data))
      } catch {}
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
  }, [])

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    } else {
      // Auto-connect and queue
      connect()
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(data))
        }
      }, 500)
    }
  }, [connect])

  const onMessage = useCallback((key: string, cb: WSCallback) => {
    callbacksRef.current.set(key, cb)
    return () => { callbacksRef.current.delete(key) }
  }, [])

  return { connected, connect, disconnect, send, onMessage }
}
