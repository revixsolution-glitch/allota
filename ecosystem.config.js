module.exports = {
  apps: [
    {
      name: "allota-crm",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 3000",
      cwd: "/var/www/allota-crm",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1500M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "allota-whatsapp",
      script: "npm",
      args: "run start",
      cwd: "/var/www/allota-crm/companion-service",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "800M",
      env: {
        NODE_ENV: "production",
        PORT: 10000,
        ALLOTA_WEBHOOK_URL: "http://localhost:3000/api/whatsapp-companion/incoming",
        COMPANY_ID: "cmubi8zf6000004l8y45hhuds",
      },
    },
  ],
};
