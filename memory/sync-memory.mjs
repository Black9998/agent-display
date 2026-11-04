#!/usr/bin/env node
/**
 * 扫描 Obsidian 记忆库 → memory-data.js
 *
 * 为什么不做运行时 fetch：页面常以 file:// 打开，浏览器不允许 fetch 本地文件。
 * 所以把数据烘焙成一个普通 <script>，双击页面也能读。
 *
 * 用法：node memory/sync-memory.mjs
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

const VAULT_NAME = '知识库'
const VAULT = join(homedir(), 'Documents', '知识库')
const ROOT_REL = '06-Agent记忆'
const ROOT = join(VAULT, ROOT_REL)
const OUT = new URL('./memory-data.js', import.meta.url)

const MAX_TEXT = 40000

function stripFrontmatter(raw) {
  if (!raw.startsWith('---')) return { text: raw, meta: {} }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { text: raw, meta: {} }
  const head = raw.slice(4, end)
  const meta = {}
  for (const line of head.split('\n')) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line.trim())
    if (m) meta[m[1]] = m[2].trim()
  }
  return { text: raw.slice(end + 4).replace(/^\n+/, ''), meta }
}

function titleOf(text, fallback) {
  const m = /^#\s+(.+)$/m.exec(text)
  return m ? m[1].trim() : fallback
}

function excerpt(text, n = 160) {
  const flat = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.slice(0, n)
}

async function readNote(dir, name) {
  const path = join(dir, name)
  const [raw, st] = await Promise.all([readFile(path, 'utf8'), stat(path)])
  const { text, meta } = stripFrontmatter(raw)
  const rel = join(ROOT_REL, basename(dir), name).split('\\').join('/')
  return {
    title: titleOf(text, basename(name, '.md')),
    file: rel,
    date: meta.date || st.mtime.toISOString().slice(0, 10),
    updated: st.mtime.toISOString(),
    tags: (meta.tags || '').replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean),
    excerpt: excerpt(text),
    text: text.slice(0, MAX_TEXT),
  }
}

async function listDir(dirName) {
  const dir = join(ROOT, dirName)
  let names
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const out = []
  for (const n of names) {
    if (!n.endsWith('.md')) continue
    try {
      out.push(await readNote(dir, n))
    } catch (err) {
      console.warn('[skip]', n, err.message)
    }
  }
  // 会话日志按日期倒序（文件名以 YYYY-MM-DD 开头），其余按更新时间倒序
  out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.title).localeCompare(String(a.title)))
  return out
}

const [core, logs, projects, lessons] = await Promise.all([
  (async () => {
    try {
      const [raw, st] = await Promise.all([readFile(join(ROOT, '核心记忆.md'), 'utf8'), stat(join(ROOT, '核心记忆.md'))])
      const { text } = stripFrontmatter(raw)
      return { text: text.slice(0, MAX_TEXT), updated: st.mtime.toISOString() }
    } catch {
      return { text: '', updated: null }
    }
  })(),
  listDir('会话日志'),
  listDir('项目'),
  listDir('决策与教训'),
])

const data = {
  generatedAt: new Date().toISOString(),
  vaultName: VAULT_NAME,
  root: ROOT_REL,
  vaultPath: VAULT,
  core,
  logs,
  projects,
  lessons,
  stats: {
    logs: logs.length,
    projects: projects.length,
    lessons: lessons.length,
    notes: logs.length + projects.length + lessons.length,
  },
}

await writeFile(
  OUT,
  '/* 由 memory/sync-memory.mjs 生成，请勿手改。重新生成：node memory/sync-memory.mjs */\n' +
    'window.__AGENT_MEMORY__ = ' +
    JSON.stringify(data) +
    ';\n',
  'utf8',
)

console.log(
  `[memory] ${data.stats.notes} 篇笔记（日志 ${data.stats.logs} / 项目 ${data.stats.projects} / 教训 ${data.stats.lessons}）→ memory/memory-data.js`,
)
