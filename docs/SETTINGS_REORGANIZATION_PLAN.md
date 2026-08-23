# Settings Reorganization Plan

**Date:** 2026-08-21  
**Status:** 📋 Planning  
**Purpose:** Separate Business-level settings from Branch-level settings

---

## 🎯 GOAL

Create clear separation between:
1. **Business Settings** - Business-wide configuration (admin only)
2. **Branch Settings** - Branch-specific configuration (branch managers)
3. **Context Switcher** - Easy navigation between branches and business admin section

---

## 🎨 NEW LAYOUT DESIGN

### Left Side: Context Switcher (New Vertical Bar)

```
┌──┐ ┌────────────────────┐
│🏢│ │ Main Content       │
│  │ │                    │
│📍│ │                    │
│📍│ │                    │
│📍│ │                    │
│  │ │                    │
│?│ │                    │
│📖│ │                    │
└──┘ └────────────────────┘
 ↑
Context switcher
(60-80px wide)
```

**Context Switcher Contents:**
- Business icon/button (top) → Navigate to `/business`
- Branch 1 icon/button → Switch to Branch 1
- Branch 2 icon/button → Switch to Branch 2
- Branch 3 icon/button → Switch to Branch 3
- ... (scrollable if many branches)
- Divider
- Contact Us → Moved from sidebar
- FAQ → New button

### Top Bar: Simplified

```
┌───────────────────────────────────────────────────────┐
│ [☰] > Breadcrumb         [🌙] [🔔] [👤 Profile ▼]   │
└───────────────────────────────────────────────────────┘
```

**Removed from top/sidebar:**
- Contact Us (moved to context switcher)
- FAQ link (moved to context switcher)
- Business/Billing (now in business section, accessed via context switcher)

**Kept in top bar:**
- Sidebar toggle
- Breadcrumbs
- Theme toggle
- Notifications
- Profile dropdown (with "My Account" link)

---

## 📊 CURRENT STRUCTURE

```
/settings (mixed business + branch level)
├── Units ← Branch level (catalog)
├── Categories ← Branch level (catalog)
├── Locations ← Branch level (inventory)
├── Suppliers ← Business level (shared)
├── Customers ← Business level (shared)
├── Branches ← Business level (manage branches)
├── Capabilities ← Business level (subscription)
├── Business Profile ← Business level (company info)
├── Security ← User level (password)
└── Account ← User level (profile)

/billing (business level)
├── Plans
├── Invoices
├── Credits
├── Quotes
└── Pricing
```

**Problems:**
- Branch-level and Business-level settings mixed together
- No clear indication which settings affect which scope
- Branch managers see business-level settings they can't control
- Business admins need to find billing in separate section

---

## 🎨 NEW STRUCTURE

### 1. Business Admin Section
**Route:** `/business` (new root section)  
**Access:** Business owner, Super admin only  
**Purpose:** Business-wide configuration that affects all branches

```
/business
├── /overview ← Dashboard: branches count, subscription, usage
├── /capabilities ← Enable/disable modules (subscription-controlled)
├── /branches ← Manage branches, create new, assign users
├── /billing ← Plans, invoices, credits, quotes
├── /suppliers ← Shared supplier database
├── /customers ← Shared customer database  
├── /users ← Manage all users across branches
└── /profile ← Business details, logo, tax info
```

### 2. Branch Settings (Current Settings, Cleaned Up)
**Route:** `/settings` (keep existing route)  
**Access:** Branch managers, Supervisors, Admins  
**Purpose:** Branch-specific configuration

```
/settings
├── /entitlements ← NEW: Configure branch-specific feature settings
├── /units ← Product units (kg, pcs, etc.)
├── /categories ← Product categories
├── /locations ← Inventory storage locations
├── /security ← Change password, 2FA
└── /account ← User profile, preferences
```

### 3. User Account (Profile Dropdown Menu)
**Route:** `/account`  
**Access:** All users (via profile dropdown, not sidebar)  
**Purpose:** Personal user settings

```
/account
├── Profile (name, email, avatar)
├── Security (password, 2FA)
└── Preferences (theme, language, notifications)
```

