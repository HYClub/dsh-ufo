/**
 * 运行时状态：档案馆目录、当前 profile 缓存、站点地址。
 *
 * 目录来源优先级：显式配置 → 会话工作区 → 上次记住的工作区 → 进程 cwd。
 * 解析结果会写回 state.json，这样站点路由在「还没调用过工具」时也能指向同一份档案。
 * @module dsh-ufo/lib/runtime
 */
import { loadProfile, saveProfile } from './archive.js'
import { join } from 'node:path'
import { writeStaticSite } from './archive.js'
import { existsSync } from 'node:fs'
import { loadPluginState, resolveArchiveDir, savePluginState } from './state.js'

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function createRuntime(ctx, settings) {
  let dir = null
  let workspaceDir = null
  let profile = { name: null, queries: 0 }
  let origin = null
  let resolved = false
  let routeRegistered = false

  const web = safeGet(ctx, 'webServer')
  try {
    origin = web?.getOrigin?.() ?? null
  } catch {
    origin = null
  }

  async function resolveWorkspace(exec) {
    const wd = safeGet(ctx, 'workingDirectory')
    if (!wd) return null
    const agent = exec?.agent ?? safeGet(ctx, 'agents')?.currentInitiator?.()
    if (agent) {
      try {
        const path = await wd.ensure(agent, exec?.signal)
        if (path) return path
      } catch {
        /* 继续尝试其它入口 */
      }
      try {
        if (agent.session) {
          const path = wd.get(agent.session)
          if (path) return path
        }
      } catch {
        /* ignore */
      }
    }
    return null
  }

  return {
    /**
     * 解析档案馆目录。
     * - 带 agent：按会话工作区重新解析（工具调用路径，必须准）。
     * - 不带 agent：站点路由，跟随工具侧最近一次落盘的目录。
     */
    async ensureDir(exec) {
      const remembered = await loadPluginState()

      if (!exec) {
        if (remembered.workspace) workspaceDir = remembered.workspace
        if (!dir) dir = remembered.archiveDir ?? resolveArchiveDir(settings, remembered.workspace)
        resolved = true
        if (!profile.name) {
          profile = await loadProfile(dir)
          if (!profile.name) {
            try {
              const account = safeGet(ctx, 'deepseekAccount')
              const meta = { version: String(settings.version ?? '0.0.0'), locale: 'zh-CN', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 }
              const who = await account?.getProfile?.(meta)
              if (who?.name) {
                profile = { ...profile, name: who.name, nameSource: 'account' }
                await saveProfile(dir, profile).catch(() => {})
              }
            } catch {
              /* 没登录或不支持：保持未登记，第一次检索时问代号 */
            }
          }
        }
        void writeStaticSite(dir, { version: settings.version ?? '' }).catch(() => {})
        return dir
      }

      const workspace = settings.workspace ?? (await resolveWorkspace(exec)) ?? remembered.workspace
      workspaceDir = workspace ?? null
      const next =
        settings.archiveDir ??
        (workspace ? resolveArchiveDir(settings, workspace) : remembered.archiveDir ?? resolveArchiveDir(settings, workspace))

      if (next !== dir) {
        dir = next
        profile = await loadProfile(dir)
      }
      resolved = true
      void writeStaticSite(dir, { version: settings.version ?? '' }).catch(() => {})
      try {
        await savePluginState({ workspace: workspace ?? null, archiveDir: dir })
      } catch {
        /* 受限环境写不了用户目录时忽略；下次仍可由会话工作区重新解析 */
      }
      return dir
    },
    /** 工具写完 profile 后同步内存快照，避免人格读到旧值。 */
    setProfile(next) {
      if (next && typeof next === 'object') profile = next
    },
    /** 工作区是否已绑定（存在 .dsh/ufo.json）。 */
    isBound() {
      return Boolean(workspaceDir && existsSync(join(workspaceDir, '.dsh', 'ufo.json')))
    },
    /** 最近一次解析出的工作区；没有时为 null。 */
    currentWorkspace() {
      return workspaceDir
    },
    /** 已经解析出的目录（未解析时为 null），供只读场景使用。 */
    currentDir() {
      return resolved ? dir : null
    },
    /** 站点地址；没有 Web GUI 时退回本地文件路径。 */
    siteUrl() {
      // 端口每次启动都可能变，调用时向 webServer 重新取一次，避免旧地址。
      try {
        const live = safeGet(ctx, 'webServer')?.getOrigin?.()
        if (live) origin = live
      } catch {
        /* 保持旧值 */
      }
      if (origin) return `${origin.replace(/\/$/, '')}/ufo/`
      return dir ? `file:///${dir.replace(/\\/g, '/')}/index.html` : '（尚未建立档案馆）'
    },
    /** 工作区里的静态入口，双击可用。 */
    archiveFile() {
      return dir ? join(dir, 'index.html') : null
    },
    /** webServer 就绪得比插件晚时补上 origin。 */
    setOrigin(next) {
      origin = typeof next === 'string' && next ? next : null
      return origin
    },
    routeBound() {
      return routeRegistered
    },
    markRouteBound() {
      routeRegistered = true
    },
    getProfile() {
      return profile
    },
    setProfile(next) {
      profile = next
    },
    async refreshProfile() {
      if (dir) profile = await loadProfile(dir)
      return profile
    }
  }
}

function safeGet(ctx, name) {
  try {
    return ctx.get?.(name)
  } catch {
    return undefined
  }
}
