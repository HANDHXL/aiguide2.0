import { AMAP_KEY, AMAP_SECURITY_CODE } from '../config/map'

let _loadPromise: Promise<any> | null = null

/** 注入安全密钥配置。高德 JS API 2.0 强制要求：必须在脚本加载之前设置，否则地图白屏。 */
function applySecurityConfig() {
  const w = window as any
  if (AMAP_SECURITY_CODE && !w._AMapSecurityConfig) {
    w._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE }
  }
}

/**
 * 确保 Scale 插件已加载。
 * 页面可能缓存了不带 plugin 参数的旧脚本（window.AMap 已存在但无 Scale），
 * 此时需通过 AMap.plugin 手动补装，否则 new AMap.Scale() 会抛错导致地图创建失败。
 * 插件加载失败或超时不阻塞主地图：Scale 只是附加控件，调用方有防御性检查。
 */
function ensureScalePlugin(AMap: any): Promise<any> {
  if (AMap.Scale) return Promise.resolve(AMap)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(AMap), 8000)
    try {
      AMap.plugin('AMap.Scale', () => { clearTimeout(timer); resolve(AMap) })
    } catch {
      clearTimeout(timer)
      resolve(AMap)
    }
  })
}

/** 动态注入高德 JS API 脚本，resolve window.AMap（全局只加载一次）。 */
export function loadAMap(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('非浏览器环境'))
  applySecurityConfig()
  if ((window as any).AMap) return ensureScalePlugin((window as any).AMap)
  if (_loadPromise) return _loadPromise
  _loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    let url = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_KEY)}&plugin=AMap.Scale`
    if (AMAP_SECURITY_CODE) url += `&securityJsCode=${encodeURIComponent(AMAP_SECURITY_CODE)}`
    script.src = url
    script.async = true
    script.onload = () => ensureScalePlugin((window as any).AMap).then(resolve, reject)
    script.onerror = () => {
      _loadPromise = null
      reject(new Error('高德地图加载失败，请检查网络和 API Key'))
    }
    document.head.appendChild(script)
  })
  return _loadPromise
}
