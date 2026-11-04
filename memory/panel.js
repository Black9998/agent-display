/**
 * 记忆库面板 —— 读取 memory-data.js（由 sync-memory.mjs 烘焙），显示 Obsidian 记忆库真实内容。
 * 独立于上游主题：不碰任何主题的 Shadow DOM，全部 DOM 挂在 document.body 下，类名带 am- 前缀。
 */
;(function () {
  'use strict'
  if (window.__AM_MOUNTED__) return
  window.__AM_MOUNTED__ = true

  var DATA = window.__AGENT_MEMORY__ || null
  var TABS = [
    { id: 'core', label: '核心记忆', key: null },
    { id: 'logs', label: '会话日志', key: 'logs' },
    { id: 'projects', label: '项目', key: 'projects' },
    { id: 'lessons', label: '教训', key: 'lessons' },
  ]
  var cur = 'core'
  var expanded = Object.create(null)

  // ---------- 工具 ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function obsidianHref(file) {
    var vault = (DATA && DATA.vaultName) || '知识库'
    return 'obsidian://open?vault=' + encodeURIComponent(vault) + '&file=' + encodeURIComponent(file)
  }

  /** 极简 markdown → HTML：只处理记忆库里实际用到的语法 */
  function md(src) {
    var lines = String(src || '').split('\n')
    var out = []
    var list = null

    function closeList() {
      if (list) {
        out.push('</ul>')
        list = null
      }
    }

    function inline(t) {
      return esc(t)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_m, target, label) {
          return '<a href="' + obsidianHref(target) + '">' + (label || target) + '</a>'
        })
        .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      if (/^\s*$/.test(line)) {
        closeList()
        continue
      }
      var h = /^(#{1,6})\s+(.*)$/.exec(line)
      if (h) {
        closeList()
        out.push('<h4>' + inline(h[2]) + '</h4>')
        continue
      }
      if (/^\s*([-*+])\s+/.test(line)) {
        if (!list) {
          list = true
          out.push('<ul>')
        }
        out.push('<li>' + inline(line.replace(/^\s*([-*+])\s+/, '')) + '</li>')
        continue
      }
      closeList()
      if (/^>\s?/.test(line)) {
        out.push('<blockquote>' + inline(line.replace(/^>\s?/, '')) + '</blockquote>')
        continue
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
        out.push('<hr>')
        continue
      }
      out.push('<p>' + inline(line) + '</p>')
    }
    closeList()
    return out.join('')
  }

  function emptyState(msg, hint) {
    return '<div class="am-empty">' + msg + (hint ? '<br><code>' + esc(hint) + '</code>' : '') + '</div>'
  }

  // ---------- 渲染 ----------
  function renderCore() {
    if (!DATA || !DATA.core || !DATA.core.text) {
      return emptyState('记忆库里还没有核心记忆。', '~/Documents/知识库/06-Agent记忆/核心记忆.md')
    }
    return (
      '<div class="am-md">' + md(DATA.core.text) + '</div>' +
      '<a class="am-obs" href="' + obsidianHref(DATA.root + '/核心记忆.md') + '">↗ 在 Obsidian 打开</a>'
    )
  }

  function renderList(key) {
    var items = (DATA && DATA[key]) || []
    if (!items.length) {
      return emptyState('这一栏还没有笔记。', 'node memory/sync-memory.mjs')
    }
    return items
      .map(function (n, idx) {
        var id = key + ':' + idx
        var open = expanded[id] ? 'true' : 'false'
        var tags = n.tags && n.tags.length
          ? '<div class="am-tags">' + n.tags.map(function (t) { return '<span class="am-tag">#' + esc(t) + '</span>' }).join('') + '</div>'
          : ''
        return (
          '<div class="am-card" data-expanded="' + open + '" data-card="' + id + '">' +
            '<div class="am-card-head">' +
              '<span class="am-card-title">' + esc(n.title) + '</span>' +
              '<span class="am-card-date">' + esc(n.date || '') + '</span>' +
            '</div>' +
            '<div class="am-card-excerpt">' + esc(n.excerpt || '') + '…</div>' +
            tags +
            '<div class="am-card-body"><div class="am-md">' + md(n.text) + '</div></div>' +
            '<a class="am-obs" href="' + obsidianHref(n.file) + '">↗ 在 Obsidian 打开</a>' +
          '</div>'
        )
      })
      .join('')
  }

  function render() {
    var body = document.getElementById('amBody')
    var tabs = document.getElementById('amTabs')
    if (!body || !tabs) return

    tabs.innerHTML = TABS.map(function (t) {
      var n = t.key ? ((DATA && DATA[t.key] && DATA[t.key].length) || 0) : ''
      return (
        '<button class="am-tab" role="tab" data-tab="' + t.id + '" aria-selected="' + (t.id === cur) + '">' +
        esc(t.label) + (n !== '' ? ' <b>' + n + '</b>' : '') +
        '</button>'
      )
    }).join('')

    body.innerHTML = cur === 'core' ? renderCore() : renderList(cur)
    body.scrollTop = 0
  }

  // ---------- 挂载 ----------
  function mount() {
    var scrim = document.createElement('div')
    scrim.className = 'am-scrim'
    scrim.id = 'amScrim'

    var panel = document.createElement('aside')
    panel.className = 'am-panel'
    panel.id = 'amPanel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    panel.setAttribute('aria-label', '记忆库')

    var root = (DATA && DATA.root) || '06-Agent记忆'
    var when = DATA && DATA.generatedAt ? new Date(DATA.generatedAt) : null
    var whenText = when
      ? when.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '未生成'
    var count = (DATA && DATA.stats && DATA.stats.notes) || 0

    panel.innerHTML =
      '<div class="am-head">' +
        '<div>' +
          '<h3 class="am-title">🧠 记忆库</h3>' +
          '<p class="am-sub">' + esc(((DATA && DATA.vaultName) || '知识库') + '/' + root) + ' · 同步于 ' + esc(whenText) + '</p>' +
        '</div>' +
        '<button class="am-close" id="amClose" aria-label="关闭">✕</button>' +
      '</div>' +
      '<div class="am-tabs" id="amTabs" role="tablist"></div>' +
      '<div class="am-body" id="amBody"></div>' +
      '<div class="am-foot">' + esc(count + ' 篇笔记 · 按 M 开关 · Esc 关闭') + '</div>'

    var fab = document.createElement('button')
    fab.className = 'am-fab'
    fab.id = 'amFab'
    fab.innerHTML = '<span class="am-fab-dot"></span>记忆库<span class="am-fab-count">' + count + '</span>'

    document.body.appendChild(scrim)
    document.body.appendChild(panel)
    document.body.appendChild(fab)

    render()

    function open() {
      panel.setAttribute('data-open', 'true')
      scrim.setAttribute('data-open', 'true')
      var t = panel.querySelector('.am-tab[aria-selected="true"]')
      if (t && t.focus) t.focus()
    }
    function close() {
      panel.setAttribute('data-open', 'false')
      scrim.setAttribute('data-open', 'false')
    }
    function toggle() {
      if (panel.getAttribute('data-open') === 'true') close()
      else open()
    }
    function isOpen() {
      return panel.getAttribute('data-open') === 'true'
    }

    fab.addEventListener('click', open)
    scrim.addEventListener('click', close)
    panel.querySelector('#amClose').addEventListener('click', close)

    // 地址带 ?am=1 时自动打开（方便演示 / 无头截图验证）；&amt=logs 之类可预选标签
    try {
      var q = location.search || ''
      var pick = /[?&]amt=([a-z]+)/.exec(q)
      if (pick && TABS.some(function (t) { return t.id === pick[1] })) {
        cur = pick[1]
        render() // render() 在此之前已按默认标签渲染过一次，这里重渲染
      }
      if (/[?&]am=1(&|$)/.test(q)) open()
    } catch (e) {
      /* 忽略 */
    }

    panel.addEventListener('click', function (e) {
      var tab = e.target.closest('.am-tab')
      if (tab) {
        cur = tab.dataset.tab
        render()
        return
      }
      var head = e.target.closest('.am-card-head')
      if (head) {
        var card = head.parentElement
        var id = card.getAttribute('data-card')
        expanded[id] = !expanded[id]
        card.setAttribute('data-expanded', String(!!expanded[id]))
      }
    })

    // 键盘：M 开关、Esc 关闭。捕获阶段拦下，避免和主题选择器的 Esc / T 打架
    document.addEventListener(
      'keydown',
      function (e) {
        var tag = (e.target && e.target.tagName) || ''
        if (/INPUT|TEXTAREA|SELECT/.test(tag)) return
        if (e.key === 'Escape' && isOpen()) {
          close()
          e.stopPropagation()
          return
        }
        if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) {
          toggle()
          e.stopPropagation()
        }
      },
      true,
    )
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
  else mount()
})()
