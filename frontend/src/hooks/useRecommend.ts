import { useState, useCallback } from 'react'
import type { RecommendResponse } from '../types'
import { api } from '../api'
import { useMapStore } from '../stores/mapStore'

export function useRecommend() {
  const [route, setRoute] = useState<RecommendResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const getRecommendation = useCallback(async (interest: string) => {
    setLoading(true)
    try {
      const data = await api.recommend(interest)
      setRoute(data)
      useMapStore.getState().setLatestRoute(data)  // 同步到地图页
    } catch (err) {
      console.error('Recommendation failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { route, loading, getRecommendation }
}
