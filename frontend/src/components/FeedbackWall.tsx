import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { FeedbackItem } from '../types'

function StarRating({ rating, onChange }: { rating: number; onChange?: (r: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          disabled={!onChange}
          onClick={() => onChange?.(i)}
          className={`text-sm ${onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-all ${
            i <= rating ? 'text-gray-900' : 'text-gray-300'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function FeedbackWall() {
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([])
  const [content, setContent] = useState('')
  const [rating, setRating] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState('')

  const loadFeedback = useCallback(async () => {
    try { setFeedbackList(await api.feedback.list()) } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadFeedback() }, [loadFeedback])

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    setStatus('')
    try {
      await api.feedback.create({ content: content.trim(), rating })
      setContent('')
      setRating(5)
      setStatus('留言成功，感谢您的反馈！')
      await loadFeedback()
    } catch {
      setStatus('提交失败，请重试')
    } finally {
      setSubmitting(false)
      setTimeout(() => setStatus(''), 3000)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Write feedback */}
      <div className="px-4 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">💬 游客留言墙</h2>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="分享您的游览体验或建议..."
          maxLength={500}
          rows={2}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs resize-none focus:outline-none focus:border-gray-400"
        />
        <div className="flex items-center justify-between mt-2">
          <StarRating rating={rating} onChange={setRating} />
          <button
            onClick={handleSubmit}
            disabled={submitting || !content.trim()}
            className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-black disabled:opacity-40 transition-colors"
          >
            {submitting ? '提交中...' : '提交留言'}
          </button>
        </div>
        {status && (
          <p className={`text-xs mt-1.5 ${status.includes('失败') ? 'text-gray-500' : 'text-gray-600'}`}>
            {status}
          </p>
        )}
      </div>

      {/* Feedback list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {feedbackList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <p className="text-xs">暂无留言，快来分享你的感受吧</p>
          </div>
        ) : (
          feedbackList.map(fb => (
            <div key={fb.id} className="py-2 border-b border-gray-50 last:border-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-medium text-gray-700">{fb.username}</span>
                <div className="flex items-center gap-1.5">
                  <StarRating rating={fb.rating} />
                  <span className="text-[10px] text-gray-400">
                    {new Date(fb.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{fb.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
