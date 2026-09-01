import { useState, useCallback, useRef, useEffect } from 'react'
import { useWebSocket } from './useWebSocket'
import { api } from '../api'
import type { Message } from '../types'
import { loadSettings, getTtsVoice, getPersonaPrompt } from '../utils/settings'
import { useMapStore } from '../stores/mapStore'

let msgId = Date.now()
function nextId() { return `msg-${++msgId}` }

export interface ChatEngineCallbacks {
  /** 开始作答（流式开始/发送消息时）——主页用于驱动数字人口型 */
  onStartSpeaking?: () => void
  /** 停止作答（出错时）——主页用于数字人闭嘴 */
  onStopSpeaking?: () => void
  /** 拿到完整回答文本——主页用数字人 TTS 播报，地图小窗用普通 audio 播报 */
  speak?: (text: string) => void
  /** 后端新建会话时回调——主页用于刷新会话列表 */
  onConversationCreated?: (id: number) => void
  /** 语音对话返回音频时回调 */
  playVoiceAudio?: (url: string) => void
}

/**
 * 聊天引擎：主页（含数字人）与地图页小窗（无数字人）共用同一套核心逻辑——
 * WebSocket 流式 + REST 兜底、语音对话、路线同步 mapStore、会话 ID 跨页共享。
 * 两处聊天功能完全一致，数字人表现（口型/TTS 播报）由回调注入。
 */
