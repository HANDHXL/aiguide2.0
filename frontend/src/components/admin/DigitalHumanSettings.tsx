import { useState, useEffect } from 'react'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../utils/settings'
import type { DigitalHumanSettings as DHSettings } from '../../types'

export default function DigitalHumanSettings() {
  const [settings, setSettings] = useState<DHSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSettings(loadSettings())
  }, [])

  const handleSave = () => {
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">数字人形象管理</h2>

      {/* Preview */}
      <div className="stat-card flex items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-300 to-orange-400 flex items-center justify-center shadow-lg">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-800 to-purple-700 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-14 h-14">
              <circle cx="50" cy="45" r="30" fill="#fbbf24" opacity="0.3" />
              <ellipse cx="40" cy="40" rx="5" ry="6" fill="#e2e8f0" />
              <ellipse cx="60" cy="40" rx="5" ry="6" fill="#e2e8f0" />
              <circle cx="50" cy="55" r="8" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle cx="50" cy="40" r="35" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.5" />
            </svg>
          </div>
        </div>
        <div>
          <p className="text-xl font-semibold text-gray-800">{settings.name}</p>
          <p className="text-sm text-gray-500">当前数字人形象预览</p>
        </div>
      </div>

      {/* Settings form */}
      <div className="stat-card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">数字人名称</label>
          <input
            type="text"
            value={settings.name}
            onChange={e => setSettings(s => ({ ...s, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">交互风格</label>
          <select
            value={settings.style}
            onChange={e => setSettings(s => ({ ...s, style: e.target.value as DHSettings['style'] }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-500"
          >
            <option value="warm">亲切热情</option>
            <option value="professional">专业严谨</option>
            <option value="humorous">幽默风趣</option>
            <option value="scholarly">博学儒雅</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">语音音色</label>
          <select
            value={settings.voice}
            onChange={e => setSettings(s => ({ ...s, voice: e.target.value as DHSettings['voice'] }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-500"
          >
            <option value="female_zh">女声-中文标准</option>
            <option value="male_zh">男声-中文标准</option>
            <option value="female_sweet">女声-甜美</option>
            <option value="male_deep">男声-浑厚</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">着装风格</label>
          <select
            value={settings.clothing}
            onChange={e => setSettings(s => ({ ...s, clothing: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-500"
          >
            <option value="traditional">传统汉服</option>
            <option value="modern">现代职业装</option>
            <option value="buddhist">佛教文化衫</option>
            <option value="casual">休闲装</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            语速: {settings.speed}x
          </label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={settings.speed}
            onChange={e => setSettings(s => ({ ...s, speed: parseFloat(e.target.value) }))}
            className="w-full accent-primary-600"
          />
        </div>

        <button
          onClick={handleSave}
          className={`px-6 py-2 text-white text-sm rounded-lg transition-colors ${
            saved ? 'bg-green-500' : 'bg-primary-600 hover:bg-primary-700'
          }`}
        >
          {saved ? '已保存' : '保存设置'}
        </button>
      </div>
    </div>
  )
}
