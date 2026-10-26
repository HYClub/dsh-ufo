/**
 * 稀有度与成就：全部由证据推导，模型无权决定。
 * 成就分两层：公开成就（一直显示名字）+ 隐藏成就（解锁前只显示「尚未发现」）。
 * @module dsh-ufo/lib/rarity
 */

/**
 * @param {object} record 归一化记录
 * @param {{ hasOfficialDocument?: boolean }} [context]
 * @returns {'normal' | 'unexplained' | 'hidden' | 'landmark'}
 */
export function classifyRarity(record, context = {}) {
  const hasDoc = context.hasOfficialDocument ?? (record.documents?.length ?? 0) > 0
  const contradicted = record.contradiction === true
  void hasDoc

  if (record.landmark === true) return 'landmark'
  // 「隐蔽」只留给真正对不上的记录：官方解释与叙述冲突。
  // 只有一份没写结论的档案，不算隐蔽，最多算未解。
  if (contradicted) return 'hidden'
  if (!record.explanation) return 'unexplained'
  return 'normal'
}

export const RARITY_META = {
  normal: { label: '常规记录', color: '#8b93a7', hint: '已有解释或来源单一' },
  unexplained: { label: '未解之谜', color: '#ff9f0a', hint: '来源未给出解释' },
  hidden: { label: '隐蔽档案', color: '#a855f7', hint: '官方档案与民间记录对不上' },
  landmark: { label: '地标事件', color: '#ffd700', hint: '多方档案共同指向' }
}

/**
 * 成就定义。
 * - `hidden: true` 的条目在解锁前不暴露 name/desc/reward，界面上只显示「尚未发现」。
 * - test 只接受 counters，纯函数，便于测试。
 */
export const ACHIEVEMENTS = [
  // —— 公开 ——
  { id: 'first-contact', name: '初次接触', desc: '收录 1 条记录', reward: '档案馆启用', metric: 'total', need: 1, test: (c) => c.total >= 1 },
  { id: 'archivist', name: '档案管理员', desc: '收录 10 条记录', reward: '卡片错峰入场', metric: 'total', need: 10, test: (c) => c.total >= 10 },
  { id: 'unsolved-hunter', name: '未解之谜追踪者', desc: '收录 5 条未解记录', reward: '未解标记', metric: 'unexplained', need: 5, test: (c) => c.unexplained >= 5 },
  { id: 'deep-web', name: '深网探索者', desc: '发现 1 条隐蔽档案', reward: '隐蔽标记', metric: 'hidden', need: 1, test: (c) => c.hidden >= 1 },
  { id: 'global-listener', name: '环球监听', desc: '覆盖 3 个国家', reward: '国家计数', metric: 'countries', need: 3, test: (c) => c.countries >= 3 },
  { id: 'time-traveller', name: '时间旅行者', desc: '记录跨度 ≥ 50 年', reward: '星空动效', metric: 'spanYears', need: 50, test: (c) => c.spanYears >= 50 },
  { id: 'visual-witness', name: '视觉见证者', desc: '本地保存 3 张图', reward: '图片排版', metric: 'images', need: 3, test: (c) => c.images >= 3 },
  { id: 'original-collector', name: '原件收集者', desc: '收录 3 条带官方档案的记录', reward: '原件标记', metric: 'docCount', need: 3, test: (c) => c.docCount >= 3 },

  // —— 隐藏：解锁前只显示「尚未发现」 ——
  {
    id: 'hidden-origin',
    name: '起点',
    desc: '收录一条 1950 年以前的记录',
    reward: '档案时间轴起点标记',
    hidden: true,
    test: (c) => c.earliestYear !== null && c.earliestYear <= 1950
  },
  {
    id: 'hidden-airport',
    name: '塔台静默',
    desc: '收录一条发生在机场的目击',
    reward: '机场事件标记',
    hidden: true,
    test: (c) => c.airportCount >= 1
  },
  {
    id: 'hidden-xiaoshan',
    name: '钱塘疑云',
    desc: '收录一条中国境内的记录',
    reward: '中国来源标记',
    hidden: true,
    test: (c) => c.chinaCount >= 1
  },
  {
    id: 'hidden-original',
    name: '原件',
    desc: '命中一份官方档案原件（蓝皮书 / DEFE / GEIPAN / NARA）',
    reward: '来源旁「原件」徽章',
    hidden: true,
    test: (c) => c.hasOriginal === true
  },
  {
    id: 'hidden-misread',
    name: '人间误会',
    desc: '收录一条已被解释为卫星、气球或飞机的记录',
    reward: '误认标记',
    hidden: true,
    test: (c) => c.misreadCount >= 1
  },
  {
    id: 'hidden-void',
    name: '空白页',
    desc: '查过一次什么都没有的检索',
    reward: '空档案印章',
    hidden: true,
    test: (c) => c.emptySearches >= 1
  },
  {
    id: 'hidden-polyglot',
    name: '通译',
    desc: '摘录覆盖 3 种语言',
    reward: '原文语言标记',
    hidden: true,
    test: (c) => c.languageCount >= 3
  },
  {
    id: 'hidden-same-night',
    name: '同一夜',
    desc: '同一天收录两条以上记录',
    reward: '夜间事件束',
    hidden: true,
    test: (c) => c.sameDayMax >= 2
  },
  {
    id: 'hidden-southern',
    name: '南半球',
    desc: '收录一条南半球国家的记录',
    reward: '半球标记',
    hidden: true,
    test: (c) => c.southernCount >= 1
  },
  {
    id: 'hidden-area51',
    name: '禁区',
    desc: '收录一条与 51 区 / 格鲁姆湖有关的记录',
    reward: '禁区标记',
    hidden: true,
    test: (c) => c.area51Count >= 1
  },
  {
    id: 'hidden-bermuda',
    name: '三角',
    desc: '收录一条百慕大三角范围内的记录',
    reward: '海域标记',
    hidden: true,
    test: (c) => c.bermudaCount >= 1
  },
  {
    id: 'hidden-corridor',
    name: '同一条走廊',
    desc: '同一个事件累积 3 条以上记录',
    reward: '事件走廊',
    hidden: true,
    test: (c) => c.corridorMax >= 3
  },
  {
    id: 'hidden-coldwar',
    name: '冷战档案',
    desc: '1950–1991 年之间收录 5 条以上',
    reward: '年代刻度',
    hidden: true,
    test: (c) => c.coldwarCount >= 5
  }
]

