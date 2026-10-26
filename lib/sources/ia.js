/**
 * 真实源：Internet Archive 上的 Project Blue Book 案卷（NARA 扫描件）。
 * 每个条目是一条案卷记录，标题里带 Location / Date / Incident Number。
 * @module dsh-ufo/lib/sources/ia
 */
const SOURCE = {
  sourceId: 'ia-bluebook',
  sourceName: 'Internet Archive · 蓝皮书案卷',
  sourceUrl: 'https://archive.org/details/bluebook',
  license: 'public-domain'
}
const UA = 'dsh-ufo/0.1 (archive research; +https://archive.org)'

export const meta = SOURCE

/**
 * @param {{ keyword?: string, dateFrom?: string, dateTo?: string, limit?: number }} query
 */
export async function search(query = {}) {
  if (query.country && String(query.country).toUpperCase() !== 'US') return { source: SOURCE, rows: [] }
  const limit = Math.min(Math.max(Number(query.limit) || 8, 1), 30)
  const keyword = (query.keyword ?? '').trim()
  const terms = ['title:("project blue book")']
  if (keyword) terms.push(`(${keyword.replace(/[()"]/g, ' ')})`)
  const q = terms.join(' AND ')
  const url =
    'https://archive.org/advancedsearch.php?q=' +
    encodeURIComponent(q) +
    '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&rows=' +
    Math.min(limit * 6, 120) +
    '&output=json'

  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!res.ok) throw new Error(`Internet Archive 返回 ${res.status}`)
  const body = await res.json()
  const docs = body?.response?.docs ?? []

  const rows = []
  const byPlace = new Map()
  for (const doc of docs) {
    const title = String(doc.title ?? '')
    // 只保留真正的案卷条目：标题里带 Location/Date/Incident，或明确写着 case files。
    if (!/location:/i.test(title) && !/case files/i.test(title)) continue
    if (keyword && !title.toLowerCase().includes(keyword.toLowerCase())) continue
    const row = toRow(doc)
    if (!row) continue
    if (query.dateFrom && row.date && row.date < query.dateFrom) continue
    if (query.dateTo && row.date && row.date > query.dateTo) continue
    // 同一地点的重复扫描件只留一条；优先留有日期的那个版本。
    const existing = byPlace.get(row.city)
    if (existing && !existing.hasDate && row.date) {
      rows[rows.indexOf(existing.row)] = row
      byPlace.set(row.city, { row, hasDate: true })
      continue
    }
    if (existing) continue
    byPlace.set(row.city, { row, hasDate: Boolean(row.date) })
    if (rows.length < 2) {
      const image = await itemImage(doc.identifier)
      if (image) row.mediaUrls = [image]
    }
    rows.push(row)
    if (rows.length >= limit) break
  }
  return { source: SOURCE, rows }
}

function toRow(doc) {
  const title = String(doc.title ?? '').trim()
  if (!title) return null
  const location = /Location:\s*([^-]+?)\s*-\s*Date:/i.exec(title)?.[1]?.trim()
  const rawDate = /Date:\s*([^-]+?)(?:\s*-\s*Incident|$)/i.exec(title)?.[1]?.trim()
  const incident = /Incident Number:\s*(.+)$/i.exec(title)?.[1]?.trim()
  // year 字段是上传年份，不是事件年份；只有标题里写了 Date 才当事件日期。
  const date = normalizeDate(rawDate)

  return {
    id: `ia-${slug(doc.identifier)}`,
    date,
    datePrecision: date && date.length === 4 ? 'year' : date && date.length === 7 ? 'month' : 'day',
    country: 'US',
    city: location ?? 'Internet Archive 合集（非单案）',
    admin: null,
    shape: null,
    duration: null,
    quote: truncate(title, 380),
    quoteLang: 'en',
    summaryZh: `蓝皮书案卷：${location ?? '地点未标注'}${date ? `，${date}` : ''}${incident && incident !== '[BLANK]' ? `，案号 ${incident}` : ''}。`,
    explanation: null,
    explanationAuthor: null,
    recordType: 'official-archive',
    corroboration: 'single',
    documents: [
      {
        title: `蓝皮书案卷扫描件 ${doc.identifier}`,
        archive: 'NARA / Internet Archive',
        url: `https://archive.org/details/${doc.identifier}`
      }
    ],
    sourceRecordUrl: `https://archive.org/details/${doc.identifier}`,
    landmark: false,
    contradiction: false,
    eventKey: null,
    demo: false
  }
}

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
}

/** 'August 1961' / 'May 13, 1952' / '1961' → '1961-08' / '1952-05-13' / '1961' */
export function normalizeDate(text) {
  if (!text) return null
  const value = text.replace(/[\[\]]/g, ' ').trim().toLowerCase()
  if (!value || /illegible|blank|unknown|n\/a/.test(value)) return null
  const year = /(19\d{2}|20\d{2})/.exec(value)?.[1]
  if (!year) return null
  const monthName = Object.keys(MONTHS).find((name) => new RegExp(`\\b${name}\\b`).test(value))
  if (!monthName) return year
  const month = MONTHS[monthName]
  const day = /\b(\d{1,2})\b/.exec(value.replace(year, ''))?.[1]
  if (day) return `${year}-${month}-${String(day).padStart(2, '0')}`
  return `${year}-${month}`
}

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

async function itemImage(identifier) {
  try {
    const res = await fetch('https://archive.org/metadata/' + encodeURIComponent(identifier), {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    })
    if (!res.ok) return null
    const body = await res.json()
    const files = body.files ?? []
    const bitmap = files.find((item) => /\.(jpe?g|png)$/i.test(item.name ?? '') && !/_thumb/i.test(item.name ?? ''))
    if (bitmap) return 'https://archive.org/download/' + encodeURIComponent(identifier) + '/' + encodeURIComponent(bitmap.name)
    const hasScan = files.some((item) => /\.pdf$/i.test(item.name ?? ''))
    return hasScan ? 'https://archive.org/download/' + encodeURIComponent(identifier) + '/page/n0_w800.jpg' : null
  } catch {
    return null
  }
}
