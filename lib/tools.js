/**
 * 工具定义：纯对象形式注册（不依赖 @deepseek-ai/dsh-tools，保证安装在 profile 里也能解析）。
 * 参数用标准 JSON Schema，自己校验，错误直接抛给模型看。
 * @module dsh-ufo/lib/tools
 */
import { join } from 'node:path'
import { loadPins, loadProfile, readAllRecords, savePins, saveProfile, saveRecords, toCard } from './archive.js'
import { readFile, writeFile } from 'node:fs/promises'
import { normalizeAll } from './normalize.js'
import { achievementState, countersOf } from './rarity.js'
import { anchors, fetchDetail, gather } from './sources/index.js'
import { weatherFor } from './sources/weather.js'
import { downloadMedia } from './media.js'
import { deepenAll } from './deepen.js'
import { ensureContract } from './workspace.js'

const SHAPES = ['triangle', 'disk', 'sphere', 'light', 'fireball', 'tic tac', 'v 型', '碟形', '球形', '光点', '三角']

/**
 * @param {object} runtime
 * @param {{ network: boolean, maxResults: number, version: string }} settings
 */
export function registerTools(ctx, runtime, settings) {
  const definitions = [
    searchTool(runtime, settings),
    eventTool(runtime, settings),
    documentsTool(runtime, settings),
    fetchTool(runtime, settings),
    weatherTool(runtime, settings),
    bindTool(runtime, settings),
    analyzeTool(runtime),
    guardTool(runtime),
    exportTool(runtime),
    archiveTool(runtime, settings)
  ]
  const disposers = definitions.map((definition) => ctx.tools.register(definition))
  return () => {
    for (const dispose of disposers) dispose()
  }
}

/* ------------------------------------------------------------------ */
/* ufo_search                                                          */
/* ------------------------------------------------------------------ */