**Access Point:** User clicks profile icon → Dropdown menu shows:
- User info (name, email, role, online status)
- "My Account" link → `/account`
- "Logout" button

---

## 🗂️ DETAILED BREAKDOWN

### Context Switcher (New Left Bar)

| Element | Action | Visible To | Notes |
|---------|--------|------------|-------|
| **Business Icon** | Navigate to `/business` | Admin only | Building icon, highlighted when in `/business/*` |
| **Branch Icons** | Switch active branch + reload | All users | Branch initial or number, highlighted for current branch |
| **Contact Us** | Navigate to `/contact-us` | All users | Help/Support icon |
| **FAQ** | External link or page | All users | Question mark icon |

**Visual Design:**
```
┌────┐
│ 🏢 │ ← Business (admin only, glows when active)
├────┤
│ D  │ ← Downtown Branch (active = blue border)
│ M  │ ← Mall Branch
│ C  │ ← Catering Branch
├────┤ Divider
│ ?  │ ← Contact Us
│ 📖 │ ← FAQ
└────┘
```

**Interactions:**
- **Click Business Icon:** Navigate to `/business/overview` (admin only)
- **Click Branch Icon:** Switch user's active branch, refresh page with new branch context
- **Hover:** Show tooltip with branch name
- **Right-click Branch (admin):** Context menu with "Manage Branch", "View Settings"
- **Scroll:** If many branches, context switcher is scrollable (branches section only)

---

### Business-Level Settings

| Page | Current Location | New Location | Scope | Access |
|------|-----------------|--------------|-------|---------|
| **Capabilities** | `/settings` → Capabilities | `/business/capabilities` | Business | Admin only |
| **Branches** | `/settings` → Branches | `/business/branches` | Business | Admin only |
| **Billing** | `/billing/*` | `/business/billing/*` | Business | Admin only |
| **Suppliers** | `/settings` → Suppliers | `/business/suppliers` | Business | Admin, Supervisor |
| **Customers** | `/settings` → Customers | `/business/customers` | Business | Admin, Supervisor |
| **Business Profile** | `/settings` → Business Profile | `/business/profile` | Business | Admin only |
| **Users Management** | Not yet built | `/business/users` | Business | Admin only |

### Branch-Level Settings

| Page | Current Location | New Location | Scope | Access |
|------|-----------------|--------------|-------|---------|
| **Branch Entitlements** | Not yet built | `/settings/entitlements` | Branch | Branch Manager, Admin |
| **Units** | `/settings` → Units | `/settings/units` | Branch | Supervisor, Admin |
| **Categories** | `/settings` → Categories | `/settings/categories` | Branch | Supervisor, Admin |
| **Locations** | `/settings` → Locations | `/settings/locations` | Branch | Supervisor, Admin |

### User-Level Settings (Profile Dropdown)

| Page | Current Location | New Location | Scope | Access |
|------|-----------------|--------------|-------|---------|
| **My Account** | `/settings` → Account | `/account` | User | All users |
| **Security** | `/settings` → Security | `/account/security` | User | All users |
| **Preferences** | Not yet built | `/account/preferences` | User | All users |

**Note:** User settings are accessed via profile dropdown (where logout is), not from sidebar navigation.

---

## 🚀 IMPLEMENTATION PLAN

### Phase 0: Create Context Switcher (Week 1)

**Step 0.1: Create context switcher component**
```bash
/src/components/custom/dashboard/
├── context-switcher.tsx       # NEW: Vertical context bar
└── context-switcher-item.tsx  # NEW: Individual button component
```

**Step 0.2: Update dashboard layout**
```typescript
// components/custom/dashboard/index.tsx
export function Dashboard({ children }: { children?: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        {/* NEW: Add context switcher */}
        <ContextSwitcher />
        
        <AppSidebar />
        <SidebarInset>
          <AppNav />
          <div className='grow'>{children}</div>
          <LegalFooter />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
```

