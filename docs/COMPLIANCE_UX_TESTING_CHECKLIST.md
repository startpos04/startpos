# Compliance UX Implementation - Testing Checklist

**Date:** 2026-08-25  
**Status:** ✅ IMPLEMENTATION COMPLETE - Ready for Testing  
**Related Docs:** 
- [COMPLIANCE_UX_IMPROVEMENT_PLAN.md](./COMPLIANCE_UX_IMPROVEMENT_PLAN.md)
- [COMPLIANCE_SCHEMA_ARCHITECTURE.md](./COMPLIANCE_SCHEMA_ARCHITECTURE.md)

---

## Overview

All COMPLIANCE_UX_IMPROVEMENT_PLAN features have been implemented. This checklist guides manual testing to verify the implementation works correctly end-to-end.

---

## Pre-Testing Setup

### 1. Start the Development Server
```bash
cd web
npm run dev
```

### 2. Reset Database (Optional - Fresh Start)
```bash
npm run reset  # Drops DB, recreates schema
npm run seed   # Seeds with test data
```

**Seeded Test Accounts:**
- **Owner:** owner@grocery.com / password123
- **Admin:** admin@grocery.com / password123
- **Cashier:** cashier1@grocery.com / password123

All businesses start with `registrationStatus = 'UNREGISTERED'` by default.

---

## Test Suite 1: Onboarding Survey Q12

**Goal:** Verify Q12 appears in onboarding and saves registrationStatus

### Steps:
1. [ ] **Create New Account**
   - Navigate to signup page
   - Register a new business account
   - Complete initial profile setup

2. [ ] **Verify Q12 Appears**
   - Progress through onboarding survey
   - After Q6 (business type questions), verify Q12 appears
   - Question text: "Is your business officially registered?"
   
3. [ ] **Verify Q12 Options**
   - [ ] Option 1: "Yes, I have my registration documents" → REGISTERED
   - [ ] Option 2: "Registration is in progress" → PENDING
   - [ ] Option 3: "No, not yet" → UNREGISTERED

4. [ ] **Test Each Option**
   
   **Test A: Select "REGISTERED"**
   - [ ] Complete survey selecting "Yes, I have my registration documents"
   - [ ] After registration, check if redirected to `/settings/compliance`
   - [ ] Verify Business.registrationStatus = 'REGISTERED' in database or via API
   
   **Test B: Select "PENDING"**
   - [ ] Create new account, select "Registration is in progress"
   - [ ] Verify Business.registrationStatus = 'PENDING'
   - [ ] Check dashboard shows blue "Registration In Progress" card
   
   **Test C: Select "UNREGISTERED"**
   - [ ] Create new account, select "No, not yet"
   - [ ] Verify Business.registrationStatus = 'UNREGISTERED'
   - [ ] Check dashboard shows amber "Not Registered Yet" card

5. [ ] **Verify Survey Skip Handling**
   - [ ] Skip Q12 (if allowed)
   - [ ] Verify default status is 'UNREGISTERED'

**Expected Files Modified:**
- `src/lib/onboarding/types.ts` (Q12_OPTIONS)
- `src/components/custom/onboarding/survey-wizard.tsx` (Q12 config)
- `src/lib/onboarding/survey-interpreter.ts` (extractRegistrationStatus)
- `src/lib/server-fn/complete-registration.ts` (saves registrationStatus)

---

## Test Suite 2: App Bar Status Indicator

**Goal:** Verify icon shows correct status and is role-based

### Steps:
1. [ ] **Login as OWNER/ADMIN**
   - Use: owner@grocery.com / password123
   - Navigate to `/dashboard`

2. [ ] **Verify Icon Visibility**
   - [ ] Check app bar (top right, before notification bell)
   - [ ] Icon should be visible

