/**
 * 真实源：法国 GEIPAN（CNES）案件库。
 * 官方导出是 XLSX（约 3,300 案），字段含分类（A/B/C/D）、日期、部门、现象、经纬度。
 * 整库只拉一次，进程内缓存 6 小时。
 * @module dsh-ufo/lib/sources/geipan
 */
import { readXlsx } from '../xlsx.js'

const SOURCE = {
  sourceId: 'geipan',
  sourceName: 'GEIPAN / CNES（法国）',
  sourceUrl: 'https://www.cnes-geipan.fr/fr/recherche/cas',
  license: 'Etalab-2.0'
}
const EXPORT_URL = 'https://www.cnes-geipan.fr/fr/cnes/export/cas'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
let cache = { at: 0, cases: [] }

export const meta = SOURCE

export async function search(query = {}) {
  if (query.country && String(query.country).toUpperCase() !== 'FR') return { source: SOURCE, rows: [] }
  const cases = await loadCases()
  const limit = Math.min(Math.max(Number(query.limit) || 8, 1), 30)
  const keyword = (query.keyword ?? '').trim().toLowerCase()

  const rows = []
  for (const item of cases) {
    const date = normalizeDate(item["Date d'observation"])
    if (query.dateFrom && date && date < query.dateFrom) continue
    if (query.dateTo && date && date > query.dateTo) continue
    const haystack = [
      item['Titre du Cas'],
      item['Détails'],
      item['Identification'],
      item['Phénomène'],
      item['Département'],
      item['Région']
    ]
      .join(' ')
      .toLowerCase()
    if (keyword && !haystack.includes(keyword)) continue
    const row = toRow(item, date)
    if (rows.length < 2) {
      const images = await caseImages(row.sourceRecordUrl)
      if (images.length) row.mediaUrls = images
    }
    rows.push(row)
    if (rows.length >= limit) break
  }
  return { source: SOURCE, rows }
}

async function loadCases() {
  if (cache.cases.length && Date.now() - cache.at < CACHE_TTL_MS) return cache.cases
  const res = await fetch(EXPORT_URL, {
    headers: { 'user-agent': 'dsh-ufo/0.1 (case archive)', accept: '*/*' }
  })
  if (!res.ok) throw new Error(`GEIPAN 导出返回 ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const cases = readXlsx(buffer)
  cache = { at: Date.now(), cases }
  return cases
}

const CLASSIFICATION = {
  A: { label: '已确认，可完全解释', explained: true },
  B: { label: '很可能可解释', explained: true },
  C: { label: '无法解释', explained: false },
  D: { label: '资料不足', explained: false }
}

function toNumber(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function toRow(item, date) {
  const code = String(item['Classification'] ?? '').trim().toUpperCase()
  const cls = CLASSIFICATION[code]
  const title = String(item['Titre du Cas'] ?? '').trim()
  const details = String(item['Détails'] ?? '').trim()
  const identification = String(item['Identification'] ?? '').trim()
  const id = String(item['ID Etude de Cas'] ?? '').trim()
  const url = id ? `https://www.cnes-geipan.fr/fr/cas/${encodeURIComponent(id)}` : SOURCE.sourceUrl
  const hasDocs = String(item['Cas contenant des documents'] ?? '').toLowerCase().startsWith('oui')

  const quote = (details || identification || title).slice(0, 380)
  return {
    id: `geipan-${id.replace(/[^a-zA-Z0-9]+/g, '-')}`,
    date,
    datePrecision: date && date.length === 4 ? 'year' : 'day',
    country: 'FR',
    city: title.split('(')[0].trim() || null,
    lat: toNumber(item['Latitude']),
    lon: toNumber(item['Longitude']),
    admin: String(item['Département'] ?? '').trim() || null,
    shape: String(item['Phénomène'] ?? '').trim() || null,
    duration: null,
    quote,
    quoteLang: 'fr',
    summaryZh: `GEIPAN 案件 ${id}：${title}${date ? `（${date}）` : ''}。分类 ${code || '未标注'}——${cls?.label ?? '未知'}。`,
    explanation: cls?.explained ? `CNES/GEIPAN 分类 ${code}：${cls.label}` : null,
    explanationAuthor: cls?.explained ? 'GEIPAN' : null,
    recordType: 'official-report',
    corroboration: 'single',
    documents: hasDocs ? [{ title: `GEIPAN 案件档案 ${id}`, archive: 'CNES / GEIPAN', url }] : [],
    sourceRecordUrl: url,
    landmark: false,
    contradiction: false,
    eventKey: null,
    demo: false
  }
}

/** '13/03/1997' / '--/--/1937' / '03/1997' → ISO 或年份 */
export function normalizeDate(text) {
  const value = String(text ?? '').trim()
  if (!value) return null
  const full = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  if (full) {
    const [, day, month, year] = full
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const monthYear = /^(\d{1,2})\/(\d{4})$/.exec(value)
  if (monthYear) return `${monthYear[2]}-${String(monthYear[1]).padStart(2, '0')}`
  const year = /(19\d{2}|20\d{2})/.exec(value)
  return year ? year[1] : null
}

export async function all() {
  const cases = await loadCases()
  return cases.map((item) => toRow(item, normalizeDate(item["Date d'observation"])))
}

async function caseImages(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'dsh-ufo/0.1', accept: 'text/html' }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return []
    const html = await res.text()
    const urls = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)]
      .map((m) => m[1])
      .filter((src) => /\.(jpe?g|png)$/i.test(src) && !/logo|icon|sprite/i.test(src))
      .map((src) => (src.startsWith('http') ? src : new URL(src, 'https://www.cnes-geipan.fr').href))
    return [...new Set(urls)].slice(0, 2)
  } catch {
    return []
  }
}
