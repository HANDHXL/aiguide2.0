import type {
  ChatRequest, ChatResponse,
  RecommendResponse, SearchResponse, HealthResponse,
  ConvSummary, ConvDetail, AdminStats, KbDocument
} from '../types'

/** 清洗 markdown 语法，避免 TTS 念出 # * 等符号 */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const BASE = '/api'
let _authToken: string | null = null

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  if (_authToken) h['Authorization'] = `Bearer ${_authToken}`
  return h
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

async function requestBlob(url: string, options?: RequestInit): Promise<Blob> {
  const res = await fetch(`${BASE}${url}`, options)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

export const api = {
  setAuthToken(token: string | null) {
    _authToken = token
  },

  health: () => request<HealthResponse>('/health'),

  chat: (data: ChatRequest & { conversation_id?: number }) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  recommend: (interest: string, duration: string = '半天') =>
    request<RecommendResponse>('/attractions/recommend', {
      method: 'POST',
      body: JSON.stringify({ interest, duration }),
    }),

  searchAttractions: (q: string, k: number = 5) =>
    request<SearchResponse>(`/attractions?q=${encodeURIComponent(q)}&k=${k}`),

  voiceChat: async (audioBlob: Blob, interest?: string) => {
    const form = new FormData()
    form.append('audio', audioBlob, 'recording.webm')
    if (interest) form.append('interest', interest)
    const res = await fetch(`${BASE}/voice/chat`, {
      method: 'POST',
      body: form,
      headers: authHeaders(),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || `HTTP ${res.status}`)
    }
    return res.json() as Promise<{
      success: boolean; question: string; answer: string
      sources: { content: string; source: string; type: string }[]
      audio: string | null
    }>
  },

  tts: async (text: string, voice: string = 'xiaoyan', speed: number = 1.0) => {
    const form = new FormData()
    form.append('text', stripMarkdown(text))
    form.append('voice', voice)
    form.append('speed', String(speed))
    return requestBlob('/voice/tts', {
      method: 'POST',
      body: form,
      headers: authHeaders(),
    })
  },

  auth: {
    register: (data: { username: string; password: string }) =>
      request<{ token: string; user_id: number; username: string }>('/auth/register', {
        method: 'POST', body: JSON.stringify(data),
      }),
    login: (data: { username: string; password: string }) =>
      request<{ token: string; user_id: number; username: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify(data),
      }),
    me: () => request<{ user_id: number; username: string }>('/auth/me'),
  },

  conversations: {
    list: () => request<ConvSummary[]>('/conversations'),
    create: (title?: string) =>
      request<ConvDetail>('/conversations', {
        method: 'POST', body: JSON.stringify({ title: title || '新对话' }),
      }),
    get: (id: number) => request<ConvDetail>(`/conversations/${id}`),
    delete: (id: number) => request<{ ok: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),
  },

  admin: {
    stats: () => request<AdminStats>('/admin/stats'),
    kbStatus: () => request<{ kb_ready: boolean; chunks: number }>('/admin/kb/status'),
    kbUpload: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${BASE}/admin/kb/upload`, {
        method: 'POST', body: form, headers: authHeaders(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      return res.json()
    },
    kbRebuild: () => request<{ ok: boolean; chunks: number }>('/admin/kb/rebuild', { method: 'POST' }),
    kbDelete: (filename: string) => request<{ ok: boolean }>(`/admin/kb/document/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
    kbDocuments: () => request<{ documents: KbDocument[] }>('/admin/kb/documents'),
  },
}