**Step 0.3: Implement branch switching logic**
```typescript
// hooks/use-branch-switch.ts
export function useBranchSwitch() {
  const navigate = useNavigate()
  
  const switchBranch = async (branchId: string) => {
    // 1. Update user's active branch in database
    await updateActiveBranch(branchId)
    
    // 2. Refresh auth store
    await authStore.refresh()
    
    // 3. Clear local cache (optional)
    await clearBranchCache()
    
    // 4. Reload page or navigate to dashboard
    navigate({ to: '/dashboard' })
    window.location.reload() // Force refresh to load new branch context
  }
  
  return { switchBranch }
}
```

**Step 0.4: Update sidebar**
- Remove "Contact Us" and "Billing" from AppSidebar
- These move to context switcher and business section respectively

### Phase 1: Create Business Section (Week 1-2)

**Step 1.1: Create business routes structure**
```bash
/src/routes/(private)/business/
├── route.tsx                  # Access control (admin only)
├── index.tsx                  # Business overview dashboard
├── capabilities/
│   └── index.tsx              # Enable/disable capabilities
├── branches/
│   ├── index.tsx              # List branches
│   └── [branchId]/
│       ├── index.tsx          # Branch details
│       └── entitlements/
│           └── index.tsx      # Branch entitlements settings
├── billing/
│   ├── index.tsx              # Billing overview
│   ├── plans/
│   ├── invoices/
│   ├── credits/
│   └── quotes/
├── suppliers/
│   └── index.tsx              # Moved from settings
├── customers/
│   └── index.tsx              # Moved from settings
└── profile/
    └── index.tsx              # Business profile
```

**Step 1.2: Create business navigation**
- Add "Business" to main sidebar (admin only)
- Update layout to show business nav items

**Step 1.3: Move existing pages**
- Move `/billing/*` → `/business/billing/*`
- Move `/settings/-capabilities` → `/business/capabilities`
- Move `/settings/-branches` → `/business/branches`
- Move `/settings/-suppliers` → `/business/suppliers`
- Move `/settings/-customers` → `/business/customers`
- Move `/settings/-business-profile` → `/business/profile`

### Phase 2: Create Branch Entitlements Page (Week 2)

**Step 2.1: Build entitlements UI**
```typescript
// /settings/entitlements/index.tsx
- Show enabled business capabilities
- For each capability, show branch-specific settings
- Allow enable/disable per branch
- Settings forms based on capability schema
- Show locked features (business capability disabled)
```

**Step 2.2: Update branch settings page**
- Remove capabilities tab (moved to business section)
- Remove business profile tab
- Remove account/security tabs (moved to profile dropdown)
- Keep only branch-scope settings (units, categories, locations, entitlements)

### Phase 3: Create User Account Section (Week 2)

**Step 3.1: Create account routes**
```bash
/src/routes/(private)/account/
├── route.tsx                  # Access control (all users)
├── index.tsx                  # Profile (name, email, avatar)
├── security/
│   └── index.tsx              # Password, 2FA
└── preferences/
    └── index.tsx              # Theme, language, notifications
```

**Step 3.2: Update profile dropdown**
```typescript
// Add "My Account" menu item before logout
<DropdownMenuItem onClick={() => navigate({ to: '/account' })}>
  <User />
  <span>My Account</span>
</DropdownMenuItem>
<DropdownMenuSeparator />
<DropdownMenuItem onClick={handleLogout}>
  <LogOut />
  <span>Logout</span>
</DropdownMenuItem>
```

**Step 3.3: Move existing pages**
- Move `/settings/-account` → `/account`
- Move `/settings/-security` → `/account/security`

### Phase 4: Update Navigation & Access Control (Week 3)

**Step 4.1: Update sidebar navigation**
```typescript
// Business section (admin only)
<NavSection label="Business" condition={isAdmin}>
  <NavItem href="/business" icon={Building}>Overview</NavItem>
  <NavItem href="/business/capabilities">Capabilities</NavItem>
  <NavItem href="/business/branches">Branches</NavItem>
  <NavItem href="/business/billing">Billing</NavItem>
  <NavItem href="/business/suppliers">Suppliers</NavItem>
  <NavItem href="/business/customers">Customers</NavItem>
  <NavItem href="/business/profile">Profile</NavItem>
</NavSection>

// Branch settings (supervisor+)
<NavSection label="Branch Settings" condition={isSupervisorOrAdmin}>
  <NavItem href="/settings/entitlements">Entitlements</NavItem>
  <NavItem href="/settings/units">Units</NavItem>
  <NavItem href="/settings/categories">Categories</NavItem>
  <NavItem href="/settings/locations">Locations</NavItem>
</NavSection>

// NOTE: User account settings NOT in sidebar
// Access via profile dropdown → "My Account"
```

