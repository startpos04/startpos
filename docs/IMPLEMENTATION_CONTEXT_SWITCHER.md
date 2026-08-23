# Context Switcher Implementation Guide

**Parent Plan:** See `SETTINGS_REORGANIZATION_PLAN.md`  
**Phase:** Phase 0 - Context Switcher  
**Status:** 🚀 Ready to implement

---

## 🎯 GOAL

Create a vertical context switcher bar on the far left that allows users to:
1. Switch between branches (changes entire app context)
2. Navigate to business admin section (admin only)
3. Access Contact Us and FAQ quickly

---

## 📐 DESIGN SPECS

### Visual Layout
```
┌──┬────────┬──────────────┐
│🏢│ Sidebar│ Main Content │
│  │        │              │
│D │        │              │
│M │        │              │
│C │        │              │
│  │        │              │
│──│        │              │
│? │        │              │
│📖│        │              │
└──┴────────┴──────────────┘
 ↑
60-80px
context
switcher
```

### Component Breakdown
- Width: `64px` (w-16)
- Background: `bg-sidebar` (matches sidebar theme)
- Border: Right border to separate from sidebar
- Padding: `py-4` (vertical spacing)
- Gap: `gap-2` between items

### Button States
- **Default:** `variant="ghost"`, `size="icon"`, gray/muted
- **Active:** `variant="default"`, `ring-2 ring-primary`, highlighted
- **Hover:** Slight background color change
- **Tooltip:** Shows full name on hover (side="right")

---

## 🗂️ FILES TO CREATE

### 1. Context Switcher Component
**Path:** `src/components/custom/dashboard/context-switcher.tsx`

**Responsibilities:**
- Fetch user's branches
- Detect current context (business vs branch)
- Render business button (admin only)
- Render branch buttons (all users)
- Render action buttons (Contact Us, FAQ)
- Handle click events

**Key Features:**
- Scrollable branches section (if many branches)
- Tooltips for all buttons
- Highlight active context
- Responsive to role (hide business if not admin)

### 2. Context Switcher Item
**Path:** `src/components/custom/dashboard/context-switcher-item.tsx`

**Responsibilities:**
- Render individual button with icon
- Show tooltip on hover
- Handle active state styling
- Emit click events

### 3. Branch Switch Hook
**Path:** `src/hooks/use-branch-switch.ts`

**Responsibilities:**
- Update user's active branch in database
- Refresh auth store with new branch
- Clear/invalidate relevant caches
- Navigate to appropriate page
- Handle errors gracefully

---

## 🔧 IMPLEMENTATION STEPS

### Step 1: Create Context Switcher Item Component

```typescript
// src/components/custom/dashboard/context-switcher-item.tsx
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ContextSwitcherItemProps {
  label: string
  icon: React.ReactNode
  active?: boolean
  onClick: () => void
  variant?: 'default' | 'ghost'
}

export function ContextSwitcherItem({ 
  label, 
  icon, 
  active = false, 
  onClick,
  variant = 'ghost'
}: ContextSwitcherItemProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={active ? 'default' : variant}
            size="icon"
            className={cn(
              'size-12 rounded-xl transition-all',
              active && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            )}
            onClick={onClick}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12}>
          <p className="font-medium">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

### Step 2: Create Branch Switch Hook

```typescript
// src/hooks/use-branch-switch.ts
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { authStore } from '@/store/auth-store'

export function useBranchSwitch() {
  const navigate = useNavigate()

  const switchBranch = async (branchId: string) => {
    try {
      // TODO: Create server function to update user's active branch
      // await updateUserActiveBranch({ branchId })
      
      // Refresh auth store to load new branch context
      await authStore.refresh()
      
      // Navigate to dashboard and force reload
      navigate({ to: '/dashboard' })
      
      // Force full page reload to ensure all branch-specific data is refreshed
      setTimeout(() => window.location.reload(), 100)
      
      toast.success('Branch switched successfully')
    } catch (error) {
      console.error('Failed to switch branch:', error)
      toast.error('Failed to switch branch. Please try again.')
    }
  }

  return { switchBranch }
}
```

### Step 3: Create Context Switcher Component

```typescript
// src/components/custom/dashboard/context-switcher.tsx
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Building2, BookOpen, HelpCircle } from 'lucide-react'
import { Role } from 'prisma/generated/prisma/enums'
import { Separator } from '@/components/ui/separator'
import { useBranchSwitch } from '@/hooks/use-branch-switch'
import { authStore } from '@/store/auth-store'
import { ContextSwitcherItem } from './context-switcher-item'

