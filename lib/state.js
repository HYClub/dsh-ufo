/**
 * 全局状态：记住上次用的工作区与最终档案馆目录。
 * 站点路由拿不到 agent 时靠它指回同一份档案。
 * @module dsh-ufo/lib/state
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const STATE_DIR = process.env.DSH_UFO_STATE_DIR ?? join(homedir(), '.dsh', 'plugins-data', 'dsh-ufo')
const STATE_FILE = join(STATE_DIR, 'state.json')

/** @typedef {{ workspace: string | null, archiveDir: string | null }} PluginState */

/** @returns {Promise<PluginState>} */
export async function loadPluginState() {
  try {
    const raw = JSON.parse(await readFile(STATE_FILE, 'utf8'))
    return {
      workspace: typeof raw.workspace === 'string' ? raw.workspace : null,
      archiveDir: typeof raw.archiveDir === 'string' ? raw.archiveDir : null
    }
  } catch {
    return { workspace: null, archiveDir: null }
  }
}

/** @param {PluginState} next */
export async function savePluginState(next) {
  await mkdir(STATE_DIR, { recursive: true })
  await writeFile(STATE_FILE, JSON.stringify(next, null, 2) + '\n', 'utf8')
}

/** 档案馆在用户工作区里的目录名。 */
export const ARCHIVE_DIR_NAME = 'ufo-archive'

/**
 * 解析档案馆目录：优先显式配置，其次调用方给的工作区，最后（若记住的档案目录存在）沿用它。
 * @param {{ archiveDir?: string }} settings
 * @param {string | undefined} workspace
 */
export function resolveArchiveDir(settings, workspace) {
  if (settings.archiveDir) return settings.archiveDir
  return join(workspace ?? process.cwd(), ARCHIVE_DIR_NAME)
}
