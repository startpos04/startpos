# Compliance UX Improvement Plan

**Date:** 2026-08-25  
**Status:** 📋 PLANNED  
**Priority:** HIGH (Affects onboarding UX for unregistered businesses)

---

## Problem Statement

Current implementation validates compliance data but uses **soft validation** (warnings only). This allows unregistered businesses to use the system, but we need better UX to:

1. Guide business owners through the registration process
2. Track registration status (unregistered → pending → registered)
3. Prompt admins to complete registration when ready
4. **Never interrupt cashier workflows** - POS must operate smoothly

---

## Core Principle

**⚠️ CRITICAL: Clean, Unobtrusive UX**

- **No banners or modals** - These are intrusive and annoying
- **App bar indicator** - Subtle icon showing status (admin/manager only)
- **Dashboard section** - Informational card alongside other metrics
- **Cashiers see nothing** - POS operates normally, no distractions
- **Settings page** - Full control over registration status and data

---

## Proposed Solution

### Phase 1: Business Registration Status Tracking

Add a new field to track registration status:

```prisma
// In base/business.prisma
enum BusinessRegistrationStatus {
  UNREGISTERED    // No official registration yet
  PENDING         // Have documents, filling in compliance data
  REGISTERED      // Fully registered with government
  EXPIRED         // Registration expired (for renewal tracking)
}

model Business {
  // ... existing fields
  registrationStatus BusinessRegistrationStatus @default(UNREGISTERED)
  registrationCompletedAt DateTime?
}
```

**Default Behavior:**
- New businesses start as `UNREGISTERED`
- Can be updated via survey or Settings
- Status determines what banners show on dashboard

### Phase 2: Onboarding Survey Enhancement

Add a question to the adaptive survey:

**Question:** "Is your business officially registered with the government?"

Options:
- ✅ **Yes, I have my registration documents** → Set status to `PENDING`, prompt for compliance data after registration
- ❌ **No, not yet** → Set status to `UNREGISTERED`, skip compliance, show dashboard guidance
- ⏳ **In progress** → Set status to `PENDING`, show "come back when ready" message

**Survey File:** `web/src/lib/onboarding/survey-questions.ts`

```typescript
{
  id: 'business_registration',
  text: 'Is your business officially registered?',
  type: 'single-choice',
  options: [
    { value: 'REGISTERED', label: 'Yes, I have my registration documents' },
    { value: 'UNREGISTERED', label: 'No, not yet' },
    { value: 'PENDING', label: 'Registration is in progress' },
  ],
  required: true,
}
```

**Survey Logic:**
- If `REGISTERED` selected → After completing onboarding, redirect to `/settings/compliance` with prompt
- If `UNREGISTERED` → Complete onboarding normally, show dashboard banner later
- If `PENDING` → Complete onboarding, show "complete when ready" banner

### Phase 3: App Bar Status Indicator (Subtle, Always Visible)

Small icon in the app bar showing registration status **for ADMIN/MANAGER only:**

```
┌──────────────────────────────────────────────────────────┐
│ [☰] StartPOS    Dashboard    POS    Reports    [⚠️] [👤] │
└──────────────────────────────────────────────────────────┘
                                                  ↑
                                          Status Indicator
```

**Icon States:**
- ⚠️ (Yellow/Orange) = `UNREGISTERED`
- ⏳ (Blue) = `PENDING`
- ✅ (Green) = `REGISTERED`
- 🔴 (Red) = `EXPIRED`

**Behavior:**
- Only visible to ADMIN and MANAGER roles
- Clicking icon opens Settings → Compliance page
- Tooltip on hover:
  - UNREGISTERED: "Business not registered - Click to complete"
  - PENDING: "Registration in progress - Click to complete"
  - REGISTERED: "Business registered ✓"
  - EXPIRED: "Registration expired - Click to renew"

**Implementation:**
- Component: `web/src/components/layout/registration-status-indicator.tsx`
- Location: App bar, right side before user menu
- Only renders if `user.role === 'ADMIN' || user.role === 'MANAGER'`
- Uses `getComplianceAdapter().validateCompliance()` to check data completeness

### Phase 4: Dashboard Information Section

Add a card/section on the dashboard (not a banner!) alongside other metrics:

