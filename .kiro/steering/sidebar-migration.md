---
inclusion: manual
---

# Master Plan: Modal → Sidebar Migration

## Context

The app uses a custom `MountManager` system (`src/lib/mount-manager.tsx`) as the universal overlay mechanism. The products page has been partially migrated to a sidebar pattern using a custom `Aside` component with a dedicated `MountManager` target. This plan covers migrating all remaining CRUD dialogs to the same sidebar pattern.

## What Stays as a Modal (Do Not Migrate)

| Component | Reason |
|---|---|
| `WarningPrompt` | Destructive confirmations — blocking the user is intentional |
| `AuthPrompt` | System auth gate — modal blocking is correct |
| `LoadingPrompt` | Transient system state |
| `SuccessPrompt` | Transient feedback |

---

## Migration Targets

### Phase 1 — Ingredients

**Files involved:**
- `src/routes/(private)/(dashboard)/(admin)/ingredients/index.tsx` — page host
- `src/routes/(private)/(dashboard)/(admin)/ingredients/create/index.tsx` — create form
- `src/routes/(private)/(dashboard)/(admin)/ingredients/$ingredientId/index.tsx` — details view
- `src/routes/(private)/(dashboard)/(admin)/ingredients/$ingredientId/-edit-ingredient.tsx` — edit form
- `src/routes/(private)/(dashboard)/(admin)/ingredients/$ingredientId/-restock.tsx` — restock form
- `src/routes/(private)/(dashboard)/(admin)/ingredients/-components/ingredient-sidebar.tsx` — **NEW** (to be created)

**Tasks:**
- [x] Create `ingredient-sidebar.tsx` with `INGREDIENT_ASIDE_ID`, `showIngredientSidebar()` helper
- [x] Add `<MountManager id={INGREDIENT_ASIDE_ID} />` host to the ingredients page layout (wrap with flex row container like products page)
- [x] Migrate `CreateIngredientDialog` → `CreateIngredientSidebar`
- [x] Migrate `IngredientDetailsDialog` → `IngredientDetailsSidebar`
- [x] Migrate `EditIngredientDialog` → nested panel inside details sidebar (replaces content in-place)
- [x] Migrate `RestockIngredientDialog` → nested sidebar panel (layered content, not a new modal)

---

### Phase 2 — Employees

**Files involved:**
- `src/routes/(private)/(dashboard)/(admin)/employees/index.tsx` — page host
- `src/routes/(private)/(dashboard)/(admin)/employees/create/index.tsx` — create form
- `src/routes/(private)/(dashboard)/(admin)/employees/$employeeId/index.tsx` — details view
- `src/routes/(private)/(dashboard)/(admin)/employees/$employeeId/-edit-account.tsx` — edit form
- `src/routes/(private)/(dashboard)/(admin)/employees/-components/employee-sidebar.tsx` — **NEW** (to be created)

**Tasks:**
- [x] Create `employee-sidebar.tsx` with `EMPLOYEE_ASIDE_ID`, `showEmployeeSidebar()` helper
- [x] Add `<MountManager id={EMPLOYEE_ASIDE_ID} />` host to the employees page layout
- [x] Migrate `CreateEmployeeDialog` → `CreateEmployeeSidebar`
- [x] Migrate `EmployeeDetailsDialog` → `EmployeeDetailsSidebar`
- [x] Migrate `EditEmployeeDialog` → nested panel inside details sidebar (triggered from Edit Profile button)

---

### Phase 3 — Tasks

**Files involved:**
- `src/routes/(private)/tasks/index.tsx` — page host
- `src/routes/(private)/tasks/create/index.tsx` — create form
- `src/routes/(private)/tasks/$taskId/index.tsx` — details view
- `src/routes/(private)/tasks/-components/task-sidebar.tsx` — **NEW** (to be created)

**Tasks:**
- [x] Create `task-sidebar.tsx` with `TASK_ASIDE_ID`, `showTaskSidebar()` helper
- [x] Add `<MountManager id={TASK_ASIDE_ID} />` host to the tasks page layout
- [x] Migrate `CreateTaskDialog` → `CreateTaskSidebar`
- [x] Migrate `TaskDetailsDialog` → `TaskDetailsSidebar`

---

## Reference Implementation (Products — Already Done)

Use the products implementation as the reference for all phases.

**Pattern files:**
- `src/routes/(private)/(dashboard)/(admin)/products/-components/product-sidebar.tsx` — sidebar host helper
- `src/routes/(private)/(dashboard)/(admin)/products/index.tsx` — how the page mounts the sidebar host
- `src/components/custom/aside.tsx` — the Aside UI primitive

**Key pattern:**
```tsx
// 1. Define the target ID and helper
export const PRODUCT_ASIDE_ID = 'product-aside'

export const showProductSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: PRODUCT_ASIDE_ID,
    target: PRODUCT_ASIDE_ID,
    toggle,
    children,
  })
}

// 2. Mount the host in the page layout (alongside the table)
<div className='flex h-full gap-0 overflow-hidden'>
  <div className='flex-1 overflow-auto'>
    {/* table content */}
  </div>
  <MountManager id={PRODUCT_ASIDE_ID} />
</div>

// 3. Show a sidebar panel
showProductSidebar(<CreateProductSidebar />)

// 4. Nest panels (e.g. Details → Edit) by calling showProductSidebar again with new children
//    Same key means it replaces the current content, not stacks a new overlay
showProductSidebar(<EditProductSidebar />)
```

