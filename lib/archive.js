/**
 * 档案馆存储：一条记录一个文件夹（meta.json + detail.md + 图），
 * 站点只读 data.json，详情按需读 records/<id>.json。
 * @module dsh-ufo/lib/archive
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { achievementState, classifyRarity, countersOf, evaluateAchievements, RARITY_META } from './rarity.js'
import { renderIndexHtml } from './site/page.js'
import { detailMarkdown, markdownToHtml, recordTypeLabel, corroborationLabel } from './markdown.js'
import { factLine, formatDateZh } from './normalize.js'
import { downloadMedia, downloadPdf } from './media.js'

const DEFAULT_PROFILE = {
  name: null,
  nameSource: null,
  createdAt: null,
  lastSeenAt: null,
  queries: 0,
  visits: 0,
  lastTopic: null,
  lastTopicAt: null,
  addressLevel: 0
}

export function archivePaths(dir) {
  return {
    root: dir,
    profile: join(dir, 'profile.json'),
    achievements: join(dir, 'achievements.json'),
    pins: join(dir, 'pins.json'),
    data: join(dir, 'data.json'),
    records: join(dir, 'records'),
    media: join(dir, 'media'),
    indexHtml: join(dir, 'index.html')
  }
}

export async function ensureArchive(dir) {
  const p = archivePaths(dir)
  await mkdir(p.records, { recursive: true })
  await mkdir(p.media, { recursive: true })
  return p
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeJson(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

export async function loadProfile(dir) {
  return { ...DEFAULT_PROFILE, ...(await readJson(archivePaths(dir).profile, {})) }
}

export async function saveProfile(dir, profile) {
  await ensureArchive(dir)
  await writeJson(archivePaths(dir).profile, profile)
}

export async function loadAchievements(dir) {
  return { unlocked: {}, ...(await readJson(archivePaths(dir).achievements, {})) }
}

export async function loadPins(dir) {
  const data = await readJson(archivePaths(dir).pins, { ids: [] })
  return Array.isArray(data.ids) ? data.ids : []
}

export async function savePins(dir, ids) {
  await ensureArchive(dir)
  await writeJson(archivePaths(dir).pins, { ids: [...new Set(ids)] })
}

/** 读取所有已归档记录。 */
export async function readAllRecords(dir) {
  const p = archivePaths(dir)
  let entries = []
  try {
    entries = await readdir(p.records, { withFileTypes: true })
  } catch {
    return []
  }
  const records = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const meta = await readJson(join(p.records, entry.name, 'meta.json'), null)
    if (meta) records.push(meta)
  }
  records.sort((a, b) => String(b.occurred?.date ?? '').localeCompare(String(a.occurred?.date ?? '')))
  return records
}

/**
 * 合并本次结果，落盘为文件夹，并重算成就。
 * @param {string} dir
 * @param {object[]} incoming 归一化记录
 * @param {{ profile?: object }} [options]
 */
export async function saveRecords(dir, incoming, options = {}) {
  const p = await ensureArchive(dir)
  const existing = await readAllRecords(dir)
  const byId = new Map(existing.map((record) => [record.id, record]))

  for (const record of incoming) {
    const previous = byId.get(record.id)
    const merged = {
      ...previous,
      ...record,
      firstSeenAt: previous?.firstSeenAt ?? record.retrievedAt,
      lastSeenAt: record.retrievedAt,
      sources: mergeSources(previous?.sources, record)
    }
    if (!(merged.media?.length) && merged.mediaUrls?.length) {
      merged.media = await downloadMedia(p.root, merged.mediaUrls, {
        limit: options.mediaLimit ?? 2,
        credit: merged.sourceName
      })
    }
    if (!(merged.media ?? []).some((item) => item.kind === 'pdf')) {
      const pdfUrl = (merged.documents ?? []).map((doc) => doc.url).find((url) => /\.pdf($|\?)/i.test(url ?? ''))
      if (pdfUrl) {
        const pdf = await downloadPdf(p.root, pdfUrl, { credit: merged.sourceName })
        if (pdf) merged.media = [...(merged.media ?? []), pdf]
      }
    }
    merged.rarity = classifyRarity(merged)
    merged.rarityLabel = RARITY_META[merged.rarity].label
    byId.set(merged.id, merged)

    const folder = join(p.records, merged.id)
    await mkdir(folder, { recursive: true })
    await writeJson(join(folder, 'meta.json'), merged)
    const related = [...byId.values()].filter(
      (other) => other.id !== merged.id && merged.eventKey && other.eventKey === merged.eventKey
    )
    await writeFile(join(folder, 'detail.md'), detailMarkdown(merged, { related }), 'utf8')
  }

  const records = [...byId.values()].sort((a, b) =>
    String(b.occurred?.date ?? '').localeCompare(String(a.occurred?.date ?? ''))
  )

  const achievements = await loadAchievements(dir)
  const stats = { ...(achievements.stats ?? {}) }
  if (options.emptySearch) stats.emptySearches = Number(stats.emptySearches ?? 0) + 1
  const evaluation = evaluateAchievements(records, achievements, stats)
  await writeJson(p.achievements, {
    unlocked: evaluation.unlocked,
    stats,
    updatedAt: new Date().toISOString()
  })

  const pins = await loadPins(dir)
  const profile = options.profile ?? (await loadProfile(dir))
  await writeJson(
    p.data,
    buildSiteData({
      records,
      profile,
      pins,
      achievements: { unlocked: evaluation.unlocked },
      counters: evaluation.counters,
      stats
    })
  )

  await writeStaticSite(dir, { version: options.version }).catch(() => {})
  return { records, achievements: evaluation, pins, counters: evaluation.counters, stats }
}

