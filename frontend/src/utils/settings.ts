import type { DigitalHumanSettings } from '../types'

export const DEFAULT_SETTINGS: DigitalHumanSettings = {
  name: '小灵',
  style: 'warm',
  voice: 'female_zh',
  clothing: 'traditional',
  speed: 1.0,
}

const SETTINGS_KEY = 'digital_human_settings'

export function loadSettings(): DigitalHumanSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: DigitalHumanSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

const VOICE_MAP: Record<string, string> = {
  female_zh: 'xiaoyan',
  male_zh: 'xiaofeng',
  female_sweet: 'xiaoyan2',
  male_deep: 'male',
}

export function getTtsVoice(settingsVoice: string): string {
  return VOICE_MAP[settingsVoice] || 'xiaoyan'
}

const STYLE_MAP: Record<string, string> = {
  warm: '你是一个亲切热情的导游，用温暖友善的语气与游客交流。',
  professional: '你是一个专业严谨的导游，回答准确详实、条理清晰。',
  humorous: '你是一个幽默风趣的导游，回答轻松有趣、让人愉快。',
  scholarly: '你是一个博学儒雅的导游，引经据典、娓娓道来。',
}

export function getPersonaPrompt(style: string): string {
  return STYLE_MAP[style] || STYLE_MAP.warm
}