3. [ ] **Verify Icon States**
   
   **UNREGISTERED (Default after seed):**
   - [ ] Icon: AlertCircleIcon (⚠️)
   - [ ] Color: Amber/Orange
   - [ ] Hover tooltip: "Business not registered — Click to complete"
   
   **Change to PENDING (via Settings):**
   - [ ] Go to `/settings/compliance`
   - [ ] Change status dropdown to "PENDING"
   - [ ] Click "Save Draft"
   - [ ] Return to dashboard
   - [ ] Icon: CircleDashedIcon (⏳)
   - [ ] Color: Blue
   - [ ] Hover tooltip: "Registration in progress — Click to complete"
   
   **Change to REGISTERED (with complete data):**
   - [ ] Go to `/settings/compliance`
   - [ ] Fill all required fields (BIR TIN, Branch Serial Number)
   - [ ] Change status to "REGISTERED"
   - [ ] Click "Save & Mark Registered"
   - [ ] Return to dashboard
   - [ ] Icon: CheckCircleIcon (✅)
   - [ ] Color: Green
   - [ ] Hover tooltip: "Business registered ✓"
   
   **Change to EXPIRED:**
   - [ ] Go to `/settings/compliance`
   - [ ] Change status dropdown to "EXPIRED"
   - [ ] Click "Save Draft"
   - [ ] Return to dashboard
   - [ ] Icon: XCircleIcon (🔴)
   - [ ] Color: Red
   - [ ] Hover tooltip: "Registration expired — Click to renew"

4. [ ] **Verify Click Navigation**
   - [ ] Click icon
   - [ ] Should navigate to `/settings/compliance`

5. [ ] **Login as CASHIER**
   - Use: cashier1@grocery.com / password123
   - Navigate to `/dashboard`
   - [ ] Icon should NOT be visible in app bar

6. [ ] **Login as SUPERVISOR**
   - Use: supervisor@grocery.com / password123
   - Navigate to `/dashboard`
   - [ ] Icon should NOT be visible (only ADMIN/OWNER)

**Expected File:**
- `src/components/custom/dashboard/registration-status-indicator.tsx`
- `src/components/custom/dashboard/app-nav.tsx` (integration)

---

## Test Suite 3: Dashboard Registration Status Card

**Goal:** Verify card shows correct content per status and is role-based

### Steps:
1. [ ] **Login as OWNER/ADMIN**
   - Use: owner@grocery.com / password123
   - Navigate to `/dashboard`

2. [ ] **Test UNREGISTERED Card**
   - [ ] Card visible below quick stats
   - [ ] Border: Amber
   - [ ] Background: Amber/50
   - [ ] Icon: AlertCircleIcon (amber)
   - [ ] Title: "Business Registration"
   - [ ] Status: "Not Registered Yet"
   - [ ] Message: "Your receipts won't have official tax compliance information..."
   - [ ] Buttons: "Complete Registration" (links to /settings/compliance), "Learn More" (opens BIR website)
   - [ ] "Dismiss" button visible (top right)
   - [ ] Click "Dismiss" → card disappears
   - [ ] Refresh page → card stays dismissed (localStorage)
   - [ ] Clear localStorage → card reappears

3. [ ] **Test PENDING Card**
   - [ ] Change status to PENDING via `/settings/compliance`
   - [ ] Return to dashboard
   - [ ] Card visible (not dismissible)
   - [ ] Border: Blue
   - [ ] Background: Blue/50
   - [ ] Icon: CircleDashedIcon (blue)
   - [ ] Title: "Business Registration"
   - [ ] Status: "Registration In Progress"
   - [ ] Message: "Add your TIN, permits, and business details..."
   - [ ] Shows "Missing: BIR TIN, Branch Serial Number" (or appropriate fields)
   - [ ] Button: "Complete Registration" (links to /settings/compliance)

4. [ ] **Test REGISTERED (Complete Data)**
   - [ ] Go to `/settings/compliance`
   - [ ] Fill all required fields:
     - BIR TIN: 123-456-789-000
     - Branch Serial Number: SN1234567890
   - [ ] Change status to "REGISTERED"
   - [ ] Click "Save & Mark Registered"
   - [ ] Return to dashboard
   - [ ] Card should NOT be visible (auto-hides when complete)

5. [ ] **Test REGISTERED (Incomplete Data)**
   - [ ] Go to `/settings/compliance`
   - [ ] Change status dropdown to "REGISTERED"
   - [ ] Click "Save Draft" (without filling required fields)
   - [ ] Return to dashboard
   - [ ] Card visible with error state
   - [ ] Border: Red
   - [ ] Background: Destructive/5
   - [ ] Icon: XCircleIcon (red)
   - [ ] Title: "Registration Data Incomplete"
   - [ ] Status: "Registered (but data is missing)"
   - [ ] Message: "You marked your business as registered but some required information is missing."
   - [ ] Shows "Missing: [field list]"
   - [ ] Buttons: "Fix Now", "Mark as Unregistered"

