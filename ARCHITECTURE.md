# Allota Pharma CRM — Master Technical Architecture & Developer Handbook

> **System Purpose:** Enterprise AI Telephony, Meta Suite & Lead Floor CRM specifically engineered for Indian PCD Pharma Franchises, Ethical Marketing Teams, and Third-Party Pharmaceutical Manufacturers.
> **Production Live URL:** [https://allota.vercel.app](https://allota.vercel.app)

---

## Table of Contents
1. [High-Level Architectural Overview](#1-high-level-architectural-overview)
2. [Technology Stack](#2-technology-stack)
3. [Multi-Tenant Isolation & Security Model](#3-multi-tenant-isolation--security-model)
4. [Core Modules Deep Dive](#4-core-modules-deep-dive)
   - [4.1 Authentication & Session Management](#41-authentication--session-management)
   - [4.2 Lead Center & Distribution Engine](#42-lead-center--distribution-engine)
   - [4.3 AI Telephony & Audio Intelligence Desk](#43-ai-telephony--audio-intelligence-desk)
   - [4.4 Meta Suite & Social Media Community Inbox](#44-meta-suite--social-media-community-inbox)
   - [4.5 Meta Ads Insights Engine](#45-meta-ads-insights-engine)
   - [4.6 WhatsApp Companion Multi-Device Desk](#46-whatsapp-companion-multi-device-desk)
   - [4.7 Franchise Accounts, Territories & Reorders](#47-franchise-accounts-territories--reorders)
   - [4.8 Field Rep / Telecaller Workdesk](#48-field-rep--telecaller-workdesk)
5. [Database Architecture & Data Dictionary](#5-database-architecture--data-dictionary)
6. [API Route Directory](#6-api-route-directory)
7. [Developer Runbook & Onboarding Guide](#7-developer-runbook--onboarding-guide)
8. [Troubleshooting & Maintenance Runbooks](#8-troubleshooting--maintenance-runbooks)

---

## 1. High-Level Architectural Overview

Allota Pharma CRM operates on a **Single-Codebase, Multi-Tenant Cloud Architecture** deployed on Vercel with PostgreSQL as the persistent data layer. The system is designed around high floor velocity: telecallers process dozens of inquiries per day, while managing directors require executive Hinglish call briefs, commercial intent scores, and unified Meta social interactions.

```mermaid
flowchart TD
    subgraph Clients["Client Access Layers"]
        AdminDesk["Executive / Admin Console\n(/admin)"]
        RepWorkdesk["Sales Rep Workdesk\n(/employee)"]
        SuperAdmin["Super Admin Console\n(/super-admin)"]
    end

    subgraph AppServer["Next.js 16 App Router (Vercel)"]
        Middleware["Middleware (Session Auth & Tenant Context)"]
        TenantSecurity["Tenant Isolation Guard (@/lib/tenant-credentials)"]
        CryptoEngine["AES-256-GCM Secret Crypto (@/lib/secret-crypto)"]
        AIEngine["Google Gemini Multimodal Audio Pipeline (@/lib/gemini)"]
    end

    subgraph ExternalAPIs["Integrated External Services"]
        MetaGraph["Meta Graph API v19.0\n(Pages, Instagram, Marketing API)"]
        GoogleDrive["Google Drive Scraper / Storage\n(Audio Call Recordings)"]
        WhatsAppNet["WhatsApp Multi-Device Network\n(@whiskeysockets/baileys)"]
        TwilioVoice["Twilio Telephony Bridge (Optional)"]
    end

    subgraph DatabaseLayer["Persistent Storage"]
        PostgreSQL[("PostgreSQL Database\n(Prisma 7 + Driver Adapter)")]
    end

    Clients --> Middleware --> AppServer
    AppServer --> TenantSecurity
    TenantSecurity --> MetaGraph
    TenantSecurity --> GoogleDrive
    TenantSecurity --> WhatsAppNet
    TenantSecurity --> TwilioVoice
    AppServer --> CryptoEngine --> PostgreSQL
```

---

## 2. Technology Stack

| Layer | Framework / Technology | Purpose |
| :--- | :--- | :--- |
| **Fullstack Framework** | **Next.js 16.3.4 (App Router)** | Server Components, Server Actions, Route Handlers, Edge Middleware |
| **Language & Runtime** | **TypeScript 5, Node.js 24 LTS** | End-to-end type safety |
| **Database ORM** | **Prisma 7.10.0 (`@prisma/client`)** | Type-safe queries using `@prisma/adapter-pg` driver adapter |
| **Database Engine** | **PostgreSQL (Neon Cloud / Local)** | Relational data persistence with strict foreign keys and indexes |
| **Styling & Design** | **Tailwind CSS v4** | Pure modern CSS engine with custom `@theme inline` palette & Neumorphic Glass UI (`neo-panel`, `neo-button`) |
| **AI Diarization & Audio** | **Google Gemini 2.5 Flash** | Multimodal audio transcription, speaker diarization, Hinglish summaries |
| **Meta Integrations** | **Meta Graph API v19.0** | Facebook Page feed, Instagram Business account media & comments, Marketing Ads Insights |
| **WhatsApp Engine** | **`@whiskeysockets/baileys` v6.7.24** | Self-hosted WhatsApp Web Companion pairing without per-message API fees |
| **Spreadsheet Engine** | **`xlsx` v0.18.5** | High-performance Excel parsing & lead export |
| **Security & Crypto** | **Node.js `crypto` (AES-256-GCM)** | At-rest encryption for company access tokens and secrets |

---

## 3. Multi-Tenant Isolation & Security Model

All companies share a single high-performance database instance. Data isolation is maintained through strict **Row-Level Tenant Scoping** and build-time safety verification:

### 3.1 The Tenant Credentials Engine (`src/lib/tenant-credentials.ts`)
To eliminate cross-company API calling and credential leakage, all third-party sync operations pass through `resolveCompanyMetaCredentials`:
1. **Official Brands (Kesrox & Ekonmed)**:
   - Kesrox is strictly locked to Page ID `112876304657266`, Ad Account `120232655993370513`, and Kesrox's base64-encoded permanent token.
   - Ekonmed is strictly locked to Page ID `1342042688984003` and Ekonmed's permanent token.
   - Cross-calling is blocked: If Kesrox settings ever contain Ekonmed's Page ID, or vice versa, the request is blocked with a security violation error.
2. **Custom / New Tenants**:
   - Must provide their own `metaPageId` and `metaAccessToken` in `CompanySettings`.
   - Never fall back to global environment tokens or other tenants' credentials.
   - Any attempt to query Page IDs belonging to another tenant is blocked with a `Cross-tenant safety block`.

### 3.2 Automated CI Tenant Safety Guard (`scripts/check-tenant-safety.mjs`)
Every build runs `node scripts/check-tenant-safety.mjs` before compiling Next.js. It statically analyzes all source code to prevent:
- **Fail-open company filters**: Queries without explicit `companyId` scoping.
- **Hardcoded secrets**: Plaintext Meta tokens (`EAA...`) or Google keys (`AIza...`).
- **Unencrypted raw Prisma access**: Bypassing AES-256-GCM secret hooks.

### 3.3 Secrets Encryption at Rest (`src/lib/secret-crypto.ts`)
All sensitive fields in `CompanySettings` (`metaAccessToken`, `metaApiKey`, `geminiApiKey`, `twilioAuthToken`, etc.) are encrypted before writing to PostgreSQL:
- **Format**: `enc:v1:<base64( iv(12) | authTag(16) | ciphertext )>`
- **Algorithm**: `AES-256-GCM` with Authenticated Additional Data (`AAD`).
- Transparent decryption occurs automatically via Prisma `$extends` query extensions in [`src/lib/prisma.ts`](file:///Users/kartikchaudhary/revix/pharma-crm/src/lib/prisma.ts).

---

## 4. Core Modules Deep Dive

### 4.1 Authentication & Session Management
- **Routes**: `/login`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.
- **Mechanics**:
  - Passwords hashed with `bcryptjs` (salt rounds: 10).
  - Sessions issued as signed JWT tokens stored in the `pharma_crm_session` HTTP-only cookie.
  - Payloads contain `userId`, `role` (`ADMIN`, `EMPLOYEE`, `SUPER_ADMIN`), `employeeId`, and `companyId`.
  - Super admins can dynamically impersonate any tenant via `/api/super-admin/impersonate` without modifying database ownership.

### 4.2 Lead Center & Distribution Engine
- **Routes**: `/admin/leads`, `/admin/leads-iq`, `/admin/leads-reassign`, `/admin/dead-leads`.
- **Capabilities**:
  - **Bulk Upload (`/api/admin/leads/upload`)**: Ingests `.xlsx` or `.csv` files using `xlsx`. Automatically normalizes Indian phone numbers (10 digits / `+91`) and detects duplicates against existing leads in the company.
  - **Round-Robin Allotment (`/api/admin/leads/reassign`)**: Automatically distributes unassigned leads evenly among active telecallers.
  - **Dead Leads Revival (`/admin/dead-leads`)**: Isolates non-responsive leads for secondary WhatsApp revival campaigns.
  - **Excel Export (`/api/admin/leads/export`)**: Generates an audit sheet with contact details, status, assigned rep, and territory.

### 4.3 AI Telephony & Audio Intelligence Desk
- **Routes**: `/admin/calls`, `/api/telephony/sync-drive`, `/api/telephony/upload-recording`.
- **Mechanics**:
  1. **Drive Ingestion**: Telecallers upload recordings to Google Drive (or use cloud bridging). The sync engine lists audio files (`.m4a`, `.mp3`, `.wav`) without requiring Google Cloud OAuth credentials via embedded scraping.
  2. **Multimodal Audio Processing**: The raw audio buffer is base64-encoded and transmitted directly to Google Gemini 2.5 Flash via REST endpoint.
  3. **Output Extraction**:
     - **Verbatim Transcript**: Speaker-diarized dialogue (`Employee: ... \n Customer: ...`).
     - **Executive Briefing**: 2-3 sentence summary in natural, conversational Hinglish.
     - **Commercial Lead Verdict**: Categorized into `🔥 Hot Lead`, `⚡ Warm Lead`, `❄️ Cold Lead`, or `💀 Dead Lead`.
     - **Territory & Molecule Extraction**: Extracts inquired districts (e.g., *Gorakhpur, Bhopal*) and molecules (e.g., *Cefixime, Derma range*).
  4. **1-Tap WhatsApp Recovery**: If a call was missed or unanswered, admins can click "Send WhatsApp Alert" to open pre-crafted Hindi apology/inquiry messages on `wa.me`.

### 4.4 Meta Suite & Social Media Community Inbox
- **Routes**: `/admin/social-inbox`, `/api/social-inbox/sync`, `/api/social-inbox/[id]/reply`, `/api/social-inbox/[id]/draft`.
- **Mechanics**:
  1. **Sync Action**: Resolves the company's permanent System User token, exchanges it for an official **Page Access Token** via `/v19.0/{page-id}?fields=access_token`, and pulls the latest Page feed and Instagram Business Media.
  2. **Creative Classification**: Analyzes post metadata to tag each interaction as `POST`, `REEL`, or `AD` (sponsored/promoted post).
  3. **Interactive Replying**: Admins reply directly inside the CRM. The `/api/social-inbox/[id]/reply` endpoint calls Meta's Graph API (`/{comment-id}/comments` or `/me/messages`).
  4. **AI Reply Drafter**: Uses Gemini to formulate polite, professional Hinglish distributor inquiry responses with 1 tap.

### 4.5 Meta Ads Insights Engine
- **Routes**: `/admin/ads-insights`, `/api/ads-insights/sync`.
- **Mechanics**:
  - Connects to Meta's Marketing API (`https://graph.facebook.com/v19.0/act_{ad-account-id}/campaigns`).
  - Pulls maximum-lifetime insights: Spend, Clicks, Impressions, Reach, Average CTR, and Total Leads.
  - Aggregates geographic location performance to show pharma owners where their ad budget is generating results.
  - Caches data in `MetaSyncLog` so daily visits load instantly without hitting Meta rate limits.

### 4.6 WhatsApp Companion Multi-Device Desk
- **Routes**: `/admin/settings`, `/api/whatsapp-companion/pair`, `/api/whatsapp-companion/incoming`.
- **Mechanics**:
  - Powered by `@whiskeysockets/baileys` directly on the server.
  - Generates standard WhatsApp pairing codes or QR codes on demand.
  - Persists session credentials (`creds.json`, app state keys) directly into the PostgreSQL database with AES-256 encryption.

### 4.7 Franchise Accounts, Territories & Reorders
- **Routes**: `/admin/clients`, `/admin/territories`, `/admin/reorders`, `/admin/stock-iq`.
- **Mechanics**:
  - Manages active pharma distributors, chemists, and PCD franchise partners.
  - Tracks **District Monopoly Rights**: Prevents two distributors from being assigned the same territory for the same product division.
  - Tracks monthly purchase cadence to highlight overdue accounts for repeat stock reorders.

### 4.8 Field Rep / Telecaller Workdesk
- **Routes**: `/employee`, `/employee/leads`, `/employee/clients`.
- **Mechanics**:
  - Clean, distraction-free interface designed for mobile and floor desktop use.
  - Telecallers only see leads explicitly assigned to them.
  - Direct 1-tap WhatsApp and calling actions.

---

## 5. Database Architecture & Data Dictionary

The database schema is defined in [`prisma/schema.prisma`](file:///Users/kartikchaudhary/revix/pharma-crm/prisma/schema.prisma).

```mermaid
erDiagram
    Company ||--o{ User : has
    Company ||--o{ Employee : employs
    Company ||--o{ Lead : owns
    Company ||--o{ Client : manages
    Company ||--o{ Territory : controls
    Company ||--o{ Product : offers
    Company ||--o{ SocialInboxItem : receives
    Company ||--|| CompanySettings : configures
    Employee ||--o{ Call : conducts
    Employee ||--o{ Lead : handles
    Lead ||--o{ Call : logs
```

### Key Models Reference

| Model | Purpose | Key Attributes |
| :--- | :--- | :--- |
| **`Company`** | Tenant root entity | `id`, `name`, `slug`, `domain` |
| **`CompanySettings`** | Configuration & Encrypted API Vault | `metaPageId`, `metaAccessToken`, `metaAdAccountId`, `geminiApiKey`, `driveFolderUrl`, `whatsappSessionData` |
| **`User`** | Authentication identity | `email`, `passwordHash`, `role` (`ADMIN`, `EMPLOYEE`, `SUPER_ADMIN`) |
| **`Employee`** | Telecaller / Field Rep profile | `name`, `phoneNumber`, `companyId`, `userId` |
| **`Lead`** | Prospective distributor inquiry | `name`, `phoneNumber`, `city`, `state`, `source`, `status`, `assignedEmployeeId` |
| **`Call`** | Recorded phone call record | `targetPhone`, `durationSec`, `recordingUrl`, `transcript`, `aiSummary`, `behaviorTags`, `leadScore`, `leadCategory` |
| **`SocialInboxItem`** | Meta Facebook / Instagram interaction | `platform`, `kind`, `externalId`, `fromName`, `text`, `mediaType`, `isAd`, `status`, `repliedText` |
| **`Client`** | Active Franchise Partner | `name`, `phoneNumber`, `city`, `state`, `gstNumber`, `drugLicenseNumber` |
| **`Territory`** | Monopoly geographic allocation | `state`, `district`, `status`, `assignedClientId` |
| **`MetaSyncLog`** | Cached Meta Ads snapshot | `adAccountId`, `summary` (JSON), `syncedAt` |

---

## 6. API Route Directory

All backend endpoints reside in `src/app/api/`:

```
src/app/api/
├── auth/
│   ├── login/route.ts              # Authenticates user & sets JWT cookie
│   ├── logout/route.ts             # Clears session cookie
│   └── me/route.ts                 # Returns current session user payload
├── social-inbox/
│   ├── sync/route.ts               # Fetches live Meta Page feed & Instagram media
│   └── [id]/
│       ├── reply/route.ts          # Dispatches reply to Meta Graph API
│       └── draft/route.ts          # Generates Hinglish AI reply draft via Gemini
├── ads-insights/
│   └── sync/route.ts               # Pulls campaign metrics from Meta Marketing API
├── telephony/
│   ├── sync-drive/route.ts         # Scrapes Drive audio & invokes Gemini diarization
│   ├── upload-recording/route.ts   # Direct audio recording uploader
│   ├── initiate/route.ts           # Twilio outbound call trigger
│   └── bridge-twiml/route.ts       # Twilio TwiML bridge instructions
├── admin/
│   └── leads/
│       ├── upload/route.ts         # Parses Excel/CSV leads with deduplication
│       ├── export/route.ts         # Streams `.xlsx` lead workbook
│       └── reassign/route.ts       # Executes bulk lead reassignments
├── whatsapp-companion/
│   ├── pair/route.ts               # Generates Baileys pairing code / QR code
│   └── incoming/route.ts           # Ingests companion webhook messages
└── super-admin/
    ├── impersonate/route.ts        # Switches active tenant session for debugging
    └── encrypt-secrets/route.ts    # One-time migration to encrypt legacy plaintext credentials
```

---

## 7. Developer Runbook & Onboarding Guide

### 7.1 Local Development Setup

1. **Clone the Repository:**
   ```bash
   git clone git@github.com:revixsolution-glitch/allota.git
   cd allota
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables (`.env`):**
   Copy `.env.example` to `.env` and fill in:
   ```env
   DATABASE_URL="postgresql://user:pass@localhost:5432/pharma_crm_dev?schema=public"
   JWT_SECRET="generate-a-secure-random-64-character-string"
   SETTINGS_ENCRYPTION_KEY="base64-encoded-32-byte-key"
   GEMINI_API_KEY="AIzaSy...your-gemini-key"
   GEMINI_MODEL="gemini-2.5-flash"
   ```

4. **Initialize Database & Prisma Client:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` to view the application.

---

### 7.2 Onboarding a New Pharma Client (Step-by-Step)

1. **Create the Company & Admin Account:**
   - Log into `/super-admin` or insert via Prisma Studio (`npx prisma studio`).
   - Create a `Company` record with `name` (e.g. *BioZenith Lifesciences*) and unique `slug` (e.g. *biozenith*).
   - Create an admin `User` with `role: ADMIN` associated with the company's `id`.

2. **Configure Meta Suite:**
   - Log into the company's admin dashboard at `/login`.
   - Go to **System & Integrations → Meta Suite** (`/admin/settings`).
   - Enter their numeric **Meta Page ID** (found in their Facebook Page About section).
   - Enter their permanent **System User Access Token** generated from Meta Business Manager with permissions:
     - `pages_show_list`
     - `pages_read_engagement`
     - `pages_manage_engagement`
     - `instagram_basic`
     - `instagram_manage_messages`
   - Enter their numeric **Ad Account ID** (e.g. `123456789012345`) to enable Ads Insights.

3. **Configure Telephony / Call Recordings:**
   - Under Settings, enter the Google Drive shared folder URL containing telecaller recordings.
   - Enter their Google Gemini AI API key (or leave empty to inherit system default).

---

## 8. Troubleshooting & Maintenance Runbooks

### Issue 1: Meta Returns "Invalid OAuth 2.0 Access Token"
- **Cause**: Meta User Tokens expire or lack page permissions. Feed/comment endpoints require **Page Access Tokens** on the New Pages Experience.
- **Solution**: The system automatically exchanges system user tokens for page access tokens via `resolvePageAccessToken`. If Meta declines with subcode `2069032`, verify that the system user has full Page management control in Meta Business Manager.

### Issue 2: Google Drive Sync Reports 0 Files
- **Cause**: The Google Drive folder is set to "Restricted" rather than "Anyone with the link can view".
- **Solution**: Open the folder in Google Drive → Share → Change General Access to **"Anyone on the internet with this link can view"**.

### Issue 3: Build Fails with "Tenant-safety check FAILED"
- **Cause**: A developer introduced a raw SQL query or Prisma lookup without a `companyId` scope, or committed a literal `EAA...` token string.
- **Solution**: Run `npm run check:tenant`. Wrap queries with `scopeToCompany(companyId)` from `@/lib/auth` and store all API keys in environment variables or encrypted settings.

---

## 9. Verification & Safety Guarantees

- **No Data Cross-Contamination**: Guaranteed by `resolveCompanyMetaCredentials` and Prisma row-level tenant filters.
- **No API Cost Spikes**: Gemini multimodal diarization runs on lightweight Flash models with duration limits.
- **Zero Plaintext Token Exposure**: Encrypted using AES-256-GCM authenticated crypto at rest.
