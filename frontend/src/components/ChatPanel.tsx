import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Message, SourceDoc, RecommendResponse } from '../types'


function RouteCard({ route }: { route: RecommendResponse }) {
  const navigate = useNavigate()
  return (
    <div className="mt-3 border border-gray-300 rounded-lg overflow-hidden bg-white">
      <div className="bg-gray-900 text-white px-3 py-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold">{route.route_name}</p>
          <p className="text-[10px] text-gray-400">{route.steps.length} 个景点 · {route.total_duration}</p>
        </div>
        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">AI 路线</span>
      </div>
      <div className="p-2">
        <div className="flex gap-2 overflow-x-auto">
          {route.steps.map((step, i) => (
            <div key={step.order} className="flex items-start gap-1.5 min-w-[90px] max-w-[120px] flex-shrink-0">
              <div className="flex-shrink-0 flex flex-col items-center pt-0.5">
                <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[9px] font-bold flex items-center justify-center">
                  {step.order}
                </span>
                {i < route.steps.length - 1 && (
                  <div className="w-px h-3 bg-gray-300 my-0.5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-gray-800 truncate">{step.attraction_name}</p>
                <p className="text-[10px] text-gray-400">{step.duration_minutes}分钟</p>
                <p className="text-[9px] text-gray-500 mt-0.5 line-clamp-2">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
        {route.tips && route.tips.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            {route.tips.map((tip, i) => (
              <p key={i} className="text-[9px] text-gray-500 flex items-start gap-1">
                <span className="text-amber-500 flex-shrink-0 font-bold">!</span>
                {tip}
              </p>
            ))}
          </div>
        )}
        <button
          onClick={() => navigate('/map')}
          className="mt-2 w-full py-1.5 text-[11px] bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          📍 在地图上查看路线
        </button>
      </div>
    </div>
  )
}

function SourceBadge({ source, index }: { source: SourceDoc; index: number }) {
  const typeLabel = source.type === 'docx' ? '文档' : source.type === 'xlsx' ? '表格' : source.type === 'pdf' ? 'PDF' : source.type === 'txt' ? '文本' : '资料'
  const shortName = source.source.length > 25 ? source.source.slice(-25) : source.source

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[11px] cursor-default"
      title={`${source.source}\n${source.content.slice(0, 100)}...`}
    >
      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="truncate max-w-[100px]">{shortName}</span>
      <span className="text-[10px] text-gray-400">·{typeLabel}</span>
    </span>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  const sources = msg.sources || []
  const displayedSources = sources.slice(0, 3)
  const hiddenCount = sources.length - displayedSources.length

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}>
        {msg.sources && msg.sources.length > 0 && (
          <div className="flex items-center gap-1 mb-2 pb-1.5 border-b border-gray-200">
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-[10px] text-gray-500 font-medium">知识库来源</span>
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {displayedSources.map((s, i) => (
              <SourceBadge key={i} source={s} index={i} />
            ))}
            {hiddenCount > 0 && (
              <span className="text-[11px] text-gray-400 self-center">+{hiddenCount} 篇</span>
            )}
          </div>
        )}
        {/* Route card — displayed inline when AI generates a route */}
        {msg.route && <RouteCard route={msg.route} />}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="chat-bubble-ai flex items-center gap-1 py-4">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
      </div>
    </div>
  )
}

export default function ChatPanel({
  messages,
  loading,
}: {
  messages: Message[]
  loading: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 bg-gray-50/80">
      {messages.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          <p className="text-sm">开始与AI导游对话吧</p>
          <p className="text-xs mt-1">您可以问任何关于灵山胜境的问题</p>
        </div>
      )}
      {messages.map(msg => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}
      {loading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  )
}