**Step 4.2: Update profile dropdown**
```typescript
<ProfileDropdown>
  {/* User info displayed */}
  
  <DropdownMenuItem onClick={() => navigate({ to: '/account' })}>
    <User className="size-4" />
    <span>My Account</span>
  </DropdownMenuItem>
  
  <DropdownMenuSeparator />
  
  <DropdownMenuItem onClick={handleLogout} className="text-destructive">
    <LogOut className="size-4" />
    <span>Logout</span>
  </DropdownMenuItem>
</ProfileDropdown>
```

**Step 4.3: Update route guards**
```typescript
// /business/route.tsx - Admin only
beforeLoad: async () => {
  const { user } = authStore.state
  if (user.role !== Role.ADMIN) {
    throw redirect({ to: '/dashboard' })
  }
}

// /settings/route.tsx - Supervisor + Admin
beforeLoad: async () => {
  const { user } = authStore.state
  const allowedRoles = [Role.ADMIN, Role.SUPERVISOR]
  if (!allowedRoles.includes(user.role)) {
    throw redirect({ to: '/dashboard' })
  }
}

// /account/route.tsx - All authenticated users
beforeLoad: async () => {
  const { user } = authStore.state
  if (!user) {
    throw redirect({ to: '/login' })
  }
}
```

### Phase 5: Update Links & Redirects (Week 3-4)

**Step 5.1: Add redirects for old routes**
```typescript
// Redirect old billing routes
/billing/* → /business/billing/*

// Redirect old settings tabs (if direct URLs exist)
/settings?tab=Capabilities → /business/capabilities
/settings?tab=Branches → /business/branches
/settings?tab=Suppliers → /business/suppliers
/settings?tab=Customers → /business/customers
/settings?tab=Business%20Profile → /business/profile
/settings?tab=Account → /account
/settings?tab=Security → /account/security
```

**Step 5.2: Update all internal links**
- Search codebase for `/billing` links
- Search for `/settings?tab=` links
- Update to new routes

### Phase 6: Create Business Overview Dashboard (Week 4)

**Step 6.1: Build overview page**
```typescript
// /business/index.tsx
<BusinessOverview>
  <StatsCards>
    - Active branches count
    - Total users count
    - Current plan
    - Subscription status
    - Usage limits
  </StatsCards>
  
  <QuickActions>
    - Add branch
    - Invite user
    - Manage billing
    - View capabilities
  </QuickActions>
  
  <RecentActivity>
    - New branches created
    - Capability changes
    - Subscription events
    - User invitations
  </RecentActivity>
</BusinessOverview>
```

---

### UI Mockups

### Full Layout with Context Switcher

```
┌──┬──────────────┬────────────────────────────────────────┐
│🏢│ [☰] App      │ Dashboard > Sales      [🌙] [🔔] [👤] │ ← Top Bar
├──┼──────────────┴────────────────────────────────────────┤
│  │ 📊 Dashboard                                           │
│D │ 👥 Admin                                               │ ← Sidebar
│  │    └─ Employees                                        │   (current
│M │    └─ Products                                         │    branch
│  │ 🎯 Supervisor                                          │    context)
│C │    └─ Sales Report                                     │
│  │    └─ Transactions                                     │
├──┤ ⚙️  Settings                                           │
│? │                                                         │
│📖│                                                         │
└──┴─────────────────────────────────────────────────────────┘
 ↑
Context
Switcher
```

**When user clicks Business icon (🏢):**

```
┌──┬──────────────┬────────────────────────────────────────┐
│🏢│ [☰] Business │ Overview              [🌙] [🔔] [👤] │ ← Top Bar
├──┼──────────────┴────────────────────────────────────────┤ (Business
│  │ 📊 Overview                                            │  context)
│D │ ⚡ Capabilities                                        │
│  │ 🏢 Branches                                            │ ← Sidebar
│M │ 💳 Billing                                             │   (business
│  │ 📦 Suppliers                                           │    mode)
│C │ 👥 Customers                                           │
│  │ 🏷️  Profile                                            │
├──┤                                                         │
│? │                                                         │
│📖│                                                         │
└──┴─────────────────────────────────────────────────────────┘
 ↑
Business
is active
(highlighted)
```