export function ContextSwitcher() {
  const user = useStore(authStore, state => state.user)
  const location = useLocation()
  const navigate = useNavigate()
  const { switchBranch } = useBranchSwitch()

  const isBusinessActive = location.pathname.startsWith('/business')
  const isAdmin = user.role === Role.ADMIN
  const currentBranchId = user.branch.id

  // Get all branches (for now, just current branch - will expand later)
  const branches = [user.branch] // TODO: Fetch all user's branches

  return (
    <aside className="w-16 border-r bg-sidebar flex flex-col items-center py-4 gap-2 shrink-0">
      {/* Business + Branches */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {/* Business Admin (Admin only) */}
        {isAdmin && (
          <ContextSwitcherItem
            label="Business Admin"
            icon={<Building2 className="size-5" />}
            active={isBusinessActive}
            onClick={() => navigate({ to: '/business' })}
          />
        )}

        {/* Current Branch (or list of branches) */}
        {branches.map((branch) => (
          <ContextSwitcherItem
            key={branch.id}
            label={branch.name}
            icon={
              <span className="text-lg font-bold">
                {branch.name[0].toUpperCase()}
              </span>
            }
            active={branch.id === currentBranchId && !isBusinessActive}
            onClick={() => {
              if (branch.id !== currentBranchId) {
                switchBranch(branch.id)
              }
            }}
          />
        ))}
      </div>

      {/* Divider */}
      <Separator className="w-10" />

      {/* Action Items */}
      <div className="flex flex-col gap-2">
        {/* Contact Us */}
        <ContextSwitcherItem
          label="Contact Us"
          icon={<HelpCircle className="size-5" />}
          active={location.pathname === '/contact-us'}
          onClick={() => navigate({ to: '/contact-us' })}
        />

        {/* FAQ */}
        <ContextSwitcherItem
          label="Help & FAQ"
          icon={<BookOpen className="size-5" />}
          onClick={() => {
            // TODO: Replace with actual FAQ link
            window.open('https://help.yourapp.com', '_blank')
          }}
        />
      </div>
    </aside>
  )
}
```

### Step 4: Update Dashboard Layout

```typescript
// src/components/custom/dashboard/index.tsx
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LegalFooter } from '../legal-footer'
import AppNav from './app-nav'
import { AppSidebar } from './app-sidebar'
import { ContextSwitcher } from './context-switcher' // NEW

