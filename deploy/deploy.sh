#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/allota-crm"
cd "$APP_DIR"

echo ">>> [1/5] Fetching latest code from GitHub main..."
git fetch --all
git reset --hard origin/main

echo ">>> [2/5] Installing CRM dependencies..."
npm install --production=false

echo ">>> [3/5] Generating Prisma client..."
npx prisma generate

echo ">>> [4/5] Building Next.js application..."
npm run build

echo ">>> [5/5] Reloading PM2 processes..."
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

echo ">>> DEPLOYMENT SUCCEEDED!"
