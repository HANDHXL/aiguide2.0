export interface ChatRequest {
  question: string
  conversation_id?: number
  interest?: string
  persona?: string
  name?: string
}

export interface SourceDoc {
  content: string
  source: string
  type: string
}

export interface ChatResponse {
  question: string
  answer: string
  sources: SourceDoc[]
  conversation_id?: number
}

export interface ConvSummary {
  id: number
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

export interface ConvDetail {
  id: number
  title: string
  messages: {
    id: number
    role: string
    content: string
    sources?: SourceDoc[]
    created_at: string
  }[]
  created_at: string
}

export interface RouteStep {
  order: number
  attraction_name: string
  duration_minutes: number
  description: string
}

export interface RecommendResponse {
  interest: string
  route_name: string
  steps: RouteStep[]
  total_duration: string
}

export interface SearchResult {
  content: string
  source: string
  type: string
}

export interface SearchResponse {
  query: string
  count: number
  results: SearchResult[]
}

export interface HealthResponse {
  status: string
  version: string
  kb_ready: boolean
}

export interface AdminStats {
  today_visits: number
  week_visits: number
  total_conversations: number
  total_messages: number
  total_users: number
  satisfaction: { satisfied: number; neutral: number; unsatisfied: number }
  trend: { date: string; count: number }[]
  hot_questions: { question: string; count: number }[]
  kb_ready: boolean
  kb_chunks: number
  suggestions: string[]
}

export interface KbDocument {
  name: string
  size: number
  type: string
  updated_at: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SourceDoc[]
  timestamp: number
}

export interface DigitalHumanSettings {
  name: string
  style: 'warm' | 'professional' | 'humorous' | 'scholarly'
  voice: 'female_zh' | 'male_zh' | 'female_sweet' | 'male_deep'
  clothing: string
  speed: number
}
