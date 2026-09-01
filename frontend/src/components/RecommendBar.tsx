import type { RecommendResponse } from '../types'

const INTERESTS = [
  { key: '历史', label: '历史探源', icon: '📜', desc: '千年佛缘·文化典故' },
  { key: '佛教文化', label: '佛教朝圣', icon: '🙏', desc: '佛国净土·参拜祈福' },
  { key: '建筑艺术', label: '建筑美学', icon: '🏛️', desc: '匠心营造·艺术瑰宝' },
  { key: '自然风光', label: '自然生态', icon: '🌿', desc: '山水灵境·湖光山色' },
  { key: '亲子娱乐', label: '亲子欢乐', icon: '👨‍👩‍👧', desc: '欢聚灵山·全家同游' },
]

export default function RecommendBar({
  onSelect, route, loading,
}: {
  onSelect: (interest: string) => void
  route: RecommendResponse | null
  loading: boolean
}) {
  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-400 mb-2">选择游览偏好，获取 AI 个性化路线推荐：</p>
      <div className="flex gap-2 flex-wrap mb-2">
        {INTERESTS.map(item => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            disabled={loading}
            title={item.desc}
            className="px-3 py-2 rounded-lg text-xs border transition-all font-medium bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-gray-400 disabled:opacity-50"
          >
            <span className="text-base">{item.icon}</span>
            <span className="ml-1">{item.label}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
          <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          正在为您规划专属路线...
        </div>
      )}

      {route && !loading && (
        <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
          <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">{route.route_name}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {route.steps.length} 个景点 · {route.total_duration}
              </p>
            </div>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">AI 推荐</span>
          </div>
          <div className="p-3">
            <div className="flex gap-3 mb-3">
              {route.steps.map((step, i) => (
                <div key={step.order} className="flex items-center gap-2 min-w-0">
                  <div className="flex-shrink-0 flex flex-col items-center">
                    <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center">
                      {step.order}
                    </span>
                    {i < route.steps.length - 1 && (
                      <div className="w-px h-4 bg-gray-300 my-0.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{step.attraction_name}</p>
                    <p className="text-[10px] text-gray-400">{step.duration_minutes}分钟</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Dynamic tips from LLM */}
            {route.tips && route.tips.length > 0 && (
              <div className="border-t border-gray-100 pt-2 mt-1">
                {route.tips.map((tip, i) => (
                  <p key={i} className="text-[10px] text-gray-500 flex items-start gap-1 mb-0.5">
                    <span className="text-amber-500 flex-shrink-0 mt-0.5">!</span>
                    {tip}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
