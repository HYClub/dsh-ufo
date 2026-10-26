/**
 * 极简 Markdown 生成：只处理我们自己产出的结构（标题/列表/引用/段落），
 * 不引第三方库，保证离线可用、无 XSS 面。
 * @module dsh-ufo/lib/markdown
 */
import { citationLine, factLine, formatDateZh } from './normalize.js'

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 生成可读的 detail.md（同时用于网站详情与导出）。 */
export function detailMarkdown(record, context = {}) {
  const lines = []
  lines.push(`# ${record.place.label || '未知地点'} · ${formatDateZh(record.occurred.date)}`)
  lines.push('')
  lines.push(`- 形状：${record.shape ?? '不详'}`)
  lines.push(`- 持续：${record.duration ?? '不详'}`)
  lines.push(`- 来源性质：${recordTypeLabel(record.recordType)}`)
  lines.push(`- 置信结构：${corroborationLabel(record.corroboration)}`)
  lines.push('')
  lines.push('## 原文摘录')
  lines.push('')
  lines.push(`> ${record.quote}`)
  lines.push('')
  lines.push(`摘录语言：${record.quoteLang}　来源：${citationLine(record)}`)
  if (record.sourceId === 'nuforc' && (record.quote ?? '').length < 160) {
    lines.push('')
    lines.push('（这是 NUFORC 摘要，不是完整叙述；数据集没有收录全文，原页受访问限制。）')
  }
  lines.push('')
  if (record.summaryZh) {
    lines.push('## 中文概述')
    lines.push('')
    lines.push(`${record.summaryZh}（概述由模型生成，不是原文）`)
    lines.push('')
  }
  if (record.description) {
    lines.push('## 来源正文')
    lines.push('')
    lines.push(record.description)
    lines.push('')
  }
  lines.push('## 解释归属')
  lines.push('')
  lines.push(
    record.explanation
      ? `「${record.explanation}」——由 ${record.explanationAuthor ?? '来源未标注'} 给出。这是该机构的判断，不是记录本身。`
      : '该来源未给出解释。空白不等于「无法解释」，只表示这条记录里没有。'
  )
  lines.push('')
  if (record.documents?.length) {
    lines.push('## 关联官方档案')
    lines.push('')
    for (const doc of record.documents) {
      lines.push(`- ${doc.title}（${doc.archive}）${doc.url ? ` — ${doc.url}` : ''}`)
    }
    lines.push('')
  }
  const images = (record.media ?? []).filter((item) => item.kind !== 'pdf' && /\.(jpe?g|png|webp)$/i.test(item.file ?? ''))
  if (images.length) {
    lines.push('## 本地图片')
    lines.push('')
    for (const item of images) lines.push(`![${item.credit || '来源图片'}](media/${item.file})`)
    lines.push('')
  }
  const pdfs = (record.media ?? []).filter((item) => item.kind === 'pdf')
  if (pdfs.length) {
    lines.push('## 本地原件')
    lines.push('')
    for (const item of pdfs) lines.push(`- [${item.credit || '原件 PDF'}](media/${item.file})`)
    lines.push('')
  }
  if (context.related?.length) {
    lines.push('## 同事件的其他记录')
    lines.push('')
    for (const other of context.related) {
      lines.push(`- ${factLine(other)} — ${other.sourceName}`)
    }
    lines.push('')
  }
  lines.push('## 记录元数据')
  lines.push('')
  lines.push(`- 记录 ID：${record.id}`)
  lines.push(`- 来源机构：${record.sourceName}（${record.sourceId}）`)
  lines.push(`- 许可证：${record.license ?? 'unknown'}`)
  lines.push(`- 检索时间：${record.retrievedAt}`)
  if (record.firstSeenAt) lines.push(`- 首次归档：${record.firstSeenAt}`)
  if (record.lastSeenAt) lines.push(`- 最近更新：${record.lastSeenAt}`)
  if (record.eventKey) lines.push(`- 事件键：${record.eventKey}`)
  const files = (record.media ?? []).map((item) => item.file).filter(Boolean)
  if (files.length) lines.push(`- 本地文件：${files.join('、')}`)
  if (record.sources?.length) {
    lines.push(`- 引用的来源：${record.sources.map((item) => item.sourceName).join('、')}`)
  }
  lines.push('')
  lines.push('---')
  lines.push(`记录 ID：${record.id}`)
  lines.push(`归档时间：${record.retrievedAt}`)
  return lines.join('\n')
}

/** detail.md → 详情 HTML。 */
export function markdownToHtml(markdown) {
  const blocks = []
  const lines = markdown.split('\n')
  let paragraph = []
  let list = []
  let quote = []

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${paragraph.map((line) => inline(line)).join('<br>')}</p>`)
      paragraph = []
    }
  }
  const flushList = () => {
    if (list.length) {
      blocks.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`)
      list = []
    }
  }
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(`<blockquote>${quote.map((line) => inline(line)).join('<br>')}</blockquote>`)
      quote = []
    }
  }

  for (const line of lines) {
    if (line.startsWith('# ')) {
      flushParagraph(); flushList(); flushQuote()
      blocks.push(`<h1>${inline(line.slice(2))}</h1>`)
    } else if (line.startsWith('## ')) {
      flushParagraph(); flushList(); flushQuote()
      blocks.push(`<h2>${inline(line.slice(3))}</h2>`)
    } else if (line.startsWith('> ')) {
      flushParagraph(); flushList()
      quote.push(line.slice(2))
    } else if (line.startsWith('- ')) {
      flushParagraph(); flushQuote()
      list.push(line.slice(2))
    } else if (line.trim() === '' || line.startsWith('---')) {
      flushParagraph(); flushList(); flushQuote()
      if (line.startsWith('---')) blocks.push('<hr>')
    } else {
      flushList(); flushQuote()
      paragraph.push(line)
    }
  }
  flushParagraph(); flushList(); flushQuote()
  return blocks.join('\n')
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
    .replace(/(https?:\/\/[^\s·）)]+)/g, '<a href="$1" target="_blank" rel="noreferrer noopener">$1</a>')
}

export function recordTypeLabel(type) {
  switch (type) {
    case 'official-report': return '官方调查/声明'
    case 'official-archive': return '官方档案文件'
    case 'civilian-database': return '民间目击数据库'
    case 'aggregator': return '聚合站'
    case 'media': return '媒体报道'
    default: return type ?? '未标注'
  }
}

export function corroborationLabel(value) {
  switch (value) {
    case 'multi-source': return '多源指向同一事件'
    case 'conflicting': return '多源互相矛盾'
    case 'single': return '单一来源'
    default: return value ?? '未标注'
  }
}
