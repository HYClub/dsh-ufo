/**
 * Wikidata：事件锚点。不产出目击记录，只给「这个事件在权威条目里叫什么」。
 * 用于 ufo_event 的关联条目，避免中英文别名各查各的。
 * @module dsh-ufo/lib/sources/wikidata
 */
const SOURCE = {
  sourceId: 'wikidata',
  sourceName: 'Wikidata',
  sourceUrl: 'https://www.wikidata.org/',
  license: 'CC0'
}
const UA = 'dsh-ufo/0.1 (event anchor; +https://www.wikidata.org)'
const UFO_HINT = /ufo|unidentified|uap|ovni|flying saucer|sighting|extraterrestrial/i
const NOT_EVENT = /\b(film|movie|book|novel|song|album|game|series|episode|band)\b/i

export const meta = SOURCE

/**
 * @param {string} keyword
 * @returns {Promise<Array<{ id: string, label: string, description: string, url: string }>>}
 */
export async function lookup(keyword) {
  const term = String(keyword ?? '').trim()
  if (!term) return []
  const url =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&limit=8&language=en&uselang=en&search=' +
    encodeURIComponent(term)

  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!res.ok) throw new Error(`Wikidata 返回 ${res.status}`)
  const body = await res.json()

  return (body?.search ?? [])
    .filter((item) => UFO_HINT.test(`${item.label ?? ''} ${item.description ?? ''}`))
    .filter((item) => !NOT_EVENT.test(item.description ?? ''))
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      label: item.label ?? item.id,
      description: item.description ?? '',
      url: `https://www.wikidata.org/wiki/${item.id}`
    }))
}
