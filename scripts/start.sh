#!/usr/bin/env bash
# PosterFlow 服务启动脚本
# 用法：
#   ./scripts/start.sh          # 开发模式（HMR）
#   ./scripts/start.sh prod     # 构建并预览生产包
set -euo pipefail

cd "$(dirname "$0")/.."

CONFIG="${VITE_LLM_CONFIG_PATH:-$HOME/.config/llm.yaml}"
if [ ! -f "$CONFIG" ]; then
  echo "⚠️  未找到模型配置 $CONFIG —— AI 生成将不可用。请在该文件中配置 api_key 后再启动。"
fi

if [ ! -d node_modules ]; then
  echo "📦 安装依赖中..."
  npm install
fi

MODE="${1:-dev}"
if [ "$MODE" = "prod" ]; then
  echo "🏗️  构建生产包..."
  npm run build
  echo "🚀 预览生产服务 -> http://localhost:5000"
  npm run preview -- --port 5000 --strictPort
else
  echo "🚀 启动开发服务 -> http://localhost:5000"
  npm run dev
fi
