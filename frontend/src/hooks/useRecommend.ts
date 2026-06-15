import { useState, useCallback } from 'react'
import type { RecommendResponse } from '../types'
import { api } from '../api'

export function useRecommend() {
  const [route, setRoute] = useState<RecommendResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const getRecommendation = useCallback(async (interest: string) => {
    setLoading(true)
    try {
      const data = await api.recommend(interest)
      setRoute(data)
    } catch (err) {
      console.error('Recommendation failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { route, loading, getRecommendation }
}
