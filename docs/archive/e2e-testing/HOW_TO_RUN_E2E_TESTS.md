# How to Run E2E Tests

## ⚠️ CRITICAL: Two Terminal Setup Required

E2E tests run against the **production build** (not dev server) to match your production environment.

### Step 1: Start Production Server (Terminal 1)

```powershell
cd c:\Users\ADMIN\Documents\workspace\active\start-pos\web
pnpm start
```

**Wait for:**
```
> vite preview

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
```

**Note:** First build takes 1-2 minutes. Keep this terminal running.

### Step 2: Run E2E Tests (Terminal 2)

```powershell
cd c:\Users\ADMIN\Documents\workspace\active\start-pos\web

# Option A: Playwright UI (recommended for development)
pnpm test:e2e:ui

# Option B: Run all tests headless
pnpm test:e2e

# Option C: Run with browser visible
pnpm test:e2e:headed

# Option D: Run specific test
pnpm test:e2e billing-success-addons.spec.ts --project=admin
```

## 🚨 Error Messages

### If You Forget to Start Server:

When you run `pnpm test:e2e` without the server running, you'll see:

```
❌ [E2E Setup] PRODUCTION SERVER NOT RUNNING!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  The E2E tests require the production build to be running.
  
  Please start the server FIRST in another terminal:
  
    pnpm start
  
  Then run the E2E tests:
  
    pnpm test:e2e
    pnpm test:e2e:ui
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Fix:** Start `pnpm start` in another terminal first.

### If Port 3000 is Already in Use:

```
Error: Port 3000 is already in use
```

**Fix:** 
- Check if `pnpm start` is already running
- Kill other processes using port 3000
- Or change PORT in `.env.local`: `PORT=3001`

## 🎯 What Gets Tested

### Test Workflow:
1. **Global Setup** (runs once):
   - ✅ Checks production server is running
   - ✅ Resets database
   - ✅ Seeds test data
   - ✅ Generates auth state files for admin/supervisor/cashier

2. **Individual Tests** (use saved auth):
   - Login already done (reuses auth state)
   - Tests run as authenticated user
   - Each test gets fresh browser context

## 📁 Important Files

- `playwright.config.ts` - Playwright configuration
- `__tests__/e2e/global-setup.ts` - Setup script
- `__tests__/e2e/fixtures/.auth/*.json` - Saved auth states
- `__tests__/e2e/README.md` - Test documentation

## 🐛 Debugging

### View Browser While Testing:
```powershell
pnpm test:e2e:headed
```

### Pause on Failure:
```powershell
pnpm test:e2e --debug
```

### View Screenshots:
Failed tests save screenshots to `test-results/`

### Check Auth State:
```powershell
cat __tests__/e2e/fixtures/.auth/admin.json
```

Should contain session token cookie.

## 💡 Tips

- **Keep server running** between test runs for faster execution
- **Use Playwright UI** (`pnpm test:e2e:ui`) for interactive debugging
- **Run specific tests** to iterate faster when adding test IDs
- **Check screenshots** in `test-results/` when tests fail

## 🔧 Alternative: Auto-Start (Slower)

If you want Playwright to build and start automatically (not recommended for development):

**Edit `playwright.config.ts`:**
```typescript
webServer: {
  command: 'pnpm start',
  url: 'http://localhost:3000',
  reuseExistingServer: !process.env['CI'], // Change this line
  // ...
}
```

This adds 1-2 minutes to every test run for the build process.
