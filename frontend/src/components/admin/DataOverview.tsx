import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { api } from '../../api'
import type { AdminStats } from '../../types'

function StatCard({ title, value, sub, color }: { title: string; value: string; sub: string; color: string }) {
  return (
    <div className="stat-card">
      <p className="text-sm text-gray-500 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  )
}

const COLORS = ['#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af']

export default function DataOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.admin.stats().then(s => { setStats(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-800">数据概览</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="stat-card animate-pulse h-24 bg-gray-100" />)}
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-800">数据概览</h2>
        <div className="stat-card text-center py-12 text-gray-400">
          <p>数据加载失败</p>
          <button onClick={() => window.location.reload()} className="text-primary-600 text-sm mt-2 hover:underline">重新加载</button>
        </div>
      </div>
    )
  }

  const trendData = stats.trend.map(d => ({ name: d.date, 服务量: d.count }))
  const topicData = stats.hot_questions.map(q => ({ name: q.question.slice(0, 10), value: q.count }))
  const hotLabel = stats.hot_questions[0]?.question?.slice(0, 12) || '暂无数据'
  const hotCount = stats.hot_questions[0]?.count || 0

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">数据概览</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="今日服务人次" value={String(stats.today_visits)} sub={`总消息 ${stats.total_messages.toLocaleString()} 条`} color="text-gray-900" />
        <StatCard title="本周服务人次" value={String(stats.week_visits)} sub={`${stats.total_conversations} 次对话`} color="text-gray-900" />
        <StatCard title="用户满意度" value={`${stats.satisfaction.satisfied}%`} sub={`中性 ${stats.satisfaction.neutral}% · 不满意 ${stats.satisfaction.unsatisfied}%`} color="text-gray-900" />
        <StatCard title="热门问答TOP1" value={hotLabel} sub={`被提问 ${hotCount} 次`} color="text-gray-900" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h3 className="text-sm font-medium text-gray-700 mb-4">本周服务趋势</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="服务量" fill="#374151" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="stat-card">
          <h3 className="text-sm font-medium text-gray-700 mb-4">热门问题分布</h3>
          {topicData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={topicData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value">
                    {topicData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {topicData.map((t, i) => (
                  <div key={t.name} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />{t.name}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">暂无数据</div>
          )}
        </div>
      </div>

      <div className="stat-card flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700">知识库状态</h3>
          <p className="text-xs text-gray-400 mt-1">向量数据库 · {stats.kb_chunks} 个文档块 · {stats.total_users} 个注册用户</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${stats.kb_ready ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500'}`}>
          {stats.kb_ready ? '运行中' : '未连接'}
        </span>
      </div>
    </div>
  )
}
