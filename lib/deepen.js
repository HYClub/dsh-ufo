/**
 * 首次检索就深取：按来源访问记录页/接口，把正文与额外字段补进记录。
 * 只在本次命中的前若干条上并行执行，单条失败不影响其它记录。
 * @module dsh-ufo/lib/deepen
 */
const UA = 'Mozilla/5.0 (compatible; dsh-ufo/0.4)'
const TIMEOUT = 9000

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT)
  })
  if (!res.ok) throw new Error(`http ${res.status}`)
  return res.json()
}

async function getText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT)
  })
  if (!res.ok) throw new Error(`http ${res.status}`)
  return res.text()
}

function strip(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function deepenTna(record) {
  const id = /details\/r\/([A-Za-z0-9]+)/.exec(record.sourceRecordUrl ?? '')?.[1]
  if (!id) return null
  const data = await getJson(`https://discovery.nationalarchives.gov.uk/API/records/v1/details/${id}`)
  const parts = []
  if (data.scopeContent?.description) parts.push(strip(data.scopeContent.description))
  if (data.citableReference) parts.push(`档号：${data.citableReference}`)
  if (data.coveringDates) parts.push(`覆盖年代：${data.coveringDates}`)
  if (Array.isArray(data.heldBy) && data.heldBy.length) {
    const names = data.heldBy.map((item) => item.xReferenceName).filter(Boolean)
    if (names.length) parts.push(`保管：${names.join('、')}`)
  }
  if (data.closureStatus) parts.push(`封存状态：${data.closureStatus}`)
  const regulation = data.accessRegulation?.closureCriteria
  if (Array.isArray(regulation) && regulation.length) parts.push(`限制：${regulation.join('；')}`)
  return { text: parts.join('\n'), source: 'The National Archives' }
}

async function deepenIa(record) {
  const match = /archive\.org\/download\/([^/]+)/.exec(record.sourceRecordUrl ?? '')
  if (!match) return null
  const data = await getJson(`https://archive.org/metadata/${encodeURIComponent(match[1])}`)
  const meta = data.metadata ?? {}
  const parts = []
  if (meta.description) {
    parts.push(Array.isArray(meta.description) ? meta.description.join(' ') : String(meta.description))
  }
  for (const [label, key] of [['日期', 'date'], ['创建者', 'creator'], ['格式', 'mediatype']]) {
    if (meta[key]) parts.push(`${label}：${meta[key]}`)
  }
  return { text: strip(parts.join('\n')), source: 'Internet Archive' }
}

async function deepenGeipan(record) {
  const url = record.sourceRecordUrl
  if (!/cnes-geipan\.fr/.test(url ?? '')) return null
  const html = await getText(url)
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => strip(m[1]))
    .filter((text) => text.length > 80)
  return { text: paragraphs.slice(0, 4).join('\n'), source: 'GEIPAN' }
}

const DEEPENERS = {
  tna: deepenTna,
  'ia-bluebook': deepenIa,
  'ia-collection': deepenIa,
  geipan: deepenGeipan
}

/**
 * 就地补全一条记录：description、deepenedAt；失败保持原样。
 * @returns {Promise<boolean>}
 */
export async function deepenRecord(record) {
  const fn = DEEPENERS[record.sourceId]
  if (!fn) return false
  try {
    const result = await fn(record)
    const text = String(result?.text ?? '').trim()
    if (!text) return false
    record.description = text.slice(0, 4000)
    record.descriptionSource = result.source
    record.deepenedAt = new Date().toISOString()
    return true
  } catch {
    return false
  }
}

export async function deepenAll(records, limit = 3) {
  const targets = records.slice(0, limit)
  await Promise.allSettled(targets.map((record) => deepenRecord(record)))
  return targets.filter((record) => record.description).length
}
