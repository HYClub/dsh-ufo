/**
 * 真实源：NUFORC 公开数据集的镜像（GitHub: planetsig/ufo-reports）。
 * NUFORC 官网有 Cloudflare 挑战，不绕；这个镜像提供了同样的民间目击数据，
 * 但**不含逐条原始 URL**，因此记录链接指向 NUFORC 档案入口，并在覆盖说明里注明。
 * @module dsh-ufo/lib/sources/nuforc
 */
const SOURCE = {
  sourceId: 'nuforc',
  sourceName: 'NUFORC（公开数据集镜像）',
  sourceUrl: 'https://nuforc.org/webreports/ndxevent.html',
  license: 'unknown-mirror'
}
const DATASET =
  'https://raw.githubusercontent.com/planetsig/ufo-reports/master/csv-data/ufo-scrubbed-geocoded-time-standardized.csv'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
let cache = { at: 0, rows: [] }

export const meta = SOURCE

export async function search(query = {}) {
  if (query.country && String(query.country).toUpperCase() !== 'US') return { source: SOURCE, rows: [] }
  const rows = await loadRows()
  const limit = Math.min(Math.max(Number(query.limit) || 8, 1), 30)
  const keyword = (query.keyword ?? '').trim().toLowerCase()
  const country = (query.country ?? '').trim().toLowerCase()

  const out = []
  for (const row of rows) {
    const [datetime, city, state, ctry, shape, , duration, comments] = row
    if (country && ctry.toLowerCase() !== country) continue
    if (keyword) {
      const haystack = `${city} ${state} ${ctry} ${shape} ${comments}`.toLowerCase()
      if (!haystack.includes(keyword)) continue
    }
    const record = toRow(row)
    if (!record) continue
    if (query.dateFrom && record.date && record.date < query.dateFrom) continue
    if (query.dateTo && record.date && record.date > query.dateTo) continue
    out.push(record)
    if (out.length >= limit) break
  }
  return { source: SOURCE, rows: out }
}

async function loadRows() {
  if (cache.rows.length && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows
  const res = await fetch(DATASET, { headers: { 'user-agent': 'dsh-ufo/0.1', accept: 'text/csv' } })
  if (!res.ok) throw new Error(`NUFORC 镜像返回 ${res.status}`)
  const text = await res.text()
  const rows = parseCsv(text)
  cache = { at: Date.now(), rows }
  return rows
}

function toRow(cells) {
  const [datetime, city, state, country, shape, , duration, comments] = cells
  if (!city) return null
  // 镜像里有 283 条记成 10/10，疑似「月日未知」的占位符；这类只保留年份，别假装精确到天。
  const placeholder = /^10\/10\//.test(String(datetime ?? '').trim())
  const full = parseUsDatetime(datetime)
  const date = placeholder ? (full ? full.slice(0, 4) : null) : full
  const quote = clean(comments).slice(0, 380)
  if (!quote) return null
  return {
    id: `nuforc-${hash(`${datetime}|${city}|${state}|${shape}`)}`,
    date,
    datePrecision: date && date.length === 4 ? 'year' : 'day',
    country: country ? country.toUpperCase() : null,
    city: titleCase(city),
    lat: toNumber(cells[9]),
    lon: toNumber(cells[10]),
    admin: state ? state.toUpperCase() : null,
    shape: shape || null,
    duration: duration || null,
    quote,
    quoteLang: 'en',
    summaryZh: `NUFORC 摘要（镜像只收录短摘要，完整叙述在原页）：${titleCase(city)}${state ? `, ${state.toUpperCase()}` : ''}${date ? `（${date}）` : ''}，形状 ${shape || '未标注'}，持续 ${duration || '未标注'}。`,
    explanation: null,
    explanationAuthor: null,
    recordType: 'civilian-database',
    corroboration: 'single',
    documents: [
      {
        title: 'NUFORC 公开数据集（镜像）',
        archive: 'GitHub / planetsig',
        url: DATASET
      }
    ],
    sourceRecordUrl: SOURCE.sourceUrl,
    landmark: false,
    contradiction: false,
    eventKey: null,
    demo: false
  }
}

/** '10/10/1949 20:30' → '1949-10-10' */
export function parseUsDatetime(text) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(text ?? '').trim())
  if (!match) return null
  const [, month, day, year] = match
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clean(text) {
  return String(text ?? '')
    .replace(/&#(\d+);?/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())
}

function hash(text) {
  let value = 0
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0
  return value.toString(36)
}

/** 最小 CSV 解析：处理引号内逗号与双引号转义。 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      if (row.length > 1) rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field || row.length) {
    row.push(field)
    if (row.length > 1) rows.push(row)
  }
  return rows
}

export async function all() {
  const rows = await loadRows()
  return rows.map(toRow).filter(Boolean)
}
