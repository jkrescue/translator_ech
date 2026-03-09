# 问题记录 (QA)

## 问题1：Nginx 代理后显示默认测试页面

### 现象
- 访问 `http://43.156.44.234` 显示 Nginx 默认测试页面
- 本地 `curl http://localhost/` 返回正确的前端内容

### 原因
1. Nginx 配置文件可能存在 `conf.d` 或 `sites-enabled` 中的默认配置未被覆盖
2. 浏览器缓存问题

### 解决步骤
```bash
# 1. 确认主配置文件
cat > /etc/nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    client_max_body_size 100M;

    upstream frontend { server 127.0.0.1:5174; }
    upstream backend { server 127.0.0.1:8000; }

    server {
        listen 80 default_server;
        
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
        }

        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
EOF

# 2. 删除默认站点配置
rm -f /etc/nginx/sites-enabled/default

# 3. 测试并重启
nginx -t && systemctl restart nginx

# 4. 强制刷新浏览器缓存
# Ctrl + Shift + R (Windows/Linux)
# Cmd + Shift + R (Mac)
```

---

## 问题2：端口选择问题

### 现象
- 之前使用 5174 (Vite) 和 8000 (FastAPI) 端口可以正常访问
- 配置 Nginx 后使用 80 端口无法访问

### 原因
- 5174 和 8000 端口已在防火墙/安全组中放行
- 新增的 80 端口需要手动开放

### 解决步骤
```bash
# 腾讯云控制台 → 安全组 → 添加入站规则
| 协议 | 端口 | 来源     |
|------|------|----------|
| TCP  | 80   | 0.0.0.0/0|
```

---

## 问题3：前端 API 地址硬编码

### 现象
- 部分代码中 API 地址硬编码为 `http://localhost:8000`
- Nginx 代理后 API 请求失败

### 原因
- `frontend/src/app/App.tsx` 中有硬编码的 API 地址

### 解决步骤
修改为使用相对路径：
```typescript
// 之前
const response = await fetch('http://localhost:8000/api/translate', ...)

// 之后
import * as api from './services/api';
const response = await fetch(`${api.API_BASE_URL}/api/translate`, ...)

// api.ts 中已配置为空字符串，通过 Nginx 代理到后端
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
```

---

## 最终架构

```
┌─────────────────────────────────────────────────────────┐
│                     用户浏览器                          │
│              http://43.156.44.234                      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Nginx (端口 80)                            │
│  ┌─────────────┐        ┌─────────────┐               │
│  │ /           │  ───▶  │ 5174 (前端)  │               │
│  │ /api/       │  ───▶  │ 8000 (后端)  │               │
│  └─────────────┘        └─────────────┘               │
└─────────────────────────────────────────────────────────┘
```

### 端口映射
| 服务   | 内部端口 | 外部访问方式         |
|--------|----------|---------------------|
| 前端   | 5174     | http://43.156.44.234 |
| 后端   | 8000     | http://43.156.44.234/api |
| Nginx  | 80       | -                   |

---

## 验证命令

```bash
# 测试各服务状态
curl -s -o /dev/null -w "Frontend: %{http_code}\n" http://127.0.0.1:5174/
curl -s -o /dev/null -w "Backend: %{http_code}\n" http://127.0.0.1:8000/health
curl -s -o /dev/null -w "Nginx: %{http_code}\n" http://127.0.0.1/

# 测试外部访问
curl -s -o /dev/null -w "External: %{http_code}\n" http://43.156.44.234/
```

---

## 相关配置文件

- `/etc/nginx/nginx.conf` - Nginx 主配置
- `/root/workspace/pdfTranslator/nginx.conf` - 项目 Nginx 配置备份
- `/root/workspace/pdfTranslator/setup-nginx.sh` - 自动部署脚本
