/**
 * 站点路由：挂在 Harness 自带的 webServer 上，路径 /ufo。
 * 同源提供 HTML / data.json / 详情 / 媒体 / 置顶 / 改名接口。
 * @module dsh-ufo/lib/site/server
 */
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import {
  archivePaths,
  buildSiteData,
  loadAchievements,
  loadPins,
  loadProfile,
  readJson,
  readRecordDetail,
  readAllRecords,
  savePins,
  saveProfile
} from '../archive.js'
import { achievementState, countersOf } from '../rarity.js'
import { randomBytes } from 'node:crypto'
import { renderIndexHtml } from './page.js'

const sessions = new Map()
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

function issueSession(res) {
  const token = randomBytes(24).toString('hex')
  sessions.set(token, Date.now() + SESSION_TTL_MS)
  res.setHeader('set-cookie', `ufo_sid=${token}; Path=/ufo; HttpOnly; SameSite=Strict`)
  return token
}

function cookieToken(req) {
  const header = req.headers.cookie ?? ''
  const hit = /(?:^|;\s*)ufo_sid=([a-f0-9]+)/.exec(header)
  return hit ? hit[1] : null
}

function hasSession(req) {
  const token = cookieToken(req)
  if (!token) return false
  const expires = sessions.get(token)
  if (!expires || expires < Date.now()) {
    sessions.delete(token)
    return false
  }
  return true
}

/** 只允许同源页面发起的请求；直链、外站 iframe、curl 一律拒。 */
function sameOrigin(req) {
  const site = String(req.headers['sec-fetch-site'] ?? '')
  if (site && site !== 'same-origin') return false
  const referer = String(req.headers.referer ?? '')
  if (referer) {
    try {
      return new URL(referer).pathname.startsWith('/ufo')
    } catch {
      return false
    }
  }
  return true
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf'
}

/**
 * @param {{ getDir: () => Promise<string>, version: string }} options
 */
export function createUfoRoute(options) {
  return {
    kind: 'prefix',
    path: '/ufo',
    handler: async (req, res) => {
      try {
        await handle(req, res, options)
      } catch (error) {
        send(res, 500, 'text/plain; charset=utf-8', `dsh-ufo: ${error?.message ?? error}`)
      }
    }
  }
}

async function handle(req, res, options) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sub = url.pathname.replace(/^\/ufo/, '') || '/'
  const dir = await options.getDir()

  if (sub === '/' || sub === '' || sub === '/index.html') {
    const profile = await loadProfile(dir)
    const html = renderIndexHtml({ name: profile.name, version: options.version })
    if (!hasSession(req)) issueSession(res)
    return send(res, 200, MIME['.html'], html)
  }

  // 数据类接口：必须持有页面下发的会话 cookie，且来自同源页面。
  if (!hasSession(req) || !sameOrigin(req)) {
    return send(res, 403, 'application/json; charset=utf-8', JSON.stringify({ error: 'forbidden' }))
  }

  if (sub === '/data.json') {
    const records = await readAllRecords(dir)
    const profile = await loadProfile(dir)
    const pins = await loadPins(dir)
    const achievements = await loadAchievements(dir)
    return sendJson(
      res,
      buildSiteData({
        records,
        profile,
        pins,
        achievements: { unlocked: achievements.unlocked },
        stats: achievements.stats ?? {},
        counters: countersOf(records)
      })
    )
  }

  const detailMatch = /^\/records\/([A-Za-z0-9._-]+)\.json$/.exec(sub)
  if (detailMatch) {
    const detail = await readRecordDetail(dir, detailMatch[1])
    if (!detail) return send(res, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'not found' }))
    return sendJson(res, detail)
  }

  if (sub.startsWith('/media/')) {
    const file = safeJoin(archivePaths(dir).media, sub.slice('/media/'.length))
    if (!file) return send(res, 400, 'text/plain', 'bad path')
    try {
      const info = await stat(file)
      if (!info.isFile()) throw new Error('not a file')
      const body = await readFile(file)
      return send(res, 200, MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', body, { cache: 'public, max-age=3600' })
    } catch {
      return send(res, 404, 'text/plain', 'not found')
    }
  }

  if (sub === '/api/pin' && req.method === 'POST') {
    const body = await readBody(req)
    const id = String(body.id ?? '')
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return send(res, 400, 'application/json', JSON.stringify({ error: 'bad id' }))
    const pins = await loadPins(dir)
    const next = body.pinned ? [...pins, id] : pins.filter((item) => item !== id)
    await savePins(dir, next)
    return sendJson(res, { ok: true, pins: [...new Set(next)] })
  }

  if (sub === '/api/name' && req.method === 'POST') {
    const body = await readBody(req)
    const name = String(body.name ?? '').trim().slice(0, 40)
    if (!name) return send(res, 400, 'application/json', JSON.stringify({ error: 'empty name' }))
    const profile = await loadProfile(dir)
    const next = { ...profile, name, nameSource: 'user', updatedAt: new Date().toISOString() }
    await saveProfile(dir, next)
    return sendJson(res, { ok: true, name })
  }

  if (sub === '/favicon.ico') {
    res.writeHead(204)
    return res.end()
  }

  return send(res, 404, 'text/html; charset=utf-8', '<meta charset="utf-8"><p>没有这个档案页。回到 <a href="/ufo/">档案馆首页</a>。</p>')
}

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': extra.cache ?? 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"
  })
  res.end(body)
}

function sendJson(res, value) {
  send(res, 200, 'application/json; charset=utf-8', JSON.stringify(value))
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

/** 防目录穿越：解析后必须仍在 base 下。 */
function safeJoin(base, relative) {
  const target = normalize(join(base, relative))
  const root = normalize(base)
  return target.startsWith(root) ? target : null
}
