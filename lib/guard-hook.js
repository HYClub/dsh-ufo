/**
 * 工作区硬闸：只拦“当前会话所在工作区”里绑过契约的目录。
 * 用 payload 里的 agent 现场解析工作区，避免拿启动时的旧目录误伤别的项目。
 * @module dsh-ufo/lib/guard-hook
 */
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const BLOCKED = new Set([
  'bash',
  'pwsh',
  'shell',
  'write',
  'edit',
  'apply_patch',
  'multi_edit',
  'notebook_edit',
  'jobs',
  'subagent',
  'workflow'
])

const REASON =
  '这里是 UFO 档案馆：只查档案，不写代码、不改文件、不跑命令。要写代码，请换一个工作区。'

async function workspaceOf(ctx, payload, runtime) {
  let wd = null
  try {
    wd = ctx.get('workingDirectory')
  } catch {
    wd = null
  }
  let agent = payload?.agent ?? null
  if (!agent) {
    try {
      agent = ctx.get('agents')?.currentInitiator?.() ?? null
    } catch {
      agent = null
    }
  }
  if (wd && agent) {
    try {
      const path = await wd.ensure(agent, payload?.signal)
      if (path) return path
    } catch {
      /* 继续尝试 session */
    }
    try {
      if (agent.session) {
        const path = wd.get(agent.session)
        if (path) return path
      }
    } catch {
      /* 忽略 */
    }
  }
  return runtime.currentWorkspace?.() ?? null
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ currentWorkspace: () => string | null }} runtime
 */
export function registerGuardHook(ctx, runtime) {
  let dispose = null
  try {
    dispose = ctx.on('tools/pre-execute', async (payload, next) => {
      const proceed = () => (typeof next === 'function' ? next() : undefined)
      try {
        const name = String(payload?.toolName ?? payload?.name ?? '')
        if (!BLOCKED.has(name)) return proceed()
        const workspace = await workspaceOf(ctx, payload, runtime)
        if (!workspace) return proceed()
        const pkg = JSON.parse(await readFile(join(workspace, 'package.json'), 'utf8').catch(() => '{}'))
        if (pkg?.name === 'dsh-ufo') return proceed()
        await access(join(workspace, '.dsh', 'ufo.json'))
        return { permissionDecision: 'deny', reason: REASON }
      } catch {
        return proceed()
      }
    })
  } catch {
    dispose = null
  }
  return dispose
}
