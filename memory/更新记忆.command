#!/bin/bash
# 双击即可：把 Obsidian 记忆库的最新内容同步进大屏
# 每次在记忆库里写完笔记后跑一次，刷新大屏页面就能看到
cd "$(dirname "$0")/.." || exit 1

echo "正在同步记忆库 → memory/memory-data.js"
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 没找到 node。装一个 Node.js 再来（brew install node）"
  read -r -p "按回车关闭..."
  exit 1
fi

node memory/sync-memory.mjs || {
  echo "❌ 同步失败，看上面的报错"
  read -r -p "按回车关闭..."
  exit 1
}

echo
echo "✅ 完成。刷新浏览器里的大屏页面（Cmd+R）即可看到新内容。"
read -r -p "按回车关闭..."
