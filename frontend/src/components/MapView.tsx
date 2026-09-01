import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadAMap } from '../utils/amap'
import { AMAP_KEY_MISSING, MAP_CENTER } from '../config/map'
import { api } from '../api'
import { useMapStore } from '../stores/mapStore'
import type { MapAttraction, NearbyResult } from '../types'

/** 演示模式模拟定位点（景区入口 / 游客中心，高德官方 POI 坐标） */
const SIMULATED_LOCATION = { lat: 31.420196, lng: 120.103651 }

function fmtDistance(m: number): string {
  return m < 1000 ? `${m}米` : `${(m / 1000).toFixed(1)}公里`
}

/**
 * 高德地图视图：景点标记、GPS/手动/模拟定位、附近景点面板、路线折线绘制。
 * 定位与路线状态通过 mapStore 与聊天页/路线推荐页共享。
 */
export default function MapView() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const AMapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const routeOverlaysRef = useRef<any[]>([])
  const userOverlaysRef = useRef<any[]>([])
  const infoWindowRef = useRef<any>(null)
  const pickingRef = useRef(false)

  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [locating, setLocating] = useState(false)
  const [picking, setPicking] = useState(false)
  const [notice, setNotice] = useState('')
  const [nearby, setNearby] = useState<NearbyResult[]>([])

  const userLocation = useMapStore(s => s.userLocation)
  const setUserLocation = useMapStore(s => s.setUserLocation)
  const latestRoute = useMapStore(s => s.latestRoute)

  // ---- 初始化地图 ----
  useEffect(() => {
    if (AMAP_KEY_MISSING) return
    let cancelled = false
    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return
        AMapRef.current = AMap
        // 每次挂载用全新容器 div：高德 destroy 后复用同一容器会白屏
        const holder = document.createElement('div')
        holder.style.cssText = 'width:100%;height:100%'
        containerRef.current.replaceChildren(holder)
        const map = new AMap.Map(holder, {
          center: [MAP_CENTER.lng, MAP_CENTER.lat],
          zoom: 15.5,
          viewMode: '2D',
        })
        if (AMap.Scale) map.addControl(new AMap.Scale())
        mapRef.current = map

        // 容器刚挂载时尺寸可能为 0，稍后强制重算，避免空白地图
        ;[300, 1200].forEach((delay) => {
          setTimeout(() => {
            if (!cancelled && mapRef.current) mapRef.current.resize()
          }, delay)
        })

        // 手动选点模式：点击地图设置位置
        map.on('click', (e: any) => {
          if (!pickingRef.current) return
          pickingRef.current = false
          setPicking(false)
          const { lng, lat } = e.lnglat
          setUserLocation({ lat, lng, source: 'manual' })
          setNotice('已设置您的位置（手动点选）')
        })

        api.mapAttractions()
          .then((list) => drawAttractionMarkers(AMap, map, list))
          .catch(() => setMapError('景点数据加载失败'))

        setMapReady(true)
      })
      .catch((err: any) => setMapError(err?.message || '高德地图加载失败'))
    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
      AMapRef.current = null
      containerRef.current?.replaceChildren()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 绘制景点标记 ----
  const drawAttractionMarkers = (AMap: any, map: any, list: MapAttraction[]) => {
    const infoWindow = new AMap.InfoWindow({ anchor: 'bottom-center', offset: new AMap.Pixel(0, -14) })
    infoWindowRef.current = infoWindow
    list.forEach((a) => {
      const marker = new AMap.Marker({
        position: [a.lng, a.lat],
        anchor: 'bottom-center',
        title: a.name,
        content: `<div style="cursor:pointer;padding:2px 8px;border-radius:10px;background:#fff;border:1.5px solid #f59e0b;color:#92400e;font-size:12px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25)">${a.name}</div>`,
      })
      marker.on('click', () => {
        const el = document.createElement('div')
        el.innerHTML = `
          <div style="font-family:sans-serif;min-width:200px;max-width:260px;padding:4px 2px">
            <div style="font-size:14px;font-weight:700;color:#1f2937;margin-bottom:2px">${a.name}</div>
            <div style="font-size:11px;color:#f59e0b;margin-bottom:6px">${a.category}</div>
            <div style="font-size:12px;color:#4b5563;line-height:1.5;margin-bottom:8px">${a.description}</div>
            <div style="display:flex;gap:12px">
              <button data-act="locate" style="font-size:12px;color:#4f46e5;background:none;border:none;padding:0;cursor:pointer">📍 设为我的位置</button>
              <button data-act="ask" style="font-size:12px;color:#4f46e5;background:none;border:none;padding:0;cursor:pointer">💬 问 AI 讲解</button>
            </div>
          </div>`
        el.querySelector('[data-act="locate"]')?.addEventListener('click', () => {
          setUserLocation({ lat: a.lat, lng: a.lng, source: 'manual' })
          setNotice(`已设置位置：${a.name}`)
          infoWindow.close()
        })
        el.querySelector('[data-act="ask"]')?.addEventListener('click', () => {
          infoWindow.close()
          useMapStore.getState().setPendingQuestion(`请介绍一下${a.name}，有什么游览亮点？`)
          navigate('/')
        })
        infoWindow.setContent(el)
        infoWindow.open(map, marker.getPosition())
      })
      map.add(marker)
      markersRef.current.push(marker)
    })
  }

  // ---- 定位点变化 → 绘制定位标记 + 拉取附近景点 ----
  useEffect(() => {
    const AMap = AMapRef.current
    const map = mapRef.current
    if (!AMap || !map) return
    userOverlaysRef.current.forEach(o => map.remove(o))
    userOverlaysRef.current = []
    setNearby([])
    if (!userLocation) return
    const pos: [number, number] = [userLocation.lng, userLocation.lat]
    const marker = new AMap.Marker({
      position: pos,
      anchor: 'bottom-center',
      content: `<div style="display:flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#2563eb;color:#fff;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 1px 6px rgba(37,99,235,.5)">📍 我的位置</div>`,
    })
    const circle = new AMap.Circle({
      center: pos,
      radius: 60,
      strokeColor: '#2563eb',
      strokeOpacity: 0.8,
      strokeWeight: 1.5,
      fillColor: '#2563eb',
      fillOpacity: 0.12,
    })
    map.add([marker, circle])
    userOverlaysRef.current = [marker, circle]
    map.setCenter(pos)
    api.mapNearby(userLocation.lat, userLocation.lng).then(setNearby).catch(() => {})
  }, [userLocation, mapReady])

  // ---- 路线变化 → 绘制折线与序号标记 ----
  useEffect(() => {
    const AMap = AMapRef.current
    const map = mapRef.current
    if (!AMap || !map) return
    routeOverlaysRef.current.forEach(o => map.remove(o))
    routeOverlaysRef.current = []
    if (!latestRoute) return
    const path = latestRoute.steps
      .filter(s => s.lat != null && s.lng != null)
      .map(s => [s.lng as number, s.lat as number] as [number, number])
    if (path.length < 2) return
    const polyline = new AMap.Polyline({
      path,
      strokeColor: '#4f46e5',
      strokeWeight: 5,
      strokeOpacity: 0.75,
      strokeStyle: 'dashed',
      showDir: true,
      lineJoin: 'round',
    })
    map.add(polyline)
    routeOverlaysRef.current.push(polyline)
    latestRoute.steps.forEach((s, i) => {
      if (s.lat == null || s.lng == null) return
      const isFirst = i === 0
      const isLast = i === latestRoute.steps.length - 1
      const badge = isFirst ? '起' : isLast ? '终' : String(i + 1)
      const color = isFirst ? '#10b981' : isLast ? '#ef4444' : '#4f46e5'
      const marker = new AMap.Marker({
        position: [s.lng as number, s.lat as number],
        anchor: 'bottom-center',
        content: `<div style="width:24px;height:24px;border-radius:50%;background:${color};color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${badge}</div>`,
      })
      map.add(marker)
      routeOverlaysRef.current.push(marker)
    })
    // 自适应视野：setFitView 必须传 overlay 对象（高德内部会调用 getBounds），
    // 传裸坐标数组会抛 "getBounds is not a function" 并拖垮整个应用
    try {
      const overlays = routeOverlaysRef.current.filter((o) => o && typeof o.getBounds === 'function')
      if (overlays.length) map.setFitView(overlays, false, [80, 80, 80, 80])
    } catch {
      const lngs = path.map((p) => p[0])
      const lats = path.map((p) => p[1])
      try {
        map.setBounds(new AMap.Bounds(
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ))
      } catch { /* 视图自适应失败不影响折线与标记显示 */ }
    }
  }, [latestRoute, mapReady])

  // ---- 定位按钮 ----
  const handleLocate = () => {
    if (!('geolocation' in navigator)) {
      pickingRef.current = true
      setPicking(true)
      setNotice('浏览器不支持 GPS 定位，请在地图上点击您的位置')
      return
    }
    setLocating(true)
    setNotice('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const { latitude, longitude } = pos.coords
        const AMap = AMapRef.current
        // 浏览器 GPS 返回 WGS-84 坐标，高德地图是 GCJ-02，
        // 直接绘制会偏移数百米，需先转换
        if (AMap && AMap.convertFrom) {
          AMap.convertFrom([longitude, latitude], 'gps', (status: string, result: any) => {
            if (status === 'complete' && result?.locations?.length) {
              const loc = result.locations[0]
              setUserLocation({ lat: loc.lat, lng: loc.lng, source: 'gps' })
            } else {
              setUserLocation({ lat: latitude, lng: longitude, source: 'gps' })
            }
          })
        } else {
          setUserLocation({ lat: latitude, lng: longitude, source: 'gps' })
        }
        setNotice('GPS 定位成功')
      },
      (err) => {
        setLocating(false)
        pickingRef.current = true
        setPicking(true)
        setNotice(`GPS 定位失败（${err.message}），请在地图上点击您的位置`)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    )
  }

  const handleSimulate = () => {
    pickingRef.current = false
    setPicking(false)
    setUserLocation({ ...SIMULATED_LOCATION, source: 'simulated' })
    setNotice('演示模式：已模拟定位到灵山胜境景区入口')
  }

  const startPicking = () => {
    pickingRef.current = true
    setPicking(true)
    setNotice('👆 请在地图上点击您所在的位置')
  }

  const clearLocation = () => {
    setUserLocation(null)
    setNotice('')
  }

  return (
    <div className="relative w-full h-full bg-gray-100">
      {/* 地图画布 */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* 未配置 Key 提示 */}
      {AMAP_KEY_MISSING && (
        <div className="absolute inset-0 z-20 bg-gray-50 flex items-center justify-center">
          <div className="max-w-md text-center p-8">
            <div className="text-4xl mb-3">🗺</div>
            <h3 className="text-base font-bold text-gray-800 mb-2">尚未配置高德地图 Key</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              免费注册：console.amap.com → 创建应用 → 添加 Key（服务平台选
              「Web端(JS API)」），然后填入
              <code className="bg-gray-100 px-1 mx-1 rounded text-xs">frontend/src/config/map.ts</code>
            </p>
            <a
              href="https://console.amap.com/dev/key/app"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-indigo-600 underline"
            >
              前往高德开放平台 →
            </a>
          </div>
        </div>
      )}

      {/* 地图加载中 */}
      {!mapReady && !AMAP_KEY_MISSING && !mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100 text-sm text-gray-500">
          地图加载中…
        </div>
      )}

      {/* 加载失败提示 */}
      {mapError && !AMAP_KEY_MISSING && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="text-center p-6 bg-white rounded-xl shadow-lg border border-red-200 max-w-sm">
            <div className="text-3xl mb-2">⚠</div>
            <p className="text-sm text-red-600 font-medium">{mapError}</p>
          </div>
        </div>
      )}

      {/* 手动选点遮罩 */}
      {picking && (
        <div className="absolute inset-0 z-10 pointer-events-none bg-indigo-500/10 border-2 border-indigo-400 flex items-center justify-center">
          <span className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
            👆 请点击地图上您的位置
          </span>
        </div>
      )}

      {/* 提示横幅 */}
      {(notice || mapError) && !AMAP_KEY_MISSING && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-lg text-xs shadow-lg max-w-[80%] text-center ${
            mapError ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-gray-900/85 text-white'
          }`}
        >
          {mapError || notice}
        </div>
      )}

      {/* 定位操作按钮 */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        <button
          onClick={handleLocate}
          disabled={locating}
          className="px-3 py-2 text-xs font-medium bg-white text-gray-700 rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors text-left"
        >
          {locating ? '⏳ 定位中…' : '📍 GPS 定位'}
        </button>
        <button
          onClick={startPicking}
          className={`px-3 py-2 text-xs font-medium rounded-lg shadow-md border transition-colors text-left ${
            picking
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          👆 手动选点
        </button>
        <button
          onClick={handleSimulate}
          className="px-3 py-2 text-xs font-medium bg-white text-gray-700 rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 transition-colors text-left"
        >
          🎯 模拟定位（演示）
        </button>
        {userLocation && (
          <button
            onClick={clearLocation}
            className="px-3 py-2 text-xs font-medium bg-white text-red-500 rounded-lg shadow-md border border-gray-200 hover:bg-red-50 transition-colors text-left"
          >
            ✕ 清除定位
          </button>
        )}
      </div>

      {/* 附近景点面板 */}
      {userLocation && (
        <div className="absolute bottom-4 left-4 z-10 w-64 max-h-60 overflow-y-auto bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-gray-700">📍 附近景点</h3>
            <span className="text-[10px] text-gray-400">
              {userLocation.source === 'gps' ? 'GPS 定位' : userLocation.source === 'simulated' ? '模拟定位' : '手动定位'}
            </span>
          </div>
          {nearby.length === 0 ? (
            <p className="text-xs text-gray-500 leading-relaxed">
              1.5 公里内没有景点。您可能离景区较远，点击「🎯 模拟定位」体验景区内功能。
            </p>
          ) : (
            <ul className="space-y-1.5">
              {nearby.map(a => (
                <li key={a.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 font-medium">{a.name}</span>
                  <span className="text-[10px] text-gray-400">{fmtDistance(a.distance_m)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
