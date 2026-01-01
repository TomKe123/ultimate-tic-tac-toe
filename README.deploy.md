# 生产环境部署指南

## 快速部署

### Linux / macOS
```bash
chmod +x deploy.sh
./deploy.sh wss://your-domain.com/ws
```

### Windows PowerShell
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\deploy.ps1 -WsUrl "wss://your-domain.com/ws"
```

### 跨平台 (Node.js)
```bash
node deploy.js wss://your-domain.com/ws
```

---

## 手动部署步骤

### 1. 环境准备
- Node.js >= 20.19.0
- npm
- pm2 (可选，推荐)

### 2. 构建前端
```bash
# 设置 WebSocket 地址
export VITE_WS_URL=wss://your-domain.com/ws  # Linux/macOS
# 或
$env:VITE_WS_URL="wss://your-domain.com/ws"  # Windows PowerShell

# 安装依赖并构建
npm ci
npm run build
```

### 3. 启动后端
```bash
# 方式1：使用 pm2 (推荐)
pm2 start server/index.cjs --name uttt-ws
pm2 save
pm2 startup  # 设置开机自启

# 方式2：直接运行
node server/index.cjs
```

### 4. 配置 Web 服务器

#### Nginx 配置
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 静态文件
    root /path/to/project/dist;
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
    }

    # SSL 配置 (推荐)
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
}
```

#### 宝塔面板
1. 创建站点，根目录指向 `dist/`
2. 在站点设置 → 配置文件中添加 WebSocket 反代（见上面 location /ws）
3. 申请 SSL 证书
4. 使用 pm2 管理器启动后端

#### IIS (Windows)
1. 安装 URL Rewrite 和 Application Request Routing 模块
2. 创建站点，物理路径指向 `dist/`
3. 复制 `web.config.example` 到 `dist/web.config`
4. 配置 ARR 代理到 `http://localhost:3000`

---

## 环境变量说明

| 变量 | 说明 | 示例 |
|------|------|------|
| `VITE_WS_URL` | WebSocket 服务器地址（构建时） | `wss://example.com/ws` |
| `NODE_ENV` | 环境标识（可选） | `production` |

**注意：** `VITE_WS_URL` 必须在 **构建前** 设置，构建后修改无效。

---

## 常见问题

### Q: WebSocket 连接失败？
1. 检查防火墙/安全组是否放行 3000 端口
2. 确认 Nginx 反代配置正确（Upgrade/Connection 头）
3. 检查 SSL 证书配置（HTTPS 页面必须用 WSS）
4. 查看后端日志：`pm2 logs uttt-ws`

### Q: 页面刷新 404？
前端路由需要 Web 服务器配置回退到 `index.html`：
- Nginx: `try_files $uri $uri/ /index.html;`
- IIS: 参考 `web.config.example`

### Q: 如何更新部署？
```bash
# 1. 拉取最新代码
git pull

# 2. 重新部署
./deploy.sh wss://your-domain.com/ws  # Linux/macOS
# 或
.\deploy.ps1 -WsUrl "wss://your-domain.com/ws"  # Windows

# 3. 如果只更新前端
npm run build

# 4. 如果只更新后端
pm2 restart uttt-ws
```

### Q: 如何查看服务状态？
```bash
pm2 status         # 进程列表
pm2 logs uttt-ws   # 实时日志
pm2 monit          # 实时监控
```

---

## 性能优化

### 1. 启用 Gzip (Nginx)
```nginx
gzip on;
gzip_types text/css application/javascript application/json;
gzip_min_length 1000;
```

### 2. 设置缓存
```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 3. 使用 CDN
将 `dist/assets/` 上传到 CDN，修改 Nginx 配置：
```nginx
location /assets/ {
    proxy_pass https://your-cdn.com/assets/;
}
```

---

## 安全建议

1. **必须使用 HTTPS**：配置 SSL 证书（Let's Encrypt 免费）
2. **限制端口访问**：仅开放 80/443，3000 端口不对外
3. **定期更新**：及时更新依赖和 Node.js 版本
4. **备份数据**：定期备份代码和配置

---

## 监控与日志

### 日志位置
- pm2 日志：`~/.pm2/logs/`
- Nginx 日志：`/var/log/nginx/`
- 宝塔日志：`/www/wwwlogs/`

### 监控工具
- pm2 自带监控：`pm2 monit`
- 宝塔监控面板
- 外部监控：UptimeRobot、阿里云云监控

---

## 技术支持

遇到问题？
1. 检查本文档的「常见问题」
2. 查看 pm2 日志排查错误
3. 提交 Issue 或联系开发者
