---
inclusion: auto
---

# UI Feedback Patterns

## Overview

This steering document establishes the standard patterns for providing user feedback in our application. Always use **Prompt Components with MountManager** for important user feedback instead of shadcn Alert components or inline messages.

## Core Pattern: Prompt Components with MountManager

### Available Prompt Components

Located in `src/components/custom/prompt/`:

1. **SuccessPrompt** - For successful operations
2. **AlertPrompt** - For warnings and important information
3. **WarningPrompt** - For confirmations before destructive actions
4. **LoadingPrompt** - For loading states
5. **AuthPrompt** - For authentication required messages

### Why Prompt Components?

✅ **Better visibility** - Modal overlay ensures user sees the message  
✅ **User acknowledgment** - Requires explicit action, prevents missed notifications  
✅ **Accessibility** - Built-in focus management, keyboard navigation, screen reader support  
✅ **Consistent UX** - Standardized icons, colors, and behavior  
✅ **Centralized management** - MountManager handles stacking, z-index, cleanup  

### Basic Usage

```typescript
import MountManager from '@/lib/mount-manager'
import { SuccessPrompt } from '@/components/custom/prompt/success-prompt'
import { AlertPrompt } from '@/components/custom/prompt/alert-prompt'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'

// Success message
MountManager.show(SuccessPrompt, {
  title: 'Payment Submitted',
  description: 'Your payment has been submitted successfully.',
  btnText: 'OK'
})

// Alert/Warning message
MountManager.show(AlertPrompt, {
  title: 'Payment Pending',
  description: 'Your payment is awaiting admin approval.',
  btnText: 'Understood'
})

// Confirmation before action
MountManager.show(WarningPrompt, {
  title: 'Delete Payment?',
  description: 'This action cannot be undone.',
  btnText: 'Delete',
  onClick: async () => {
    await deletePayment()
  }
})
```

### With Navigation

```typescript
MountManager.show(SuccessPrompt, {
  title: 'Subscription Activated',
  description: 'Your subscription is now active.',
  btnText: 'View Dashboard',
  onClick: () => {
    router.navigate({ to: '/billing' })
  }
})
```

### Advanced: Keyed Prompts for Updates

Use a stable key when you need to update the same prompt:

```typescript
const PAYMENT_KEY = 'payment-status'

// Show initial state
MountManager.show(LoadingPrompt, {
  key: PAYMENT_KEY,
  title: 'Processing...',
  description: 'Please wait while we process your payment.'
})

// Update to success
setTimeout(() => {
  MountManager.update(PAYMENT_KEY, {
    title: 'Payment Complete',
    description: 'Your payment was processed successfully.'
  })
}, 2000)
```

## Decision Matrix: When to Use What

### Use Prompt Component (Modal Dialog)

✅ **Payment confirmations** - "Payment submitted", "Payment approved"  
✅ **Subscription changes** - "Subscription activated", "Plan upgraded"  
✅ **Destructive actions** - "Delete account?", "Cancel subscription?"  
✅ **Errors** - "Payment failed", "Invalid credentials"  
✅ **Form submissions** - "Settings saved", "Profile updated"  
✅ **Important warnings** - "Subscription expiring soon"  

### Use Sonner Toast (Non-blocking)

✅ **Background operations** - "Syncing in background", "Auto-saved"  
✅ **Low-priority info** - "Item added to cart", "Copied to clipboard"  
✅ **Progress updates** - "Uploading...", "Processing..."  
✅ **Non-critical status** - "Connection restored", "New update available"  

### Never Use

❌ **shadcn Alert component** - Use Prompt components instead  
❌ **Inline error messages for critical errors** - Use Prompt for visibility  
❌ **Browser alert()** - Not accessible, inconsistent styling  
❌ **Browser confirm()** - Use WarningPrompt instead  

## Common Patterns

### 1. Form Submission Success

```typescript
const handleSubmit = async (data: FormData) => {
  try {
    await submitForm(data)
    
    MountManager.show(SuccessPrompt, {
      title: 'Form Submitted',
      description: 'Your form has been submitted successfully.',
      btnText: 'Continue',
      onClick: () => {
        router.navigate({ to: '/dashboard' })
      }
    })
  } catch (error) {
    MountManager.show(AlertPrompt, {
      title: 'Submission Failed',
      description: error.message || 'An error occurred. Please try again.',
      btnText: 'OK'
    })
  }
}
```

### 2. Destructive Action Confirmation

```typescript
const handleDelete = (itemId: string) => {
  MountManager.show(WarningPrompt, {
    title: 'Delete Item?',
    description: 'This action cannot be undone. Are you sure?',
    btnText: 'Delete',
    onClick: async () => {
      try {
        await deleteItem(itemId)
        
        MountManager.show(SuccessPrompt, {
          title: 'Item Deleted',
          description: 'The item has been deleted successfully.',
          btnText: 'OK'
        })
      } catch (error) {
        MountManager.show(AlertPrompt, {
          title: 'Delete Failed',
          description: 'Could not delete item. Please try again.',
          btnText: 'OK'
        })
      }
    }
  })
}
```

### 3. Multi-step Process with Loading

