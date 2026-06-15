import { useEffect, useState, useRef, useCallback } from 'react'
import { api } from '../../api'
import type { KbDocument } from '../../types'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function typeLabel(type: string) {
  const map: Record<string, string> = { docx: 'DOC', xlsx: 'XLS', pdf: 'PDF', txt: 'TXT' }
  return map[type] || type.toUpperCase().slice(0, 3)
}

export default function KnowledgeManager() {
  const [docs, setDocs] = useState<KbDocument[]>([])
  const [chunks, setChunks] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    try {
      const [docRes, kbRes] = await Promise.all([api.admin.kbDocuments(), api.admin.kbStatus()])
      setDocs(docRes.documents)
      setChunks(kbRes.chunks)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setStatus(`正在上传并索引 ${file.name}...`)
    try {
      await api.admin.kbUpload(file)
      setStatus('上传成功，知识库已更新')
      await loadData()
    } catch (err: any) {
      setStatus(`上传失败: ${err.message}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(() => setStatus(''), 3000)
    }
  }

  const handleDelete = async (filename: string) => {
    if (!confirm(`确定删除 ${filename}？`)) return
    setStatus(`正在删除 ${filename}...`)
    try {
      await api.admin.kbDelete(filename)
      setStatus('删除成功，知识库已重建')
      await loadData()
    } catch (err: any) {
      setStatus(`删除失败: ${err.message}`)
    }
    setTimeout(() => setStatus(''), 3000)
  }

  const handleRebuild = async () => {
    setRebuilding(true)
    setStatus('正在重建知识库索引...')
    try {
      const res = await api.admin.kbRebuild()
      setStatus(`重建完成，共 ${res.chunks} 个文档块`)
      await loadData()
    } catch (err: any) {
      setStatus(`重建失败: ${err.message}`)
    } finally {
      setRebuilding(false)
      setTimeout(() => setStatus(''), 3000)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">知识库管理</h2>
        <label className={`px-4 py-2 text-white text-sm rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-gray-400' : 'bg-primary-600 hover:bg-primary-700'}`}>
          {uploading ? '上传中...' : '上传文档'}
          <input ref={fileRef} type="file" accept=".docx,.xlsx,.pdf,.txt" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {/* Status toast */}
      {status && (
        <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">{status}</div>
      )}

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card text-center">
          <p className="text-3xl font-bold text-indigo-600">{docs.length}</p>
          <p className="text-sm text-gray-500">知识文档</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl font-bold text-green-600">{chunks}</p>
          <p className="text-sm text-gray-500">文档分块</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl font-bold text-amber-600">768维</p>
          <p className="text-sm text-gray-500">向量维度</p>
        </div>
      </div>

      {/* Doc list */}
      <div className="stat-card">
        <h3 className="text-sm font-medium text-gray-700 mb-3">已索引文档</h3>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">暂无文档，请上传景区资料</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc, i) => (
              <div key={i} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                    {typeLabel(doc.type)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{doc.name}</p>
                    <p className="text-xs text-gray-400">{formatSize(doc.size)} · {doc.type} 格式</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">已索引</span>
                  <button
                    onClick={() => handleDelete(doc.name)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="删除文档"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rebuild button */}
      <div className="stat-card">
        <h3 className="text-sm font-medium text-gray-700 mb-2">维护操作</h3>
        <p className="text-xs text-gray-400 mb-3">重新构建向量索引会重新分块并生成所有文档的向量嵌入</p>
        <button
          onClick={handleRebuild}
          disabled={rebuilding}
          className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {rebuilding ? '重建中...' : '重新构建知识库'}
        </button>
      </div>
    </div>
  )
}