```
┌─────────────────────────────────────────────────────┐
│ Dashboard                                            │
├─────────────────────────────────────────────────────┤
│                                                      │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│ │ Today Sales  │ │ Products     │ │ Transactions │ │
│ │ ₱12,450      │ │ 143 items    │ │ 45 today     │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ │
│                                                      │
│ ┌────────────────────────────────────────────────┐  │
│ │ ⚠️ Business Registration                       │  │
│ │                                                 │  │
│ │ Status: Not Registered Yet                     │  │
│ │                                                 │  │
│ │ Your receipts won't have tax compliance info.  │  │
│ │ Complete registration when you're ready.       │  │
│ │                                                 │  │
│ │         [Learn More]  [Complete Registration →]│  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ ┌──────────────┐ ┌──────────────┐                  │
│ │ Low Stock    │ │ Recent       │                  │
│ │ Alerts       │ │ Activity     │                  │
│ └──────────────┘ └──────────────┘                  │
└─────────────────────────────────────────────────────┘
```

**Section States:**

#### For UNREGISTERED businesses:
```
┌────────────────────────────────────────────────────┐
│ ⚠️ Business Registration                           │
│                                                     │
│ Status: Not Registered Yet                         │
│                                                     │
│ Your receipts won't have official tax compliance   │
│ information. Complete registration when ready.     │
│                                                     │
│         [Learn More]  [Complete Registration →]    │
└────────────────────────────────────────────────────┘
```

#### For PENDING businesses:
```
┌────────────────────────────────────────────────────┐
│ ⏳ Business Registration                           │
│                                                     │
│ Status: Registration In Progress                   │
│                                                     │
│ Add your TIN, permits, and business details to     │
│ complete your registration.                        │
│                                                     │
│ Missing: BIR TIN, Branch Serial Number             │
│                                                     │
│                    [Complete Registration →]       │
└────────────────────────────────────────────────────┘
```

#### For REGISTERED with complete data:
- **Section is hidden** (or shows brief green success message then disappears)
- Dashboard is clean and focused on business metrics
- App bar icon shows ✅

#### For REGISTERED with incomplete data:
```
┌────────────────────────────────────────────────────┐
│ ❌ Registration Data Incomplete                    │
│                                                     │
│ Status: Registered (but data is missing)           │
│                                                     │
│ You marked your business as registered but some    │
│ required information is missing.                   │
│                                                     │
│ Missing: BIR TIN, Branch Serial Number             │
│                                                     │
│         [Fix Now →]         [Mark as Unregistered] │
└────────────────────────────────────────────────────┘
```

**Implementation Details:**
- Component: `web/src/components/dashboard/registration-status-card.tsx`
- Location: Dashboard page, after main metrics, before low stock alerts
- Role check: Only render for ADMIN and MANAGER
- Dismissible: Can be dismissed if UNREGISTERED (localStorage)
- Auto-hides: Disappears when status is REGISTERED and data is complete
- Uses adapter validation to determine missing fields

### Phase 5: Settings → Compliance Setup Page

Create a dedicated page for entering compliance data:

**Route:** `/settings/compliance`

**Sections:**

#### 1. Registration Status Control
```
┌─────────────────────────────────────────────────────────────┐
│ Business Registration Status                                 │
│                                                               │
│ Current Status: [UNREGISTERED ▼]                             │
│                                                               │
│ Change this if your business registration status has changed.│
│ • UNREGISTERED: Not registered with government yet           │
│ • PENDING: Registration in progress                          │
│ • REGISTERED: Fully registered (fill data below)             │
└─────────────────────────────────────────────────────────────┘
```

**Dropdown allows manual status change:**
- Admin can update status anytime
- If changing to `REGISTERED`, must fill required fields below
- Validation prevents saving `REGISTERED` status with missing data

#### 2. Tax Information (Philippines example)
```
┌─────────────────────────────────────────────────────────────┐
│ Tax Information                                               │
│                                                               │
│ BIR TIN (Tax Identification Number) *                        │
│ [___-___-___-___]                                             │
│                                                               │
│ RDO Code (Revenue District Office)                           │
│ [_____]                                                       │
│                                                               │
│ VAT Registered?  [Yes] [No]                                  │
│                                                               │
│ VAT Registration Date (if applicable)                        │
│ [MM/DD/YYYY]                                                  │
└─────────────────────────────────────────────────────────────┘
```