```typescript
const PROCESS_KEY = 'multi-step-process'

const handleProcess = async () => {
  // Step 1: Show loading
  MountManager.show(LoadingPrompt, {
    key: PROCESS_KEY,
    title: 'Step 1 of 3',
    description: 'Validating your payment...'
  })
  
  await validatePayment()
  
  // Step 2: Update loading
  MountManager.update(PROCESS_KEY, {
    title: 'Step 2 of 3',
    description: 'Processing transaction...'
  })
  
  await processTransaction()
  
  // Step 3: Update loading
  MountManager.update(PROCESS_KEY, {
    title: 'Step 3 of 3',
    description: 'Activating subscription...'
  })
  
  await activateSubscription()
  
  // Close loading and show success
  const existing = __mountRegistry.getByKey(PROCESS_KEY)
  if (existing) MountManager.close(existing.id)
  
  MountManager.show(SuccessPrompt, {
    title: 'All Done!',
    description: 'Your subscription is now active.',
    btnText: 'Get Started'
  })
}
```

### 4. Batch Operations

```typescript
MountManager.batch(() => {
  // Close all existing prompts first
  MountManager.clear()
  
  // Show new prompt
  MountManager.show(SuccessPrompt, {
    title: 'Batch Complete',
    description: `Successfully processed ${count} items.`,
    btnText: 'OK'
  })
})
```

## Anti-Patterns to Avoid

### ❌ Don't: Using shadcn Alert

```typescript
// DON'T DO THIS
import { Alert, AlertDescription } from '@/components/ui/alert'

<Alert>
  <AlertDescription>Payment submitted</AlertDescription>
</Alert>
```

### ✅ Do: Use Prompt Component

```typescript
// DO THIS INSTEAD
import MountManager from '@/lib/mount-manager'
import { SuccessPrompt } from '@/components/custom/prompt/success-prompt'

MountManager.show(SuccessPrompt, {
  title: 'Payment Submitted',
  description: 'Your payment has been submitted successfully.',
  btnText: 'OK'
})
```

### ❌ Don't: Using Toast for Important Feedback

```typescript
// DON'T DO THIS - User might miss it
import { toast } from 'sonner'
toast.success('Payment approved - subscription activated')
```

### ✅ Do: Use Prompt for Important Feedback

```typescript
// DO THIS - Requires user acknowledgment
MountManager.show(SuccessPrompt, {
  title: 'Payment Approved',
  description: 'Your subscription has been activated successfully.',
  btnText: 'View Dashboard'
})
```

## Accessibility Considerations

Prompt components automatically handle:

✅ **Focus trapping** - Focus stays within the prompt  
✅ **Escape key** - Configured per prompt type  
✅ **Keyboard navigation** - Tab through interactive elements  
✅ **Screen reader announcements** - Proper ARIA attributes  
✅ **Focus restoration** - Returns focus when closed  

No additional work needed - it's built in!

## MountManager API Reference

```typescript
// Show a prompt
const id = MountManager.show(Component, options)

// Show with stable key (for updates)
MountManager.show(Component, { key: 'my-key', ...props })

// Update existing prompt
MountManager.update('my-key', { title: 'Updated' })

// Toggle (open if closed, close if open)
MountManager.toggle(Component, { key: 'my-key', ...props })

// Close specific prompt
MountManager.close(id)

// Close all children after a prompt
MountManager.closeChildren(id)

// Clear all prompts
MountManager.clear()

// Batch multiple operations
MountManager.batch(() => {
  MountManager.clear()
  MountManager.show(SuccessPrompt, {...})
})
```

## Testing Prompts

```typescript
import { describe, it, expect, vi } from 'vitest'
import MountManager from '@/lib/mount-manager'
import { SuccessPrompt } from '@/components/custom/prompt/success-prompt'

describe('Payment submission', () => {
  it('shows success prompt after payment', async () => {
    const showSpy = vi.spyOn(MountManager, 'show')
    
    await submitPayment()
    
    expect(showSpy).toHaveBeenCalledWith(
      SuccessPrompt,
      expect.objectContaining({
        title: 'Payment Submitted',
        description: expect.any(String)
      })
    )
  })
})
```

## Migration Guide

### From shadcn Alert

**Before:**
```typescript
import { Alert, AlertDescription } from '@/components/ui/alert'

{error && (
  <Alert variant="destructive">
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
```

**After:**
```typescript
import MountManager from '@/lib/mount-manager'
import { AlertPrompt } from '@/components/custom/prompt/alert-prompt'

useEffect(() => {
  if (error) {
    MountManager.show(AlertPrompt, {
      title: 'Error',
      description: error,
      btnText: 'OK'
    })
  }
}, [error])
```

### From Toast (for important messages)

**Before:**
```typescript
import { toast } from 'sonner'
toast.success('Subscription activated')
```

**After:**
```typescript
import MountManager from '@/lib/mount-manager'
import { SuccessPrompt } from '@/components/custom/prompt/success-prompt'

MountManager.show(SuccessPrompt, {
  title: 'Subscription Activated',
  description: 'Your subscription is now active.',
  btnText: 'Get Started'
})
```

## Related Files

- **MountManager**: `src/lib/mount-manager.tsx`
- **Prompt Components**: `src/components/custom/prompt/`
- **Component Standards**: `.kiro/steering/component-standards.md`

---

**This is a steering standard. Always follow these patterns for user feedback.**
