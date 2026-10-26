/**
 * 单条深取：只有用户明确要看某一条记录时，才去拉它的原件。
 * 不在检索阶段批量下载任何档案。
 * @module dsh-ufo/lib/sources/detail
 */
const UA = 'dsh-ufo/0.1 (single-record fetch)'

/**
 * @param {object} record 归档的 meta.json
 * @returns {Promise<{ documents: object[], note: string }>}
 */
export async function fetchDetail(record) {
  switch (record.sourceId) {
    case 'geipan':
      return fetchGeipan(record)
    case 'ia-bluebook':
      return fetchInternetArchive(record)
    case 'tna':
      return {
        documents: record.documents ?? [],
        note: '英国国家档案馆的记录本身就是档案级：详情页已给出案卷号与馆藏信息，没有额外的可下载原件。'
      }
    case 'nuforc':
      return {
        documents: record.documents ?? [],
        note: 'NUFORC 镜像不含逐条原始页面，无法深取；链接指向 NUFORC 档案入口。'
      }
    case 'wikipedia':
      return {
        documents: record.documents ?? [],
        note: '维基百科是叙事层，条目内引用需人工核对；这里只保留条目标题与链接。'
      }
    default:
      return { documents: record.documents ?? [], note: '该来源没有可深取的原件。' }
  }
}

async function fetchGeipan(record) {
  const pageUrl = record.sourceRecordUrl
  const res = await fetch(pageUrl, { headers: { 'user-agent': UA, accept: 'text/html' } })
  if (!res.ok) throw new Error(`GEIPAN 案件页返回 ${res.status}`)
  const html = await res.text()
  const title = decode(/<title>([^<]+)<\/title>/.exec(html)?.[1] ?? record.summaryZh)
  const files = [...html.matchAll(/href="([^"]+\.(?:pdf|jpg|jpeg|png))[^"]*"/gi)]
    .map((match) => decode(match[1]))
    .filter((url) => /cnes-geipan\.fr/.test(url) && !/Questionnaire/i.test(url))
  const unique = [...new Set(files)].slice(0, 6)

  return {
    documents: unique.map((url) => ({
      title: `GEIPAN 原件：${fileName(url)}`,
      archive: 'CNES / GEIPAN',
      url
    })),
    note: unique.length
      ? `案件页里找到 ${unique.length} 份原件（PV / 附件）。这些是文件链接，未写入本地。`
      : `案件页可打开，但没有公开的扫描件。标题：${title}`
  }
}

async function fetchInternetArchive(record) {
  const identifier = /archive\.org\/details\/([^/?#]+)/.exec(record.sourceRecordUrl)?.[1]
  if (!identifier) throw new Error('无法从记录里解析 Internet Archive 标识')
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`Internet Archive metadata 返回 ${res.status}`)
  const body = await res.json()
  const files = (body?.files ?? [])
    .filter((file) => /\.pdf$/i.test(file.name ?? ''))
    .filter((file) => !/_?(hocr|chocr|djvu)/i.test(file.name ?? ''))
    .slice(0, 6)

  return {
    documents: files.map((file) => ({
      title: `蓝皮书案卷文件：${file.name}`,
      archive: 'NARA / Internet Archive',
      url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`
    })),
    note: files.length
      ? `该条目下有 ${files.length} 个可读文件（PDF/文本）。`
      : '该条目没有可读的 PDF/文本文件。'
  }
}

function fileName(url) {
  const tail = url.split('/').pop() ?? url
  return decodeURIComponent(tail).slice(0, 80)
}

function decode(text) {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