/** 生成可直接双击打开的自包含站点（数据与详情内嵌，图片走相对路径）。 */
export async function writeStaticSite(dir, options = {}) {
  const records = await readAllRecords(dir)
  const profile = await loadProfile(dir)
  const pins = await loadPins(dir)
  const achievements = await loadAchievements(dir)
  const data = buildSiteData({
    records,
    profile,
    pins,
    achievements: { unlocked: achievements.unlocked },
    stats: achievements.stats ?? {}
  })
  const details = {}
  for (const record of records) {
    const detail = await readRecordDetail(dir, record.id)
    if (detail) details[record.id] = { html: detail.html, sourceUrl: detail.sourceUrl, rarity: detail.rarity }
  }
  const html = renderIndexHtml({
    name: profile.name ?? null,
    version: options.version ?? '',
    data,
    details
  })
  await writeFile(join(dir, 'index.html'), html, 'utf8')
}

function mergeSources(previous, record) {
  const list = Array.isArray(previous) ? [...previous] : []
  const key = `${record.sourceId}:${record.sourceRecordUrl}`
  if (!list.some((item) => `${item.sourceId}:${item.sourceRecordUrl}` === key)) {
    list.push({
      sourceId: record.sourceId,
      sourceName: record.sourceName,
      sourceRecordUrl: record.sourceRecordUrl,
      retrievedAt: record.retrievedAt
    })
  }
  return list
}

/** 站点读取的完整数据文件。隐藏未解锁的成就在这里就被脱敏。 */
export function buildSiteData({ records, profile, pins, achievements, counters, stats = {} }) {
  const state = achievementState(records, achievements ?? {}, stats)
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    profile: { name: profile.name ?? null },
    counters: counters ?? state.counters,
    pins,
    achievements: { unlocked: achievements?.unlocked ?? {}, ...state },
    records: records.map(toCard)
  }
}

/** 卡片数据：只带列表需要的字段，详情按需请求。 */
export function toCard(record) {
  const rarity = record.rarity ?? classifyRarity(record)
  return {
    id: record.id,
    title: record.place?.label || '未知地点',
    date: record.occurred?.date ?? null,
    dateLabel: formatDateZh(record.occurred?.date),
    shape: record.shape ?? null,
    country: record.place?.country ?? null,
    rarity,
    rarityLabel: RARITY_META[rarity]?.label ?? '记录',
    summary: record.summaryZh || record.quote,
    description: record.description ?? null,
    sourceName: record.sourceName,
    sourceUrl: record.sourceRecordUrl,
    recordType: record.recordType,
    recordTypeLabel: recordTypeLabel(record.recordType),
    corroboration: record.corroboration,
    corroborationLabel: corroborationLabel(record.corroboration),
    demo: record.demo === true,
    hasImage: (record.media ?? []).some((item) => item.kind !== 'pdf' && /\.(jpe?g|png|webp)$/i.test(item.file ?? '')),
    image: (() => { const hit = (record.media ?? []).find((item) => item.kind !== 'pdf' && /\.(jpe?g|png|webp)$/i.test(item.file ?? '')); return hit ? `media/${hit.file}` : null; })(),
    duration: record.duration ?? null,
    explanation: record.explanation ?? null,
    explanationAuthor: record.explanationAuthor ?? null,
    documents: (record.documents ?? []).slice(0, 3).map((doc) => ({ title: doc.title, archive: doc.archive, url: doc.url })),
    mediaCount: (record.media ?? []).filter((item) => item.kind !== 'pdf').length,
    pdfCount: (record.media ?? []).filter((item) => item.kind === 'pdf').length,
    factLine: factLine(record)
  }
}

/** 详情：从文件夹读 meta.json，现算 HTML。 */
export async function readRecordDetail(dir, id) {
  if (!/^[a-z0-9._-]+$/i.test(id)) return null
  const record = await readJson(join(archivePaths(dir).records, id, 'meta.json'), null)
  if (!record) return null
  const markdown = detailMarkdown(record)
  return {
    id: record.id,
    html: markdownToHtml(markdown),
    rarity: record.rarity ?? classifyRarity(record),
    sourceUrl: record.sourceRecordUrl,
    sourceName: record.sourceName,
    demo: record.demo === true
  }
}

/** 彻底删掉一条记录（用户手动清理时用）。 */
export async function removeRecord(dir, id) {
  if (!/^[a-z0-9._-]+$/i.test(id)) return false
  const folder = join(archivePaths(dir).records, id)
  await rm(folder, { recursive: true, force: true })
  return true
}
