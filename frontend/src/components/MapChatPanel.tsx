import { useState, useEffect, useCallback } from 'react'
import ChatPanel from './ChatPanel'
import ChatInput from './ChatInput'
import { useChatEngine } from '../hooks/useChatEngine'
import { api } from '../api'
import { useMapStore } from '../stores/mapStore'
import { loadSettings, getTtsVoice } from '../utils/settings'
import type { RecommendResponse } from '../types'

const QUICK = [
  '灵山大佛有多高？',
  '灵山有哪些必去景点？',
  '灵山的历史文化渊源？',
  '游览需要多长时间？',
  '九龙灌浴表演几点开始？',
  '推荐一条适合老人小孩的路线',
]

/** 路线卡片（可折叠）：与聊天合并展示在右侧面板顶部 */
function RouteMiniCard({ route, expanded, onToggle }: {
  route: RecommendResponse
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 max-h-[45%] overflow-y-auto scrollbar-thin">
      <button
        onClick={onToggle}
        className="sticky top-0 w-full flex items-center justify-between px-3 py-2 text-left bg-gray-50 hover:bg-gray-100 transition-colors z-10"
      >
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">🧭 {route.route_name}</p>
          <p className="text-[10px] text-gray-400">{route.total_duration} · {route.steps.length} 个景点</p>
        </div>
        <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{expanded ? '收起 ▲' : '展开 ▼'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3">
          <ol className="relative border-l border-gray-200 ml-1 space-y-2.5">
            {route.steps.map((s) => (
              <li key={s.order} className="relative pl-4">
                <span className="absolute -left-2.5 top-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                  {s.order}
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-800">{s.attraction_name}</span>
                  <span className="text-[10px] text-gray-400">{s.duration_minutes} 分钟</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{s.description}</p>
                {s.lat == null && (
                  <p className="text-[10px] text-amber-500 mt-0.5">⚠ 无坐标，未在地图上标注</p>
                )}
              </li>
            ))}
          </ol>
          {route.tips && route.tips.length > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-200">
              <p className="text-[11px] font-semibold text-gray-600 mb-1">💡 温馨提示</p>
              <ul className="space-y-1">
                {route.tips.map((t, i) => (
                  <li key={i} className="text-[11px] text-gray-500">· {t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 地图页右侧合并面板：路线卡片 + 对话小窗。
 * 聊天与主页完全一致（流式/语音/来源/路线/TTS 播报），仅不展示数字人。
 */
export default function MapChatPanel() {
  const latestRoute = useMapStore(s => s.latestRoute)
  const [expanded, setExpanded] = useState(false)

  // 新路线生成/到达时自动展开路线卡片
  useEffect(() => {
    if (latestRoute) setExpanded(true)
  }, [latestRoute?.route_name])

  // 回答播报：无数字人，用普通 audio 播放 TTS
  const speak = useCallback((text: string) => {
    const s = loadSettings()
    api.tts(text, getTtsVoice(s.voice), s.speed).then(blob => {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      audio.play().catch(() => URL.revokeObjectURL(url))
    }).catch(() => { /* TTS 失败不影响文字回答 */ })
  }, [])

  // 语音对话返回的音频
  const playVoiceAudio = useCallback((url: string) => {
    const audio = new Audio(url)
    audio.onended = () => URL.revokeObjectURL(url)
    audio.play().catch(() => {})
  }, [])

  const { messages, loading, isBusy, handleSend, handleVoice, loadConversation } =
    useChatEngine({ speak, playVoiceAudio })

  // 挂载时续用聊天页的当前会话，历史消息直接显示
  useEffect(() => {
    const cid = useMapStore.getState().conversationId
    if (cid) loadConversation(cid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {latestRoute && (
        <RouteMiniCard
          route={latestRoute}
          expanded={expanded}
          onToggle={() => setExpanded(v => !v)}
        />
      )}
      <ChatPanel messages={messages} loading={loading} />
      {/* Quick questions */}
      <div className="flex-shrink-0 flex gap-2 px-3 py-2 overflow-x-auto scrollbar-thin border-t border-gray-100">
        {QUICK.map((q, i) => (
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
    </div>
  )
}
