import type { RecommendResponse } from '../types'

const INTERESTS = [
  { key: '历史', label: '历史探源', icon: '📜', color: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100' },
  { key: '佛教文化', label: '佛教朝圣', icon: '🙏', color: 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100' },
  { key: '建筑艺术', label: '建筑美学', icon: '🏛️', color: 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100' },
  { key: '自然风光', label: '自然生态', icon: '🌿', color: 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100' },
  { key: '亲子娱乐', label: '亲子欢乐', icon: '👨‍👩‍👧', color: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100' },
]

export default function RecommendBar({
  onSelect,
  route,
  loading,
}: {
  onSelect: (interest: string) => void
  route: RecommendResponse | null
  loading: boolean
}) {
  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-400 mb-2">选择兴趣，获取个性化游览路线推荐：</p>
      <div className="flex gap-2 flex-wrap mb-2">
        {INTERESTS.map(item => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors font-medium ${item.color} disabled:opacity-50`}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {/* Route result */}
      {loading && (
        <div className="text-xs text-gray-400 py-2">正在为您规划路线...</div>
      )}

      {route && !loading && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-3 border border-indigo-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-indigo-900">{route.route_name}</p>
            <span className="text-xs text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">
              {route.total_duration}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {route.steps.map(step => (
              <div
                key={step.order}
                className="flex-shrink-0 bg-white rounded-lg p-2 border border-indigo-100 min-w-[100px] text-center"
              >
                <p className="text-xs font-medium text-gray-800">{step.attraction_name}</p>
                <p className="text-xs text-gray-400">{step.duration_minutes}分钟</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