#### 3. Business Permits
```
┌─────────────────────────────────────────────────────────────┐
│ Business Permits                                              │
│                                                               │
│ PTU Number (Permit to Use) * (required for VAT businesses)   │
│ [PTU-YYYY-NNNNN]                                              │
│                                                               │
│ PTU Issue Date                                                │
│ [MM/DD/YYYY]                                                  │
│                                                               │
│ DTI/SEC Registration Number                                   │
│ [________________]                                            │
└─────────────────────────────────────────────────────────────┘
```

#### 4. Branch Information
```
┌─────────────────────────────────────────────────────────────┐
│ Branch Information                                            │
│                                                               │
│ Branch Serial Number * (BIR-issued)                          │
│ [SN__________]                                                │
│                                                               │
│ Branch Code                                                   │
│ [00001]                                                       │
│                                                               │
│ Branch PTU (if different from main)                           │
│ [PTU-YYYY-NNNNN]                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 5. Validation & Actions
```
┌─────────────────────────────────────────────────────────────┐
│ [Test Compliance]     [Save Draft]     [Save & Mark Registered]│
│                                                               │
│ * Required fields are marked with an asterisk                │
│ Required fields vary by country and VAT registration status  │
└─────────────────────────────────────────────────────────────┘
```

**Button Behaviors:**
- **Test Compliance**: Validates without saving, shows missing fields
- **Save Draft**: Saves partial data, keeps status as PENDING
- **Save & Mark Registered**: Validates, saves, sets status to REGISTERED (only enabled if validation passes)

#### 6. Help & Guidance
```
┌─────────────────────────────────────────────────────────────┐
│ Need help?                                                    │
│                                                               │
│ • How to get a BIR TIN                                        │
│ • How to apply for Permit to Use (PTU)                       │
│ • Where to find your Branch Serial Number                    │
│ • Complete registration guide for Philippines                │
└─────────────────────────────────────────────────────────────┘
```

Links to country-specific government websites and guides

**Country-Specific Fields:**
- Form adapts based on `DEPLOYMENT_COUNTRY`
- PH: Shows BIR fields (TIN, PTU, RDO, Serial Number)
- SG: Shows IRAS fields (GST Number, UEN, ACRA)
- US: Shows IRS fields (EIN, State Tax ID, Sales Tax Permit)
- Uses `getComplianceAdapter()` to determine required fields

### Phase 6: Compliance Validation Logic

**On Save:**

1. **Get current status** from form
2. **Build ComplianceData** from form fields
3. **Validate using adapter:**
   ```typescript
   const adapter = getComplianceAdapter()
   const missingFields = adapter.validateCompliance(complianceData)
   ```
4. **If status is REGISTERED:**
   - If `missingFields.length > 0`:
     - Block save
     - Highlight missing fields
     - Show error: "Cannot mark as REGISTERED. Missing: [fields]"
   - If `missingFields.length === 0`:
     - Save data
     - Set `registrationStatus = 'REGISTERED'`
     - Set `registrationCompletedAt = now()`
     - Show success toast: "✅ Business registration complete!"
     - Redirect to dashboard (banner should be gone)

5. **If status is UNREGISTERED or PENDING:**
   - Save whatever data exists (partial OK)
   - Keep current status
   - Show toast: "✓ Draft saved. Complete when ready."

**Manual Status Change:**
- If admin changes dropdown to `REGISTERED` but data is incomplete:
  - Show warning: "Required fields are missing. Please complete them first."
  - On save attempt, validate and block if incomplete
- If admin changes from `REGISTERED` to `UNREGISTERED`:
  - Allow (maybe they made a mistake)
  - Keep the compliance data (don't delete)
  - Dashboard banner will appear again

### Phase 7: Receipt Footer Based on Status

Update receipts to show registration status:

**For REGISTERED businesses:**
```
────────────────────────────────
THIS IS AN OFFICIAL RECEIPT
VAT REG TIN: 123-456-789-000
Valid for income tax and VAT purposes
────────────────────────────────
```

**For UNREGISTERED businesses:**
```
────────────────────────────────
THIS IS A SALES RECEIPT
Business not yet officially registered
Not valid for income tax purposes
────────────────────────────────
```

**For PENDING businesses:**
```
────────────────────────────────
THIS IS A SALES RECEIPT
Business registration in progress
Not valid for income tax purposes
────────────────────────────────
```

**Implementation:**
```typescript
// In receipt-helper.ts
export function getReceiptFooterText(registrationStatus: BusinessRegistrationStatus): string {
  const adapter = getComplianceAdapter()
  
  if (registrationStatus === 'REGISTERED') {
    return adapter.getOfficialReceiptFooter() // Country-specific
  }
  
  return 'THIS IS A SALES RECEIPT\nBusiness not yet officially registered\nNot valid for income tax purposes'
}
```

---

## Implementation Priority

### Must Have (v1.1)
- [x] Soft validation (already implemented ✅)
- [ ] Add `registrationStatus` field to Business model
- [ ] Update survey to ask about registration
- [ ] App bar status indicator icon (admin/manager only)
- [ ] Dashboard registration status section (not banner!)
- [ ] Settings → Compliance page with status dropdown
- [ ] Validation logic that blocks `REGISTERED` status if data incomplete
- [ ] Receipt footer based on status

### Should Have (v1.2)
- [ ] "Learn how to register" guide pages (per country)
- [ ] Help tooltips on compliance form fields
- [ ] Compliance data validation on field blur
- [ ] Status change confirmation dialog
- [ ] Dismissal persistence for dashboard section

### Nice to Have (v2.0)
- [ ] Compliance checklist progress indicator
- [ ] Email reminders to complete registration (for admins only)
- [ ] Integration with government APIs to validate TIN
- [ ] Document upload for permits
- [ ] Renewal reminders for expiring permits
- [ ] Status history/audit log

---

## User Flows

### Flow 1: Unregistered Business (Most Common)

**Scenario:** Small shop owner, not officially registered yet

1. **Onboarding Survey:**
   - Q: "Is your business officially registered?"
   - A: "No, not yet"
   - System sets `registrationStatus = 'UNREGISTERED'`

2. **After Registration:**
   - User completes account setup
   - Lands on Dashboard
   - Sees **information section** (not banner): "Your business is not officially registered yet"
   - **App bar shows ⚠️ icon** (subtle indicator)
   - Can dismiss section if wants to explore system first

3. **Using the System:**
   - Hires cashiers, adds products, processes sales
   - POS works normally, no warnings
   - Receipts show "Sales Receipt - Not valid for tax purposes"

4. **Later - Gets Registered:**
   - Completes DTI/SEC registration
   - Gets TIN from BIR
   - Admin opens Settings → Compliance
   - Fills in TIN, serial number, etc.
   - Changes status dropdown to "REGISTERED"
   - Clicks "Save & Mark Registered"
   - System validates, saves, dashboard banner disappears
   - Receipts now show "Official Receipt" with TIN

### Flow 2: Already Registered Business

**Scenario:** Established business with all documents

1. **Onboarding Survey:**
   - Q: "Is your business officially registered?"
   - A: "Yes, I have my registration documents"
   - System sets `registrationStatus = 'PENDING'`

2. **After Registration:**
   - User completes account setup
   - System redirects to Settings → Compliance
   - Shows message: "Great! Let's add your registration details."
   - User fills in TIN, PTU, serial number
   - Clicks "Save & Mark Registered"
   - System validates, saves, sets status to `REGISTERED`
   - Redirects to dashboard
   - **Dashboard section disappears** (registration complete)
   - **App bar shows ✅ icon** (green check)

3. **Using the System:**
   - POS works normally
   - Receipts show "Official Receipt" with full compliance data
   - Tax-compliant from day one

### Flow 3: Wrong Selection - Correction Flow

**Scenario:** User selected "Registered" by mistake

1. **During/After Onboarding:**
   - Selected "Yes, have documents" but actually doesn't
   - Dashboard shows section: "Registration data incomplete - Missing: TIN, Serial Number"
   - **App bar shows ⚠️ icon** (warning state)

2. **Correction:**
   - Admin goes to Settings → Compliance
   - Sees validation errors for missing fields
   - Realizes they selected wrong option
   - Changes status dropdown to "UNREGISTERED"
   - Saves
   - Dashboard banner changes to "Not registered yet" message

3. **Continue Using System:**
   - POS works normally
   - Can complete registration later when ready

### Flow 4: Cashier Using POS

**Scenario:** Cashier role, business is unregistered

1. **Login as Cashier:**
   - Lands on POS or assigned route
   - **Sees no compliance banners** (role check blocks them)

2. **Processing Transactions:**
   - POS interface clean and focused
   - No warnings about compliance
   - Processes sales normally
   - Receipt prints with "Sales Receipt" footer

3. **Never Sees Compliance Issues:**
   - Only admin/manager see dashboard warnings
   - Cashier workflow uninterrupted

---

## Database Changes

```sql
-- Add registration status to Business table
ALTER TABLE businesses 
ADD COLUMN registration_status TEXT DEFAULT 'UNREGISTERED',
ADD COLUMN registration_completed_at TIMESTAMP;

