import { useNavigate } from 'react-router-dom'
import MapView from '../components/MapView'
import MapChatPanel from '../components/MapChatPanel'
import MapErrorBoundary from '../components/MapErrorBoundary'
import { useMapStore } from '../stores/mapStore'

const SOURCE_LABEL: Record<string, string> = {
  gps: 'GPS 定位',
  manual: '手动点选',
  simulated: '模拟定位',
}

export default function MapPage() {
  const navigate = useNavigate()
  const userLocation = useMapStore(s => s.userLocation)

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* 顶部栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            ← 返回对话
          </button>
          <div>
            <h1 className="text-sm font-semibold text-gray-800">🗺 灵山胜境 · 景区地图</h1>
            <p className="text-[11px] text-gray-400">GPS 定位 · 附近景点 · 路线绘制</p>
          </div>
        </div>
        {userLocation && (
          <span className="text-xs text-gray-500">
            📍 当前位置：
            <span className="font-medium text-gray-700">
              {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
            </span>
            <span className="ml-1 text-[10px] text-gray-400">（{SOURCE_LABEL[userLocation.source] ?? userLocation.source}）</span>
          </span>
        )}
      </div>

      {/* 主体：地图 + 右侧合并面板（路线卡片 + 对话小窗） */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 relative">
          <MapErrorBoundary>
            <MapView />
          </MapErrorBoundary>
        </div>
        <aside className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col min-h-0">
          <MapChatPanel />
        </aside>
      </div>
    </div>
  )
}
