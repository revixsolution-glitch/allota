===================================================================
PHARMA CRM - DATABASE RESTORE & SERVER SETUP INSTRUCTIONS
===================================================================

This package contains the full PostgreSQL database dump for Pharma CRM,
including all tables, relationships, realistic PCD pharma products,
softgel capsules, injections, leads, employees, sessions, calls,
and company settings.

-------------------------------------------------------------------
1. HOW TO RESTORE THIS DATABASE ON YOUR PRODUCTION SERVER
-------------------------------------------------------------------

Step 1: Create a PostgreSQL database on the server
  psql -U postgres -c "CREATE DATABASE pharma_crm_prod;"

Step 2: Restore this SQL file into the database
  psql -U postgres -d pharma_crm_prod -f pharma_crm_full_backup.sql

(If using a cloud database like Supabase, Neon, Railway, or AWS RDS,
 run the import command using your connection URI):
  psql "postgresql://user:password@host:port/dbname?sslmode=require" -f pharma_crm_full_backup.sql

-------------------------------------------------------------------
2. CONFIGURE YOUR ENVIRONMENT (.env)
-------------------------------------------------------------------

DATABASE_URL="postgresql://postgres:your_db_password@localhost:5432/pharma_crm_prod?schema=public"
JWT_SECRET="generate-a-secure-secret-key-32-chars"
NODE_ENV="production"
PORT=3000

-------------------------------------------------------------------
3. START THE APPLICATION
-------------------------------------------------------------------

1. Install dependencies & build:
   npm install
   npm run build

2. Start the server:
   npm run start
   (or use PM2: `pm2 start npm --name "pharma-crm" -- start`)

===================================================================
Default Admin Account (from database):
Email: admin@pharmalifesciences.com
Password: admin123
===================================================================
