#!/bin/bash

# Nginx 配置脚本 - 完整版
# 用于服务器直接安装 Nginx 的方案

set -e

echo "========== Nginx 反向代理配置 =========="

# 1. 安装 Nginx（如果未安装）
echo "[1/5] 检查 Nginx..."
if ! command -v nginx &> /dev/null; then
    echo "正在安装 Nginx..."
    apt update && apt install nginx -y
else
    echo "Nginx 已安装: $(nginx -v 2>&1)"
fi

# 2. 备份并配置 Nginx
echo "[2/5] 配置 Nginx..."
cat > /etc/nginx/nginx.conf << 'NGINX_CONF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    sendfile        on;
    keepalive_timeout  65;
    client_max_body_size 100M;

    proxy_cache off;

    # 前端服务（Vite dev server，端口 5174）
    upstream frontend {
        server 127.0.0.1:5174;
    }

    # 后端服务（FastAPI/Uvicorn，端口 8000）
    upstream backend {
        server 127.0.0.1:8000;
    }

    server {
        listen 80 default_server;
        listen [::]:80 default_server;
        server_name _;

        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        location /api/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            proxy_connect_timeout 300s;
            proxy_send_timeout 300s;
            proxy_read_timeout 300s;
        }

        location /uploads/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location /health {
            proxy_pass http://backend/health;
            proxy_set_header Host $host;
        }

        location /ws/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
NGINX_CONF

# 3. 删除默认站点配置
echo "[3/5] 清理默认站点配置..."
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-available/default

# 4. 检查并重启
echo "[4/5] 检查配置并重启..."
nginx -t

# 5. 重启 Nginx
systemctl restart nginx
systemctl enable nginx

# 6. 验证服务
echo "[5/5] 验证服务..."
sleep 2

echo ""
echo "========== 验证结果 =========="

# 检查前端
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5174/ 2>/dev/null || echo "000")
if [ "$FRONTEND_STATUS" = "200" ]; then
    echo "✓ 前端服务 (5174) - 正常"
else
    echo "✗ 前端服务 (5174) - 异常 (HTTP $FRONTEND_STATUS)"
    echo "  请确保已启动: cd /root/workspace/pdfTranslator/frontend && npm run dev"
fi

# 检查后端
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/health 2>/dev/null || echo "000")
if [ "$BACKEND_STATUS" = "200" ]; then
    echo "✓ 后端服务 (8000) - 正常"
else
    echo "✗ 后端服务 (8000) - 异常 (HTTP $BACKEND_STATUS)"
    echo "  请确保已启动: cd /root/workspace/pdfTranslator/backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"
fi

# 检查 Nginx 代理
NGINX_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ 2>/dev/null || echo "000")
if [ "$NGINX_STATUS" = "200" ]; then
    echo "✓ Nginx 代理 (80) - 正常"
else
    echo "✗ Nginx 代理 (80) - 异常 (HTTP $NGINX_STATUS)"
fi

echo ""
echo "========== 完成！=========="
echo ""
echo "访问地址：http://43.156.44.234"
echo ""
echo "请确保以下服务正在运行："
echo "  1. 前端: npm run dev (端口 5174)"
echo "  2. 后端: uvicorn (端口 8000)"
echo ""
echo "如果服务未运行，启动命令："
echo "  # 终端1: 启动前端"
echo "  cd /root/workspace/pdfTranslator/frontend && npm run dev"
echo ""
echo "  # 终端2: 启动后端"
echo "  cd /root/workspace/pdfTranslator/backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"
