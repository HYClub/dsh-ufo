/**
 * dsh-ufo：多国 UFO/UAP 档案检索 + 本地档案馆站点 + AEGIS 人格。
 *
 * 零依赖：只用 Node 内置模块与 Harness 提供的服务（tools / webServer / systemPrompt / workingDirectory），
 * 因此作为 profile 里安装的 bundle 也能正常解析。
 * @module dsh-ufo
 */
import { createRuntime } from './lib/runtime.js'
import { registerTools } from './lib/tools.js'
import { buildPersonaText, PERSONA_SECTION } from './lib/persona.js'
import { createUfoRoute } from './lib/site/server.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerGuardHook } from './lib/guard-hook.js'
import { ensureSkill } from './lib/skill.js'

export const name = 'dsh-ufo'
export const inject = ['tools']

const VERSION = '0.4.9'

export function apply(ctx, config = {}) {
  const settings = {
    network: config.network !== false,
    maxResults: Math.min(Math.max(Number(config.maxResults) || 8, 1), 30),
    workspace: typeof config.workspace === 'string' && config.workspace ? config.workspace : null,
    archiveDir: typeof config.archiveDir === 'string' && config.archiveDir ? config.archiveDir : null,
    version: VERSION
  }

  const runtime = createRuntime(ctx, settings)
  registerTools(ctx, runtime, { ...settings, version: VERSION })

  // 先把上次的 profile 读进内存，第一句话的称呼就是对的（不等第一次工具调用）。
  void runtime.ensureDir().catch(() => {})

  // 写入 /ufo 技能，让用户能在会话里用 /ufo 打开档案终端。
  void ensureSkill().catch(() => {})

  // 工作区硬闸：绑过契约的目录里，拒绝写文件与执行命令。
  bindDisposal(ctx, registerGuardHook(ctx, runtime))

  const prompt = safeGet(ctx, 'systemPrompt')
  if (prompt) {
    const dispose = prompt.section({
      name: PERSONA_SECTION,
      order: 900,
      text: () => {
        try {
          const wd = safeGet(ctx, 'workingDirectory')
          const agent = safeGet(ctx, 'agents')?.currentInitiator?.()
          const workspace = agent?.session ? wd?.get?.(agent.session) : null
          if (workspace && existsSync(join(workspace, '.dsh', 'ufo.json'))) {
            return buildPersonaText(() => runtime.getProfile())
          }
        } catch {
          /* 未绑定：不注入 */
        }
        return ''
      }
    })
    bindDisposal(ctx, dispose)
  }

  const web = safeGet(ctx, 'webServer')
  if (web) {
    bindSite(ctx, runtime, web)
  } else if (typeof ctx.inject === 'function') {
    // webServer 可能比插件晚就绪（重新装配时常见）：等它就绪再绑，避免退回 file:// 模式。
    try {
      ctx.inject(['webServer'], () => bindSite(ctx, runtime, safeGet(ctx, 'webServer')))
    } catch {
      /* 无 inject 能力时只依赖下面的延后重试 */
    }
  } else {
    setTimeout(() => bindSite(ctx, runtime, safeGet(ctx, 'webServer')), 1500).unref?.()
  }
}

/** 注册 /ufo 路由；重复注册视为已占用，不重复报错。 */
function bindSite(ctx, runtime, web) {
  if (!web || runtime.routeBound?.()) return
  try {
    const dispose = web.register(createUfoRoute({ getDir: () => runtime.ensureDir(), version: VERSION }))
    runtime.markRouteBound()
    runtime.setOrigin(web.getOrigin?.())
    bindDisposal(ctx, dispose)
  } catch (error) {
    // 同名路由已存在：可能是同一进程里的旧实例，站点仍由它提供，不应让插件加载失败。
    try {
      runtime.setOrigin(web.getOrigin?.())
    } catch {
      /* ignore */
    }
    ctx.logger?.warn?.(`dsh-ufo: /ufo 路由未重新注册（${error?.message ?? error}）`)
  }
}

/** 插件卸载/HMR 时释放自己占用的资源，否则重新启用会撞上重复路由。 */
function bindDisposal(ctx, dispose) {
  if (typeof dispose !== 'function') return
  try {
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => dispose)
      return
    }
  } catch {
    /* 落到 on(dispose) */
  }
  try {
    ctx.on?.('dispose', dispose)
  } catch {
    /* 无生命周期支持时只能依赖进程退出 */
  }
}

function safeGet(ctx, name) {
  try {
    return ctx.get?.(name)
  } catch {
    return undefined
  }
}
