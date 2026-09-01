/**
 * 根据导游回答内容，加权推荐伴随动作。
 * 每个动作有 score，score 越高越容易被选中。
 */

export interface MotionHint {
  no: number      // TapBody 动作编号 (1-based)
  label: string
  score: number   // 基础权重 0~1
}

// 语义类别 → 候选动作及权重 + 表情映射
interface CategoryRule {
  keywords: string[]
  motions: MotionHint[]
  expression?: string   // Live2D 表情 ID: F01(微笑) F02(惊讶) F04(悲伤) F05(开心) F06(严肃)
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    keywords: ['欢迎', '来到', '光临', '你好', '您好', '大家好', '见到'],
    motions: [
      { no: 10, label: '挥手', score: 1.0 },
      { no: 21, label: '邀请', score: 0.8 },
      { no: 1, label: '点头', score: 0.6 },
    ],
    expression: 'F05',  // 欢迎 → Joy
  },
  {
    keywords: ['谢谢', '感谢', '感恩', '多谢', '辛苦了'],
    motions: [
      { no: 1, label: '点头', score: 1.0 },
      { no: 4, label: '手势', score: 0.5 },
      { no: 21, label: '邀请', score: 0.3 },
    ],
    expression: 'F05',  // 感谢 → Joy
  },
  {
    keywords: ['推荐', '建议', '值得', '一定要', '不妨', '可以试试'],
    motions: [
      { no: 24, label: '推荐', score: 1.0 },
      { no: 23, label: '抱手讲解', score: 0.6 },
      { no: 22, label: '讲解', score: 0.5 },
    ],
    expression: 'F01',  // 推荐 → Gentle Smile
  },
  {
    keywords: ['历史', '建于', '修建', '朝代', '古代', '千年', '百年', '传统', '文化', '佛教', '寺院', '菩萨'],
    motions: [
      { no: 22, label: '讲解', score: 1.0 },
      { no: 23, label: '抱手讲解', score: 0.9 },
      { no: 11, label: '思考', score: 0.4 },
    ],
    expression: 'F06',  // 历史讲解 → Serious
  },
  {
    keywords: ['故事', '传说', '据说', '相传', '有意思', '有趣', '典故'],
    motions: [
      { no: 22, label: '讲解', score: 1.0 },
      { no: 12, label: '双手思考', score: 0.7 },
      { no: 4, label: '手势', score: 0.6 },
    ],
    expression: 'F02',  // 故事/趣闻 → Surprised
  },
  {
    keywords: ['总结', '总的来说', '以上', '大概', '差不多', '主要'],
    motions: [
      { no: 24, label: '推荐', score: 0.8 },
      { no: 23, label: '抱手讲解', score: 0.7 },
      { no: 4, label: '手势', score: 0.5 },
    ],
    expression: 'F01',  // 总结 → Gentle Smile
  },
  {
    keywords: ['请问', '什么', '怎么', '为什么', '哪里', '哪个', '多少'],
    motions: [
      { no: 18, label: '提问', score: 1.0 },
      { no: 11, label: '思考', score: 0.8 },
      { no: 12, label: '双手思考', score: 0.6 },
    ],
    expression: 'F01',  // 提问 → Gentle Smile
  },
  {
    keywords: ['小心', '注意', '提醒', '安全', '不要', '禁止'],
    motions: [
      { no: 21, label: '邀请', score: 0.7 },
      { no: 4, label: '手势', score: 0.5 },
      { no: 1, label: '点头', score: 0.4 },
    ],
    expression: 'F06',  // 安全提醒 → Serious
  },
  {
    keywords: ['抱歉', '对不起', '遗憾', '不好意思', '请谅解', '未能', '无法', '暂时不'],
    motions: [
      { no: 16, label: '致歉', score: 1.0 },
      { no: 1, label: '点头', score: 0.7 },
      { no: 4, label: '手势', score: 0.4 },
    ],
    expression: 'F04',  // 致歉 → Sad
  },
  {
    keywords: ['再见', '欢迎再来', '下次见', '拜拜', '期待', '祝您'],
    motions: [
      { no: 10, label: '挥手', score: 1.0 },
      { no: 1, label: '点头', score: 0.7 },
      { no: 21, label: '邀请', score: 0.5 },
    ],
    expression: 'F05',  // 告别 → Joy (warm farewell)
  },
  {
    keywords: ['壮观', '美丽', '漂亮', '宏伟', '震撼', '太棒', '著名', '闻名', '独特', '神奇'],
    motions: [
      { no: 24, label: '推荐', score: 0.9 },
      { no: 22, label: '讲解', score: 0.7 },
      { no: 13, label: '惊讶', score: 0.6 },
    ],
    expression: 'F02',  // 赞美景观 → Surprised/Amazed
  },
]

/**
 * 分析回答文本，返回带权重的动作分数表。
 * 返回 Map<no, score>，score 越高的动作越适合当前回答。
 */
export function analyzeResponseForMotions(text: string): Map<number, number> {
  const scores = new Map<number, number>()

  for (const rule of CATEGORY_RULES) {
    let matched = false
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        matched = true
        break
      }
    }
    if (!matched) continue

    for (const m of rule.motions) {
      const current = scores.get(m.no) || 0
      scores.set(m.no, Math.max(current, m.score))
    }
  }

  // 兜底：无匹配时默认讲解+点头
  if (scores.size === 0) {
    scores.set(22, 0.8)
    scores.set(1, 0.5)
    scores.set(4, 0.4)
  }

  return scores
}

/**
 * 基于加权分数随机选一个动作编号 (1-based TapBody no)
 */
export function pickWeightedMotion(scores: Map<number, number>, excludeNo?: number): number {
  const entries = Array.from(scores.entries()).filter(([no]) => no !== excludeNo)
  if (entries.length === 0) return 4 // fallback 手势

  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0)
  let r = Math.random() * totalWeight
  for (const [no, w] of entries) {
    r -= w
    if (r <= 0) return no
  }
  return entries[entries.length - 1][0]
}

/**
 * 表情优先级 — 数字越小优先级越高。
 * 当多个语义类别同时命中时，选择优先级最高的表情。
 * 设计原则：情绪化表情优先于中性表情，让数字人更有表现力。
 */
const EXPRESSION_PRIORITY: Record<string, number> = {
  F04: 1,  // Sad — 致歉/遗憾，最高优先级
  F05: 2,  // Joy — 欢迎/感谢/告别
  F02: 3,  // Surprised — 故事/趣闻/赞美
  F06: 4,  // Serious — 历史讲解/安全提醒
  F01: 5,  // Gentle Smile — 默认/推荐/总结/提问
}

/**
 * 分析回答文本，返回推荐的表情 ID (F01-F08)。
 * 任何情况下都返回一个有效表情，默认 F01（温和微笑）。
 *
 * @param text  AI 导游的回答文本
 * @returns     Live2D 表情 ID，如 'F05'、'F06'
 */
export function analyzeResponseForExpression(text: string): string {
  if (!text || text.length < 2) return 'F01'

  let bestExpression = 'F01'
  let bestPriority = 999

  for (const rule of CATEGORY_RULES) {
    if (!rule.expression) continue

    let matched = false
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        matched = true
        break
      }
    }
    if (!matched) continue

    const priority = EXPRESSION_PRIORITY[rule.expression] ?? 99
    if (priority < bestPriority) {
      bestPriority = priority
      bestExpression = rule.expression
    }
  }

  return bestExpression
}
