#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "  ALLOTA CRM - HOSTINGER KVM 1 PRODUCTION SERVER SETUP   "
echo "=========================================================="

# 1. Update OS packages
echo ">>> [1/7] Updating system packages..."
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
apt-get install -y curl wget git build-essential ufw nginx certbot python3-certbot-nginx

# 2. Configure 4 GB Swap space (Critical for 4 GB RAM VPS)
if [ ! -f /swapfile ]; then
    echo ">>> [2/7] Creating 4 GB Swap space..."
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
else
    echo ">>> [2/7] Swap already exists, skipping."
fi

# 3. Install Node.js 20 LTS & PM2
echo ">>> [3/7] Installing Node.js 20 LTS & PM2..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
npm install -g pm2
pm2 startup systemd -u root --hp /root || true

# 4. Setup UFW Firewall
echo ">>> [4/7] Configuring UFW Firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 5. Prepare Web Directory
echo ">>> [5/7] Preparing application directory..."
mkdir -p /var/www/allota-crm
mkdir -p /var/backups/allota

# 6. Setup Automated Daily Database & Session Backup Cron
echo ">>> [6/7] Setting up automated backup cron job..."
cat << 'EOF' > /usr/local/bin/allota-daily-backup.sh
#!/usr/bin/env bash
BACKUP_DIR="/var/backups/allota"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p "$BACKUP_DIR"

# Backup WhatsApp Companion session keys
if [ -d "/var/www/allota-crm/companion-service/data" ]; then
    tar -czf "$BACKUP_DIR/whatsapp_session_$TIMESTAMP.tar.gz" -C /var/www/allota-crm/companion-service data/
fi

# Keep only last 14 days of backups
find "$BACKUP_DIR" -type f -name "*.tar.gz" -mtime +14 -delete
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +14 -delete
EOF
chmod +x /usr/local/bin/allota-daily-backup.sh

# Add to crontab if not already present
(crontab -l 2>/dev/null | grep -v 'allota-daily-backup.sh'; echo "0 2 * * * /usr/local/bin/allota-daily-backup.sh > /dev/null 2>&1") | crontab -

echo "=========================================================="
echo "  SERVER INITIALIZATION COMPLETE!                         "
echo "  Node: $(node -v) | NPM: $(npm -v) | Memory: $(free -h | awk '/Mem:/ {print $2}')"
echo "=========================================================="
