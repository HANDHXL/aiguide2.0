import { useState, useEffect, useCallback } from 'react'
import Live2DDigitalHuman from '../components/Live2DDigitalHuman'

interface MotionInfo {
  no: number        // 0-based index in group
  label: string     // display label like "m01"
  duration: string  // approx duration
  semantics: string // semantic meaning
  hasSound: boolean
}

interface ExpressionInfo {
  id: string
  emotion: string
  desc: string
}

// ============================================================
// Motion registry — mirrors Haru.model3.json + semantic bindings
// ============================================================

const IDLE_MOTIONS: MotionInfo[] = [
  { no: 0, label: 'haru_g_idle', duration: '10.0s', semantics: '🔄 站立呼吸循环', hasSound: false },
  { no: 1, label: 'haru_g_m15',  duration: '5.3s',  semantics: '🔄 空闲循环（备用）', hasSound: false },
]

const TAPBODY_MOTIONS: MotionInfo[] = [
  { no: 0,  label: 'm01', duration: '2.9s',  semantics: '🙆 点头', hasSound: false },
  { no: 1,  label: 'm02', duration: '2.0s',  semantics: '🙅 拒绝', hasSound: false },
  { no: 2,  label: 'm03', duration: '4.6s',  semantics: '🙆 点头（长）', hasSound: false },
  { no: 3,  label: 'm04', duration: '5.3s',  semantics: '🤷 轻微手势', hasSound: false },
  { no: 4,  label: 'm05', duration: '2.0s',  semantics: '💕 关心 / 单手轻摆', hasSound: false },
  { no: 5,  label: 'm06', duration: '4.5s',  semantics: '🎉 庆祝', hasSound: true },
  { no: 6,  label: 'm07', duration: '3.9s',  semantics: '🙅 拒绝 / 皱眉', hasSound: false },
  { no: 7,  label: 'm08', duration: '4.6s',  semantics: '😢 悲伤', hasSound: false },
  { no: 8,  label: 'm09', duration: '4.0s',  semantics: '💕 关心 / 🙏 感谢', hasSound: true },
  { no: 9,  label: 'm10', duration: '5.5s',  semantics: '👋 挥手', hasSound: false },
  { no: 10, label: 'm11', duration: '3.4s',  semantics: '🤔 思考', hasSound: false },
  { no: 11, label: 'm12', duration: '4.9s',  semantics: '🤔 思考 / ❓ 提问（双手交叉）', hasSound: false },
  { no: 12, label: 'm13', duration: '2.5s',  semantics: '🎉 庆祝 / 😲 惊喜', hasSound: false },
  { no: 13, label: 'm14', duration: '3.0s',  semantics: '😲 惊喜', hasSound: false },
  { no: 14, label: 'm15', duration: '5.3s',  semantics: '🔄 空闲备用 / 😢 悲伤', hasSound: false },
  { no: 15, label: 'm16', duration: '4.0s',  semantics: '🙇 道歉', hasSound: false },
  { no: 16, label: 'm17', duration: '4.5s',  semantics: '🙇 道歉 / 🙏 感谢', hasSound: false },
  { no: 17, label: 'm18', duration: '3.2s',  semantics: '❓ 提问', hasSound: false },
  { no: 18, label: 'm19', duration: '8.0s',  semantics: '⏳ 等待（最长动作）', hasSound: false },
  { no: 19, label: 'm20', duration: '6.0s',  semantics: '⚠️ 提醒', hasSound: true },
  { no: 20, label: 'm21', duration: '5.0s',  semantics: '🙏 邀请', hasSound: false },
  { no: 21, label: 'm22', duration: '5.0s',  semantics: '🎤 讲解', hasSound: false },
  { no: 22, label: 'm23', duration: '4.0s',  semantics: '🎤 讲解（抱手交叉臂）', hasSound: false },
  { no: 23, label: 'm24', duration: '3.4s',  semantics: '⭐ 推荐', hasSound: false },
  { no: 24, label: 'm25', duration: '4.0s',  semantics: '⚠️ 警告', hasSound: false },
  { no: 25, label: 'm26', duration: '5.0s',  semantics: '📝 总结', hasSound: true },
]