---

## Content Polish Rules

These apply to all sidebar migrations. The goal is to make content feel native to the sidebar container, not like a modal that was moved.

### Sidebar Header Band
Every sidebar panel gets a fixed top band containing:
- Title (left) — `text-xl font-semibold` (not `text-3xl font-bold` like modal headings)
- Subtitle (left, below title) — `text-sm text-muted-foreground`
- Close button (right) — `X` icon, calls `onClose()`
- Optional back button (left of title) — `← Back` for nested panels (e.g. Edit inside Details)

```tsx
// Sidebar header band pattern
<div className='flex items-center justify-between p-4 border-b shrink-0'>
  <div className='flex items-center gap-2'>
    {onBack && (
      <Button variant='ghost' size='icon' onClick={onBack} className='h-7 w-7'>
        <ArrowLeft className='h-4 w-4' />
      </Button>
    )}
    <div>
      <h2 className='text-base font-semibold leading-none'>{title}</h2>
      {description && <p className='text-xs text-muted-foreground mt-1'>{description}</p>}
    </div>
  </div>
  <Button variant='ghost' size='icon' onClick={onClose} className='h-7 w-7'>
    <X className='h-4 w-4' />
  </Button>
</div>
```

### Forms (Create / Edit panels)
- Remove the standalone `<h1>` / `<p>` title block inside the form body — the sidebar header band handles this
- All `grid-cols-2` field layouts → `grid-cols-1` inside `w-96`, keep `grid-cols-2` only for `xl:w-lg` breakpoint
- Submit button → sticky footer band (does not scroll with the form)
- Form content area → `flex-1 overflow-y-auto p-4 space-y-4`

```tsx
// Sidebar form layout pattern
<div className='flex flex-col h-full'>
  {/* Header band */}
  <SidebarHeader title='New Ingredient' description='...' onClose={onClose} />

  {/* Scrollable form body */}
  <div className='flex-1 overflow-y-auto p-4 space-y-4'>
    {/* form fields */}
  </div>

  {/* Sticky footer */}
  <div className='p-4 border-t shrink-0'>
    <Button className='w-full'>Submit</Button>
  </div>
</div>
```

### Details / View panels
- Stat cards in `grid-cols-3` → `grid-cols-1` stack, or `grid-cols-2` + 1 full-width card below
- Tables inside details → remove outer `Card` border, use a plain `Table` with a section label above it
- Action buttons (e.g. Restock, Edit) → move from the content header into the **sidebar header band** right side
- Replace `overflow-y-auto max-h-full` on the content root → `flex-1 overflow-y-auto`
- Tabs stay as-is — the tab pattern works natively in a vertical layout

### Typography scaling
| Modal usage | Sidebar equivalent |
|---|---|
| `text-3xl font-bold tracking-tight` (page title) | Handled by sidebar header band, remove from content |
| `text-2xl font-bold` (section titles) | `text-base font-semibold` |
| `text-[10px] uppercase tracking-widest` section labels | Keep as-is — they work well |
| `text-3xl font-black` stat numbers | `text-2xl font-black` (slightly scaled down) |

### Nested panels (Details → Edit → Back)
- Do NOT spawn a second MountManager overlay — update sidebar content in-place
- Call `showXxxSidebar(<EditXxxSidebar onBack={() => showXxxSidebar(<XxxDetailsSidebar />)} />)`
- Back button in the header takes the user back to the details view
- No backdrop, no animation stacking — just a content swap in the same `Aside` container

---

## Aside Component Reference

```tsx
// src/components/custom/aside.tsx
<div className={cn(
  'h-full bg-card flex flex-col overflow-hidden z-20 shrink-0 transition-all duration-300 ease-in-out rounded-tl-2xl',
  open ? 'w-96 xl:w-lg border border-border shadow-xl' : 'w-0 ...',
)}>
  <div className={cn('w-96 xl:w-lg h-1 grow flex flex-col', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
    {children}
  </div>
</div>
```

The `Aside` component:
- Lives **in the page flow** (not a portal) — no backdrop, no scroll lock
- Animates from `w-0` → `w-96` / `xl:w-lg`
- Passes `children` directly, so the sidebar content component controls its own layout
- The `children` container has `h-1 grow flex flex-col` — always use `flex-1` on inner scrollable areas

---

## Progress Tracker

| Area | Create | Details | Edit | Restock/Nested |
|---|---|---|---|---|
| **Products** | ✅ Sidebar | ✅ Sidebar | ✅ Sidebar | — |
| **Ingredients** | ✅ Sidebar | ✅ Sidebar | ✅ Nested panel | ✅ Nested panel |
| **Employees** | ✅ Sidebar | ✅ Sidebar | ✅ Nested panel | — |
| **Tasks** | ✅ Sidebar | ✅ Sidebar | — | — |
