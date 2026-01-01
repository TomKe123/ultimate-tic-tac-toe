#!/bin/bash
# 一键部署脚本 (Linux/macOS)
# 使用方法: ./deploy.sh [WS_URL]
# 示例: ./deploy.sh wss://your-domain.com/ws

set -e

echo "=========================================="
echo "复合井字棋 - 生产环境部署脚本"
echo "=========================================="

# 读取 WebSocket URL 参数
WS_URL="${1:-ws://localhost:3000}"
echo "WebSocket URL: $WS_URL"

# 检查 Node 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ 错误: Node.js 版本需要 >= 20，当前版本: $(node -v)"
    exit 1
fi
echo "✅ Node.js 版本检查通过: $(node -v)"

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm ci --production=false

# 构建前端
echo ""
echo "🔨 构建前端 (VITE_WS_URL=$WS_URL)..."
VITE_WS_URL="$WS_URL" npm run build

# 检查 dist 目录
if [ ! -d "dist" ]; then
    echo "❌ 错误: 构建失败，dist 目录不存在"
    exit 1
fi
echo "✅ 前端构建完成: dist/"

# 检查 pm2
if ! command -v pm2 &> /dev/null; then
    echo ""
    echo "⚠️  未检测到 pm2，正在安装..."
    npm install -g pm2
fi

# 停止旧进程（如果存在）
echo ""
echo "🔄 检查并停止旧进程..."
pm2 delete uttt-ws 2>/dev/null || echo "没有运行中的进程"

# 启动后端
echo ""
echo "🚀 启动 WebSocket 服务器..."
pm2 start server/index.cjs --name uttt-ws
pm2 save

# 生成 Nginx 配置
echo ""
echo "📝 生成 Nginx 配置示例..."
cat > nginx.conf.example << 'EOF'
# Nginx 配置示例
# 将此配置添加到你的站点配置中

server {
    listen 80;
    server_name your-domain.com;

    # 静态文件根目录
    root /path/to/your/project/dist;
    index index.html;

    # 前端路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # WebSocket 反向代理
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # SSL 配置 (如果使用 HTTPS)
    # listen 443 ssl http2;
    # ssl_certificate /path/to/cert.pem;
    # ssl_certificate_key /path/to/key.pem;
}
EOF

# 输出部署信息
echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
echo ""
echo "📋 部署信息："
echo "  - 前端静态文件: $(pwd)/dist"
echo "  - WebSocket 服务: http://0.0.0.0:3000"
echo "  - WebSocket URL: $WS_URL"
echo "  - pm2 进程名: uttt-ws"
echo ""
echo "🔧 后续操作："
echo "  1. 将 Nginx 站点根目录指向: $(pwd)/dist"
echo "  2. 参考 nginx.conf.example 配置 WebSocket 反代"
echo "  3. 配置 SSL 证书 (生产环境必须)"
echo "  4. 重启 Nginx: systemctl restart nginx"
echo ""
echo "📊 查看服务状态:"
echo "  - pm2 status"
echo "  - pm2 logs uttt-ws"
echo "  - pm2 monit"
echo ""
echo "🛑 停止服务:"
echo "  - pm2 stop uttt-ws"
echo "  - pm2 delete uttt-ws"
echo ""
