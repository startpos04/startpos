# StartPOS — Legal & Compliance Master Plan

> **Scope:** Legal readiness, privacy compliance, security hardening, and data governance for a Philippine-market B2B SaaS POS platform.
> **Audience:** Solo founder. Every item is scoped to one person with limited time.
> **Last updated:** August 6, 2026
> **Status:** Phase 0 ✅ complete (2026-08-06). Phase 1 ✅ complete (2026-08-06). Phase 2 ✅ complete (2026-08-06). Phase 3+ deferred to post-launch.

---

## Table of Contents

1. [Context — What Makes StartPOS Different from Generic SaaS](#1-context--what-makes-startpos-different-from-generic-saas)
2. [What Is Already Implemented](#2-what-is-already-implemented)
3. [Phase 0 — Pre-Launch Gate](#3-phase-0--pre-launch-gate)
4. [Phase 1 — First Paying Merchants (0–10 users)](#4-phase-1--first-paying-merchants-010-users)
5. [Phase 2 — Growth (10–50 merchants)](#5-phase-2--growth-1050-merchants)
6. [Phase 3 — Scale (50–100 merchants)](#6-phase-3--scale-50100-merchants)
7. [Phase 4 — Mature SaaS (100+ merchants)](#7-phase-4--mature-saas-100-merchants)
8. [Permanently Deferred](#8-permanently-deferred)
9. [Implementation Reference — Code Changes by Phase](#9-implementation-reference--code-changes-by-phase)

---

## 1. Context — What Makes StartPOS Different from Generic SaaS

A standard SaaS compliance checklist does not apply cleanly to StartPOS because the platform operates in two data roles simultaneously.

### 1.1 Dual Data Role

| Role | What it means | Who it applies to |
|---|---|---|
| **Data Controller** | StartPOS decides the purpose and means of processing its own users' data (merchant ADMIN accounts, subscription records, billing) | StartPOS the company |
| **Data Processor** | StartPOS processes end-customer data on behalf of merchants | Every merchant using the platform |

Most generic SaaS checklists are written for the Controller role only. StartPOS also operates as a Processor because merchants use the platform to record their own customers' data: names, phone numbers, emails, SC/PWD IDs, TINs, and addresses at POS checkout. That data belongs to the merchant's customers, not to StartPOS.

Under the **Philippine Data Privacy Act (RA 10173)**, Processors have statutory obligations separate from Controllers. A standard Privacy Policy does not discharge Processor obligations — a Data Processing Agreement (DPA) clause in the Terms of Service is required.

### 1.2 Sensitive Data Classes Present in the System

The following data is already being stored and requires specific legal treatment:

| Data | Location in schema | Sensitivity | Legal basis required |
|---|---|---|---|
| SC/PWD name and ID number | `Transaction.complianceData` (JSON) | **Health-related PII** — highest protection under RA 10173 | BIR-mandated recording; must be disclosed in Privacy Policy |
| Buyer TIN and address | `Transaction.buyerTaxId`, `Transaction.buyerAddress` | PII + fiscal data | BIR-mandated for invoices above ₱1,000 |
| Customer name, phone, email | `Customer.*` | Standard PII | Merchant must obtain customer consent; disclosed in DPA clause |
| Employee name, email, IP, work history | `User.*`, `Session.ipAddress`, `InventoryMovement.*` | Employee PII | Merchant's HR responsibility; disclosed in DPA clause |
| Subscription billing data | `BillingInvoice.*`, `CreditLedger.*` | Financial PII | Standard SaaS; covered by standard Privacy Policy |

### 1.3 BIR Retention Creates a Conflict with "Right to Deletion"

Merchants may request account deletion. Under **RA 10173**, data subjects have a right to erasure. Under **BIR Revenue Regulations 17-2013** (and related issuances), official receipts and supporting accounting records must be retained for **10 years**.

This means:
- **Transaction records containing BIR-required data cannot be deleted on request.**
- Account deletion in StartPOS means *access termination*, not *data deletion*.
- The Terms of Service must state this explicitly before merchants sign up.

### 1.4 The 50-Transaction Freemium Gate Is a Contractual Term

The registration page states: *"Get started with 50 free transactions — no card required."*

When the 50-transaction limit is reached, POS checkout is blocked. A merchant who has onboarded their products, trained their staff, and begun operating has a reasonable expectation that this condition was disclosed. The Terms of Service must define:

- The exact limit (50 transactions)
- What happens when the limit is reached (checkout blocked, data retained)
- How to upgrade
- What happens to data if they never upgrade (retention policy applies)

Without this, a merchant could claim misrepresentation.

---

## 2. What Is Already Implemented

The following items from standard compliance checklists are **already done** in the codebase. They do not require additional work.

### Authentication & Session Security

| Item | Status | Evidence |
|---|---|---|
| Password hashing | ✅ Done | better-auth with bcrypt via `prismaAdapter` |
| Email OTP verification | ✅ Done | `emailOTP` plugin, Resend, 10-minute expiry |
| Password reset | ✅ Done | `/forgot-password` route exists |
| Session expiration | ✅ Done | `Session.expiresAt` enforced by better-auth |
| Session IP and user agent recording | ✅ Done | `Session.ipAddress`, `Session.userAgent` |
| Cookie-based secure session management | ✅ Done | `tanstackStartCookies()`, trusted origins scoped |
| Social OAuth (Google, Facebook) | ✅ Done | Conditional on env vars |

### Authorization

| Item | Status | Evidence |
|---|---|---|
| Role-based access control (RBAC) | ✅ Done | `Role` enum (ADMIN, SUPERVISOR, CASHIER, SERVICE_PROVIDER); enforced in all routes |
| Capability/feature gating | ✅ Done | `EntitlementEngine` + `requireCapability()` middleware — server-side, DB-authoritative |
| Tenant isolation | ✅ Done | `getTenantPrisma` scopes all queries by `businessId`; enforced at infrastructure layer |
| Branch isolation | ✅ Done | `branchId` on sessions and all operational models |
| Server-side auth enforcement | ✅ Done | `entitlement-middleware.ts` rebuilds context from DB on every server function call |

### Payments

| Item | Status | Evidence |
|---|---|---|
| No card data stored | ✅ Done | `Payment` stores `referenceNo`, `method`, `platform` only. Stripe Checkout handles card data. |
| Webhook signature verification | ✅ Done | Raw body + `stripe-signature` verified before any processing |
| Idempotent webhook processing | ✅ Done | Duplicate delivery is safe — all handlers check existing state before writing |

### Data Export

| Item | Status | Evidence |
|---|---|---|
| Transaction CSV export | ✅ Done | `downloadTransactionsCSV` — entitlement-gated (EXPORT_DATA) |
| Inventory CSV export | ✅ Done | `downloadInventoryCsv` — entitlement-gated |

### Audit Trail (partial)

| Item | Status | Evidence |
|---|---|---|
| Billing status audit | ✅ Done | `SubscriptionStatusHistory` — immutable append-only log |
| Inventory movement audit | ✅ Done | `InventoryMovement` records all stock changes with `userId` |
| Transaction cashier trail | ✅ Done | `Transaction.cashierId` links every sale to a staff member |
| Business event log | ✅ Done | `BusinessEventLog` — captures analytics events with `actorId` |

### Secrets and Infrastructure

| Item | Status | Evidence |
|---|---|---|
| Secrets in environment variables | ✅ Done | `.env` is gitignored; all keys use `process.env['KEY']` pattern |
| Cross-origin isolation headers | ✅ Done | `vite.config.ts` — `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy` |

### Support Contact

| Item | Status | Evidence |
|---|---|---|
| Support contact page | ✅ Done | `/contact-us` — `support@start-pos.app` + Facebook link |

---

## 3. Phase 0 — Pre-Launch Gate

**Trigger:** Before any public user signs up.
**Goal:** Minimum viable legal and technical foundation. Nothing that requires external registration or certification.

### 3.1 Legal Documents (Content — No Code Required)

These are documents, not features. A solo founder can write them in a few hours using a generator as a starting point, then customizing for the StartPOS-specific items below.

#### Terms of Service

Must explicitly include — beyond standard SaaS boilerplate:

- **The 50-transaction freemium condition** — exact limit, what blocks, how to upgrade, what happens to data if a merchant never upgrades
- **BIR 10-year retention clause** — transaction data containing BIR-required fields cannot be deleted on request; account deletion means access termination, not data deletion
- **Merchant data responsibility clause** — merchant warrants they have obtained all necessary consents from their employees and end-customers before recording their data in StartPOS
- **BIR TIN warranty** — merchant warrants that all compliance data (TIN, PTU number) entered into the system is accurate; StartPOS is not responsible for incorrect BIR data on printed receipts
- **Data Processing clause** — StartPOS acts as a Data Processor for merchant customer data; merchant is the Data Controller; merchant accepts responsibility for compliance with RA 10173 toward their own data subjects
- **Subscription and billing terms** — plan limits, overage behavior, grace period policy, cancellation terms

#### Privacy Policy

Must explicitly disclose — beyond standard SaaS boilerplate:

- **SC/PWD data** — the platform records SC/PWD beneficiary name and ID number in transaction records as required by BIR; this is health-related PII under RA 10173; it is retained for the BIR-mandated 10-year period
- **Employee data** — merchants add employee accounts; employee names, email addresses, session IP addresses, and work history (transactions processed, tasks performed) are stored on behalf of the merchant
- **End-customer data** — merchants record customer names, phone numbers, emails, TINs, and addresses; this data is processed on behalf of the merchant who is the Data Controller
- **Retention periods** — transaction data: 10 years (BIR); session data: X days after expiry; subscription/billing data: 7 years (standard accounting)
- **Data export** — merchants can export their data via the CSV export feature
- **Account deletion** — what data is deleted vs. retained on account closure

#### Refund and Cancellation Policy

Must include:
- Subscription cancellation process
- What happens to data after cancellation (retained per retention policy; accessible on request for X days)
- Credit purchases — whether credits are refundable
- The freemium-to-paid upgrade path

#### Cookie Policy

Minimal. StartPOS uses only strictly necessary session cookies (better-auth). No consent banner required unless analytics scripts are added. Document this so it's clear.

### 3.2 Consent Recording at Registration (Code Required)

**Current state:** `register.tsx` has no ToS/Privacy Policy checkbox. No acceptance is recorded anywhere.

**Required changes:**

1. Add a checkbox to the Step 1 form in `register.tsx`:
   > "I agree to the Terms of Service and Privacy Policy"

2. Add fields to the `User` model in `schema.prisma`:
   ```prisma
   termsAcceptedAt   DateTime?
   termsVersion      String?   // e.g. "2026-08-01"
   privacyAcceptedAt DateTime?
   privacyVersion    String?
   ```

3. Pass `termsAcceptedAt` and `termsVersion` to `completeRegistration` and write them to the `User` record in Step 3b of the transaction.

4. The IP address is already in `Session.ipAddress`. No additional IP recording needed.

**Legal effect:** Establishes that the merchant accepted the specific version of the ToS before accessing the service. Required for enforcement.

### 3.3 HTTPS

No code change required. Verify that the production deployment host (Vercel, Railway, Render, etc.) enforces HTTPS with auto-redirect. This is a one-click setting in every major host. Confirm before first user.

### 3.4 Production Backups

No code change required. Enable automated daily backups in the database hosting service. Most providers (Supabase, Neon, Railway) offer this as a toggle. Confirm before first user.

---

## 4. Phase 1 — First Paying Merchants (0–10 users)

**Trigger:** First subscription payment received.
**Deferred item from Phase 0:** Business registration (DTI/SEC + BIR) deferred to 10 active paying users per founder decision.

### 4.1 Business Registration (Deferred — Due at 10 Paying Users)

When the 10-user threshold is reached:
- Register with DTI (sole proprietorship) or SEC (OPC/corporation)
- Register with BIR — obtain TIN, register the business, obtain ATP (Authority to Print) if issuing printed official receipts through the platform
- Open a business bank account
- Update the Privacy Policy and ToS to reflect the registered business entity

**Note on ATP:** StartPOS generates BIR-format official receipts with TIN, PTU number, and OR number sequences. Merchants enter their own compliance data. Whether StartPOS itself needs an ATP depends on whether the platform is the one "issuing" receipts — clarify with a BIR consultant. For now, the receipt is generated by the merchant's device, using the merchant's credentials, which is the safer interpretation.

### 4.2 Audit Log for Admin Actions (Code Required)

**Current gap:** Destructive and privilege-elevating admin actions have no audit trail. A merchant ADMIN can delete employees, change roles, modify prices, and authorize refunds with no record of who did it.

**Why this matters legally:** If a merchant disputes a transaction, claims an employee made unauthorized changes, or files a complaint, you have no evidence of what happened at the admin level.

**Add an `AuditLog` model:**

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  actorId    String   // userId who performed the action
  action     String   // e.g. "EMPLOYEE_DELETED", "ROLE_CHANGED", "PRICE_UPDATED"
  targetType String   // e.g. "User", "ProductVariant", "Transaction"
  targetId   String
  before     Json?    // snapshot before change (for reversible actions)
  after      Json?    // snapshot after change
  ipAddress  String?
  createdAt  DateTime @default(now())

  @@index([businessId, createdAt])
  @@index([actorId])
  @@map("audit_logs")
}
```

**Actions to log initially (minimum viable):**
- Employee created, edited, deleted
- Role changed
- Refund issued (already has `cashierId` but add an explicit audit entry)
- Subscription plan changed
- Business settings changed (VAT rate, price configuration)

### 4.3 Account Deletion Workflow (Code Required)

**Current gap:** `User.deletedAt` and `Business.deletedAt` fields exist but no workflow is implemented. A merchant has no way to request account deletion.

**What deletion means for StartPOS (due to BIR retention):**
- **Access deletion:** User and Membership records soft-deleted; login blocked
- **Data retained:** All `Transaction`, `TransactionTaxLine`, `Payment`, and `InventoryMovement` records retained for 10 years
- **Data deleted (eventually):** Products, categories, settings, non-financial operational data — can be purged after 30–90 days

**Minimum implementation:**
1. A settings page action: "Delete my account" — sends an email request to support
2. An admin-side process to execute the soft-delete and notify the merchant
3. The `User.deletedAt` already prevents login if checked in the auth flow

**Full implementation (Phase 2):** A structured deletion workflow with automatic data classification and tiered retention.

### 4.4 Login History Page (Low Effort)

The data is already there. `Session` stores `ipAddress`, `userAgent`, `createdAt`, `expiresAt`. Surface this in the employee detail page or a "Security" section in Settings so merchants can see recent logins for their account.

**Effort:** One query + one UI component. Uses `crudAPI` pattern.

### 4.5 Rate Limiting and Account Lockout

**Current gap:** better-auth supports both features via configuration. Not enabled.

**What to add in `auth.ts`:**
```ts
rateLimit: {
  window: 60,     // 60-second window
  max: 10,        // max 10 auth requests per window
},
account: {
  accountLockout: {
    enabled: true,
    maxAttempts: 10,
    lockoutDuration: 5 * 60, // 5 minutes
  },
}
```

**Effort:** Two configuration additions. No new code.

---

## 5. Phase 2 — Growth (10–50 merchants)

**Trigger:** Platform is live with paying users, business is registered, BIR compliance is in order.

### 5.1 Security Headers in Production (Low Effort)

**Current gap:** `vite.config.ts` sets cross-origin isolation headers for dev/preview only. Production responses have no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, or `X-Content-Type-Options`.

**Add to the Nitro/Vite config or the hosting platform:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
```

The CSP needs to be tailored to what the app actually loads (Stripe.js, Resend, Google/Facebook OAuth). Start with a report-only mode to identify violations before enforcing.

### 5.2 Terms and Privacy Policy Versioning (Code Required)

**Current gap:** No version tracking. If the ToS is updated, merchants cannot be prompted to re-accept.

**Minimum schema addition:**
```prisma
// On User model — already has termsAcceptedAt from Phase 0
termsVersion      String?
privacyVersion    String?
```

**Behavior:**
- On login, compare `user.termsVersion` against `CURRENT_TERMS_VERSION` constant
- If outdated, show a modal requiring acceptance before proceeding
- Record new version + timestamp on acceptance

**When to require re-acceptance:** Only on material changes — changes to data retention policy, new data categories collected, changes to merchant obligations.

### 5.3 Session Management UI (Low Effort)

Merchants should be able to view and revoke their own active sessions. The employee detail page at `/employees/$employeeId` already shows session data. Extend this to the user's own "Security" settings page.

**What to show:** Device/browser (from `userAgent`), IP, last active, ability to revoke (delete the session record).

### 5.4 Data Retention Enforcement Job

**Current gap:** Soft-deleted records accumulate indefinitely. No job exists to enforce retention periods.

**What to build:** A background job (cron) that:
1. Identifies `Business` records where `deletedAt` is older than 90 days
2. Purges non-financial data: products, categories, units, settings, operational tasks, notifications
3. Retains: `Transaction`, `TransactionTaxLine`, `Payment`, `InventoryMovement`, `BillingInvoice`, `CreditLedger` (10-year BIR retention)
4. Logs the purge action

**Pattern:** Same as `subscription-lifecycle.ts` background job — scheduled, idempotent, logs warnings.

### 5.5 Two-Factor Authentication (Medium Effort)

better-auth has a `twoFactor` plugin supporting TOTP (authenticator apps). This is a configuration + UI addition — the underlying cryptography is provided.

**Priority:** Medium. Required for merchants who process high transaction volumes or manage multiple employees. Not blocking for initial growth.

---

## 6. Phase 3 — Scale (50–100 merchants)

**Trigger:** Platform is generating consistent revenue. Compliance infrastructure needs to match merchant expectations.

### 6.1 Privacy Center (Merchant-Facing)

A dedicated settings section where a merchant can:
- Download all their business data (full structured export beyond CSV)
- View consent history (when they accepted which ToS/Privacy Policy version)
- Submit a formal data deletion request (routed to support with pre-filled business info)
- View data retention policy specific to their account

### 6.2 Structured Account Deletion Workflow

Replace the Phase 1 email-based process with a proper in-app workflow:
1. Merchant initiates deletion from settings
2. System shows a summary of what will be deleted vs. retained and why
3. Merchant confirms
4. Automated: soft-delete access, revoke all sessions, queue data purge job
5. Email confirmation with summary of what was retained and the legal basis

### 6.3 Security Notifications

Email or in-app notifications for:
- Login from a new device or IP
- Password changed
- Admin role granted to a new user
- Account deletion initiated

### 6.4 Subscription Invoice Download for Merchants

**Current gap:** `BillingInvoice` model exists with full lifecycle but the UI for a merchant to download their own subscription invoices is unclear. Merchants need receipts for their own bookkeeping and BIR compliance.

**Add to the billing settings page:** A table of `BillingInvoice` records with status and a download link. Use the `crudAPI` pattern — no `createServerFn` needed.

---

## 7. Phase 4 — Mature SaaS (100+ merchants)

### 7.1 National Privacy Commission Registration

Under RA 10173, organizations that control or process personal information of 1,000 or more data subjects are required to register with the National Privacy Commission (NPC). Track the merchant user count; register when approaching this threshold.

### 7.2 Data Protection Officer (DPO)

At the same threshold (or earlier if handling health data at scale), the DPA requires designating a DPO. For a solo founder this may mean engaging a consultant rather than hiring.

### 7.3 Enterprise-Readiness

- SSO (SAML/OIDC) — for enterprise merchants
- SCIM provisioning — for enterprise employee management
- Formal penetration testing
- Independent security audit
- ISO 27001 gap assessment (not certification — assessment only, to know where you stand)

---

## 8. Permanently Deferred

These items are on standard compliance checklists but are explicitly out of scope for StartPOS at this scale:

| Item | Reason |
|---|---|
| ISO 27001 certification | Requires dedicated compliance team, external auditor |
| SOC 2 certification | Requires dedicated compliance team, external auditor |
| Bug bounty program | Premature at <100 merchants |
| Formal vulnerability disclosure program | Premature at <100 merchants |
| Dedicated compliance officer | Solo founder scale |
| Automated compliance reporting | Enterprise-only requirement |
| SCIM provisioning | Enterprise-only; build when first enterprise customer asks |

---

## 9. Implementation Reference — Code Changes by Phase

A quick-reference for what actually needs to be built, in order.

### Phase 0 Code Changes

| Task | File(s) | Effort | Status |
|---|---|---|---|
| Add ToS/Privacy checkbox to registration form | `src/routes/(public)/register.tsx` | 1–2 hours | ✅ Done (2026-08-06) |
| Add consent fields to User model | `prisma/schema.prisma` | 30 min + migration | ✅ Done (2026-08-06) |
| Write consent fields in `completeRegistration` | `src/lib/queries/complete-registration.ts` | 1 hour | ✅ Done (2026-08-06) |
| Verify HTTPS on production host | Hosting platform settings | 15 min | ⬜ Manual — confirm before first user |
| Enable daily DB backups | Hosting platform settings | 15 min | ⬜ Manual — confirm before first user |

### Phase 1 Code Changes

| Task | File(s) | Effort | Status |
|---|---|---|---|
| Add `AuditLog` model | `prisma/schema.prisma` | 30 min + migration | ✅ Done (2026-08-06) |
| Write audit entries for destructive admin actions | `write-audit.ts`, employee + refund files | 3–4 hours | ✅ Done (2026-08-06) |
| Account deletion email request | `request-account-deletion.ts` + Settings → Account tab | 2 hours | ✅ Done (2026-08-06) |
| Login history UI | `fetch-login-history.ts` + Settings → Security tab | 2–3 hours | ✅ Done (2026-08-06) |
| Enable better-auth rate limiting and lockout | `src/lib/better-auth/auth.ts` | 30 min | ✅ Done (2026-08-06) |
| Business registration (at 10 paying users) | External process, not code | — | ⬜ Manual |

### Phase 2 Code Changes

| Task | File(s) | Effort | Status |
|---|---|---|---|
| Security headers | `vite.config.ts` / Nitro config | 2–3 hours | ✅ Done (2026-08-06) |
| Terms version check on login | `src/routes/(private)/route.tsx` | 3–4 hours | ✅ Done (2026-08-06) |
| Session revocation UI | Settings → Security tab | 1 hour | ✅ Done (2026-08-06) |
| Data retention background job | `src/lib/jobs/data-retention.ts` | 4–6 hours | ⏭️ Post-launch |
| 2FA UI | Settings + better-auth `twoFactor` plugin | 4–6 hours | ⏭️ Post-launch |

### Phase 3 Code Changes

| Task | File(s) | Effort |
|---|---|---|
| Privacy Center page | `/settings/privacy` route | 4–6 hours |
| Structured deletion workflow | Settings + job | 6–8 hours |
| Security notifications | Notification engine additions | 3–4 hours |
| Subscription invoice download | Billing settings page | 2–3 hours |

---

## Appendix — Philippine Legal Reference

| Regulation | Relevance to StartPOS |
|---|---|
| RA 10173 — Data Privacy Act of 2012 | Primary privacy law. StartPOS is both Controller (own user data) and Processor (merchant customer data). |
| IRR of RA 10173 | Requires DPA with sub-processors; security measures; NPC registration at 1,000 data subjects. |
| BIR Revenue Regulations 17-2013 | 10-year retention for books of accounts and accounting records including official receipts. |
| BIR RMO 12-2013 | Authority to Print requirements for official receipts. |
| DTI / SEC registration | Business registration. Deferred to 10 active paying users. |
| Consumer Act (RA 7394) | Consumer rights — disclosure of terms, no misleading representations. Relevant to the 50-transaction freemium gate disclosure. |

---

*This document is a living plan. Update it when implementation is completed, when regulations change, or when new data categories are added to the system.*