### Context Switcher Component

```typescript
// components/custom/dashboard/context-switcher.tsx

interface ContextItem {
  id: string
  type: 'business' | 'branch' | 'action'
  label: string
  icon?: React.ReactNode
  active?: boolean
  visible?: boolean
  onClick: () => void
}

function ContextSwitcher() {
  const user = useStore(authStore, state => state.user)
  const location = useLocation()
  const { switchBranch } = useBranchSwitch()
  const navigate = useNavigate()
  
  const isBusinessActive = location.pathname.startsWith('/business')
  const isAdmin = user.role === Role.ADMIN
  
  const branches = user.business?.branches || []
  const currentBranchId = user.branch.id
  
  const items: ContextItem[] = [
    // Business (admin only)
    isAdmin && {
      id: 'business',
      type: 'business',
      label: 'Business Admin',
      icon: <Building2 />,
      active: isBusinessActive,
      visible: true,
      onClick: () => navigate({ to: '/business' })
    },
    
    // Branches
    ...branches.map(branch => ({
      id: branch.id,
      type: 'branch' as const,
      label: branch.name,
      icon: <span>{branch.name[0]}</span>, // First letter
      active: branch.id === currentBranchId && !isBusinessActive,
      visible: true,
      onClick: () => switchBranch(branch.id)
    })),
    
    // Divider (handled in render)
    
    // Contact Us
    {
      id: 'contact',
      type: 'action',
      label: 'Contact Us',
      icon: <HelpCircle />,
      active: location.pathname === '/contact-us',
      visible: true,
      onClick: () => navigate({ to: '/contact-us' })
    },
    
    // FAQ
    {
      id: 'faq',
      type: 'action',
      label: 'Help & FAQ',
      icon: <BookOpen />,
      active: false,
      visible: true,
      onClick: () => window.open('https://docs.yourapp.com', '_blank')
    }
  ].filter(Boolean)
  
  return (
    <aside className="w-16 border-r bg-sidebar flex flex-col items-center py-4 gap-2">
      {/* Business + Branches */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {items
          .filter(item => item.type === 'business' || item.type === 'branch')
          .map(item => (
            <ContextSwitcherItem
              key={item.id}
              {...item}
            />
          ))}
      </div>
      
      {/* Divider */}
      <Separator className="w-10" />
      
      {/* Actions */}
      <div className="flex flex-col gap-2">
        {items
          .filter(item => item.type === 'action')
          .map(item => (
            <ContextSwitcherItem
              key={item.id}
              {...item}
            />
          ))}
      </div>
    </aside>
  )
}
```

### Context Switcher Item

```typescript
function ContextSwitcherItem({ 
  label, 
  icon, 
  active, 
  onClick 
}: ContextItem) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={active ? "default" : "ghost"}
            size="icon"
            className={cn(
              "size-12 rounded-xl",
              active && "ring-2 ring-primary"
            )}
            onClick={onClick}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

---

### Business Overview Page

```
┌─────────────────────────────────────────────────────┐
│  Business Overview                        [Business] │
├─────────────────────────────────────────────────────┤
│                                                      │
│  📊 Stats                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│  │ Branches │ │  Users   │ │   Plan   │ │ Status ││
│  │    3     │ │    12    │ │   Pro    │ │ Active ││
│  └──────────┘ └──────────┘ └──────────┘ └────────┘│
│                                                      │
│  ⚡ Quick Actions                                    │
│  [+ Add Branch] [+ Invite User] [Manage Billing]    │
│                                                      │
│  📋 Recent Activity                                  │
│  • "Downtown Branch" created (2 days ago)           │
│  • ORDER_QUEUE enabled (1 week ago)                 │
│  • Upgraded to Pro plan (2 weeks ago)               │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

### Complete Navigation Structure

