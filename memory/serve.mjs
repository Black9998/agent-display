#!/usr/bin/env node
/**
 * agent-display 静态服务器（node 版）
 *
 * 为什么不用 python3 -m http.server：
 *   在 launchd 下运行时，/usr/bin/python3 对 ~/Documents 没有 TCC 授权，
 *   os.getcwd() 直接抛 Operation not permitted。node 在这个上下文里能正常读，
 *   所以自己写一个最小静态服务。
 *
 * 监听 0.0.0.0:8099，供局域网访问。
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, normalize, extname, sep } from 'node:path'

const ROOT = '/Users/admin/Documents/agent-display-local'
const PORT = Number(process.env.PORT || 8099)
const HOST = process.env.HOST || '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })

const server = createServer(async (req, res) => {
  let urlPath
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  } catch {
    res.writeHead(400).end('bad request')
    return
  }

  // 防目录穿越：解析后必须仍在 ROOT 之内
  const target = normalize(join(ROOT, urlPath))
  if (!target.startsWith(ROOT + sep) && target !== ROOT) {
    res.writeHead(403).end('forbidden')
    return
  }

  try {
    let filePath = target
    let info = await stat(filePath)
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html')
      info = await stat(filePath)
    }
    const body = await readFile(filePath)
    const ext = extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      // html / js 不缓存：记忆库快照更新后刷新就能看到
      'Cache-Control': ['.html', '.htm', '.js', '.mjs', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600',
    })
    res.end(body)
  } catch (err) {
    const code = err && (err.code === 'ENOENT' || err.code === 'ENOTDIR') ? 404 : 500
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }).end(code === 404 ? 'not found' : String(err))
    if (code === 500) console.error(`[${stamp()}] ${req.method} ${urlPath} → ${err && err.code}`)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[${stamp()}] agent-display 已启动 http://${HOST}:${PORT}/  (root: ${ROOT})`)
})

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[${stamp()}] 收到 ${sig}，退出`)
    server.close(() => process.exit(0))
  })
}
