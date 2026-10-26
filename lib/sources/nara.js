/**
 * 美国国家档案馆（NARA）RG 615 记录组。
 * Catalog API 返回的是 SPA，但官方主题页把 RG 615 的档案条目直接列成了链接。
 * 这里按页取：一次请求 4 个主题页，抽出 catalog.archives.gov/id* 条目。
 * @module dsh-ufo/lib/sources/nara
 */
const SOURCE = {
  sourceId: 'nara',
  sourceName: '美国国家档案馆 · RG 615 记录',
  sourceUrl: 'https://www.archives.gov/research/topics/uaps',
  license: 'public-domain'
}
const UA = 'Mozilla/5.0 (compatible; dsh-ufo/0.1)'

const PAGES = [
  'https://www.archives.gov/research/topics/uaps/rg-615',
  'https://www.archives.gov/research/topics/uaps/textual-and-microfilm',
  'https://www.archives.gov/research/topics/uaps/photographs',
  'https://www.archives.gov/research/topics/uaps/moving-images-and-sound'
]

export const meta = SOURCE

let cache = { at: 0, entries: [] }

export async function search(query = {}) {
  if (query.country && String(query.country).toUpperCase() !== 'US') return { source: SOURCE, rows: [] }
  const keyword = String(query.keyword ?? '').trim().toLowerCase()
  const limit = Math.min(Math.max(Number(query.limit) || 8, 1), 30)
  const entries = await loadEntries()

  const rows = []
  for (const entry of entries) {
    if (keyword && !`${entry.title} ${entry.page}`.toLowerCase().includes(keyword)) continue
    rows.push(toRow(entry))
    if (rows.length >= limit) break
  }
  return { source: SOURCE, rows }
}

async function loadEntries() {
  if (cache.entries.length && Date.now() - cache.at < 6 * 60 * 60 * 1000) return cache.entries
  const byId = new Map()
  for (const page of PAGES) {
    let html
    try {
      const res = await fetch(page, { headers: { 'user-agent': UA, accept: 'text/html' } })
      if (!res.ok) continue
      html = await res.text()
    } catch {
      continue
    }
    const re = /<a[^>]+href="([^"]*catalog\.archives\.gov\/(?:id\/)?(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    for (const match of html.matchAll(re)) {
      const id = match[2]
      if (byId.has(id)) continue
      // 链接文字只有目录号；标题在上一个 <h3> 里。
      const before = html.slice(Math.max(0, (match.index ?? 0) - 3000), match.index ?? 0)
      const headings = [...before.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)]
      const heading = headings.length ? strip(headings[headings.length - 1][1]) : ''
      const title = heading || strip(match[3]) || `NARA 记录 ${id}`
      // 描述在同一个 col 区块的 <p> 里；影像条目还会带 iframe 播放源。
      const blockStart = html.lastIndexOf('<div class="col-sm-6"', match.index ?? 0)
      const block = html.slice(blockStart >= 0 ? blockStart : Math.max(0, (match.index ?? 0) - 2000), (match.index ?? 0) + 2500)
      const paras = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((m) => strip(m[1]))
        .filter((text) => text && !/^National Archives Identifier/i.test(text))
      const description = (paras[0] ?? '').replace(/National Archives Identifier.*$/i, '').trim()
      const video = /<iframe[^>]+src="([^"]+)"/i.exec(block)?.[1] ?? null
      byId.set(id, { id, title, description, video, page: pageLabel(page), url: `https://catalog.archives.gov/id/${id}` })
    }
  }
  cache = { at: Date.now(), entries: [...byId.values()] }
  return cache.entries
}

function toRow(entry) {
  return {
    id: `nara-${entry.id}`,
    date: null,
    datePrecision: 'unknown',
    country: 'US',
    city: entry.page,
    admin: 'RG 615',
    shape: null,
    duration: null,
    quote: (entry.description || entry.title).slice(0, 380),
    quoteLang: 'en',
    summaryZh: `美国国家档案馆 RG 615 记录：${entry.title}（${entry.page}，目录号 ${entry.id}）${entry.description ? '；附带官方描述' : ''}。`,
    explanation: null,
    explanationAuthor: null,
    recordType: 'official-archive',
    corroboration: 'single',
    documents: [
      { title: entry.title, archive: 'NARA', url: entry.url },
      ...(entry.video ? [{ title: '影像（NARA 页面转载）', archive: 'NARA', url: entry.video }] : [])
    ],
    sourceRecordUrl: entry.url,
    landmark: false,
    contradiction: false,
    eventKey: null,
    demo: false
  }
}

function strip(html) {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, ' ')
    .trim()
}

function pageLabel(page) {
  if (page.includes('rg-615')) return 'RG 615 记录组'
  if (page.includes('textual')) return '文本与缩微胶卷'
  if (page.includes('photographs')) return '照片'
  return '影像与录音'
}
