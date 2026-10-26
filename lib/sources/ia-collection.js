/**
 * 澳大利亚、新西兰：两国档案的 UFO 文件都在 Internet Archive 上有公开副本。
 * 这里按「文件级」接入：一个 PDF = 一条记录（卷宗名、年份、下载链接）。
 * @module dsh-ufo/lib/sources/ia-collection
 */
const UA = 'dsh-ufo/0.1 (national archive files)'

const CONFIGS = [
  {
    sourceId: 'au-naa',
    sourceName: '澳大利亚国家档案馆 · A9755 系列',
    item: 'AustralianUFOFiles',
    country: 'AU',
    archiveLabel: 'National Archives of Australia',
    series: 'A9755',
    license: 'public-domain'
  },
  {
    sourceId: 'nz-nzdf',
    sourceName: '新西兰国防军 · AIR 系列',
    item: 'NewZealandUFO',
    country: 'NZ',
    archiveLabel: 'Archives New Zealand / NZDF',
    series: 'AIR',
    license: 'public-domain'
  }
]

const cache = new Map()

export const sources = CONFIGS.map((config) => ({
  meta: {
    sourceId: config.sourceId,
    sourceName: config.sourceName,
    sourceUrl: `https://archive.org/details/${config.item}`,
    license: config.license
  },
  search: (query) => search(config, query)
}))

async function search(config, query = {}) {
  const country = String(query.country ?? '').toUpperCase()
  const keyword = String(query.keyword ?? '').trim().toLowerCase()
  const limit = Math.min(Math.max(Number(query.limit) || 8, 1), 30)
  // 只有问到这两个国家、或关键词里带国名/机构名时才查，避免每次检索都扫一遍。
  const relevant =
    country === config.country ||
    (keyword && (keyword.includes(config.country.toLowerCase()) || keyword.includes(config.sourceName.slice(0, 4))))
  if (!relevant && !keyword) return { source: sources.find((s) => s.meta.sourceId === config.sourceId).meta, rows: [] }

  const files = await loadFiles(config)
  const rows = []
  for (const file of files) {
    if (keyword && !file.name.toLowerCase().includes(keyword) && !keyword.includes(config.series.toLowerCase())) continue
    rows.push(toRow(config, file))
    if (rows.length >= limit) break
  }
  return { source: sources.find((s) => s.meta.sourceId === config.sourceId).meta, rows }
}

async function loadFiles(config) {
  const hit = cache.get(config.item)
  if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return hit.files
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(config.item)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`Internet Archive metadata 返回 ${res.status}`)
  const body = await res.json()
  const files = (body?.files ?? [])
    .filter((file) => /\.pdf$/i.test(file.name ?? ''))
    .filter((file) => !/_text\.pdf$|_hocr|_chocr/i.test(file.name ?? ''))
    .map((file) => ({ name: file.name, url: `https://archive.org/download/${encodeURIComponent(config.item)}/${encodeURIComponent(file.name)}` }))
  cache.set(config.item, { at: Date.now(), files })
  return files
}

function toRow(config, file) {
  const years = String(file.name).match(/(19\d{2}|20\d{2})/g) ?? []
  const date = years.length ? years[0] : null
  return {
    id: `${config.sourceId}-${hash(file.name)}`,
    date,
    datePrecision: 'year',
    country: config.country,
    city: `${config.archiveLabel}（${config.series}）`,
    admin: null,
    shape: null,
    duration: null,
    quote: String(file.name).replace(/\.pdf$/i, '').slice(0, 380),
    quoteLang: 'en',
    summaryZh: `${config.sourceName}档案文件：${file.name}${years.length ? `（${years[0]}）` : ''}。`,
    explanation: null,
    explanationAuthor: null,
    recordType: 'official-archive',
    corroboration: 'single',
    mediaUrls: [/\.pdf$/i.test(file.name) ? `https://archive.org/download/${encodeURIComponent(config.item)}/page/n0_w800.jpg` : file.url],
    documents: [{ title: file.name, archive: config.archiveLabel, url: file.url }],
    sourceRecordUrl: file.url,
    landmark: false,
    contradiction: false,
    eventKey: null,
    demo: false
  }
}

function hash(text) {
  let value = 0
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0
  return value.toString(36)
}
