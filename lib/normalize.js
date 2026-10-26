/**
 * 记录归一化与「引用束」校验。
 *
 * 原则：没有来源的记录不出现在模型上下文里。缺 URL / 缺检索时间 / 缺逐字摘录的记录
 * 一律丢弃并计数，而不是靠提示词要求模型「记得引用」。
 * @module dsh-ufo/lib/normalize
 */

const MAX_QUOTE = 400

/** @typedef {ReturnType<typeof normalizeRecord>} ArchiveRecord */

/**
 * @param {object} raw 源适配器产出的原始记录
 * @param {{ sourceId: string, sourceName: string, sourceUrl: string, license?: string }} source
 * @param {string} [now] ISO 时间，便于测试注入
 */
export function normalizeRecord(raw, source, now = new Date().toISOString()) {
  const record = {
    id: raw.id ?? buildId(source.sourceId, raw),
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceUrl: raw.sourceUrl ?? source.sourceUrl,
    sourceRecordUrl: raw.sourceRecordUrl ?? raw.sourceUrl ?? source.sourceUrl,
    license: raw.license ?? source.license ?? 'unknown',
    retrievedAt: raw.retrievedAt ?? now,
    occurred: {
      date: raw.date ?? null,
      precision: raw.datePrecision ?? (raw.date ? 'day' : 'unknown')
    },
    place: {
      country: raw.country ?? null,
      admin: raw.admin ?? null,
      city: raw.city ?? null,
      lat: Number.isFinite(Number(raw.lat)) ? Number(raw.lat) : null,
      lon: Number.isFinite(Number(raw.lon)) ? Number(raw.lon) : null,
      label: formatPlace(raw)
    },
    shape: raw.shape ?? null,
    duration: raw.duration ?? null,
    quote: (raw.quote ?? '').trim(),
    quoteLang: raw.quoteLang ?? 'en',
    summaryZh: raw.summaryZh ?? '',
    explanation: raw.explanation ?? null,
    explanationAuthor: raw.explanationAuthor ?? null,
    recordType: raw.recordType ?? 'civilian-database',
    corroboration: raw.corroboration ?? 'single',
    documents: raw.documents ?? [],
    media: raw.media ?? [],
    mediaUrls: raw.mediaUrls ?? [],
    demo: raw.demo === true,
    landmark: raw.landmark === true,
    contradiction: raw.contradiction === true,
    eventKey: raw.eventKey ?? null
  }
  assertProvenance(record)
  return record
}

/**
 * @param {object} record
 * @returns {string[]} 违反项；空数组表示通过
 */
export function provenanceViolations(record) {
  const problems = []
  if (!/^https?:\/\//.test(record.sourceRecordUrl ?? '')) problems.push('sourceRecordUrl 不是 http(s) 链接')
  if (!record.retrievedAt) problems.push('缺少 retrievedAt')
  if (!record.quote) problems.push('缺少逐字摘录 quote')
  if (record.quote && record.quote.length > MAX_QUOTE) problems.push(`quote 超过 ${MAX_QUOTE} 字符`)
  if (!record.place?.label) problems.push('缺少地点')
  return problems
}

/** @param {object} record */
export function assertProvenance(record) {
  const problems = provenanceViolations(record)
  if (problems.length > 0) {
    throw new Error(`记录 ${record.id ?? '(unknown)'} 来源信息不完整：${problems.join('；')}`)
  }
}

/** 归一化整批，返回通过项与被丢弃的条目 id。 */
export function normalizeAll(raws, source, now) {
  const kept = []
  const dropped = []
  for (const raw of raws) {
    try {
      kept.push(normalizeRecord(raw, source, now))
    } catch (error) {
      dropped.push({ id: raw?.id ?? '(unknown)', reason: error.message })
    }
  }
  return { kept, dropped }
}

export function buildId(sourceId, raw) {
  const date = raw.date ?? 'undated'
  const slug = String(raw.city ?? raw.eventKey ?? raw.shape ?? 'sighting')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${sourceId}-${date}-${slug || 'sighting'}`
}

export function formatPlace(raw) {
  const parts = [raw.city, raw.admin, raw.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : ''
}

/** 中文日期：支持 YYYY / YYYY-MM / YYYY-MM-DD。 */
export function formatDateZh(date) {
  if (!date) return '日期不详'
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(date))
  if (!match) return date
  const [, year, month, day] = match
  if (!month) return `${year} 年`
  if (!day) return `${year} 年 ${Number(month)} 月`
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`
}

/** 事实层文本：任何看板/网页/会话都复用这一份，保证口径一致。 */
export function factLine(record) {
  const bits = [formatDateZh(record.occurred.date), record.place.label || '地点不详']
  if (record.shape) bits.push(`形状 ${record.shape}`)
  if (record.duration) bits.push(`持续 ${record.duration}`)
  return bits.join(' · ')
}

export function citationLine(record) {
  const who = record.sourceName ?? record.sourceId
  const when = record.retrievedAt.slice(0, 10)
  return `${who}，检索于 ${when}：${record.sourceRecordUrl}`
}
