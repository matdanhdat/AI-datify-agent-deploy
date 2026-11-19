#!/usr/bin/env bash
set -e

echo "========================================================"
echo "  👾 KHỞI ĐỘNG PIXEL TRADING AGENT (Trình duyệt + Vercel)"
echo "========================================================"
echo ""

# 1. Kiểm tra Node.js
if ! command -v node &> /dev/null; then
    echo "[LỖI] Máy tính của bạn chưa cài đặt Node.js!"
    echo "Vui lòng tải và cài đặt bản Node.js LTS (>= 20) tại: https://nodejs.org/"
    exit 1
fi

# 2. Kiểm tra .env.local
if [ ! -f ".env.local" ] && [ -f ".env.example" ]; then
    cp .env.example .env.local
    echo "[THÔNG BÁO] Đã tạo file .env.local từ mẫu .env.example."
    echo "[LƯU Ý] Mở file .env.local và dán khóa Gemini vào để bật tính năng AI!"
    echo ""
fi

# 3. Kiểm tra node_modules
if [ ! -d "node_modules" ]; then
    echo "[CÀI ĐẶT] Đang cài đặt thư viện cần thiết (npm install)..."
    npm install
fi

# 4. Chạy ứng dụng
npm start
