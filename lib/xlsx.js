/**
 * 极简 XLSX 读取器：只解 zip 中央目录、sharedStrings 与第一个工作表。
 * 目的：不引第三方库，也能读 GEIPAN 的导出文件。
 * @module dsh-ufo/lib/xlsx
 */
import { inflateRawSync } from 'node:zlib'

/**
 * @param {Buffer} buffer
 * @returns {object[]} 以首行为表头的行对象
 */
export function readXlsx(buffer) {
  const entries = readZipEntries(buffer)
  const sharedEntry = entries.get('xl/sharedStrings.xml')
  const sheetEntry =
    [...entries.keys()].find((name) => /^xl\/worksheets\/sheet1\.xml$/.test(name)) ??
    [...entries.keys()].find((name) => /^xl\/worksheets\/.*\.xml$/.test(name))
  if (!sheetEntry) throw new Error('xlsx 里没有工作表')

  const sharedStrings = sharedEntry ? parseSharedStrings(inflateEntry(sharedEntry).toString('utf8')) : []
  const rows = parseRows(inflateEntry(entries.get(sheetEntry)).toString('utf8'), sharedStrings)
  if (rows.length === 0) return []

  const header = rows[0].map((value) => String(value ?? '').trim())
  return rows.slice(1).map((row) => {
    const item = {}
    header.forEach((key, index) => {
      if (key) item[key] = row[index] ?? ''
    })
    return item
  })
}

function readZipEntries(buffer) {
  const eocdIndex = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocdIndex < 0) throw new Error('不是有效的 xlsx（缺少 zip 结束记录）')
  const count = buffer.readUInt16LE(eocdIndex + 10)
  const centralOffset = buffer.readUInt32LE(eocdIndex + 16)

  const entries = new Map()
  let offset = centralOffset
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)

    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const data = buffer.subarray(dataStart, dataStart + compressedSize)
    entries.set(name, { method, data })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** 条目在读取时保持压缩态，取用时才解压，避免二次解压。 */
function inflateEntry(entry) {
  return entry.method === 0 ? entry.data : inflateRawSync(entry.data)
}

function parseSharedStrings(xml) {
  const strings = []
  const blocks = xml.match(/<si[\s>][\s\S]*?<\/si>/g) ?? []
  for (const block of blocks) {
    const texts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1]))
    strings.push(texts.join(''))
  }
  return strings
}

function parseRows(xml, sharedStrings) {
  const rows = []
  const rowBlocks = xml.match(/<row[\s>][\s\S]*?<\/row>/g) ?? []
  for (const block of rowBlocks) {
    const cells = []
    const cellBlocks = block.match(/<c[\s>][\s\S]*?<\/c>|<c[^>]*\/>/g) ?? []
    for (const cell of cellBlocks) {
      const ref = /r="([A-Z]+)\d+"/.exec(cell)?.[1]
      if (!ref) continue
      const index = columnIndex(ref)
      const type = /t="([^"]+)"/.exec(cell)?.[1]
      let value = ''
      if (type === 's') {
        const id = Number(/<v>(\d+)<\/v>/.exec(cell)?.[1] ?? -1)
        value = sharedStrings[id] ?? ''
      } else if (type === 'inlineStr') {
        value = [...cell.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('')
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? '')
      }
      cells[index] = value
    }
    if (cells.length) rows.push(cells)
  }
  return rows
}

function columnIndex(letters) {
  let index = 0
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

function decodeXml(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}
