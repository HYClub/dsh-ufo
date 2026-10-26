/**
 * 媒体落盘：只下载用户这次查到的记录所附带的图，不预抓任何东西。
 * 限制：每条最多 2 张、单张 ≤3 MB、只收 jpg/png/webp。
 * @module dsh-ufo/lib/media
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const UA = 'dsh-ufo/0.1 (media fetch)'
const MAX_BYTES = 3 * 1024 * 1024

/**
 * @param {string} archiveDir
 * @param {string[]} urls
 * @param {{ limit?: number, credit?: string }} [options]
 * @returns {Promise<Array<{ file: string, credit: string, sourceUrl: string }>>}
 */
export async function downloadMedia(archiveDir, urls, options = {}) {
  const list = [...new Set((urls ?? []).filter(Boolean))].slice(0, options.limit ?? 2)
  if (!list.length) return []
  const mediaDir = join(archiveDir, 'media')
  await mkdir(mediaDir, { recursive: true })

  const saved = []
  for (const url of list) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'image/*' },
        signal: AbortSignal.timeout(15000)
      })
      if (!res.ok) continue
      const type = String(res.headers.get('content-type') ?? '').toLowerCase()
      if (!/image\/(jpeg|jpg|png|webp)/.test(type)) continue
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length === 0 || buffer.length > MAX_BYTES) continue
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
      const file = `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.${ext}`
      await writeFile(join(mediaDir, file), buffer)
      saved.push({ file, credit: options.credit ?? '来源图片', sourceUrl: url })
    } catch {
      /* 单张失败不影响记录 */
    }
  }
  return saved
}

/** 原件 PDF：单份上限 25 MB，落本地 media/。 */
export async function downloadPdf(archiveDir, url, options = {}) {
  if (!url || !/\.pdf($|\?)/i.test(url)) return null
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/pdf' },
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) return null
    const type = String(res.headers.get('content-type') ?? '').toLowerCase()
    if (type && !/pdf|octet-stream/.test(type)) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (!buffer.length || buffer.length > (options.maxBytes ?? 25 * 1024 * 1024)) return null
    const mediaDir = join(archiveDir, 'media')
    await mkdir(mediaDir, { recursive: true })
    const file = createHash('sha1').update(url).digest('hex').slice(0, 16) + '.pdf'
    await writeFile(join(mediaDir, file), buffer)
    return { file, kind: 'pdf', credit: options.credit ?? '原件', sourceUrl: url }
  } catch {
    return null
  }
}
