import { useEffect, useRef } from 'react'
import type { Message, SourceDoc } from '../types'

function SourceBadge({ source, index }: { source: SourceDoc; index: number }) {
  const typeLabel = source.type === 'docx' ? '文档' : source.type === 'xlsx' ? '表格' : source.type === 'pdf' ? 'PDF' : source.type === 'txt' ? '文本' : '资料'
  const shortName = source.source.length > 25 ? source.source.slice(-25) : source.source

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-[11px] cursor-default"
      title={`${source.source}\n${source.content.slice(0, 100)}...`}
    >
      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="truncate max-w-[100px]">{shortName}</span>
      <span className="text-[10px] text-primary-400">·{typeLabel}</span>
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
          <div className="flex items-center gap-1 mb-2 pb-1.5 border-b border-amber-100/60">
            <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-[10px] text-amber-600 font-medium">知识库来源</span>
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
