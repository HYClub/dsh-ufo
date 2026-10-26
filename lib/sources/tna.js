/**
 * 真实源：英国国家档案馆 Discovery API（AIR / DEFE 系列 UFO 文件）。
 * 返回的是档案级记录：案卷号、标题、覆盖年份、馆藏地、详情页。
 * @module dsh-ufo/lib/sources/tna
 */
const SOURCE = {
  sourceId: 'tna',
  sourceName: '英国国家档案馆 · Discovery',
  sourceUrl: 'https://discovery.nationalarchives.gov.uk/',
  license: 'OGL-3.0'
}
const UA = 'dsh-ufo/0.1 (archive research; +https://discovery.nationalarchives.gov.uk)'

export const meta = SOURCE

/** @param {{ keyword?: string, dateFrom?: string, dateTo?: string, limit?: number }} query */
export async function search(query = {}) {
  if (query.country && String(query.country).toUpperCase() !== 'GB') return { source: SOURCE, rows: [] }
  const limit = Math.min(Math.max(Number(query.limit) || 8, 1), 30)
  const keyword = (query.keyword ?? '').trim()
  // Discovery 是全文检索：只查关键词会命中「Roswell v Roswell」这类都铎王朝诉讼，
  // 所以固定叠加 UFO 语境，并在本地再筛一遍。
  const term = keyword ? `${keyword} UFO` : 'UFO'
  const url =
    'https://discovery.nationalarchives.gov.uk/API/search/records?sps.searchQuery=' +
    encodeURIComponent(term) +
    '&sps.resultsPageSize=' +
    Math.min(limit * 3, 60)

  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!res.ok) throw new Error(`Discovery API 返回 ${res.status}`)
  const body = await res.json()
  const records = body?.records ?? []

  const rows = []
  for (const record of records) {
    const haystack = `${record.title ?? ''} ${record.description ?? ''} ${record.context ?? ''}`.toLowerCase()
    if (!/ufo|unidentified|flying saucer|aerial phenomenon/.test(haystack)) continue
    if (keyword && !haystack.includes(keyword.toLowerCase())) continue
    const row = toRow(record)
    if (!row) continue
    if (query.dateFrom && row.date && row.date < query.dateFrom) continue
    if (query.dateTo && row.date && row.date > query.dateTo) continue
    rows.push(row)
    if (rows.length >= limit) break
  }
  return { source: SOURCE, rows }
}

function toRow(record) {
  const id = record.id
  if (!id) return null
  const reference = record.reference ?? ''
  const title = String(record.title ?? '').trim()
  const description = String(record.description ?? '').trim()
  const same = (a, b) => a.replace(/[.\s]+$/, '').toLowerCase() === b.replace(/[.\s]+$/, '').toLowerCase()
  const parts = []
  if (title) parts.push(title)
  if (description && !(title && same(title, description))) parts.push(description)
  const quote = parts.join(' — ').slice(0, 380) || `档案 ${reference}`
  const date = parseUkDate(record.startDate)
  const heldBy = Array.isArray(record.heldBy) && record.heldBy.length ? record.heldBy[0] : 'The National Archives, Kew'
  const url = `https://discovery.nationalarchives.gov.uk/details/r/${id}`

  return {
    id: `tna-${id}`,
    date,
    datePrecision: date && date.length === 4 ? 'year' : 'day',
    country: 'GB',
    city: null,
    admin: record.department ?? null,
    shape: null,
    duration: null,
    quote,
    quoteLang: 'en',
    summaryZh: `英国国家档案馆档案 ${reference}：${title || description || '未命名卷宗'}${date ? `（${date}）` : ''}。`,
    explanation: null,
    explanationAuthor: null,
    recordType: 'official-archive',
    corroboration: 'single',
    documents: [
      {
        title: `${reference} ${title}`.trim(),
        archive: heldBy,
        url
      }
    ],
    sourceRecordUrl: url,
    landmark: false,
    contradiction: false,
    eventKey: null,
    demo: false
  }
}

/** '01/01/1968' → '1968-01-01' */
export function parseUkDate(text) {
  if (!text) return null
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(text).trim())
  if (!match) return null
  const [, day, month, year] = match
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 全量翻页：TNA 的 UFO 相关记录总量约七百条，按 100 条一页取完。 */
export async function all(maxRecords = 2000) {
  const out = []
  for (let page = 1; page <= 30; page += 1) {
    const url =
      "https://discovery.nationalarchives.gov.uk/API/search/records?sps.searchQuery=" +
      encodeURIComponent("UFO") +
      "&sps.resultsPageSize=100&page=" +
      page
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } })
    if (!res.ok) throw new Error("Discovery API 返回 " + res.status)
    const body = await res.json()
    const records = body?.records ?? []
    for (const record of records) {
      const haystack = (record.title ?? "") + " " + (record.description ?? "") + " " + (record.context ?? "")
      if (!/ufo|unidentified|flying saucer|aerial phenomenon/i.test(haystack)) continue
      const row = toRow(record)
      if (row) out.push(row)
      if (out.length >= maxRecords) return out
    }
    if (records.length < 100) break
  }
  return out
}
