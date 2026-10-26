/**
 * 源注册表：按查询需要选源，不做无条件全量拉取。
 *
 * 轻量源（维基、TNA、IA）每次都可问；重量源（GEIPAN 整库 XLSX、NUFORC 80k CSV）
 * 只在查询真的指向它们的覆盖范围时才联网：
 *   - 指定国家（FR / US）
 *   - 或者带关键词（关键词检索才需要广谱库）
 * 什么线索都没有的浏览式检索，只打轻量源 + 示例源，避免为了「看一眼」拖 14 MB。
 * @module dsh-ufo/lib/sources
 */
import * as ia from './ia.js'
import * as tna from './tna.js'
import * as geipan from './geipan.js'
import * as nuforc from './nuforc.js'
import * as wikipedia from './wikipedia.js'
import * as nara from './nara.js'
import { sources as iaCollections } from './ia-collection.js'
import { sources as nationalCollections } from './national-collection.js'

const LIGHT_SOURCES = [wikipedia, tna, ia, nara, ...iaCollections, ...nationalCollections]
const HEAVY_BY_COUNTRY = { FR: [geipan], US: [nuforc] }

/** 决定本次查询要打哪些源。 */
export function pickSources(query = {}) {
  const country = String(query.country ?? '').toUpperCase()
  const keyword = String(query.keyword ?? '').trim()
  if (country && HEAVY_BY_COUNTRY[country]) return [...LIGHT_SOURCES, ...HEAVY_BY_COUNTRY[country]]
  if (keyword.length >= 2) return [...LIGHT_SOURCES, geipan, nuforc]
  return [...LIGHT_SOURCES]
}

/**
 * @param {{ keyword?: string, country?: string, dateFrom?: string, dateTo?: string, shape?: string, limit?: number }} query
 * @param {{ network?: boolean }} settings
 */
export async function gather(query, settings = {}) {
  const bundles = []
  const errors = []
  const sources = settings.network === false ? [] : pickSources(query)

  if (sources.length) {
    const results = await Promise.allSettled(sources.map((adapter) => adapter.search(query)))
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') bundles.push(result.value)
      else errors.push(`${sources[index].meta.sourceName}：${result.reason?.message ?? result.reason}`)
    })
  }

  return { bundles, errors, selected: sources.map((adapter) => adapter.meta.sourceId) }
}

export { ia, tna, geipan, nuforc, wikipedia }

/**
 * 事件锚点：Wikidata 条目标题。失败不影响主检索。
 * @param {string} keyword
 */
export async function anchors(keyword) {
  try {
    const { lookup } = await import('./wikidata.js')
    return await lookup(keyword)
  } catch {
    return []
  }
}

/** 单条深取：只有用户点名要看某条记录时才调用。 */
export { fetchDetail } from './detail.js'