6. [ ] **Test EXPIRED Card**
   - [ ] Change status to EXPIRED via `/settings/compliance`
   - [ ] Return to dashboard
   - [ ] Card visible
   - [ ] Border: Red
   - [ ] Icon: XCircleIcon (red)
   - [ ] Title: "Registration Expired"
   - [ ] Status: "Renewal Required"
   - [ ] Message: "Your business registration has expired..."
   - [ ] Button: "Renew Registration"

7. [ ] **Login as CASHIER**
   - Use: cashier1@grocery.com / password123
   - Navigate to `/dashboard`
   - [ ] Card should NOT be visible

**Expected File:**
- `src/components/custom/dashboard/registration-status-card.tsx`
- `src/routes/(private)/(dashboard)/dashboard.tsx` (integration)

---

## Test Suite 4: Compliance Settings Page

**Goal:** Verify page loads, saves, and validates correctly

### Steps:
1. [ ] **Navigate to Settings**
   - Login as owner@grocery.com
   - Go to `/settings/compliance` (or Settings → Compliance tab)

2. [ ] **Verify Page Loads**
   - [ ] Page renders without errors
   - [ ] Shows "Business Compliance" title
   - [ ] Shows loading spinner initially
   - [ ] After load, shows all form sections:
     - Registration Status dropdown
     - Tax Information (BIR TIN, RDO Code, VAT switch, VAT date)
     - Business Permits (PTU Number, PTU date, DTI/SEC)
     - Branch Information (Serial Number, Branch Code, Branch PTU)
     - Help section with links
     - Action buttons (Test Compliance, Save Draft, Save & Mark Registered)

3. [ ] **Test Data Loading**
   - [ ] If compliance data exists, verify fields are populated
   - [ ] Status dropdown shows current registrationStatus
   - [ ] Form fields show saved values

4. [ ] **Test Registration Status Dropdown**
   - [ ] Dropdown shows 4 options:
     - Unregistered — Not registered with government yet
     - Pending — Registration in progress
     - Registered — Fully registered (fill data below)
     - Expired — Registration has expired
   - [ ] Change dropdown to "REGISTERED" without filling data
   - [ ] Warning toast appears: "Required fields are missing..."

5. [ ] **Test Form Fields**
   - [ ] Fill BIR TIN: 123-456-789-000
   - [ ] Fill RDO Code: 045
   - [ ] Toggle VAT Registered: ON
   - [ ] VAT Registration Date field appears
   - [ ] Fill VAT date: 2024-01-15
   - [ ] Fill PTU Number: PTU-2024-12345
   - [ ] Fill PTU Issue Date: 2024-02-01
   - [ ] Fill DTI/SEC: DTI-123456789
   - [ ] Fill Branch Serial Number: SN1234567890
   - [ ] Fill Branch Code: 00001
   - [ ] Fill Branch PTU: PTU-2024-67890

6. [ ] **Test "Test Compliance" Button**
   - [ ] Clear BIR TIN field (leave empty)
   - [ ] Click "Test Compliance"
   - [ ] Error toast appears: "Missing required fields"
   - [ ] Toast description lists: "BIR TIN, Branch Serial Number"
   - [ ] Fill BIR TIN and Branch Serial Number
   - [ ] Click "Test Compliance"
   - [ ] Success toast: "✓ All required fields are complete"

7. [ ] **Test "Save Draft" Button**
   - [ ] Set status to "PENDING"
   - [ ] Fill only BIR TIN (leave Branch Serial Number empty)
   - [ ] Click "Save Draft"
   - [ ] Success toast: "Draft saved. Your changes have been saved..."
   - [ ] Refresh page
   - [ ] Verify partial data persisted

8. [ ] **Test "Save & Mark Registered" Button**
   
   **Scenario A: Incomplete Data**
   - [ ] Clear Branch Serial Number
   - [ ] Set status to "REGISTERED"
   - [ ] Click "Save & Mark Registered"
   - [ ] Error toast: "Cannot mark as REGISTERED"
   - [ ] Toast description: "Missing: Branch Serial Number"
   - [ ] Status does NOT change to REGISTERED
   
   **Scenario B: Complete Data**
   - [ ] Fill all required fields (BIR TIN, Branch Serial Number)
   - [ ] Set status to "REGISTERED"
   - [ ] Click "Save & Mark Registered"
   - [ ] Success toast: "✓ Business registration complete!"
   - [ ] Status changes to REGISTERED
   - [ ] Navigate to dashboard
   - [ ] Verify registration status card disappears

