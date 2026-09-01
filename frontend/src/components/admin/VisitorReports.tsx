import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../../api'
import type { AdminStats } from '../../types'

export default function VisitorReports() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.admin.stats().then(s => { setStats(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-800">游客感受度报告</h2>
        <div className="stat-card h-72 animate-pulse bg-gray-100" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-800">游客感受度报告</h2>
        <div className="stat-card text-center py-12 text-gray-400">
          <p>数据加载失败</p>
          <button onClick={() => window.location.reload()} className="text-primary-600 text-sm mt-2 hover:underline">重新加载</button>
        </div>
      </div>
    )
  }

  // Real sentiment trend from LLM-based analysis
  const sentimentTrend = stats.sentiment_trend?.length > 0
    ? stats.sentiment_trend.map(d => ({
        date: d.date,
        满意: d.satisfied,
        中性: d.neutral,
        不满意: d.unsatisfied,
      }))
    : stats.trend.map(d => ({
        date: d.date,
        满意: 0,
        中性: 0,
        不满意: 0,
      }))

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">游客感受度报告</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card text-center">
          <p className="text-3xl font-bold text-gray-900">{stats.satisfaction.satisfied}%</p>
          <p className="text-sm text-gray-500">满意率</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl font-bold text-gray-900">{stats.week_visits}</p>
          <p className="text-sm text-gray-500">本周服务量</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl font-bold text-gray-900">{stats.total_conversations}</p>
          <p className="text-sm text-gray-500">总对话数</p>
        </div>
      </div>

      {/* Sentiment trend */}
      <div className="stat-card">
        <h3 className="text-sm font-medium text-gray-700 mb-4">游客情感趋势 (近7天)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={sentimentTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <Tooltip />
            <Line type="monotone" dataKey="满意" stroke="#1f2937" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="中性" stroke="#6b7280" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="不满意" stroke="#d1d5db" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Hot questions */}
      <div className="stat-card">
        <h3 className="text-sm font-medium text-gray-700 mb-3">热门提问 TOP5</h3>
        {stats.hot_questions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">暂无数据</p>
        ) : (
          <div className="space-y-2">
            {stats.hot_questions.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                    i === 0 ? 'bg-gray-200 text-gray-800' :
                    i === 1 ? 'bg-gray-100 text-gray-700' :
                    i === 2 ? 'bg-gray-100 text-gray-600' :
                    'bg-gray-50 text-gray-500'
                  }`}>{i + 1}</span>
                  <span className="text-sm text-gray-700">{item.question}</span>
                </div>
                <span className="text-sm text-gray-500">{item.count}次</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="stat-card">
        <h3 className="text-sm font-medium text-gray-700 mb-3">服务优化建议</h3>
        <div className="space-y-2">
          {stats.suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-gray-50 border border-gray-200">
              <span className="text-gray-500 mt-0.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </span>
              <span className="text-sm text-gray-700">{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
