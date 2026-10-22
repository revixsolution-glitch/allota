# Allota Pharma CRM

> **Executive AI Telephony & Meta Suite Platform for PCD Pharma Franchises, Ethical Marketing & Third-Party Manufacturing Teams**

[![Live Production](https://img.shields.io/badge/Deployment-Live-success?style=for-the-badge&logo=vercel)](https://allota.vercel.app)
[![Framework](https://img.shields.io/badge/Next.js-16.3-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Database](https://img.shields.io/badge/Prisma-7.10-blue?style=for-the-badge&logo=prisma)](https://prisma.io)
[![Security](https://img.shields.io/badge/Multi--Tenant-Isolated-emerald?style=for-the-badge)](./ARCHITECTURE.md)

---

## 🌟 Overview

Allota Pharma CRM is an enterprise-grade customer relationship management and telephony intelligence platform built specifically for Indian pharmaceutical manufacturers, franchise companies, and marketing divisions. It centralizes:

- **AI Telephony & Call Summaries**: Speaker-diarized transcripts, natural Hinglish executive briefings, and commercial intent classification (`🔥 Hot`, `⚡ Warm`, `❄️ Cold`, `💀 Dead`).
- **Meta Suite & Social Inbox**: Unified live feed of Facebook & Instagram comments, post likes, direct messages, and direct in-app replies.
- **Meta Ads Insights**: Zero-config campaign spend, reach, CTR, and lead attribution tracking via Meta Marketing API.
- **Franchise & Monopoly Distribution**: District-level franchise monopoly rights tracking, repeat order cadences, and lead floor distribution.
- **WhatsApp Multi-Device Companion**: Integrated zero-cost WhatsApp Web socket connection directly on the server.

---

## 📚 Complete Developer Architecture Handbook

For the complete technical breakdown, database ER diagrams, multi-tenant security specifications, and onboarding runbooks, please read:

👉 **[Master Architecture & Developer Handbook (`ARCHITECTURE.md`)](./ARCHITECTURE.md)**

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v20 or v24 LTS
- **PostgreSQL**: Local database instance or Neon cloud database
- **Google Gemini API Key**: For multimodal call diarization and Hinglish summaries

### 2. Installation & Setup

```bash
# Clone the repository
git clone git@github.com:revixsolution-glitch/allota.git
cd allota

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Generate Prisma client & push schema
npx prisma generate
npx prisma db push

# Start local development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the portal.

---

## 🛡️ Multi-Tenant Safety & Code Verification

This project enforces strict build-time tenant isolation guards. Before pushing code or creating builds, run:

```bash
# Run the automated tenant safety scanner
npm run check:tenant

# Run full Next.js production build with safety checks
npm run build
```

Under our tenant safety policy:
- No firm can ever query another company's Meta Page, Ad Account, or tokens.
- All secrets and API credentials in `CompanySettings` are encrypted at rest with **AES-256-GCM**.
- All database queries must be scoped using `scopeToCompany(companyId)` from `@/lib/auth`.

---

## 🌐 Production Deployment

The project is continuously deployed to Vercel production:
- **Production URL**: [https://allota.vercel.app](https://allota.vercel.app)
- **Deployment Command**: `npx vercel --prod --yes`

---

## 📄 License & Confidentiality

Proprietary enterprise software developed for Allota AI. All rights reserved.