-- Create index for faster queries
CREATE INDEX idx_businesses_registration_status ON businesses(registration_status);
```

**Migration File:** `web/prisma/migrations/YYYYMMDDHHMMSS_add_business_registration_status.sql`

---

## Country-Specific Registration Requirements

### Philippines
**Required for REGISTERED status:**
- BIR TIN (Tax Identification Number) *always required*
- Branch Serial Number *always required*
- PTU Number (if VAT registered)

**Optional but recommended:**
- RDO Code
- DTI/SEC Registration
- Mayor's Permit
- PTU Issue Date

**Resources:**
- DTI Registration: https://www.dti.gov.ph/
- BIR TIN Application: https://www.bir.gov.ph/
- BIR CAS/POS Registration: https://www.bir.gov.ph/

### Singapore
**Required for REGISTERED status:**
- GST Registration Number *always required*
- UEN (Unique Entity Number) *always required*
- ACRA Number *always required*

**Optional:**
- GST Effective Date
- ACRA Registration Date

**Resources:**
- ACRA Registration: https://www.acra.gov.sg/
- IRAS GST Registration: https://www.iras.gov.sg/

### USA
**Required for REGISTERED status:**
- EIN (Employer Identification Number) *always required*
- State Tax ID *always required*
- Sales Tax Permit Number *always required*

**Optional:**
- County/City codes
- Sales Tax Rate

**Resources:**
- IRS EIN Application: https://www.irs.gov/
- State-specific tax registration (varies by state)

---

## Testing Scenarios

### Test 1: Unregistered Flow
- [ ] Survey answer "No, not registered yet"
- [ ] Status set to UNREGISTERED
- [ ] Dashboard shows banner (admin only)
- [ ] POS has no warnings
- [ ] Transactions process normally
- [ ] Receipt shows "Sales Receipt" footer

### Test 2: Registered Flow
- [ ] Survey answer "Yes, have documents"
- [ ] Redirected to Settings → Compliance
- [ ] Fill all required fields
- [ ] Click "Save & Mark Registered"
- [ ] Status changes to REGISTERED
- [ ] Dashboard banner disappears
- [ ] Receipt shows "Official Receipt" footer

### Test 3: Incomplete Registration Block
- [ ] Set status dropdown to "REGISTERED"
- [ ] Leave required fields empty
- [ ] Click "Save & Mark Registered"
- [ ] Error shown: "Missing: BIR TIN, Branch Serial Number"
- [ ] Save blocked
- [ ] Fields highlighted in red

### Test 4: Correction Flow
- [ ] Select "REGISTERED" status
- [ ] Don't fill data
- [ ] Dashboard shows "incomplete" error banner
- [ ] Go to Settings → Compliance
- [ ] Change status to "UNREGISTERED"
- [ ] Save successful
- [ ] Dashboard banner changes to "not registered" message

### Test 5: Role-Based Banner Display
- [ ] Login as ADMIN → See banner
- [ ] Login as MANAGER → See banner
- [ ] Login as CASHIER → No banner
- [ ] Check POS route → No banner for any role

### Test 6: Multi-Country Validation
- [ ] Set DEPLOYMENT_COUNTRY=PH
- [ ] Required fields: TIN, Serial Number
- [ ] Set DEPLOYMENT_COUNTRY=SG
- [ ] Required fields: GST Number, UEN, ACRA
- [ ] Set DEPLOYMENT_COUNTRY=US
- [ ] Required fields: EIN, State Tax ID, Sales Tax Permit

---

## Open Questions for Discussion

1. **Should we allow anonymous sales (no business at all)?**
   - Use case: Individual testing before registering
   - Risk: May encourage tax avoidance
   - Recommendation: Require business account but allow UNREGISTERED status

2. **How long can a business stay PENDING?**
   - Government registration can take weeks/months
   - Should we have a timeout?
   - Recommendation: No timeout, but periodic reminders

3. **What about businesses with expired registrations?**
   - Need `EXPIRED` status for tracking
   - Should we block transactions for expired?
   - Recommendation: Warn but don't block (they may be renewing)

4. **Should we integrate with government APIs?**
   - PH: BIR TIN validation (if API exists)
   - SG: IRAS GST lookup
   - US: IRS EIN verification
   - Recommendation: Future enhancement, not v1.1

5. **Backfill strategy for existing businesses?**
   - All existing businesses will default to UNREGISTERED
   - Should we analyze compliance data and auto-set to REGISTERED if complete?
   - Recommendation: Set all to UNREGISTERED, let admins update

---

## Implementation Steps

### Step 1: Database Migration
```bash
# Generate migration for registration_status field
pnpm prisma migrate dev --name add_business_registration_status
```

### Step 2: Update Business Model
Edit `web/prisma/base/_models.prisma`:
```prisma
model Business {
  // ... existing fields
  registrationStatus BusinessRegistrationStatus @default(UNREGISTERED)
  registrationCompletedAt DateTime?
}
```

### Step 3: Update Survey
Edit `web/src/lib/onboarding/survey-questions.ts` - add registration question

### Step 4: Create Compliance Settings Page
- Route: `web/src/routes/(private)/settings/compliance/index.tsx`
- Components:
  - `registration-status-selector.tsx` (dropdown)
  - `tax-information-form.tsx` (country-specific)
  - `validation-buttons.tsx` (test/save actions)

### Step 5: Create Dashboard Banner
- Component: `web/src/components/dashboard/compliance-banner.tsx`
- Role check: `user.role === 'ADMIN' || user.role === 'MANAGER'`
- Route check: Only render on `/dashboard`
- Dismissal logic in localStorage

### Step 6: Update Receipt Footer
Edit `web/src/lib/compliance/receipt-helper.ts`:
- Add `getReceiptFooterByStatus(status)` function
- Update receipt component to use new function

### Step 7: Testing
- Unit tests for validation logic
- Integration tests for status changes
- E2E tests for user flows
- Role-based banner display tests

### Step 8: Documentation
- User guide: "How to complete business registration"
- Admin guide: "Managing compliance data"
- Country-specific registration guides

---

## Success Metrics

After implementation, track:
- % of businesses with REGISTERED status
- Time from signup to registration completion
- % of admins who dismiss banner (vs engage)
- Support tickets related to registration
- Compliance data completion rate
- Cashier satisfaction (POS interruption rate should be 0%)

Target: 80% of businesses reach REGISTERED status within 30 days

---

## References

- [Compliance Adapter Guide](./COMPLIANCE_ADAPTER_GUIDE.md) - Implementation details
- [Compliance Schema Architecture](./COMPLIANCE_SCHEMA_ARCHITECTURE.md) - Database design
- [Philippines BIR Requirements](https://www.bir.gov.ph/) - Official guidelines
- [Singapore IRAS Requirements](https://www.iras.gov.sg/) - GST guidelines
- [USA IRS Requirements](https://www.irs.gov/) - EIN and sales tax

---

## Summary

This plan provides a **clean, unobtrusive** compliance registration flow that:

✅ **No annoying banners or modals** - Information presented as dashboard section  
✅ **Subtle app bar indicator** - Quick status check without being in your face  
✅ **Never interrupts cashiers** - POS always works smoothly  
✅ **Guides business owners** - Clear dashboard section with action buttons  
✅ **Allows flexibility** - Can start unregistered, complete later  
✅ **Enforces data quality** - Can't claim "registered" without required data  
✅ **Adapts to country** - Requirements based on deployment  
✅ **Provides clear path** - Settings page makes it easy to complete  

The key principles: 
1. **Compliance is an admin concern, not a cashier concern**
2. **Information over interruption** - Dashboard section, not banner/modal
3. **Subtle indicators over loud warnings** - App bar icon for quick status check
4. **Always accessible** - Settings page for full control anytime