function searchTool(runtime, settings) {
  return {
    name: 'ufo_search',
    description:
      '检索已接入的 UFO 目击记录与官方档案，并把结果归档到用户的本地档案馆。适用于用户询问某地、某年、某种形状或某个关键词的目击。返回带来源链接的条目摘要和档案馆地址。记录是目击者报告与档案，不是对现象真伪的判定；已接入源里查不到，只说明没有收录，不等于没有发生。',
    parameters: objectSchema(
      {
        keyword: { type: 'string', description: '关键词，可中可英，匹配地点、形状、事件名与叙述' },
        country: { type: 'string', description: 'ISO 3166-1 两位国家码，如 US / FR / GB / BR' },
        date_from: { type: 'string', description: '起始日期 YYYY-MM-DD' },
        date_to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
        shape: { type: 'string', description: '形状关键词，如 三角 / 碟形 / 光点' },
        limit: { type: 'integer', description: '返回条数，1–30，默认 8' },
        media_limit: { type: 'integer', description: '每条记录最多存几张图，1–10，默认 2' }
      },
      []
    ),
    output: {
      schema: objectSchema({ result: { type: 'json' } }, ['result']),
      render: (_args, value) => [{ type: 'text', text: renderSearch(value.result) }]
    },
    async execute(args, exec) {
      const input = readArgs(args, ['keyword', 'country', 'date_from', 'date_to', 'shape'])
      const limit = clamp(Number(args?.limit) || settings.maxResults, 1, 30)
      const dir = await runtime.ensureDir(exec)

      const { bundles, errors } = await gather(
        {
          keyword: input.keyword,
          country: input.country,
          dateFrom: input.date_from,
          dateTo: input.date_to,
          shape: input.shape,
          limit
        },
        settings
      )

      const kept = []
      const dropped = []
      for (const bundle of bundles) {
        const normalized = normalizeAll(bundle.rows, bundle.source)
        kept.push(...normalized.kept)
        dropped.push(...normalized.dropped)
      }

      await deepenAll(kept, 3)
      const mediaLimit = clamp(Number(args?.media_limit) || 2, 1, 10)
      const saved = await saveRecords(dir, kept, {
        profile: await loadProfile(dir),
        emptySearch: kept.length === 0,
        mediaLimit
      })
      const profile = await touchProfile(dir, input.keyword || input.shape || input.country || '一次随机检索', saved.counters, dominantPlace(kept))
      runtime.setProfile(profile)

      const cards = kept.map((record) => {
        const stored = saved.records.find((item) => item.id === record.id) ?? record
        return { ...toCard(stored), quote: stored.quote, retrievedAt: stored.retrievedAt, sourceRecordUrl: stored.sourceRecordUrl }
      })

      return {
        result: {
          query: input,
          count: cards.length,
          focusId: cards.length === 1 ? cards[0].id : null,
          suggestions: nextHooks(saved.records, saved.records.find((r) => r.id === cards[0]?.id) ?? cards[0] ?? null),
          records: cards,
          dropped: dropped.length,
          droppedReasons: dropped,
          totalArchived: saved.records.length,
          mediaNote: mediaNoteFor(saved.records, kept, mediaLimit),
          newAchievements: saved.achievements.fresh.map((item) => ({ name: item.name, reward: item.reward })),
          archiveUrl: runtime.siteUrl(), archiveFile: runtime.archiveFile(),
          archivePath: dir,
          failedSources: errors.length,
          coverage: coverageNote(bundles, errors, settings)
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* ufo_event                                                           */
/* ------------------------------------------------------------------ */

function eventTool(runtime, settings) {
  return {
    name: 'ufo_event',
    description:
      '把一个具体 UFO 事件的多方记录按时间轴整理出来：民间目击、官方档案、官方解释，并标注「单源 / 多源一致 / 多源矛盾」。适用于用户问某个著名事件的来龙去脉、不同说法、官方怎么解释。只呈现记录之间的异同，不替用户下结论。',
    parameters: objectSchema(
      {
        event: { type: 'string', description: '事件名或关键词，中英均可，如 凤凰城 / Phoenix Lights / Rendlesham' },
        limit: { type: 'integer', description: '最多取多少条，默认 20' }
      },
      ['event']
    ),
    output: {
      schema: objectSchema({ result: { type: 'json' } }, ['result']),
      render: (_args, value) => [{ type: 'text', text: renderEvent(value.result) }]
    },
    async execute(args, exec) {
      const event = String(args?.event ?? '').trim()
      if (!event) throw new Error('event 不能为空')
      const dir = await runtime.ensureDir(exec)

      const { bundles, errors } = await gather(
        { keyword: event, limit: clamp(Number(args?.limit) || 20, 1, 30) },
        settings
      )
      const kept = []
      const dropped = []
      for (const bundle of bundles) {
        const normalized = normalizeAll(bundle.rows, bundle.source)
        kept.push(...normalized.kept)
        dropped.push(...normalized.dropped)
      }
      await deepenAll(kept, 3)
      const saved = await saveRecords(dir, kept, { profile: await loadProfile(dir) })
      const profileAfter = await touchProfile(dir, event, saved.counters, dominantPlace(kept))
      runtime.setProfile(profileAfter)

      const keptIds = new Set(kept.map((item) => item.id))
      const relevant = saved.records.filter((record) => keptIds.has(record.id))

      const byDate = [...relevant].sort((a, b) => String(a.occurred?.date ?? '').localeCompare(String(b.occurred?.date ?? '')))
      const documents = byDate.flatMap((record) =>
        (record.documents ?? []).map((doc) => ({ ...doc, recordId: record.id, date: record.occurred?.date }))
      )

      // Wikidata 只做锚点：告诉用户这个事件在权威条目里叫什么，不参与真伪判断。
      const wikiAnchors = await anchors(event)
      for (const anchor of wikiAnchors) {
        documents.push({
          title: `${anchor.label}${anchor.description ? ` — ${anchor.description}` : ''}`,
          archive: 'Wikidata',
          url: anchor.url,
          recordId: null,
          date: null
        })
      }

      return {
        result: {
          event,
          count: byDate.length,
          focusId: byDate.length === 1 ? byDate[0].id : null,
          suggestions: nextHooks(saved.records, byDate[0] ?? null),
          timeline: byDate.map((record) => ({
            id: record.id,
            date: record.occurred?.date,
            dateLabel: record.occurred?.date ?? '日期不详',
            title: record.place?.label,
            shape: record.shape,
            duration: record.duration ?? null,
            retrievedAt: record.retrievedAt ?? null,
            quote: record.quote,
            summary: record.summaryZh,
            explanation: record.explanation,
            explanationAuthor: record.explanationAuthor,
            sourceName: record.sourceName,
            sourceRecordUrl: record.sourceRecordUrl,
            corroboration: record.corroboration,
            rarity: record.rarity,
            id: record.id
          })),
          documents,
          assessment: assessCorroboration(byDate),
          failedSources: errors.length,
          newAchievements: saved.achievements.fresh.map((item) => ({ name: item.name, reward: item.reward })),
          archiveUrl: runtime.siteUrl(), archiveFile: runtime.archiveFile(),
          archivePath: dir,
          coverage: coverageNote(bundles, errors, settings)
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* ufo_documents                                                       */
/* ------------------------------------------------------------------ */

function documentsTool(runtime, settings) {
  return {
    name: 'ufo_documents',
    description:
      '在已归档记录里检索官方档案条目（案卷、报告、声明），返回档案机构、文件标题、页面链接与关联记录。适用于用户问「官方文件怎么写的」「有没有档案」。只返回归档过的引用，不生成未归档的档案内容。',
    parameters: objectSchema({ keyword: { type: 'string', description: '关键词，匹配档案标题与归档记录' } }, []),
    output: {
      schema: objectSchema({ result: { type: 'json' } }, ['result']),
      render: (_args, value) => [{ type: 'text', text: renderDocuments(value.result) }]
    },
    async execute(args, exec) {
      const keyword = String(args?.keyword ?? '').toLowerCase()
      const dir = await runtime.ensureDir(exec)
      const records = await readAllRecords(dir)
      const docs = []
      for (const record of records) {
        for (const doc of record.documents ?? []) {
          const haystack = [doc.title, doc.archive, record.place?.label, record.summaryZh].join(' ').toLowerCase()
          if (!keyword || haystack.includes(keyword)) {
            docs.push({
              title: doc.title,
              archive: doc.archive,
              url: doc.url,
              note: doc.note,
              recordId: record.id,
              place: record.place?.label,
              date: record.occurred?.date
            })
          }
        }
      }
      return {
        result: {
          keyword,
          count: docs.length,
          documents: docs,
          archiveUrl: runtime.siteUrl(), archiveFile: runtime.archiveFile(),
          coverage: `档案条目来自本机已归档记录（${records.length} 条），覆盖范围等于你查过的范围。`
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* ufo_fetch                                                           */
/* ------------------------------------------------------------------ */

function fetchTool(runtime, settings) {
  return {
    name: 'ufo_fetch',
    description:
      '对一条已归档记录「深取原件」：GEIPAN 去案件页取 PV 扫描件、蓝皮书从条目里列出可读 PDF、英国档案给出馆藏详情。只在用户明确要看某一条记录的原件、原始档案或报告时调用——检索阶段不会下载任何文件。',
    parameters: objectSchema(
      {
        record_id: { type: 'string', description: '记录 id，可从检索结果或档案馆卡片上拿到' },
        save: { type: 'boolean', description: '是否把取到的原件链接写回档案，默认 true' },
        media_limit: { type: 'integer', description: '这次最多再存几张图，1–10' }
      },
      ['record_id']
    ),
    output: {
      schema: objectSchema({ result: { type: 'json' } }, ['result']),
      render: (_args, value) => [{ type: 'text', text: renderFetch(value.result) }]
    },
    async execute(args, exec) {
      const id = String(args?.record_id ?? '').trim()
      if (!id) throw new Error('record_id 不能为空')
      const dir = await runtime.ensureDir(exec)
      const records = await readAllRecords(dir)
      const record = records.find((item) => item.id === id) ?? records.find((item) => item.id.includes(id))
      if (!record) throw new Error(`档案里没有 id 为 ${id} 的记录`)

      const detail = await fetchDetail(record)
      let media = record.media ?? []
      if (Number(args?.media_limit) > 0) {
        const more = await downloadMedia(dir, record.mediaUrls ?? [], {
          limit: clamp(Number(args.media_limit), 1, 10),
          credit: record.sourceName
        })
        const byFile = new Map(media.map((item) => [item.file, item]))
        for (const item of more) byFile.set(item.file, item)
        media = [...byFile.values()]
      }
      const documents = mergeDocuments(record.documents ?? [], detail.documents ?? [])
      if (args?.save !== false && documents.length) {
        await saveRecords(dir, [{ ...record, documents, media }], { profile: await loadProfile(dir) })
      }

      return {
        result: {
          recordId: record.id,
          title: record.place?.label ?? record.id,
          source: record.sourceName,
          documents,
          note: detail.note,
          archiveUrl: runtime.siteUrl(), archiveFile: runtime.archiveFile()
        }
      }
    }
  }
}

function mergeDocuments(existing, incoming) {
  const byUrl = new Map()
  for (const doc of [...existing, ...incoming]) {
    if (!doc?.url) continue
    byUrl.set(doc.url, doc)
  }
  return [...byUrl.values()]
}

function renderFetch(result) {
  const lines = [`🔎 ${result.title}（${result.source}）`]
  if (result.note) lines.push(result.note)
  lines.push('')
  if (result.documents.length === 0) {
    lines.push('这条没有可下载的原件。')
  } else {
    for (const doc of result.documents.slice(0, 8)) {
      lines.push(`- ${doc.title}`)
      lines.push(`  ${doc.url}`)
    }
  }
  lines.push('')
  lines.push(...archiveLines(result))
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* ufo_weather                                                         */
/* ------------------------------------------------------------------ */

function weatherTool(runtime, settings) {
  return {
    name: 'ufo_weather',
    description:
      '查某条目击记录发生当天、发生地的历史天气（Open-Meteo 再分析数据）。只在用户想聊「那晚天气怎么样」或你要在结尾带一句天气暗示时调用。没有坐标会先用地名解析；日期不完整就返回拿不到。不允许在没调用的情况下自行描述天气。',
    parameters: objectSchema(
      { record_id: { type: 'string', description: '记录 id，与 ufo_fetch 相同' } },
      ['record_id']
    ),
    output: {
      schema: objectSchema({ result: { type: 'json' } }, ['result']),
      render: (_args, value) => [{ type: 'text', text: renderWeather(value.result) }]
    },
    async execute(args, exec) {
      const id = String(args?.record_id ?? '').trim()
      if (!id) throw new Error('record_id 不能为空')
      const dir = await runtime.ensureDir(exec)
      const records = await readAllRecords(dir)
      const record = records.find((item) => item.id === id) ?? records.find((item) => item.id.includes(id))
      if (!record) throw new Error(`档案里没有 id 为 ${id} 的记录`)

      const weather = await weatherFor({
        lat: record.place?.lat,
        lon: record.place?.lon,
        place: record.place?.label,
        date: record.occurred?.date
      })

      return { result: { recordId: record.id, place: record.place?.label, date: record.occurred?.date, ...weather } }
    }
  }
}

function renderWeather(result) {
  if (!result.ok) return `🌦️ ${result.note}`
  return [
    `🌦️ ${result.date} · ${result.place}`,
    `最高 ${result.tmax}°C，最低 ${result.tmin}°C，${result.text}，降水 ${result.precipitation} mm`,
    result.note,
    '',
  ].join('\n')
}

function completeness(record) {
  const have = []
  const miss = []
  if (record.quote) have.push('原文摘录')
  if (record.shape) have.push('形状')
  if (record.duration) have.push('持续')
  if (record.explanation) have.push('官方解释')
  else miss.push('官方解释')
  if (record.documents?.length) have.push('档案文件')
  else miss.push('档案文件')
  if (record.mediaCount) have.push('本地图片')
  else miss.push('图片')
  if (record.sourceId === 'nuforc' && (record.quote ?? '').length < 160) miss.push('完整叙述')
  return `${have.join('、') || '无'}${miss.length ? ` ｜ 缺 ${miss.join('、')}` : ''}`
}

function nextHooks(records, focus, limit = 3) {
  if (!focus) return []
  const out = []
  for (const record of records) {
    if (record.id === focus.id) continue
    const reasons = []
    if (focus.eventKey && record.eventKey === focus.eventKey) reasons.push('同一事件')
    if (focus.occurred?.date && record.occurred?.date === focus.occurred.date) reasons.push('同一夜')
    if (focus.shape && record.shape === focus.shape) reasons.push(`同形状 ${record.shape}`)
    if (focus.place?.country && record.place?.country === focus.place.country) reasons.push('同国家')
    if (!reasons.length) continue
    out.push({ id: record.id, label: `${record.occurred?.date ?? '日期不详'} · ${record.place?.label ?? '地点不详'}`, why: reasons[0] })
    if (out.length >= limit) break
  }
  return out
}

function archiveLines(result) {
  const file = String(result.archiveFile ?? '')
  if (!file) return [`📁 已归档：${result.archiveUrl ?? '（尚未建立档案馆）'}`]
  const base = 'file:///' + file.replace(/\\/g, '/')
  const focus = result.focusId ?? (Array.isArray(result.records) && result.records.length === 1 ? result.records[0].id : null)
  if (focus) {
    const url = `${base}#r-${encodeURIComponent(focus)}`
    return [`📁 已归档：[打开这条记录](<${url}>)`, `   路径：${file}#r-${focus}`]
  }
  const lines = [`📁 已归档：[打开档案馆](<${base}>)`]
  const records = Array.isArray(result.records) ? result.records.slice(0, 6) : []
  if (records.length) {
    lines.push('   直达：')
    for (const record of records) {
      const url = `${base}#r-${encodeURIComponent(record.id)}`
      lines.push(`   - [${record.dateLabel ?? '日期不详'} · ${record.title ?? '地点不详'}](<${url}>)`)
    }
  }
  lines.push(`   路径：${file}`)
  return lines
}

function archiveLink(url) {
  const value = String(url ?? '').trim()
  if (!/^(https?:|file:)/i.test(value)) return value || '（尚未建立档案馆）'
  return `[打开档案馆](<${value}>)`
}

function mediaNoteFor(savedRecords, kept, limit) {
  let available = 0
  let images = 0
  let pdfs = 0
  for (const record of kept) {
    const stored = savedRecords.find((item) => item.id === record.id) ?? record
    available += (stored.mediaUrls ?? []).length
    images += (stored.media ?? []).filter((item) => item.kind !== 'pdf').length
    pdfs += (stored.media ?? []).filter((item) => item.kind === 'pdf').length
  }
  if (!available && !pdfs) return ''
  const parts = []
  if (images) parts.push(`已存 ${images} 张图`)
  if (pdfs) parts.push(`${pdfs} 份原件 PDF`)
  if (available > images) parts.push(`源上共 ${available} 张图，还有 ${available - images} 张没取；想多存就说「多存几张」`)
  return parts.length ? `🖼️ ${parts.join('，')}。` : ''
}

/* ------------------------------------------------------------------ */
/* ufo_archive                                                         */
/* ------------------------------------------------------------------ */

function exportTool(runtime) {
  const schema = objectSchema({}, [])
  return {
    name: 'ufo_export',
    description: '把当前档案馆导出成单个 share.html：图片内嵌为 base64，发给别人也能直接打开。',
    parameters: schema,
    output: {
      schema,
      render: (_args, value) => [{ type: 'text', text: value.result.message }]
    },
    async execute(_args, exec) {
      const dir = await runtime.ensureDir(exec)
      const source = join(dir, 'index.html')
      let html
      try {
        html = await readFile(source, 'utf8')
      } catch {
        return { result: { message: '还没生成档案馆页面，先查一次再来。', path: null } }
      }
      const files = new Set([...html.matchAll(/src="media\/([^"]+)"/g)].map((m) => m[1]))
      let images = 0
      for (const file of files) {
        try {
          const buffer = await readFile(join(dir, 'media', file))
          const ext = file.split('.').pop().toLowerCase()
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
          html = html.split(`src="media/${file}"`).join(`src="data:${mime};base64,${buffer.toString('base64')}"`)
          images += 1
        } catch {
          /* 缺图就留着相对路径 */
        }
      }
      const target = join(dir, 'share.html')
      await writeFile(target, html, 'utf8')
      return {
        result: {
          message: `已导出 share.html（${(html.length / 1024).toFixed(0)} KB，内嵌 ${images} 张图）。发这个文件就够，不需要别的文件。`,
          path: target,
          images
        }
      }
    }
  }
}

function bindTool(runtime, settings) {
  const schema = objectSchema({}, [])
  return {
    name: 'ufo_bind',
    description: '把当前工作区绑定为 UFO 档案馆：写 AGENTS.md 与 .dsh/ufo.json。幂等，已绑定直接返回。每个工作区只需一次。',
    parameters: schema,
    output: { schema, render: (_args, value) => [{ type: 'text', text: value.result.message }] },
    async execute(_args, exec) {
      await runtime.ensureDir(exec)
      const workspace = runtime.currentWorkspace?.()
      if (!workspace) return { result: { message: '拿不到工作区，无法绑定。' } }
      const file = await ensureContract(workspace, settings.version ?? '')
      return { result: { message: `已绑定：${file}`, workspace } }
    }
  }
}

function analyzeTool(runtime) {
  const schema = objectSchema(
    {
      query: { type: 'string', description: '用户原话' },
      event_zh: { type: 'string', description: '中文事件名（可空）' },
      event_en: { type: 'string', description: '标准英文事件名/检索词（可空）' },
      year: { type: 'integer', description: '事件年份，未知填 0' },
      kind: { type: 'string', enum: ['sighting', 'incident', 'object', 'person', 'other'], description: '这是什么' },
      keywords: { type: 'array', items: { type: 'string' }, description: '可选检索词，按优先级' },
      confidence: { type: 'number', description: '0-1，你对解析的把握' }
    },
    ['query']
  )
  return {
    name: 'ufo_analyze',
    description:
      '探索类消息先调用：由你（LLM）判断用户说的到底是什么，按字段填好；插件只接收、记录并给出下一步检索词。不要用内置别名表，也不要在插件里猜。',
    parameters: schema,
    output: {
      schema,
      render: (_args, value) => [{ type: 'text', text: `解析：${value.result.display} ｜ 检索词：${value.result.keyword}` }]
    },
    async execute(args, exec) {
      const dir = await runtime.ensureDir(exec)
      const profile = await loadProfile(dir)
      const zh = String(args?.event_zh ?? '').trim()
      const en = String(args?.event_en ?? '').trim()
      const year = Number(args?.year ?? 0)
      const keywords = Array.isArray(args?.keywords) ? args.keywords.map((item) => String(item).trim()).filter(Boolean) : []
      const keyword = en || keywords[0] || zh || String(args?.query ?? '').trim()
      const behavior = profile.behavior ?? {}
      await saveProfile(dir, {
        ...profile,
        behavior: {
          ...behavior,
          lastAnalysis: { query: String(args?.query ?? ''), event_zh: zh, event_en: en, year, kind: args?.kind ?? null, at: new Date().toISOString() }
        }
      }).catch(() => {})
      const display = [zh || en || keyword, year ? `${year}` : '', args?.kind ?? ''].filter(Boolean).join(' · ')
      return {
        result: {
          keyword,
          keywordAlt: keywords.slice(1),
          year: year || null,
          display,
          note: en ? '用 event_en 去查档案；查不到再换 keywords 里的下一个。' : '没有标准英文名：先用 web_search 确认，再回来填 event_en。'
        }
      }
    }
  }
}

function guardTool(runtime) {
  const schema = objectSchema(
    {
      intent: { type: 'string', enum: ['explore', 'chat', 'gray', 'off-mission'], description: '玩家这句话的类型' },
      topic: { type: 'string', description: '一句话概括玩家在问什么' }
    },
    ['intent']
  )
  return {
    name: 'ufo_guard',
    description:
      '探索类或疑似越界时调用：把意图判断交给插件，返回是否允许、建议话术与行为摘要。闲聊与身份问题不用调。',
    parameters: schema,
    output: {
      schema,
      render: (_args, value) => {
        const r = value.result
        const text = r.allowed ? '（已记录）' : `（越界第 ${r.streak} 次：不执行）`
        return [{ type: 'text', text }]
      }
    },
    async execute(args, exec) {
      const dir = await runtime.ensureDir(exec)
      const profile = await loadProfile(dir)
      const behavior = profile.behavior ?? {}
      const intent = String(args?.intent ?? 'chat')
      const counts = { ...(behavior.counts ?? {}) }
      counts[intent] = (counts[intent] ?? 0) + 1
      const streak = intent === 'off-mission' ? (behavior.offMissionStreak ?? 0) + 1 : 0
      const lastIntents = [...(behavior.lastIntents ?? []), intent].slice(-8)
      const next = {
        ...profile,
        behavior: { ...behavior, counts, offMissionStreak: streak, lastIntents, lastTopic: args?.topic ?? behavior.lastTopic ?? null },
        lastActiveAt: new Date().toISOString()
      }
      await saveProfile(dir, next).catch(() => {})
      const guidance =
        intent !== 'off-mission'
          ? '继续：按契约处理；探索类先澄清名词，再查档案。'
          : streak === 1
            ? '第一次：说明这里是档案馆，建议换一个工作区，不执行。'
            : streak === 2
              ? `第二次：点名——你今天是来干别的的（${args?.topic ?? '这件事'}），不是来看档案的。`
              : '第三次起：简短重申，不再解释，仍然不执行。'
      const summary = `最近 ${lastIntents.length} 次：${lastIntents.join('、')}`
      return { result: { intent, streak, allowed: intent !== 'off-mission', guidance, summary } }
    }
  }
}

function archiveTool(runtime, settings) {
  return {
    name: 'ufo_archive',
    description:
      '管理用户的本地 UFO 档案馆：给出档案馆地址、统计收集进度与成就、登记或修改代号、置顶某条记录。适用于用户说「打开我的档案馆」「我收集了多少」「叫我 XX」「置顶那条」。',
    parameters: objectSchema(
      {
        action: { type: 'string', enum: ['open', 'stats', 'set_name', 'pin'], description: '要执行的动作' },
        value: { type: 'string', description: 'set_name 时是代号；pin 时是记录 id' },
        pinned: { type: 'boolean', description: 'pin 动作：true 置顶，false 取消' }
      },
      ['action']
    ),
    output: {
      schema: objectSchema({ result: { type: 'json' } }, ['result']),
      render: (_args, value) => [{ type: 'text', text: renderArchive(value.result) }]
    },
    async execute(args, exec) {
      const action = String(args?.action ?? 'open')
      const dir = await runtime.ensureDir(exec)
      const records = await readAllRecords(dir)
      const profile = await loadProfile(dir)

      if (action === 'set_name') {
        const name = String(args?.value ?? '').trim().slice(0, 40)
        if (!name) throw new Error('value 不能为空：需要提供代号')
        const next = { ...profile, name, nameSource: 'user', updatedAt: new Date().toISOString() }
        await saveProfile(dir, next)
        runtime.setProfile(next)
        runtime.setProfile(next)
        return { result: { action, name, archiveUrl: runtime.siteUrl(), archiveFile: runtime.archiveFile(), archivePath: dir, counters: countersOf(records) } }
      }

      if (action === 'pin') {
        const id = String(args?.value ?? '').trim()
        if (!id) throw new Error('value 不能为空：需要记录 id')
        if (!records.some((record) => record.id === id)) throw new Error(`没有找到记录 ${id}`)
        const pins = await loadPins(dir)
        const pinned = args?.pinned !== false
        const next = pinned ? [...new Set([...pins, id])] : pins.filter((item) => item !== id)
        await savePins(dir, next)
        return { result: { action, pins: next, archiveUrl: runtime.siteUrl(), archiveFile: runtime.archiveFile(), archivePath: dir } }
      }

      const achievements = await achievementStateFor(dir, records)
      return {
        result: {
          action,
          name: profile.name,
          archiveUrl: runtime.siteUrl(), archiveFile: runtime.archiveFile(),
          archivePath: dir,
          counters: countersOf(records),
          achievements
        }
      }
    }
  }
}

async function achievementStateFor(dir, records) {
  const { loadAchievements } = await import('./archive.js')
  const stored = await loadAchievements(dir)
  return achievementState(records, stored, stored.stats ?? {})
}

/* ------------------------------------------------------------------ */
/* 辅助                                                                */
/* ------------------------------------------------------------------ */

/** 记录一次交互，滚动 lastTopic 与时间戳，并留下本次可用的「收尾锚点」。 */
async function touchProfile(dir, topic, counters, place) {
  const profile = await loadProfile(dir)
  const now = new Date().toISOString()
  const placeCounts = { ...(profile.placeCounts ?? {}) }
  if (place) placeCounts[place] = Number(placeCounts[place] ?? 0) + 1
  const history = [...(profile.history ?? []), { topic: String(topic ?? '').slice(0, 60), place: place ?? null, at: now }].slice(-40)
  const next = {
    ...profile,
    queries: Number(profile.queries ?? 0) + 1,
    visits: Number(profile.visits ?? 0) + 1,
    lastSeenAt: now,
    firstSeenAt: profile.firstSeenAt ?? now,
    lastTopic: String(topic ?? '').slice(0, 60),
    lastTopicAt: now,
    anchors: anchorsFrom(counters),
    placeCounts,
    history
  }
  await saveProfile(dir, next)
  return next
}

/** 本次结果里出现最多的地点，用来判断「他是不是总在查同一片地方」。 */
function dominantPlace(records) {
  const counts = new Map()
  for (const record of records ?? []) {
    const label = record.place?.label
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  let best = null
  let bestCount = 0
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label
      bestCount = count
    }
  }
  return best
}

/** 从本次统计里挑出可以承接收尾的具体事实，避免每次都写同一句。 */
function anchorsFrom(counters = {}) {
  const list = []
  if (counters.images === 0) list.push('没有照片')
  if ((counters.contradictions ?? 0) > 0) list.push('有互相矛盾的记录')
  if ((counters.hidden ?? 0) > 0) list.push('官方档案没有结论')
  if (counters.earliestYear) list.push(`最老一条 ${counters.earliestYear} 年`)
  if ((counters.countries ?? 0) >= 3) list.push(`覆盖 ${counters.countries} 个国家`)
  if ((counters.unexplainedOnly ?? 0) > 0) list.push('有待解的空白')
  return list.slice(0, 4)
}

function coverageNote(bundles = [], errors = [], settings = {}) {
  const live = bundles.filter((bundle) => bundle.source.sourceId !== 'demo')
  const parts = [`本次来源：${bundles.map((bundle) => bundle.source.sourceName).join('、') || '无'}`]
  if (live.length) {
    parts.push(`联网命中：${live.map((bundle) => `${bundle.source.sourceName} ${bundle.rows.length} 条`).join('，')}`)
  }
  if (errors.length) parts.push(`未返回：${errors.join('；')}`)
  if (settings.network === false) parts.push('联网检索未启用')
  return parts.join('；')
}

function assessCorroboration(records) {
  if (!records.length) return { label: '无记录', detail: '本次没有命中任何档案。' }
  const sources = new Set(records.map((record) => record.sourceId))
  if (sources.size < 2) {
    return { label: '单源', detail: `${records.length} 条记录，全部来自同一个来源，无法交叉验证。` }
  }
  const dates = new Set(records.map((record) => record.occurred?.date).filter(Boolean))
  const places = new Set(records.map((record) => record.place?.label).filter(Boolean))
  const shapes = new Set(records.map((record) => record.shape).filter(Boolean))
  const differing = []
  if (dates.size > 1) differing.push('日期')
  if (places.size > 1) differing.push('地点')
  if (shapes.size > 1) differing.push('形状')
  if (differing.length) {
    return { label: '多源矛盾', detail: `${sources.size} 个独立来源，在${differing.join('、')}上不一致。` }
  }
  return { label: '多源一致', detail: `${sources.size} 个独立来源，在日期、地点、形状上未发现冲突。` }
}

function objectSchema(properties, required) {
  const props = {}
  for (const [key, value] of Object.entries(properties)) {
    props[key] = value.type === 'json' ? {} : value
  }
  return { type: 'object', additionalProperties: true, properties: props, ...(required.length ? { required } : {}) }
}

function readArgs(args, fields) {
  const out = {}
  for (const field of fields) {
    const value = args?.[field]
    if (typeof value === 'string' && value.trim()) out[field] = value.trim()
  }
  return out
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/* ------------------------------------------------------------------ */
/* 会话渲染：事实层，不允许出现梗或推测                                  */
/* ------------------------------------------------------------------ */

function renderSearch(result) {
  const lines = []
  lines.push(`📡 ${result.count} 条命中 ｜ 库内累计 ${result.totalArchived} 条`)
  if (result.resolved) lines.push(`已按「${result.resolved.to}」检索（你问的是「${result.resolved.from}」）`)
  const bySource = new Map()
  for (const record of result.records) bySource.set(record.sourceName, (bySource.get(record.sourceName) ?? 0) + 1)
  const years = result.records
    .map((record) => Number(String(record.date ?? '').slice(0, 4)))
    .filter((year) => Number.isFinite(year) && year > 1000)
  const countries = [...new Set(result.records.map((record) => record.country).filter(Boolean))]
  const unexplained = result.records.filter((record) => !record.explanation).length
  if (result.records.length) {
    lines.push(`来源分布：${[...bySource.entries()].map(([name, count]) => `${name} ${count}`).join(' ｜ ')}`)
    const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '日期不详'
    lines.push(`时间跨度：${span}${countries.length ? ` ｜ 国家：${countries.join('、')}` : ''} ｜ 未给解释：${unexplained}/${result.records.length}`)
    lines.push('')
  }
  if (result.failedSources) {
    lines.push(`⚠️ 本次 ${result.failedSources} 个源未返回，结果可能偏少；原因见文末覆盖说明。`)
  }
  if (!result.records.length) {
    lines.push('已接入的源里没有。空页也存档。')
    lines.push('')
  }
  result.records.slice(0, 6).forEach((record, index) => {
    lines.push(`${index + 1}. ${record.dateLabel} · ${record.title}`)
    const facts = []
    if (record.shape) facts.push(`形状 ${record.shape}`)
    if (record.duration) facts.push(`持续 ${record.duration}`)
    facts.push(record.recordTypeLabel, record.corroborationLabel)
    lines.push(`   - ${facts.join(' ｜ ')}`)
    lines.push('')
    if (record.quote) lines.push(`   - 原文：「${trim(record.quote, 300)}」`)
    if (record.summary && record.summary !== record.quote) lines.push(`   - 概述：${trim(record.summary, 240)}`)
    if (record.description) lines.push(`   - 正文：${trim(record.description, 320)}`)
    lines.push(`   - 解释：${record.explanation ? `${record.explanation}（${record.explanationAuthor ?? '来源未标注'}）` : '该来源未给出'}`)
    if (record.documents?.length) {
      lines.push(`   - 档案：${record.documents.map((doc) => `${doc.title}（${doc.archive}）`).join('；')}`)
    }
    if (record.mediaCount || record.pdfCount) {
      lines.push(`   - 本地：${record.mediaCount ? `${record.mediaCount} 张图` : ''}${record.mediaCount && record.pdfCount ? '，' : ''}${record.pdfCount ? `${record.pdfCount} 份 PDF` : ''}`)
    }
    lines.push(`   - 完整度：${completeness(record)}`)
    lines.push(`   - 来源：${record.sourceName}`)
    lines.push(`   - 链接：${record.sourceRecordUrl}`)
    lines.push(`   - 检索于 ${String(record.retrievedAt).slice(0, 10)}`)
    lines.push('')
  })
  if (result.records.length > 6) {
    lines.push(`…另有 ${result.records.length - 6} 条，见档案馆。`)
    lines.push('')
  }
  if (result.suggestions?.length) {
    lines.push('接着看：')
    for (const item of result.suggestions) lines.push(`- ${item.label}（${item.why}）`)
    lines.push('')
  }
  if (result.dropped > 0) {
    lines.push(`⚠️ ${result.dropped} 条因来源信息不完整被丢弃，未计入。`)
    lines.push('')
  }
  if (result.mediaNote) {
    lines.push(result.mediaNote)
    lines.push('')
  }
  for (const item of result.newAchievements) lines.push(`🎖️ 解锁：${item.name} —— ${item.reward}`)
  if (result.newAchievements.length) lines.push('')
  lines.push(...archiveLines(result))
  lines.push(`覆盖说明：${result.coverage}`)
  return lines.join('\n')
}

function renderEvent(result) {
  const lines = []
  lines.push(`🗂️ 事件：${result.event} —— 共 ${result.count} 条记录，${result.assessment.label}`)
  lines.push('')
  if (result.failedSources) lines.push(`⚠️ 本次 ${result.failedSources} 个源未返回，结果可能偏少。`)
  if (!result.count) lines.push('已接入的源里没有。空页也存档。')
  const shown = result.timeline.slice(0, 6)
  for (const item of shown) {
    lines.push(`**${item.dateLabel} · ${item.title ?? '地点不详'}**`)
    const facts = []
    if (item.shape) facts.push(`形状 ${item.shape}`)
    if (item.duration) facts.push(`持续 ${item.duration}`)
    if (facts.length) lines.push(`   - ${facts.join(' ｜ ')}`)
    if (item.quote) lines.push(`   - 原文：「${trim(item.quote, 220)}」`)
    if (item.summary && item.summary !== item.quote) lines.push(`   - 概述：${trim(item.summary, 220)}`)
    lines.push(`   - 解释：${item.explanation ? `${item.explanation}（${item.explanationAuthor ?? '来源未标注'}）` : '该来源未给出'}`)
    const have = [item.quote && '原文摘录', item.shape && '形状', item.duration && '持续', item.explanation && '官方解释'].filter(Boolean)
    const miss = [!item.explanation && '官方解释'].filter(Boolean)
    lines.push(`   - 完整度：${have.join('、') || '无'}${miss.length ? ` ｜ 缺 ${miss.join('、')}` : ''}`)
    lines.push(`   - 来源：${item.sourceName}`)
    lines.push(`   - 链接：${item.sourceRecordUrl}`)
    if (item.retrievedAt) lines.push(`   - 检索于 ${String(item.retrievedAt).slice(0, 10)}`)
    lines.push('')
  }
  if (result.timeline.length > 6) lines.push(`…另有 ${result.timeline.length - 6} 条，见档案馆。`)
  const anchors = (result.documents ?? []).filter((doc) => doc.archive === 'Wikidata')
  const files = (result.documents ?? []).filter((doc) => doc.archive !== 'Wikidata')
  if (files.length) {
    lines.push('**关联档案**')
    for (const doc of files) {
      lines.push(`- ${doc.title}（${doc.archive}）`)
      if (doc.url) lines.push(`  ${doc.url}`)
    }
    lines.push('')
  }
  if (anchors.length) {
    lines.push('**网页来源（锚点，不是档案）**')
    for (const doc of anchors) {
      lines.push(`- ${doc.title}`)
      if (doc.url) lines.push(`  ${doc.url}`)
    }
    lines.push('')
  }
  if (result.suggestions?.length) {
    lines.push('接着看：')
    for (const item of result.suggestions) lines.push(`- ${item.label}（${item.why}）`)
    lines.push('')
  }
  lines.push(`判定说明：${result.assessment.detail}`)
  for (const item of result.newAchievements) lines.push(`🎖️ 解锁成就：${item.name} —— ${item.reward}`)
  lines.push('')
  lines.push(...archiveLines(result))
  lines.push(`覆盖说明：${result.coverage}`)
  return lines.join('\n')
}

function renderDocuments(result) {
  const lines = [`📚 档案条目：${result.count} 条`]
  if (!result.count) {
    lines.push('')
    lines.push('本机还没有匹配的官方档案。先做一次 ufo_search 或 ufo_event，档案条目会随记录一起归档。')
  }
  for (const doc of result.documents) {
    lines.push('')
    lines.push(`**${doc.title}**（${doc.archive}）`)
    lines.push(`　关联：${doc.place ?? '—'} ${doc.date ?? ''}`)
    if (doc.url) lines.push(`　${doc.url}`)
  }
  lines.push('')
  lines.push(`📁 档案馆：${result.archiveUrl}`)
  lines.push(result.coverage)
  return lines.join('\n')
}

function renderArchive(result) {
  if (result.action === 'set_name') {
    return `✅ 代号已登记：${result.name}`
  }
  if (result.action === 'pin') {
    return `📌 置顶已更新（当前 ${result.pins.length} 条）\n📁 档案馆：${result.archiveUrl}`
  }
  const counters = result.counters
  const state = result.achievements
  const lines = [
    `📁 档案馆：${result.archiveUrl}`,
    `代号：${result.name ?? '未登记'}`,
    `本地目录：${result.archivePath ?? '—'}`,
    `收录：${counters.total} 条 ｜ 未解 ${counters.unexplained} ｜ 隐蔽 ${counters.hidden} ｜ 国家 ${counters.countries} ｜ 图片 ${counters.images}`,
    `成就：${state.unlockedCount} / ${state.total}`,
    ''
  ]
  for (const item of state.items) {
    if (item.hidden && !item.unlocked) continue
    const mark = item.unlocked ? '🏆' : '🔒'
    const tag = item.hidden ? '（隐藏）' : ''
    lines.push(`${mark} ${item.name}${tag} — ${item.desc}（${item.reward}）`)
  }
  if (state.hiddenLocked > 0) {
    lines.push('')
    lines.push(`🕳️ 隐藏成就：${state.hiddenLocked} 枚尚未发现——继续查，它们不会提前告诉你名字。`)
  }
  return lines.join('\n')
}

function trim(text, max) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}