const EXPRESSIONS: ExpressionInfo[] = [
  { id: 'F01', emotion: '😊 微笑',   desc: '轻度微笑，默认表情' },
  { id: 'F02', emotion: '😲 惊讶',   desc: '眉毛抬高、嘴巴张开' },
  { id: 'F03', emotion: '😢 悲伤',   desc: '眉毛下垂、嘴角向下' },
  { id: 'F04', emotion: '😠 愤怒',   desc: '皱眉、眯眼' },
  { id: 'F05', emotion: '😆 闭眼笑', desc: '眼睛闭合、笑容' },
  { id: 'F06', emotion: '👀 睁大眼', desc: '眼睛放大2倍、眉毛抬高' },
  { id: 'F07', emotion: '😳 害羞',   desc: '脸红、眉毛下垂' },
  { id: 'F08', emotion: '😔 担忧',   desc: '眼睛微眯、嘴角向下' },
]

// Priority constants (mirrors lappdefine.ts)
const PRIORITY = {
  None:  0,
  Idle:  1,
  Normal: 2,
  Force: 3,
}

export default function MotionTest() {
  const [status, setStatus] = useState('模型加载中...')
  const [modelReady, setModelReady] = useState(false)

  // Wait for model to be ready via window.__live2dModel
  useEffect(() => {
    const check = setInterval(() => {
      const model = (window as any).__live2dModel
      if (model) {
        setModelReady(true)
        setStatus('✅ 模型就绪')
        clearInterval(check)
      }
    }, 300)
    // Fallback: stop checking after 15s
    const timeout = setTimeout(() => {
      clearInterval(check)
      if (!(window as any).__live2dModel) {
        setStatus('⚠️ 模型未在 15s 内就绪，请刷新')
      }
    }, 15000)
    return () => { clearInterval(check); clearTimeout(timeout) }
  }, [])

  const getModel = useCallback(() => {
    return (window as any).__live2dModel
  }, [])

  const playMotion = useCallback((group: string, no: number, label: string) => {
    const model = getModel()
    if (!model) { setStatus('❌ 模型未就绪'); return }
    model._motionManager.stopAllMotions()
    const handle = model.startMotion(group, no, PRIORITY.Force)
    if (handle === -1) {
      setStatus(`❌ 启动失败: ${label}`)
    } else {
      setStatus(`▶ 播放中: ${label}`)
    }
  }, [getModel])

  const playIdle = useCallback(() => {
    const model = getModel()
    if (!model) return
    model._motionManager.stopAllMotions()
    model.startMotion('Idle', 0, PRIORITY.Normal)
    setStatus('▶ Idle 循环: haru_g_idle')
  }, [getModel])

  const setExpr = useCallback((id: string, emotion: string) => {
    const model = getModel()
    if (!model) return
    model.setExpression(id)
    setStatus(`😊 表情: ${emotion}`)
  }, [getModel])

  const stopAll = useCallback(() => {
    const model = getModel()
    if (!model) return
    model._motionManager.stopAllMotions()
    model.setExpression('F01')
    setStatus('⏹ 已停止，回到待机')
  }, [getModel])

  const playRandom = useCallback(() => {
    const model = getModel()
    if (!model) return
    const no = Math.floor(Math.random() * 26)
    const info = TAPBODY_MOTIONS[no]
    model._motionManager.stopAllMotions()
    model.startMotion('TapBody', no, PRIORITY.Force)
    setStatus(`🎲 随机: ${info.label} — ${info.semantics}`)
  }, [getModel])

  return (
    <div className="flex h-full" style={{ background: '#111' }}>
      {/* ====== Left: Live2D Canvas ====== */}
      <div className="flex-1 relative" style={{ minWidth: 0 }}>
        <Live2DDigitalHuman />
        {/* Status bar */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3">
          <div className="flex-1 px-4 py-2 rounded-lg text-sm font-mono"
               style={{ background: 'rgba(0,0,0,0.75)', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.1)' }}>
            {status}
          </div>
          <button
            onClick={stopAll}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:scale-105"
            style={{ background: '#374151' }}
          >
            ⏹ 停止
          </button>
          <button
            onClick={playRandom}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:scale-105"
            style={{ background: '#4b5563' }}
            disabled={!modelReady}
          >
            🎲 随机
          </button>
        </div>
      </div>

      {/* ====== Right: Control Panel ====== */}
      <div className="flex flex-col overflow-y-auto" style={{
        width: 420,
        background: '#1a1a1a',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 py-4" style={{ background: '#1a1a1a', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h1 className="text-lg font-bold text-white">🎭 动作 & 表情测试面板</h1>
          <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Haru Live2D · {TAPBODY_MOTIONS.length} 动作 + {EXPRESSIONS.length} 表情</p>
        </div>

        <div className="px-4 py-3 space-y-5">

          {/* ---- Idle Group ---- */}
          <section>
            <h2 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: '#d1d5db' }}>
              <span>🔄</span> Idle 空闲组（{IDLE_MOTIONS.length}个）
            </h2>
            <div className="flex gap-2 flex-wrap">
              {IDLE_MOTIONS.map(m => (
                <button
                  key={m.label}
                  onClick={() => playMotion('Idle', m.no, m.label)}
                  disabled={!modelReady}
                  className="px-3 py-2 rounded-lg text-xs font-bold transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#334155', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  {m.label}
                  <span className="block text-[10px] opacity-70">{m.duration}</span>
                </button>
              ))}
              <button
                onClick={playIdle}
                disabled={!modelReady}
                className="px-3 py-2 rounded-lg text-xs font-bold transition-all hover:scale-105 disabled:opacity-40"
                style={{ background: '#fbbf24', color: '#1a1a1a' }}
              >
                ▶ 启动Idle循环
              </button>
            </div>
          </section>

          {/* ---- TapBody Group ---- */}
          <section>
            <h2 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: '#d1d5db' }}>
              <span>👆</span> TapBody 交互组（{TAPBODY_MOTIONS.length}个）
            </h2>
            <div className="grid grid-cols-2 gap-1.5">
              {TAPBODY_MOTIONS.map(m => (
                <button
                  key={m.label}
                  onClick={() => playMotion('TapBody', m.no, m.label)}
                  disabled={!modelReady}
                  className="text-left px-2.5 py-2 rounded-md text-xs transition-all hover:scale-[1.03] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: '#1e293b',
                    color: '#e2e8f0',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold" style={{ color: '#d1d5db' }}>{m.label}</span>
                    <span className="text-[10px] opacity-50">{m.duration}</span>
                    {m.hasSound && <span title="带配音">🔊</span>}
                  </div>
                  <div className="text-[11px] mt-0.5 leading-tight" style={{ color: '#9ca3af' }}>
                    {m.semantics}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ---- Expressions ---- */}
          <section className="pb-4">
            <h2 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: '#d1d5db' }}>
              <span>😊</span> Expressions 表情（{EXPRESSIONS.length}个）
            </h2>
            <div className="grid grid-cols-2 gap-1.5">
              {EXPRESSIONS.map(e => (
                <button
                  key={e.id}
                  onClick={() => setExpr(e.id, e.emotion)}
                  disabled={!modelReady}
                  className="text-left px-2.5 py-2 rounded-md text-xs transition-all hover:scale-[1.03] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: '#1e293b',
                    color: '#e2e8f0',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <span className="font-mono font-bold" style={{ color: '#d1d5db' }}>{e.id}</span>
                  <span className="ml-2">{e.emotion}</span>
                  <div className="text-[10px] mt-0.5 opacity-50">{e.desc}</div>
                </button>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
