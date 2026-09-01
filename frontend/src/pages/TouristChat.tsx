import { useState, useCallback, useRef, useEffect } from 'react'
import Live2DDigitalHuman from '../components/Live2DDigitalHuman'
import ChatPanel from '../components/ChatPanel'
import ChatInput from '../components/ChatInput'
import ConversationSidebar from '../components/ConversationSidebar'
import FeedbackWall from '../components/FeedbackWall'
import RouteView from '../components/RouteView'
import { useChatEngine } from '../hooks/useChatEngine'
import { api } from '../api'
import type { ConvSummary } from '../types'
import { loadSettings, getTtsVoice } from '../utils/settings'
import { useAuth } from '../contexts/AuthContext'

export default function TouristChat() {
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [showFeedback, setShowFeedback] = useState(false)
  const [showRoute, setShowRoute] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakingStartedRef = useRef(false)

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

  // 回答播报：数字人 TTS + 口型联动
  const speak = useCallback((text: string) => {
    const model = (window as any).__live2dModel
    if (model) model.setSpeakingContext(text)
    const s = loadSettings()
    api.tts(text, getTtsVoice(s.voice), s.speed).then(blob => {
      const url = URL.createObjectURL(blob)
      const model = (window as any).__live2dModel
      if (model) {
        model.playTtsAudio(url, () => {
          speakingStartedRef.current = false
          URL.revokeObjectURL(url)
        })
      } else { triggerLive2DEnd() }
    }).catch(() => { setTimeout(() => triggerLive2DEnd(), 2000) })
  }, [])

  // 语音对话返回的音频播报
  const playVoiceAudio = useCallback((url: string) => {
    if (audioRef.current) { audioRef.current.src = url; audioRef.current.play().catch(() => {}) }
  }, [])

  // Load conversations list
  const loadConversations = useCallback(async () => {
    try { setConversations(await api.conversations.list()); return true }
    catch { return false }
  }, [])

  const { token } = useAuth()

  // 聊天核心逻辑：与地图页小窗共用（useChatEngine），数字人表现由回调注入
  const {
    messages, isBusy,
    conversationId, setConversationId, loadConversation,
    handleSend, handleVoice,
  } = useChatEngine({
    onStartSpeaking: triggerLive2DSpeak,
    onStopSpeaking: triggerLive2DEnd,
    speak,
    onConversationCreated: () => { loadConversations() },
    playVoiceAudio,
  })

  // 首次加载失败时（token 尚未就位等）自动重试，保证登录后历史列表必现
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ok = await loadConversations()
      if (!ok && !cancelled) {
        setTimeout(() => { if (!cancelled) loadConversations() }, 1000)
      }
    })()
    return () => { cancelled = true }
  }, [loadConversations])

  // 登录态变化（登录/切换账号）时重新拉取
  useEffect(() => {
    if (token) loadConversations()
  }, [token, loadConversations])

  // Conversation actions
  const handleNewConv = useCallback(() => { setConversationId(null); setShowFeedback(false); setShowRoute(false) }, [setConversationId])
  const handleFeedback = useCallback(() => { setShowFeedback(v => !v); if (!showFeedback) setShowRoute(false) }, [showFeedback])
  const handleRoute = useCallback(() => { setShowRoute(v => !v); if (!showRoute) setShowFeedback(false) }, [showRoute])
  const handleSelectConv = useCallback((conv: ConvSummary) => { loadConversation(conv.id) }, [loadConversation])
  const handleDeleteConv = useCallback(async (id: number) => {
    await api.conversations.delete(id)
    if (conversationId === id) setConversationId(null)
    loadConversations()
  }, [conversationId, setConversationId, loadConversations])

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
        showFeedback={showFeedback}
        showRoute={showRoute}
        onSelect={(c) => { handleSelectConv(c); setShowFeedback(false); setShowRoute(false) }}
        onNew={handleNewConv}
        onDelete={handleDeleteConv}
        onFeedback={handleFeedback}
        onRoute={handleRoute}
      />
      {/* Live2D */}
      <div className="hidden md:flex w-[280px] flex-shrink-0 bg-gray-900 flex-col justify-center items-center border-r border-white/10">
        <Live2DDigitalHuman />
      </div>
      {/* Chat / Route / Feedback */}
      <div className="flex-1 flex flex-col bg-white min-w-0">
        {showRoute ? (
          <RouteView />
        ) : showFeedback ? (
          <FeedbackWall />
        ) : (
          <>
            <ChatPanel messages={messages} loading={isBusy} />
            {/* Quick questions */}
            <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-thin border-t border-gray-100">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  disabled={isBusy}
                  className="flex-shrink-0 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 disabled:opacity-40 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
            <ChatInput onSend={handleSend} onVoice={handleVoice} disabled={isBusy} />
          </>
        )}
      </div>
      <audio ref={audioRef} className="hidden" />
    </div>
  )
}
