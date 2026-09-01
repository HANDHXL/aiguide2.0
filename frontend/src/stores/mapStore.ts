import { create } from 'zustand'
import type { RecommendResponse } from '../types'

export interface UserLocation {
  lat: number
  lng: number
  /** gps=浏览器定位 manual=地图点选 simulated=演示模式模拟 */
  source: 'gps' | 'manual' | 'simulated'
}

interface MapState {
  userLocation: UserLocation | null
  latestRoute: RecommendResponse | null
  /** 地图页发起的提问（如「AI 讲解」），聊天页读取后自动发送 */
  pendingQuestion: string | null
  /** 当前活动对话 ID：聊天页写入，地图页小窗对话续用，保证两处对话连续 */
  conversationId: number | null
  setUserLocation: (loc: UserLocation | null) => void
  setLatestRoute: (route: RecommendResponse | null) => void
  setPendingQuestion: (q: string | null) => void
  setConversationId: (id: number | null) => void
}

/**
 * 地图全局状态：聊天页/路线推荐页生成路线后写入，
 * 地图页读取并绘制折线；定位结果跨组件共享。
 * pendingQuestion 用于地图 → 对话的提问联动。
 */
export const useMapStore = create<MapState>((set) => ({
  userLocation: null,
  latestRoute: null,
  pendingQuestion: null,
  conversationId: null,
  setUserLocation: (loc) => set({ userLocation: loc }),
  setLatestRoute: (route) => set({ latestRoute: route }),
  setPendingQuestion: (q) => set({ pendingQuestion: q }),
  setConversationId: (id) => set({ conversationId: id }),
}))