```
┌────────────┬──────────────────────┬───────────────────────┐
│  Context   │   Sidebar            │  Top Bar Profile      │
│  Switcher  │   (Main Nav)         │  Dropdown             │
├────────────┼──────────────────────┼───────────────────────┤
│            │                      │                       │
│    🏢      │ When Business active:│ ┌──────────────────┐ │
│  (admin)   │ • Overview           │ │ John Doe   online│ │
│            │ • Capabilities       │ │ ADMIN • john@... │ │
│    ───     │ • Branches           │ ├──────────────────┤ │
│            │ • Billing            │ │ 👤 My Account    │ │
│    D       │ • Suppliers          │ ├──────────────────┤ │
│  Downtown  │ • Customers          │ │ 🚪 Logout        │ │
│  (active)  │ • Profile            │ └──────────────────┘ │
│            │                      │                       │
│    M       │ When Branch active:  │                       │
│   Mall     │ • Dashboard          │                       │
│            │ • Admin              │                       │
│    C       │   └─ Employees       │                       │
│  Catering  │   └─ Products        │                       │
│            │ • Supervisor         │                       │
│    ───     │   └─ Reports         │                       │
│            │ • POS                │                       │
│    ?       │ • Settings           │                       │
│  Contact   │   └─ Entitlements    │                       │
│            │   └─ Units           │                       │
│    📖      │   └─ Categories      │                       │
│   FAQ      │                      │                       │
│            │                      │                       │
└────────────┴──────────────────────┴───────────────────────┘
```

**Key Points:**
1. Context switcher shows all branches user has access to
2. Clicking a branch switches the entire app context (reloads with new branch)
3. Sidebar content changes based on context (Business vs Branch)
4. Top bar profile dropdown stays consistent (user account settings)
5. Contact Us and FAQ in context switcher for easy access

---

## ✅ SUCCESS CRITERIA

### Must Have:
- ✅ Clear separation: Business vs Branch vs User settings
- ✅ Proper access control (admin vs supervisor vs all users)
- ✅ All old routes redirect to new locations
- ✅ Navigation reflects the new structure
- ✅ No broken links in the app

### Nice To Have:
- Breadcrumbs showing Business > Branches > [Branch Name]
- Business overview dashboard with stats
- Recently viewed branches quick access
- Branch comparison view
- Settings search functionality

---

## 📝 MIGRATION CHECKLIST

### Before Starting:
- [ ] Review current settings usage analytics
- [ ] Identify all links to `/billing/*` and `/settings`
- [ ] Plan database changes (if any)
- [ ] Create feature flag for gradual rollout

### During Implementation:
- [ ] Create new `/business` route structure
- [ ] Move existing pages to new locations
- [ ] Update all internal links
- [ ] Add redirects for old routes
- [ ] Update navigation sidebar
- [ ] Update access control/route guards
- [ ] Test all routes as different user roles

### After Launch:
- [ ] Monitor redirect usage (track old URLs)
- [ ] Update documentation
- [ ] Remove old routes after deprecation period
- [ ] Gather user feedback on new structure

---

## 🤔 OPEN QUESTIONS

1. **Breadcrumbs:** Should business pages show breadcrumbs? (Business > Branches > Downtown Branch)
2. **Branch switcher animation:** Fade transition or instant switch when changing branches?
3. **Permissions:** Can supervisors view (but not edit) business settings?
4. **Settings search:** Should we add search across all settings?
5. **Mobile:** How do we handle business admin section on mobile? (Separate app tab?)
6. **Profile dropdown:** Should "My Account" link show an icon? Which icon? (User, Settings, or UserCircle?)
7. **Context switcher width:** 60px or 80px? Should it be collapsible?
8. **Branch icons:** Use initials (D, M, C) or icons (📍, 🏢)? Or emoji picker per branch?
9. **Many branches:** If user has 20+ branches, should we add search/filter in context switcher?
10. **Branch switching:** Should we prompt "Save changes?" if user has unsaved work before switching?

---

**STATUS:** 📋 Ready for review - Awaiting approval to implement

**ESTIMATE:** 3-4 weeks for full implementation  
**RISK LEVEL:** 🟡 Medium (navigation changes, redirect management)
