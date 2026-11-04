#!/usr/bin/env node
/**
 * 记忆库 → 大屏 自动同步守护
 *
 * 监听 Obsidian 记忆库目录，任何改动 1.5 秒后自动跑一次 sync-memory.mjs，
 * 把最新内容烘焙进 memory/memory-data.js。大屏刷新即见。
 *
 * 由 LaunchAgent com.agentdisplay.memorysync 常驻拉起（KeepAlive）。
 */

import { watch } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = join(homedir(), 'Documents', '知识库', '06-Agent记忆')
const SYNC = join(dirname(fileURLToPath(import.meta.url)), 'sync-memory.mjs')
const DEBOUNCE_MS = 1500

let timer = null
let running = false
let pending = null

const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })

function runSync(reason) {
  if (running) {
    pending = reason
    return
  }
  running = true
  const child = spawn(process.execPath, [SYNC], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (d) => (out += d))
  child.stderr.on('data', (d) => (out += d))
  child.on('close', (code) => {
    running = false
    const line = out.trim().split('\n').pop() || ''
    console.log(`[${stamp()}] ${code === 0 ? '✓' : '✗'} ${reason} → ${line}`)
    if (pending) {
      const next = pending
      pending = null
      runSync(next)
    }
  })
  child.on('error', (err) => {
    running = false
    console.error(`[${stamp()}] ✗ 无法执行同步: ${err.message}`)
  })
}

function schedule(reason) {
  clearTimeout(timer)
  timer = setTimeout(() => runSync(reason), DEBOUNCE_MS)
}

// 忽略临时文件 / 隐藏文件
const noisy = (f) =>
  !f || f.split('/').some((p) => p.startsWith('.') || p.endsWith('~') || p.endsWith('.tmp') || p.endsWith('.swp'))

try {
  watch(ROOT, { recursive: true }, (_evt, file) => {
    if (noisy(file)) return
    schedule(file)
  })
  console.log(`[${stamp()}] 监听 ${ROOT}（防抖 ${DEBOUNCE_MS}ms）`)
} catch (err) {
  console.error(`[${stamp()}] ✗ 监听失败: ${err.message}`)
  process.exit(1)
}

// 启动先同步一次，保证快照不落后
runSync('启动初始化')
