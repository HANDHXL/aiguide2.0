/**
 * 高德地图 JS API 配置
 *
 * 申请免费 Key（约 5 分钟）：
 *   1. 打开 https://console.amap.com/dev/key/app
 *   2. 注册/登录后「创建新应用」→ 添加 Key，服务平台选「Web端(JS API)」
 *   3. 将生成的 Key 填入下方 AMAP_KEY
 *
 * 设置方式（二选一）：
 *   方式一：frontend/ 下创建 .env 文件，写入 VITE_AMAP_KEY=你的key（推荐，key 不进 git）
 *   方式二：直接修改下方占位值（打包 exe 前必须设置好，构建时会打包进去）
 */
export const AMAP_KEY: string =
  (import.meta.env.VITE_AMAP_KEY as string) || '682204f7da96f47dcdb5955e1bc41a65'

/** 安全密钥（可选）：发布上线需配合域名白名单使用，本地演示可留空 */
export const AMAP_SECURITY_CODE: string =
  (import.meta.env.VITE_AMAP_SECURITY_CODE as string) || '73745d737613ea12a625b0f5b939da12'

/** 灵山胜境景区中心点（默认地图视野，覆盖全部 16 个官方 POI 点位） */
export const MAP_CENTER = { lng: 120.1005, lat: 31.4252 }

/** 未配置 Key 时的提示 */
export const AMAP_KEY_MISSING = AMAP_KEY === 'YOUR_AMAP_KEY'
