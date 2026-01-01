# 一键部署脚本 (Windows PowerShell)
# 使用方法: .\deploy.ps1 [-WsUrl "wss://your-domain.com/ws"]
# 示例: .\deploy.ps1 -WsUrl "wss://example.com/ws"

param(
    [string]$WsUrl = "ws://localhost:3000"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "复合井字棋 - 生产环境部署脚本 (Windows)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "WebSocket URL: $WsUrl" -ForegroundColor Yellow
Write-Host ""

# 检查 Node 版本
try {
    $nodeVersion = (node -v) -replace 'v', '' -replace '\..*', ''
    if ([int]$nodeVersion -lt 20) {
        Write-Host "❌ 错误: Node.js 版本需要 >= 20，当前版本: $(node -v)" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Node.js 版本检查通过: $(node -v)" -ForegroundColor Green
} catch {
    Write-Host "❌ 错误: 未找到 Node.js，请先安装" -ForegroundColor Red
    exit 1
}

# 安装依赖
Write-Host ""
Write-Host "📦 安装依赖..." -ForegroundColor Yellow
npm ci --production=false
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 依赖安装失败" -ForegroundColor Red
    exit 1
}

# 构建前端
Write-Host ""
Write-Host "🔨 构建前端 (VITE_WS_URL=$WsUrl)..." -ForegroundColor Yellow
$env:VITE_WS_URL = $WsUrl
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 构建失败" -ForegroundColor Red
    exit 1
}

# 检查 dist 目录
if (!(Test-Path "dist")) {
    Write-Host "❌ 错误: 构建失败，dist 目录不存在" -ForegroundColor Red
    exit 1
}
Write-Host "✅ 前端构建完成: dist/" -ForegroundColor Green

# 检查 pm2
Write-Host ""
Write-Host "🔍 检查 pm2..." -ForegroundColor Yellow
$pm2Installed = $null
try {
    $pm2Installed = Get-Command pm2 -ErrorAction SilentlyContinue
} catch {}

if (!$pm2Installed) {
    Write-Host "⚠️  未检测到 pm2，正在安装..." -ForegroundColor Yellow
    npm install -g pm2
}

# 停止旧进程
Write-Host ""
Write-Host "🔄 检查并停止旧进程..." -ForegroundColor Yellow
try {
    pm2 delete uttt-ws 2>$null
} catch {
    Write-Host "没有运行中的进程" -ForegroundColor Gray
}

# 启动后端
Write-Host ""
Write-Host "🚀 启动 WebSocket 服务器..." -ForegroundColor Yellow
pm2 start server/index.cjs --name uttt-ws
pm2 save

# 生成部署说明
$deployInfo = @"
========================================
✅ 部署完成！
========================================

📋 部署信息：
  - 前端静态文件: $(Get-Location)\dist
  - WebSocket 服务: http://0.0.0.0:3000
  - WebSocket URL: $WsUrl
  - pm2 进程名: uttt-ws

🔧 后续操作 (IIS/Nginx)：

【IIS 部署】
  1. 打开 IIS 管理器
  2. 创建新网站，物理路径指向: $(Get-Location)\dist
  3. 安装 URL Rewrite 和 Application Request Routing 模块
  4. 配置 WebSocket 反向代理（参考 web.config.example）

【Nginx 部署 (Windows)】
  1. 将 Nginx 站点根目录指向: $(Get-Location)\dist
  2. 参考 nginx.conf.example 配置 WebSocket 反代
  3. 配置 SSL 证书 (生产环境必须)
  4. 重启 Nginx

📊 查看服务状态:
  - pm2 status
  - pm2 logs uttt-ws
  - pm2 monit

🛑 停止服务:
  - pm2 stop uttt-ws
  - pm2 delete uttt-ws

⚠️  防火墙提醒:
  - 确保开放 3000 端口（WebSocket）
  - 确保开放 80/443 端口（HTTP/HTTPS）
  - Windows 防火墙：控制面板 → 高级安全 → 入站规则

"@

Write-Host $deployInfo -ForegroundColor Cyan

# 生成 IIS web.config
$webConfig = @'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <!-- SPA 前端路由 -->
    <rewrite>
      <rules>
        <rule name="WebSocket" stopProcessing="true">
          <match url="^ws$" />
          <action type="Rewrite" url="http://localhost:3000" />
        </rule>
        <rule name="SPA" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/" />
        </rule>
      </rules>
    </rewrite>
    
    <!-- WebSocket 支持 -->
    <webSocket enabled="true" />
    
    <!-- 静态文件处理 -->
    <staticContent>
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <mimeMap fileExtension=".js" mimeType="application/javascript" />
      <mimeMap fileExtension=".mjs" mimeType="application/javascript" />
    </staticContent>
  </system.webServer>
</configuration>
'@

Set-Content -Path "web.config.example" -Value $webConfig -Encoding UTF8
Write-Host "📝 已生成: web.config.example (IIS 配置)" -ForegroundColor Green

# 生成 Nginx 配置
$nginxConfig = @'
# Nginx 配置示例 (Windows)
server {
    listen 80;
    server_name your-domain.com;

    root C:/path/to/your/project/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
'@

Set-Content -Path "nginx.conf.example" -Value $nginxConfig -Encoding UTF8
Write-Host "📝 已生成: nginx.conf.example (Nginx 配置)" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
