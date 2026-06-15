import { useState, useCallback, useRef, useEffect } from 'react'
import Live2DDigitalHuman from '../components/Live2DDigitalHuman'
import ChatPanel from '../components/ChatPanel'
import ChatInput from '../components/ChatInput'
import RecommendBar from '../components/RecommendBar'
import ConversationSidebar from '../components/ConversationSidebar'
import { useRecommend } from '../hooks/useRecommend'
import { useWebSocket } from '../hooks/useWebSocket'
import { api } from '../api'
import type { Message, ConvSummary } from '../types'
import { loadSettings, getTtsVoice, getPersonaPrompt } from '../utils/settings'

let msgId = Date.now()
function nextId() { return `msg-${++msgId}` }

export default function TouristChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const { route, loading: routeLoading, getRecommendation } = useRecommend()
  const [voiceLoading, setVoiceLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamingMsgRef = useRef<string | null>(null)
  const streamingTextRef = useRef('')
  const speakingStartedRef = useRef(false)

  const { connected, connect, send, onMessage } = useWebSocket()

  // Helper: trigger Live2D speaking
  const triggerLive2DSpeak = () => {
    const model = (window as any).__live2dModel
    if (model && !speakingStartedRef.current) {
      speakingStartedRef.current = true
      model.triggerSpeakingStart()
    }
  }
  const triggerLive2DEnd = () => {
    const model = (window as any).__live2dModel
    if (model && speakingStartedRef.current) {
      speakingStartedRef.current = false
      model.triggerSpeakingEnd()
    }
  }

  // Connect WebSocket on mount
  useEffect(() => { connect() }, [connect])

  // Load conversations list
  const loadConversations = useCallback(async () => {
    try { setConversations(await api.conversations.list()) }
    catch { /* ignore */ }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Load messages when switching conversation
  useEffect(() => {
    if (conversationId === null) { setMessages([]); return }
    (async () => {
      try {
        const conv = await api.conversations.get(conversationId)
        setMessages(conv.messages.map(m => ({
          id: `m-${m.id}`, role: m.role as 'user' | 'assistant',
          content: m.content, sources: m.sources || undefined,
          timestamp: new Date(m.created_at).getTime(),
        })))
      } catch { setMessages([]) }
    })()
  }, [conversationId])

  // Listen for streaming tokens
  useEffect(() => {
    return onMessage('stream', (data: any) => {
      if (data.type === 'status') {
        setLoading(true)
        triggerLive2DSpeak()
      } else if (data.type === 'conversation_id') {
        // New conversation created by backend
        if (data.conversation_id && !conversationId) {
          setConversationId(data.conversation_id)
          loadConversations()
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
            m.id === streamId ? { ...m, sources: data.sources } : m
          ))
        }
        streamingMsgRef.current = null
        streamingTextRef.current = ''
        setLoading(false)
        // Update conversation_id from response
        if (data.conversation_id) {
          setConversationId(data.conversation_id)
          loadConversations()
        }
        if (finalText) {
          const model = (window as any).__live2dModel
          if (model) model.setSpeakingContext(finalText)
          const s = loadSettings()
          api.tts(finalText, getTtsVoice(s.voice), s.speed).then(blob => {
            const url = URL.createObjectURL(blob)
            const model = (window as any).__live2dModel
            if (model) {
              model.playTtsAudio(url, () => {
                speakingStartedRef.current = false
                URL.revokeObjectURL(url)
              })
            } else { triggerLive2DEnd() }
          }).catch(() => { setTimeout(() => triggerLive2DEnd(), 2000) })
        }
      } else if (data.type === 'error') {
        setMessages(prev => [...prev, {
          id: nextId(), role: 'assistant',
          content: `出错了：${data.message}`, timestamp: Date.now()
        }])
        streamingMsgRef.current = null; setLoading(false); triggerLive2DEnd()
      }
    })
  }, [onMessage, conversationId, loadConversations])

  const handleSend = useCallback((text: string) => {
    const userMsg: Message = { id: nextId(), role: 'user', content: text, timestamp: Date.now() }
    const aiMsgId = nextId()
    const aiMsg: Message = { id: aiMsgId, role: 'assistant', content: '', timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg, aiMsg])
    streamingMsgRef.current = aiMsgId
    setLoading(true)

    if (connected) {
      triggerLive2DSpeak()
      const s = loadSettings()
      send({ question: text, conversation_id: conversationId, persona: getPersonaPrompt(s.style), name: s.name })
    } else {
      triggerLive2DSpeak()
      const s = loadSettings()
      api.chat({ question: text, conversation_id: conversationId, persona: getPersonaPrompt(s.style), name: s.name })
        .then(data => {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, content: data.answer, sources: data.sources } : m
          ))
          streamingMsgRef.current = null; setLoading(false)
          if (data.conversation_id) { setConversationId(data.conversation_id); loadConversations() }
          if (data.answer) {
            const model = (window as any).__live2dModel
            if (model) model.setSpeakingContext(data.answer)
            const s2 = loadSettings()
            api.tts(data.answer, getTtsVoice(s2.voice), s2.speed).then(blob => {
              const url = URL.createObjectURL(blob)
              const model = (window as any).__live2dModel
              if (model) {
                model.playTtsAudio(url, () => {
                  speakingStartedRef.current = false
                  URL.revokeObjectURL(url)
                })
              } else { triggerLive2DEnd() }
            }).catch(() => { setTimeout(() => triggerLive2DEnd(), 2000) })
          }
        }).catch(err => {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, content: `请求失败：${err.message}` } : m
          ))
          streamingMsgRef.current = null; setLoading(false); triggerLive2DEnd()
        })
    }
  }, [connected, send, conversationId, loadConversations])

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
        if (audioRef.current) { audioRef.current.src = url; audioRef.current.play().catch(() => {}) }
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: nextId(), role: 'assistant', content: `语音识别失败: ${err.message}`, timestamp: Date.now()
      }])
    } finally { setVoiceLoading(false) }
  }, [])

  // Conversation actions
  const handleNewConv = useCallback(() => { setConversationId(null); setMessages([]) }, [])
  const handleSelectConv = useCallback((conv: ConvSummary) => { setConversationId(conv.id) }, [])
  const handleDeleteConv = useCallback(async (id: number) => {
    await api.conversations.delete(id)
    if (conversationId === id) { setConversationId(null); setMessages([]) }
    loadConversations()
  }, [conversationId, loadConversations])

  const isBusy = loading || voiceLoading

  // Quick question presets
  const quickQuestions = [
    '灵山大佛有多高？',
    '灵山有哪些必去景点？',
    '灵山的历史文化渊源？',
    '游览需要多长时间？',
    '九龙灌浴表演几点开始？',
    '推荐一条适合老人小孩的路线',
  ]

  return (
    <div className="h-[calc(100vh-3.5rem)] flex">
      {/* Conversation Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        activeId={conversationId}
        onSelect={handleSelectConv}
        onNew={handleNewConv}
        onDelete={handleDeleteConv}
      />
      {/* Live2D */}
      <div className="hidden md:flex w-[280px] flex-shrink-0 bg-gradient-to-b from-indigo-900 via-purple-800 to-slate-900 flex-col justify-center items-center border-r border-white/10">
        <Live2DDigitalHuman />
      </div>
      {/* Chat */}
      <div className="flex-1 flex flex-col bg-white min-w-0">
        <ChatPanel messages={messages} loading={isBusy} />
        <RecommendBar onSelect={getRecommendation} route={route} loading={routeLoading} />
        {/* Quick questions */}
        <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-thin border-t border-gray-100">
          {quickQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q)}
              disabled={isBusy}
              className="flex-shrink-0 px-3 py-1.5 text-xs bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 disabled:opacity-40 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
        <ChatInput onSend={handleSend} onVoice={handleVoice} disabled={isBusy} />
      </div>
      <audio ref={audioRef} className="hidden" />
    </div>
  )
}