9. [ ] **Test Help Links**
   - [ ] Click "→ DTI Registration Guide" → Opens https://www.dti.gov.ph/
   - [ ] Click "→ How to get a BIR TIN" → Opens https://www.bir.gov.ph/
   - [ ] Click "→ How to apply for PTU" → Opens https://www.bir.gov.ph/

10. [ ] **Test Status Change from REGISTERED to UNREGISTERED**
    - [ ] Change status dropdown to "UNREGISTERED"
    - [ ] Click "Save Draft"
    - [ ] Success toast
    - [ ] Navigate to dashboard
    - [ ] Verify amber "Not Registered Yet" card appears

**Expected Files:**
- `src/routes/(private)/(dashboard)/settings/-compliance/index.tsx`
- `src/lib/server-fn/save-compliance-data.ts`
- `src/lib/server-fn/fetch-compliance-data.ts`

---

## Test Suite 5: Receipt Footer

**Goal:** Verify receipt shows correct footer text based on registrationStatus

### Steps:
1. [ ] **Setup: Set Status to UNREGISTERED**
   - Login as owner@grocery.com
   - Go to `/settings/compliance`
   - Set status to "UNREGISTERED"
   - Save

2. [ ] **Process a Sale (UNREGISTERED)**
   - [ ] Navigate to `/pos`
   - [ ] Add products to cart
   - [ ] Click "Checkout"
   - [ ] Complete payment
   - [ ] View/print receipt (or check PDF)
   - [ ] Verify footer shows:
     ```
     THIS IS A SALES RECEIPT
     Business not yet officially registered
     Not valid for income tax purposes
     ```

3. [ ] **Change Status to PENDING**
   - [ ] Go to `/settings/compliance`
   - [ ] Change status to "PENDING"
   - [ ] Save

4. [ ] **Process a Sale (PENDING)**
   - [ ] Go to `/pos`
   - [ ] Process another transaction
   - [ ] View receipt
   - [ ] Verify footer shows:
     ```
     THIS IS A SALES RECEIPT
     Business registration in progress
     Not valid for income tax purposes
     ```

5. [ ] **Change Status to REGISTERED (with complete data)**
   - [ ] Go to `/settings/compliance`
   - [ ] Fill all required fields
   - [ ] Change status to "REGISTERED"
   - [ ] Click "Save & Mark Registered"

6. [ ] **Process a Sale (REGISTERED)**
   - [ ] Go to `/pos`
   - [ ] Process another transaction
   - [ ] View receipt
   - [ ] Verify footer shows:
     ```
     THIS IS AN OFFICIAL RECEIPT
     Valid for income tax and VAT purposes
     Thank you for shopping!
     ```
   - [ ] Verify header shows compliance info:
     ```
     VAT REG TIN: 123-456-789-000
     SN: SN1234567890
     PTU NO: PTU-2024-12345 (if filled)
     ```

7. [ ] **Change Status to EXPIRED**
   - [ ] Go to `/settings/compliance`
   - [ ] Change status to "EXPIRED"
   - [ ] Save

8. [ ] **Process a Sale (EXPIRED)**
   - [ ] Go to `/pos`
   - [ ] Process another transaction
   - [ ] View receipt
   - [ ] Verify footer shows:
     ```
     THIS IS A SALES RECEIPT
     Business registration expired
     Not valid for income tax purposes
     ```

**Expected Files:**
- `src/lib/compliance/receipt-helper.ts` (getReceiptFooterText function)
- `src/routes/(private)/pos/-components/receipt-ticket.tsx` (integration)

---

## Test Suite 6: Role-Based Visibility

**Goal:** Verify compliance indicators only show for ADMIN/OWNER

### Steps:
1. [ ] **Login as OWNER**
   - Use: owner@grocery.com / password123
   - [ ] Navigate to `/dashboard`
   - [ ] **App bar indicator:** ✅ VISIBLE
   - [ ] **Dashboard card:** ✅ VISIBLE
   - [ ] Navigate to `/pos`
   - [ ] **No compliance warnings on POS:** ✅ VERIFIED