export function Dashboard({ children }: { children?: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        {/* NEW: Add context switcher */}
        <ContextSwitcher />
        
        <AppSidebar />
        <SidebarInset className='flex flex-col h-screen overflow-hidden justify-start'>
          <AppNav />
          <div className='pt-0 grow h-1 overflow-y-auto flex flex-col gap-2'>{children}</div>
          <LegalFooter />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
```

### Step 5: Update Sidebar (Remove Contact Us & Billing)

```typescript
// src/components/custom/dashboard/app-sidebar.tsx

// REMOVE these items from the sidebar items array:
{
  title: 'Contact us',
  url: '/contact-us',
  icon: <LifeBuoyIcon />,
  allowedRoles: [Role.ADMIN, Role.SUPERVISOR, Role.CASHIER, Role.SERVICE_PROVIDER],
},
{
  title: 'Billing',
  url: '/billing',
  icon: <CreditCardIcon />,
  allowedRoles: [Role.ADMIN],
},

// These are now in the context switcher
```

---

## 🧪 TESTING CHECKLIST

### Visual Tests
- [ ] Context switcher appears on the left side
- [ ] Width is exactly 64px (w-16)
- [ ] Buttons are properly sized (size-12)
- [ ] Active button has ring highlight
- [ ] Tooltips appear on hover
- [ ] Icons are centered in buttons
- [ ] Separator line appears between sections
- [ ] Scrollable if many branches (test with 10+ branches)

### Functional Tests
- [ ] Business button only visible to admins
- [ ] Business button navigates to `/business` (even though page doesn't exist yet)
- [ ] Branch button highlights current branch
- [ ] Contact Us navigates to `/contact-us`
- [ ] FAQ opens external link in new tab
- [ ] Tooltips show correct labels
- [ ] Active state persists on page navigation

### Responsive Tests
- [ ] Works on desktop (1920px+)
- [ ] Works on tablet (768px-1024px)
- [ ] Works on mobile (< 768px) - may need to collapse
- [ ] Dark mode theme support
- [ ] High contrast mode support

### Edge Cases
- [ ] User with only 1 branch (still shows branch button)
- [ ] User with 20+ branches (scrollable list)
- [ ] Non-admin users (business button hidden)
- [ ] Offline mode (buttons still visible but disabled?)

---

## 🚨 IMPORTANT NOTES

### Database Changes Required
You'll need to create a server function to update the user's active branch:

```typescript
// src/lib/server-fn/update-active-branch.ts
export async function updateUserActiveBranch({ 
  branchId 
}: { 
  branchId: string 
}) {
  'use server'
  
  const session = await getSession()
  if (!session?.user) throw new Error('Unauthorized')
  
  // Update user's active branch in database
  await prisma.membership.update({
    where: {
      userId_businessId: {
        userId: session.user.id,
        businessId: session.user.businessId
      }
    },
    data: {
      branchId: branchId
    }
  })
  
  return { success: true }
}
```

### Multi-Branch Support
Currently shows only current branch. To show all branches user has access to:

```typescript
// Fetch user's branches
const branches = await prisma.branch.findMany({
  where: {
    businessId: user.business.id,
    deletedAt: null,
    // Optional: filter by user's branch access
    memberships: {
      some: {
        userId: user.id
      }
    }
  },
  orderBy: { name: 'asc' }
})
```

### Navigation State
When switching branches, consider:
- Should unsaved changes prompt confirmation?
- Should current page be preserved (e.g., stay on `/products` after switch)?
- Should we redirect to dashboard always?

---

## 📦 DEPENDENCIES

### Required Packages (Already Installed)
- `@tanstack/react-router` - Navigation
- `@tanstack/react-store` - State management
- `lucide-react` - Icons
- `sonner` - Toast notifications

### Required Components (Already Exist)
- `Button` - Button component
- `Tooltip` - Tooltip component
- `Separator` - Divider line
- `Sidebar` components - For theming consistency

---

## 🎨 STYLING TOKENS

Use these Tailwind classes for consistency:

```typescript
// Sizing
width: 'w-16' // 64px
buttonSize: 'size-12' // 48x48px
iconSize: 'size-5' // 20x20px

// Spacing
padding: 'py-4' // Vertical padding
gap: 'gap-2' // Between items

// Colors
background: 'bg-sidebar'
border: 'border-r'
activeRing: 'ring-2 ring-primary ring-offset-2 ring-offset-background'

// Border radius
buttons: 'rounded-xl'

// Transitions
all: 'transition-all'
```

---

## ✅ DEFINITION OF DONE

Context switcher is complete when:
1. ✅ Visual component renders on the left side
2. ✅ Business button visible only to admins
3. ✅ Branch buttons render for current branch
4. ✅ Active state highlights correctly
5. ✅ Tooltips work on hover
6. ✅ Contact Us navigates correctly
7. ✅ FAQ opens in new tab
8. ✅ No console errors
9. ✅ Responsive on all screen sizes
10. ✅ Dark mode support
11. ✅ Contact Us and Billing removed from sidebar
12. ✅ Code is clean and commented

---

## 🔜 NEXT STEPS

After context switcher is complete:
1. Create `/business` routes and pages (Phase 1)
2. Implement branch switching server function
3. Fetch and display all user's branches
4. Add branch management features
5. Continue with SETTINGS_REORGANIZATION_PLAN.md phases

---

**Good luck with the implementation! 🚀**
