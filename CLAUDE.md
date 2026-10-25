# ALLOTA CRM — CORE ARCHITECTURAL PRINCIPLES & TENANT SAFETY RULES

> [!CRITICAL]
> **MULTI-TENANT ISOLATION IS SACROSANCT.**
> Allota CRM hosts multiple pharmaceutical brands, each with their own proprietary customer leads, call recordings, telecaller data, and WhatsApp companion sessions.
> Under NO CIRCUMSTANCE must any feature, test, or code change allow data, credentials, or session state to cross company boundaries.

---

### RULE 1: ZERO GLOBAL STATE FOR TENANT ASSETS
- Never create unpartitioned global variables, in-memory singletons, or shared socket maps for things that belong to a company (WhatsApp sessions, Google Drive folders, API keys, Meta webhooks).
- All companion services, daemons, and background workers must partition active sessions by `companyId`:
  `const sessions = new Map<string, TenantSession>();`
- Every tenant storage path must be partitioned by company ID:
  `const authDir = path.join(BASE_AUTH_DIR, "comp_" + companyId);`

### RULE 2: EXPLICIT `companyId` SCOPING ON EVERY ENDPOINT & QUERY
- Every API route and microservice endpoint that touches tenant state MUST take `:companyId`:
  - `GET /api/:companyId/status` (NEVER `/api/status`)
  - `GET /api/:companyId/qr` (NEVER `/api/qr`)
  - `POST /api/:companyId/disconnect` (NEVER `/api/disconnect`)
- Every database query and mutation must include `companyId`:
  `where: { companyId: activeCompanyId }`

### RULE 3: TEST DATA & DEMO ACCOUNTS NEVER TOUCH PRODUCTION CLIENTS
- All features tested under demo accounts (e.g. "Pharma Life Sciences" / `default`) must be strictly confined to that tenant's workspace.
- Production clients (e.g. Kesrox / `cmub4ssdx00000u8oqlqc62e0`) must never inherit, see, or receive test phones, test leads, or test webhooks.
- Background alert forwarding (e.g. sending WhatsApp leads to team reps like Savi) must be explicitly scoped to that specific company's verified employee master.

### RULE 4: PRE-DEPLOYMENT SAFETY ENFORCEMENT
- `scripts/check-tenant-safety.mjs` must run on every build to guarantee no fail-open company filters or hardcoded secrets are committed.

### RULE 5: ZERO LEAD LOSS & SESSION PERSISTENCE LAWS
- **Permanent Database Vaulting**: All WhatsApp companion sessions, authentication tokens, and cryptographic keys must be dual-written to PostgreSQL database vaults (`CompanySettings.whatsappCompanionCreds`) on every `creds.update` and `connection.open`. Never rely on ephemeral server disks.
- **Fail-Safe DB Upsert**: Never use `updateMany` alone for session backups without an explicit `create` fallback. Silent updates of 0 rows destroy sessions on reboot.
- **24/7 Keep-Alive Guarantee**: Background microservices that process real-time incoming leads (such as Baileys companion daemons on Render) must never sleep. Always enforce multi-layer external keep-alive heartbeats (e.g. GitHub Actions, self-pings every 3 minutes, and watchdog auto-reconnects).
- **Lead Ingestion First**: Always persist incoming leads into PostgreSQL CRM tables (`Lead`) before attempting external alerts or WhatsApp forwarding. If forwarding fails, the lead must still be 100% visible in the CRM dashboard.
