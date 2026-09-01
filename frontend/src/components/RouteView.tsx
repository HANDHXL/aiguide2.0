import { useNavigate } from 'react-router-dom'
import { useRecommend } from '../hooks/useRecommend'

const INTERESTS = [
  { key: '历史', label: '历史探源', icon: '📜', desc: '千年佛缘·文化典故' },
  { key: '佛教文化', label: '佛教朝圣', icon: '🙏', desc: '佛国净土·参拜祈福' },
  { key: '建筑艺术', label: '建筑美学', icon: '🏛️', desc: '匠心营造·艺术瑰宝' },
  { key: '自然风光', label: '自然生态', icon: '🌿', desc: '山水灵境·湖光山色' },
  { key: '亲子娱乐', label: '亲子欢乐', icon: '👨‍👩‍👧', desc: '欢聚灵山·全家同游' },
]

export default function RouteView() {
  const { route, loading, getRecommendation } = useRecommend()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-4 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 mb-1">🗺 个性化路线推荐</h2>
          <p className="text-xs text-gray-400">选择你的游览偏好，AI 为你规划专属路线</p>
        </div>
        <button
          onClick={() => navigate('/map')}
          className="flex-shrink-0 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          📍 查看地图
        </button>
      </div>

      {/* Interest selection */}
      <div className="px-4 py-4 bg-white border-b border-gray-100">
        <div className="grid grid-cols-2 gap-2">
          {INTERESTS.map(item => (
            <button
              key={item.key}
              onClick={() => getRecommendation(item.key)}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-left border border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              <span className="text-xl">{item.icon}</span>
              <div>
                <p className="text-xs font-medium text-gray-800">{item.label}</p>
                <p className="text-[10px] text-gray-400">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-400">正在为你规划专属路线...</p>
          </div>
        </div>
      )}

      {/* Route result */}
      {route && !loading && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-900 text-white px-4 py-4">
              <p className="text-base font-bold">{route.route_name}</p>
              <p className="text-xs text-gray-400 mt-1">
                {route.steps.length} 个景点 · 总时长 {route.total_duration}
              </p>
            </div>
            <div className="p-4">
              <div className="relative">
                {route.steps.map((step, i) => (
                  <div key={step.order} className="flex gap-3 pb-4 last:pb-0">
                    {/* Timeline */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className="w-7 h-7 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                        {step.order}
                      </span>
                      {i < route.steps.length - 1 && (
                        <div className="w-px flex-1 bg-gray-200 my-1" />
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-sm font-semibold text-gray-800">{step.attraction_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">建议游览 {step.duration_minutes} 分钟</p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!route && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
          <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-sm">点击上方兴趣标签，获取推荐路线</p>
        </div>
      )}
    </div>
  )
}