export function useChatEngine(callbacks: ChatEngineCallbacks = {}) {
  const cbRef = useRef(callbacks)
  cbRef.current = callbacks

  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationIdState] = useState<number | null>(null)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const streamingMsgRef = useRef<string | null>(null)
  const streamingTextRef = useRef('')

  const { connected, connect, send, onMessage } = useWebSocket()

  // 连接 WebSocket
  useEffect(() => { connect() }, [connect])

  // 加载指定会话的历史消息（同时恢复其中的路线到 mapStore，地图页据此绘图）
  const loadConversation = useCallback(async (id: number) => {
    setConversationIdState(id)
    try {
      const conv = await api.conversations.get(id)
      let restoredRoute = null
      const msgs = conv.messages.map(m => {
        if (m.route) restoredRoute = m.route
        return {
          id: `m-${m.id}`, role: m.role as 'user' | 'assistant',
          content: m.content, sources: m.sources || undefined,
          route: m.route || undefined,
          timestamp: new Date(m.created_at).getTime(),
        }
      })
      setMessages(msgs)
      if (restoredRoute) useMapStore.getState().setLatestRoute(restoredRoute)
    } catch { setMessages([]) }
  }, [])

  // 切换/新建会话：置空时同步清空消息
  const setConversationId = useCallback((id: number | null) => {
    setConversationIdState(id)
    if (id === null) setMessages([])
  }, [])

  // 监听流式消息
  useEffect(() => {
    return onMessage('stream', (data: any) => {
      if (data.type === 'status') {
        setLoading(true)
        cbRef.current.onStartSpeaking?.()
      } else if (data.type === 'conversation_id') {
        // 后端新建会话
        if (data.conversation_id && !conversationId) {
          setConversationIdState(data.conversation_id)
          cbRef.current.onConversationCreated?.(data.conversation_id)
        }
      } else if (data.type === 'token') {
        const streamId = streamingMsgRef.current
        if (streamId) {
          streamingTextRef.current += data.content
          setMessages(prev => prev.map(m =>
            m.id === streamId ? { ...m, content: m.content + data.content } : m
          ))
        }
      } else if (data.type === 'done') {
        const streamId = streamingMsgRef.current
        const finalText = streamingTextRef.current
        if (streamId) {
          setMessages(prev => prev.map(m =>
            m.id === streamId ? { ...m, sources: data.sources, route: data.route || undefined } : m
          ))
        }
        // 路线同步到地图页
        if (data.route) useMapStore.getState().setLatestRoute(data.route)
        streamingMsgRef.current = null
        streamingTextRef.current = ''
        setLoading(false)
        if (data.conversation_id) {
          setConversationIdState(data.conversation_id)
          cbRef.current.onConversationCreated?.(data.conversation_id)
        }
        if (finalText) cbRef.current.speak?.(finalText)
      } else if (data.type === 'error') {
        setMessages(prev => [...prev, {
          id: nextId(), role: 'assistant',
          content: `出错了：${data.message}`, timestamp: Date.now()
        }])
        streamingMsgRef.current = null
        setLoading(false)
        cbRef.current.onStopSpeaking?.()
      }
    })
  }, [onMessage, conversationId])

  // 发送消息：WebSocket 流式，未连接时 REST 兜底
  const handleSend = useCallback((text: string) => {
    const userMsg: Message = { id: nextId(), role: 'user', content: text, timestamp: Date.now() }
    const aiMsgId = nextId()
    const aiMsg: Message = { id: aiMsgId, role: 'assistant', content: '', timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg, aiMsg])
    streamingMsgRef.current = aiMsgId
    setLoading(true)
    cbRef.current.onStartSpeaking?.()

    if (connected) {
      const s = loadSettings()
      send({ question: text, conversation_id: conversationId, persona: getPersonaPrompt(s.style), name: s.name })
    } else {
      const s = loadSettings()
      api.chat({ question: text, conversation_id: conversationId, persona: getPersonaPrompt(s.style), name: s.name })
        .then(data => {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, content: data.answer, sources: data.sources, route: data.route } : m
          ))
          // 路线同步到地图页
          if (data.route) useMapStore.getState().setLatestRoute(data.route)
          streamingMsgRef.current = null
          setLoading(false)
          if (data.conversation_id) {
            setConversationIdState(data.conversation_id)
            cbRef.current.onConversationCreated?.(data.conversation_id)
          }
          if (data.answer) cbRef.current.speak?.(data.answer)
        })
        .catch(err => {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, content: `请求失败：${err.message}` } : m
          ))
          streamingMsgRef.current = null
          setLoading(false)
          cbRef.current.onStopSpeaking?.()
        })
    }
  }, [connected, send, conversationId])

  // 语音对话
  const handleVoice = useCallback(async (blob: Blob) => {
    setVoiceLoading(true)
    const userMsg: Message = { id: nextId(), role: 'user', content: '🎤 语音识别中...', timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    try {
      const result = await api.voiceChat(blob)
      setMessages(prev => [...prev,
        { id: nextId(), role: 'user', content: `🎤 ${result.question}`, timestamp: Date.now() },
        { id: nextId(), role: 'assistant', content: result.answer, sources: result.sources, timestamp: Date.now() }
      ])
      if (result.audio) {
        const binary = atob(result.audio)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
        cbRef.current.playVoiceAudio?.(url)
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: nextId(), role: 'assistant', content: `语音识别失败: ${err.message}`, timestamp: Date.now()
      }])
    } finally { setVoiceLoading(false) }
  }, [])

  // 同步当前对话 ID 到 mapStore，地图页小窗对话续用同一会话
  const setStoreConversationId = useMapStore(s => s.setConversationId)
  useEffect(() => { setStoreConversationId(conversationId) }, [conversationId, setStoreConversationId])

  // 地图页发起的提问（如景点「问 AI 讲解」）→ 自动发送
  const pendingQuestion = useMapStore(s => s.pendingQuestion)
  const setPendingQuestion = useMapStore(s => s.setPendingQuestion)
  useEffect(() => {
    if (pendingQuestion) {
      setPendingQuestion(null)
      handleSend(pendingQuestion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion])

  const isBusy = loading || voiceLoading

  return {
    messages, loading, voiceLoading, isBusy,
    conversationId, setConversationId, loadConversation,
    handleSend, handleVoice,
  }
}
