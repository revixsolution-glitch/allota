#!/usr/bin/env bash
# ==============================================================================
# ALLOTA PHARMA CRM - ZERO-RISK PRODUCTION DEPLOYMENT SCRIPT
# Hostinger KVM 1: 201.18.206.214
# ==============================================================================
set -euo pipefail

TARGET_HOST="root@201.18.206.214"
TARGET_DIR="/var/www/allota-crm"

echo "=== [1/4] Running Pre-flight TypeScript Check ==="
npx tsc --noEmit
echo "✓ Pre-flight checks passed."

echo "=== [2/4] Syncing Code to Production (Environment Guarded) ==="
# STRICT SAFETY RULE: NEVER sync ANY .env file, local auth tokens, or node_modules
rsync -avz \
  --delete-after \
  --exclude='.env*' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='companion-service/data/wa_auth' \
  --exclude='companion-service/node_modules' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  ./ "${TARGET_HOST}:${TARGET_DIR}/"

echo "=== [3/4] Building and Reloading PM2 on Production Server ==="
ssh "${TARGET_HOST}" "cd ${TARGET_DIR} && npm run build && pm2 reload all"

echo "=== [4/4] Automated Post-Deploy Database Health Check ==="
HEALTH_STATUS=$(ssh "${TARGET_HOST}" "curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'x-demo-bypass: true' \
  -d '{\"email\":\"savi@kesrox.com\",\"password\":\"health_check_probe\"}'")

if echo "${HEALTH_STATUS}" | grep -q "Invalid email or password"; then
  echo "✓ DATABASE & AUTH HEALTH CHECK PASSED! Application is healthy and serving requests."
else
  echo "❌ CRITICAL: Health probe failed! Response: ${HEALTH_STATUS}"
  exit 1
fi

echo "=== DEPLOYMENT COMPLETED SAFELY ==="
