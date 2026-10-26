/**
 * 真实源：维基百科「已报告 UFO 目击列表」年表。
 * 147 行，跨公元前到现代，带引用；作为「有出处的年表」补充官方档案之外的叙事层。
 * @module dsh-ufo/lib/sources/wikipedia
 */
const SOURCE = {
  sourceId: 'wikipedia',
  sourceName: '维基百科 · 目击年表',
  sourceUrl: 'https://en.wikipedia.org/wiki/List_of_reported_UFO_sightings',
  license: 'CC-BY-SA-4.0'
}
const API =
  'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_reported_UFO_sightings&prop=wikitext&format=json&formatversion=2'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
let cache = { at: 0, rows: [] }

export const meta = SOURCE

export async function search(query = {}) {
  const rows = await loadRows()
  const limit = Math.min(Math.max(Number(query.limit) || 8, 1), 30)
  const keyword = (query.keyword ?? '').trim().toLowerCase()
  const countryNames = COUNTRY_NAMES[String(query.country ?? '').toUpperCase()]

  const out = []
  for (const row of rows) {
    const haystack = `${row.name} ${row.location} ${row.description}`.toLowerCase()
    if (keyword && !haystack.includes(keyword)) continue
    if (countryNames && !countryNames.some((name) => new RegExp(`\\b${name}\\b`).test(haystack))) continue
    if (query.dateFrom && row.date && row.date < query.dateFrom) continue
    if (query.dateTo && row.date && row.date > query.dateTo) continue
    const record = toRow(row)
    if (out.length < 3 && row.name) {
      const image = await pageImage(row.name)
      if (image) record.mediaUrls = [image]
    }
    out.push(record)
    if (out.length >= limit) break
  }
  return { source: SOURCE, rows: out }
}

const COUNTRY_NAMES = {
  AU: ['australia', 'australian'],
  NZ: ['new zealand'],
  BR: ['brazil', 'brazilian'],
  CA: ['canada', 'canadian'],
  CL: ['chile', 'chilean'],
  FR: ['france', 'french'],
  GB: ['united kingdom', 'britain', 'british', 'england'],
  US: ['united states', 'american', 'usa']
}

async function loadRows() {
  if (cache.rows.length && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows
  const res = await fetch(`${API}&origin=*`, { headers: { 'user-agent': 'dsh-ufo/0.1', accept: 'application/json' } })
  if (!res.ok) throw new Error(`维基百科返回 ${res.status}`)
  const body = await res.json()
  const wikitext = body?.parse?.wikitext ?? ''
  const rows = parseTable(wikitext)
  cache = { at: Date.now(), rows }
  return rows
}

/** 解析 wikitable：页面按世纪拆成多张表，全部解析后拼接。 */
export function parseTable(wikitext) {
  const tables = []
  let cursor = 0
  while ((cursor = wikitext.indexOf('{|', cursor)) >= 0) {
    const end = wikitext.indexOf('|}', cursor)
    if (end < 0) break
    tables.push(wikitext.slice(cursor, end))
    cursor = end + 2
  }
  const rows = []
  for (const body of tables) {
    const blocks = body.split(/\n\|-/).slice(1)
    for (const block of blocks) {
      const cells = []
      for (const line of block.split('\n')) {
        if (!line.startsWith('|') || line.startsWith('|}')) continue
        for (const rawCell of line.replace(/^\|/, '').split('||')) {
          // 只剥掉 data-sort-value="…" / style="…" 这类属性前缀，别把 [[链接|显示名]] 的竖线也吃掉。
          const cell = rawCell.replace(/^[a-z-]+="[^"]*"\|/i, '')
          cells.push(stripMarkup(cell))
        }
      }
      if (cells.length < 4) continue
      const [dateText, name, location, description] = cells
      rows.push({ date: parseDate(dateText), dateText, name, location, description })
    }
  }
  return rows
}

/** 'c. 1450 BC' → null；'May 13, 1997' / '1997' → ISO 或年份 */
export function parseDate(text) {
  const value = String(text ?? '').trim()
  if (!value || /\bBC\b/i.test(value)) return null
  // 行内常写成 '1980-12-26 to 1980 -12-28'，取第一个完整日期。
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value)
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`
  const year = /(1[5-9]\d{2}|20\d{2})/.exec(value)?.[1]
  if (!year) return null
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const lower = value.toLowerCase()
  const monthIndex = monthNames.findIndex((month) => lower.includes(month))
  if (monthIndex < 0) return year
  const month = String(monthIndex + 1).padStart(2, '0')
  const day = /\b(\d{1,2})\b/.exec(value.replace(year, ''))?.[1]
  return day ? `${year}-${month}-${String(day).padStart(2, '0')}` : `${year}-${month}`
}

function toRow(row) {
  const label = row.location || row.name || '未标注地点'
  const description = (row.description || row.name).slice(0, 380)
  return {
    id: `wiki-${hash(`${row.name}|${row.location}|${row.dateText}`)}`,
    date: row.date,
    datePrecision: row.date && row.date.length === 4 ? 'year' : 'day',
    country: null,
    city: label.slice(0, 80),
    admin: null,
    shape: null,
    duration: null,
    quote: description,
    quoteLang: 'en',
    summaryZh: `维基百科年表：${row.name || label}${row.date ? `（${row.date}）` : ''} —— ${row.location || '地点未标注'}。`,
    explanation: null,
    explanationAuthor: null,
    recordType: 'media',
    corroboration: 'single',
    documents: [
      {
        title: `维基百科条目：${row.name || label}`,
        archive: 'Wikipedia',
        url: SOURCE.sourceUrl
      }
    ],
    sourceRecordUrl: SOURCE.sourceUrl,
    landmark: false,
    contradiction: false,
    eventKey: null,
    demo: false
  }
}

function stripMarkup(text) {
  return String(text ?? '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/<span[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/'''?/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function hash(text) {
  let value = 0
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0
  return value.toString(36)
}

export async function all() {
  const rows = await loadRows()
  return rows.map(toRow)
}

async function pageImage(title) {
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&pithumbsize=640&redirects=1&titles=' + encodeURIComponent(title)
    const res = await fetch(url, { headers: { 'user-agent': 'dsh-ufo/0.1', accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null
    const body = await res.json()
    const pages = body?.query?.pages ?? {}
    for (const page of Object.values(pages)) {
      if (page?.thumbnail?.source) return page.thumbnail.source.split('?')[0]
    }
    return null
  } catch {
    return null
  }
}
