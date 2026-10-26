/**
 * 巴西、加拿大、智利：官方档案入口页。
 * 这三家没有可用的逐条检索接口（或接口被挡），只能给到「馆藏入口 + 页面描述」的合集级记录。
 * 明确标注「合集级」，不冒充个案。
 * @module dsh-ufo/lib/sources/national-collection
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) dsh-ufo/0.1'

const CONFIGS = [
  {
    sourceId: 'br-an',
    sourceName: '巴西国家档案馆 · Fundo UFO',
    country: 'BR',
    url: 'https://www.gov.br/arquivonacional/pt-br/canais_atendimento/imprensa/noticias/conheca-o-fundo-sobre-ovnis-do-arquivo-nacional',
    archiveLabel: 'Arquivo Nacional（巴西）',
    keywords: ['brasil', 'brazil', '巴西', 'arquivo nacional', 'ovni', 'ufo']
  },
  {
    sourceId: 'ca-lac',
    sourceName: '加拿大图书档案馆 · UFO 记录',
    country: 'CA',
    url: 'https://www.canada.ca/en/library-archives/collection/research-help/science-technology/ufos.html',
    archiveLabel: 'Library and Archives Canada',
    keywords: ['canada', '加拿大', 'lac', 'ufo']
  },
  {
    sourceId: 'cl-dgac',
    sourceName: '智利 DGAC / CEFAA',
    country: 'CL',
    url: 'https://www.dgac.gob.cl/',
    archiveLabel: 'DGAC Chile',
    keywords: ['chile', '智利', 'cefaa', 'dgac', 'ovni']
  }
]

export const sources = CONFIGS.map((config) => ({
  meta: {
    sourceId: config.sourceId,
    sourceName: config.sourceName,
    sourceUrl: config.url,
    license: 'unknown'
  },
  search: (query) => search(config, query)
}))

async function search(config, query = {}) {
  const country = String(query.country ?? '').toUpperCase()
  const keyword = String(query.keyword ?? '').trim().toLowerCase()
  const relevant =
    country === config.country ||
    (keyword && config.keywords.some((word) => keyword.includes(word)))
  const sourceMeta = sources.find((item) => item.meta.sourceId === config.sourceId).meta
  if (!relevant) return { source: sourceMeta, rows: [] }

  const page = await loadPage(config)
  return { source: sourceMeta, rows: [toRow(config, page)] }
}

async function loadPage(config) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(config.url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: controller.signal })
    if (!res.ok) throw new Error(`入口页返回 ${res.status}`)
    const html = await res.text()
    const title = decode(/<title>([^<]+)<\/title>/i.exec(html)?.[1] ?? config.sourceName)
    const description = decode(
      /<meta[^>]+(?:name|property)="(?:description|og:description)"[^>]+content="([^"]+)"/i.exec(html)?.[1] ?? ''
    )
    return { title, description, html }
  } finally {
    clearTimeout(timer)
  }
}

function toRow(config, page) {
  const quote = (page.description || page.title).slice(0, 380)
  return {
    id: `${config.sourceId}-collection`,
    date: null,
    datePrecision: 'unknown',
    country: config.country,
    city: config.archiveLabel,
    admin: null,
    shape: null,
    duration: null,
    quote,
    quoteLang: 'en',
    summaryZh: `${config.sourceName}：馆藏入口（合集级，尚未逐条数字化检索）。`,
    explanation: null,
    explanationAuthor: null,
    recordType: 'official-archive',
    corroboration: 'single',
    documents: [{ title: page.title, archive: config.archiveLabel, url: config.url }],
    sourceRecordUrl: config.url,
    landmark: false,
    contradiction: false,
    eventKey: null,
    demo: false
  }
}

function decode(text) {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
