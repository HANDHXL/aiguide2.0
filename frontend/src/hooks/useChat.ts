import { useState, useCallback } from 'react'
import type { Message, SourceDoc } from '../types'
import { api } from '../api'

let msgId = 0
function nextId() {
  return `msg-${Date.now()}-${++msgId}`
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  const sendMessage = useCallback(async (question: string, interest?: string) => {
    const userMsg: Message = {
      id: nextId(), role: 'user', content: question, timestamp: Date.now()
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const data = await api.chat({ question, interest })
      const aiMsg: Message = {
        id: nextId(),
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, aiMsg])
    } catch (err: any) {
      const errorMsg: Message = {
        id: nextId(),
        role: 'assistant',
        content: `抱歉，请求出错了：${err.message}。请确保后端服务已启动。`,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }, [])

  const addMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg])
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return { messages, loading, sendMessage, addMessage, clearMessages }
}
