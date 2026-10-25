# ALLOTA CRM — SENIOR ARCHITECT & RELIABILITY MEMORY

This document is the permanent system memory and architectural rulebook for **Allota CRM**.
Every agent and developer working in this codebase must strictly adhere to these tenets to ensure **100% production stability for live onboarding clients**.

---

## 1. INFRASTRUCTURE & ARCHITECTURAL TOPOLOGY

* **Frontend & Main CRM**: Next.js 16 (App Router), deployed on **Vercel** (`https://allota.vercel.app`).
* **Database**: PostgreSQL with Prisma ORM (Strict Multi-Tenant schema).
* **WhatsApp Companion Daemon**: Node.js Baileys microservice running on **Render** (`https://allota-whatsapp-companion.onrender.com`).
* **Key Identifiers**:
  * Default/Demo Tenant (Kesrox): `cmubi8zf6000004l8y45hhuds`
  * Official Kesrox WhatsApp: `+91 74948 09665`
  * Lead Notification Dispatch: Savi WhatsApp (`+91 78891 07964`)

---

## 2. THE 5 NON-NEGOTIABLE LAWS OF ALLOTA

### LAW 1: RENDER / VERCEL ABSOLUTE DECOUPLING
* In `render.yaml`, `autoDeploy: false` is permanently enforced.
* **RULE**: Pushes to `main` for Vercel must NEVER restart, rebuild, or interrupt Render. Render's WhatsApp socket must run 24/7 without rebooting.

### LAW 2: STRICT MULTI-TENANT ISOLATION
* Every database query, state cache, Baileys socket, and webhook event MUST be scoped by `companyId`.
* Never introduce unpartitioned global state.
* Run `npm run check:tenant` to verify tenant safety before any deployment.

### LAW 3: ZERO-STALE CRYPTOGRAPHIC GUARD (WHATSAPP)
* In `companion-service/src/index.ts`, unregistered/aborted pairing sessions must be automatically wiped (`fs.rmSync`) before any new QR code is generated.
* Stale pre-keys or broken session IDs must never touch a new QR code (prevents *"Can't link new devices"* error).
* Valid credentials (`creds.registered === true`) must be immediately vaulted into PostgreSQL (`CompanySettings.whatsappCompanionCreds`).

### LAW 4: SENIOR DEVELOPER PRE-FLIGHT IMPACT ANALYSIS
Before making ANY code modification (even a "small" one), you must complete:
1. **Blast-Radius Assessment**: What other pages, navigation tabs, or filters rely on this file?
2. **State & Cookie Invariant Check**: Does this break URL search params, cookies (`allota_date_range`), or active filters?
3. **Type & Build Check**: Verify zero TypeScript errors and zero missing props.

### LAW 5: NO BLIND EDITS
* When fixing an issue, identify the root cause in code and system logs rather than guessing or making speculative edits.
* Maintain complete documentation integrity and existing comments.