2. [ ] **Login as ADMIN**
   - Use: admin@grocery.com / password123
   - [ ] Navigate to `/dashboard`
   - [ ] **App bar indicator:** ✅ VISIBLE
   - [ ] **Dashboard card:** ✅ VISIBLE

3. [ ] **Login as SUPERVISOR**
   - Use: supervisor@grocery.com / password123
   - [ ] Navigate to `/dashboard`
   - [ ] **App bar indicator:** ❌ NOT VISIBLE
   - [ ] **Dashboard card:** ❌ NOT VISIBLE
   - [ ] Try to access `/settings/compliance` directly
   - [ ] Verify access (or no access based on permissions)

4. [ ] **Login as CASHIER**
   - Use: cashier1@grocery.com / password123
   - [ ] Navigate to `/dashboard` (or assigned home route)
   - [ ] **App bar indicator:** ❌ NOT VISIBLE
   - [ ] **Dashboard card:** ❌ NOT VISIBLE
   - [ ] Navigate to `/pos`
   - [ ] Process a sale normally
   - [ ] **No banners or warnings:** ✅ VERIFIED
   - [ ] **POS workflow uninterrupted:** ✅ VERIFIED

5. [ ] **Verify Settings Access Control**
   - [ ] Login as CASHIER
   - [ ] Try to navigate to `/settings/compliance`
   - [ ] Should either:
     - Be redirected (if route is protected)
     - Or show "Access Denied" message
     - Or not show the Compliance tab in Settings

**Expected Logic:**
- Visibility check: `user.role === Role.ADMIN || user.role === Role.OWNER`
- Files:
  - `registration-status-indicator.tsx` (line 24-25)
  - `registration-status-card.tsx` (line 49-50)

---

## Test Suite 7: Data Persistence & Validation

**Goal:** Verify data saves correctly to country-specific tables

### Steps:
1. [ ] **Database Verification (Optional - for thorough testing)**
   - [ ] After saving compliance data, check database:
   ```sql
   -- Check Business table
   SELECT id, name, registrationStatus, registrationCompletedAt 
   FROM businesses 
   WHERE id = 'YOUR_BUSINESS_ID';
   
   -- Check PhilippinesCompliance table (if DEPLOYMENT_COUNTRY=PH)
   SELECT * FROM philippines_compliances 
   WHERE businessId = 'YOUR_BUSINESS_ID';
   
   -- Check PhilippinesBranchCompliance table
   SELECT * FROM philippines_branch_compliances 
   WHERE branchId = 'YOUR_BRANCH_ID';
   ```

2. [ ] **Verify Country-Specific Adapter**
   - [ ] Check `.env.config` file
   - [ ] Verify `DEPLOYMENT_COUNTRY=PH` (Philippines)
   - [ ] Change to `DEPLOYMENT_COUNTRY=SG` (Singapore)
   - [ ] Restart server
   - [ ] Go to `/settings/compliance`
   - [ ] Verify field labels change (GST instead of VAT, etc.)
   - [ ] Change back to `DEPLOYMENT_COUNTRY=PH`

3. [ ] **Verify Validation Logic**
   - [ ] Go to `/settings/compliance`
   - [ ] For PH (Philippines):
     - Required fields: BIR TIN, Branch Serial Number
     - If VAT registered: PTU Number also required
   - [ ] Try to save REGISTERED status without required fields
   - [ ] Verify error message lists missing fields correctly

---

## Test Suite 8: Edge Cases & Error Handling

**Goal:** Test unusual scenarios and error conditions

### Steps:
1. [ ] **Offline Mode (if supported)**
   - [ ] Open DevTools → Network tab
   - [ ] Set throttling to "Offline"
   - [ ] Go to `/settings/compliance`
   - [ ] Try to save data
   - [ ] Verify appropriate error message

2. [ ] **Invalid Data Format**
   - [ ] Fill BIR TIN with invalid format: "ABC123"
   - [ ] Try to save
   - [ ] Verify validation error (if format validation exists)

3. [ ] **Browser Refresh During Edit**
   - [ ] Fill form fields
   - [ ] DO NOT save
   - [ ] Refresh page
   - [ ] Verify unsaved changes are lost (expected behavior)