/** 所有成就（含隐藏）的聚合计数。 */
export function countersOf(records, stats = {}) {
  const years = records
    .map((r) => Number(String(r.occurred?.date ?? '').slice(0, 4)))
    .filter((y) => Number.isFinite(y) && y > 0)
  const languages = new Set(records.map((r) => r.quoteLang).filter(Boolean))
  const SOUTHERN = new Set(['AU', 'NZ', 'ZA', 'AR', 'CL', 'UY', 'PY'])
  const haystack = (r) => `${r.place?.label ?? ''} ${r.summaryZh ?? ''} ${r.quote ?? ''} ${r.eventKey ?? ''}`
  const docText = (r) => (r.documents ?? []).map((d) => `${d.archive ?? ''} ${d.title ?? ''}`).join(' ')
  const explanation = (r) => String(r.explanation ?? '')

  const perDay = new Map()
  const perEvent = new Map()
  for (const record of records) {
    const day = record.occurred?.date
    if (day) perDay.set(day, (perDay.get(day) ?? 0) + 1)
    const key = record.eventKey
    if (key) perEvent.set(key, (perEvent.get(key) ?? 0) + 1)
  }

  return {
    total: records.length,
    unexplained: records.filter((r) => r.rarity === 'unexplained' || r.rarity === 'hidden').length,
    unexplainedOnly: records.filter((r) => r.rarity === 'unexplained').length,
    hidden: records.filter((r) => r.rarity === 'hidden').length,
    landmark: records.filter((r) => r.rarity === 'landmark').length,
    images: records.reduce((sum, r) => sum + (r.media?.length ?? 0), 0),
    docCount: records.filter((r) => (r.documents?.length ?? 0) > 0).length,
    contradictions: records.filter((r) => r.contradiction === true).length,
    countries: new Set(records.map((r) => r.place?.country).filter(Boolean)).size,
    spanYears: years.length > 1 ? Math.max(...years) - Math.min(...years) : 0,
    earliestYear: years.length ? Math.min(...years) : null,
    chinaCount: records.filter((r) => r.place?.country === 'CN').length,
    airportCount: records.filter((r) => /机场|airport/i.test(r.place?.label ?? '')).length,
    languageCount: languages.size,
    sameDayMax: perDay.size ? Math.max(...perDay.values()) : 0,
    southernCount: records.filter((r) => SOUTHERN.has(r.place?.country)).length,
    area51Count: records.filter((r) => /51\s*区|area[\s-]*51|groom\s*lake|格鲁姆湖/i.test(haystack(r))).length,
    bermudaCount: records.filter((r) => /百慕大|bermuda/i.test(haystack(r))).length,
    corridorMax: perEvent.size ? Math.max(...perEvent.values()) : 0,
    coldwarCount: years.filter((y) => y >= 1950 && y <= 1991).length,
    hasOriginal: records.some((r) => /nara|blue book|defe|geipan|national archives|国家档案馆/i.test(docText(r))),
    misreadCount: records.filter((r) =>
      /卫星|气球|飞机|星链|starlink|balloon|aircraft|satellite|flare|照明弹/i.test(explanation(r))
    ).length,
    emptySearches: Number(stats.emptySearches ?? 0)
  }
}

/**
 * 返回本次新解锁的成就（已解锁的不会重复播报）。
 * @param {object[]} records
 * @param {{ unlocked?: Record<string, string> }} achievements
 * @param {{ emptySearches?: number }} [stats]
 */
export function evaluateAchievements(records, achievements, stats = {}) {
  const counters = countersOf(records, stats)
  const unlocked = { ...(achievements.unlocked ?? {}) }
  const fresh = []
  const now = new Date().toISOString()
  for (const achievement of ACHIEVEMENTS) {
    if (!unlocked[achievement.id] && achievement.test(counters)) {
      unlocked[achievement.id] = now
      fresh.push(achievement)
    }
  }
  return { unlocked, fresh, counters }
}

/**
 * 给界面/工具用的成就快照：隐藏且未解锁的条目被脱敏。
 * @returns {{ counters: object, items: object[], hiddenLocked: number, unlockedCount: number }}
 */
export function achievementState(records, achievements, stats = {}) {
  const counters = countersOf(records, stats)
  const unlockedMap = achievements.unlocked ?? {}
  let hiddenLocked = 0
  const items = ACHIEVEMENTS.map((a) => {
    const unlocked = Boolean(unlockedMap[a.id])
    if (a.hidden && !unlocked) {
      hiddenLocked += 1
      return { id: a.id, hidden: true, unlocked: false }
    }
    return {
      id: a.id,
      name: a.name,
      desc: a.desc,
      reward: a.reward,
      hidden: Boolean(a.hidden),
      unlocked,
      unlockedAt: unlockedMap[a.id] ?? null,
      have: a.metric ? Number(counters[a.metric] ?? 0) : null,
      need: a.need ?? null
    }
  })
  return {
    counters,
    items,
    hiddenLocked,
    unlockedCount: items.filter((i) => i.unlocked).length,
    total: items.length
  }
}