4. [ ] **Multiple Tabs**
   - [ ] Open `/settings/compliance` in Tab A
   - [ ] Open `/settings/compliance` in Tab B
   - [ ] Make changes in Tab A, save
   - [ ] Refresh Tab B
   - [ ] Verify Tab B shows updated data

5. [ ] **Long Business Name on Receipt**
   - [ ] Set business name to very long text (50+ chars)
   - [ ] Process a sale
   - [ ] Verify receipt renders correctly (text wraps/truncates)

6. [ ] **Missing Compliance Data**
   - [ ] Create a brand new account via onboarding
   - [ ] Skip Q12 (or select UNREGISTERED)
   - [ ] Go directly to `/settings/compliance`
   - [ ] Verify page loads with empty form fields
   - [ ] Verify no errors in console

---

## Test Suite 9: Integration & Cross-Feature Testing

**Goal:** Verify compliance features work with other system features

### Steps:
1. [ ] **Billing & Subscription Integration**
   - [ ] Verify compliance status doesn't affect subscription features
   - [ ] Unregistered businesses can still:
     - [ ] Process transactions
     - [ ] Add products
     - [ ] Manage employees
     - [ ] Access all paid features

2. [ ] **Multi-Branch Support (Future)**
   - [ ] If multiple branches exist
   - [ ] Verify each branch has its own branch-level compliance data
   - [ ] Business-level data (TIN) is shared across branches
   - [ ] Branch serial numbers are unique per branch

3. [ ] **Settings Page Tab Navigation**
   - [ ] Go to `/settings`
   - [ ] Click "Compliance" tab
   - [ ] Verify navigation to `/settings/compliance` works
   - [ ] Verify tab is highlighted/active

4. [ ] **Notification System (Future)**
   - [ ] If notification for "Complete registration" exists
   - [ ] Verify clicking notification navigates to compliance page

---

## Performance & Accessibility Checklist

### Performance:
- [ ] Page load time < 2 seconds (Settings page)
- [ ] No visible lag when switching registration status
- [ ] Receipt generation time < 1 second
- [ ] Dashboard card doesn't cause layout shift

### Accessibility:
- [ ] All form fields have proper labels
- [ ] Keyboard navigation works (Tab through fields)
- [ ] Screen reader announces status changes
- [ ] Color contrast meets WCAG AA standards
- [ ] Focus indicators visible on all interactive elements

### Browser Compatibility:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

---

## Known Issues / Limitations

Document any issues found during testing:

1. **Issue:** [Description]
   - **Severity:** High / Medium / Low
   - **Steps to Reproduce:**
   - **Expected:** 
   - **Actual:**
   - **Workaround:**

---

## Sign-Off

**Tested By:** ___________________________  
**Date:** ___________________________  
**Status:** ⬜ Pass | ⬜ Pass with issues | ⬜ Fail  

**Notes:**
- 

---

## Quick Test Commands

```bash
# Start dev server
npm run dev

# Reset and seed database
npm run reset
npm run seed

# Run TypeScript checks
npm run typecheck

# Run linter
npm run lint

# Check for console errors
# Open browser DevTools → Console tab → Filter: "error"
```

---

## Test Data Reference

**Seeded Business:**
- Name: FreshMart Superstore
- Type: GROCERY
- Country: PH (Philippines)
- Default Status: UNREGISTERED

**Test Compliance Data (Philippines):**
- BIR TIN: 123-456-789-000
- RDO Code: 045
- VAT Registered: Yes
- PTU Number: PTU-2024-12345
- DTI/SEC: DTI-123456789
- Branch Serial Number: SN1234567890
- Branch Code: 00001

**Valid Format Examples:**
- BIR TIN: XXX-XXX-XXX-XXX (e.g., 123-456-789-000)
- PTU Number: PTU-YYYY-NNNNN (e.g., PTU-2024-12345)
- Serial Number: SN + 10 digits (e.g., SN1234567890)

---

## Success Criteria

✅ All test suites pass  
✅ No console errors during normal usage  
✅ Role-based visibility works correctly  
✅ Receipts show correct footer text  
✅ Data persists across sessions  
✅ Validation prevents invalid states  
✅ User experience is smooth and unobtrusive  

**Result:** Implementation is production-ready when all criteria are met.
