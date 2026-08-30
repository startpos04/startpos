# Component Usage Standards

## Overview

This document outlines the standard components to use for common UI patterns in our application. Using these standards ensures consistency, reduces bundle size, and maintains our design system integrity.

## Standard Components

### Tabs
**Use:** Our custom tabs component
- Always use the project's custom tabs implementation
- Provides consistent styling and behavior across the application
- Maintains accessibility standards

### Tables
**Use:** Table View component
- Use our standardized Table View component for all tabular data
- Provides built-in sorting, filtering, and pagination capabilities
- Ensures consistent table styling and behavior

### Modals and Drawers
**Use:** Mount Manager
- All modal and drawer implementations should use Mount Manager
- Provides centralized management of overlays
- Handles proper z-indexing, focus management, and cleanup
- Supports both modal and drawer patterns through the same API

### Forms
**Use:** Our form components
- Use the project's standardized form components for all form implementations
- Provides consistent validation patterns and styling
- Integrates with our form state management solution

### User Feedback and Notifications

**Use:** Prompt Components with Mount Manager (Preferred)
- Use our custom Prompt components (`SuccessPrompt`, `AlertPrompt`, `WarningPrompt`, `LoadingPrompt`) with MountManager for important user feedback
- Located in `src/components/custom/prompt/`
- Provides modal-based feedback with proper focus management and accessibility
- Use for: confirmations, success messages, warnings, errors that require user attention
- Benefits: Better visibility, user must acknowledge, prevents accidental dismissal

**Example:**
```typescript
import MountManager from '@/lib/mount-manager'
import { SuccessPrompt } from '@/components/custom/prompt/success-prompt'

MountManager.show(SuccessPrompt, {
  title: 'Success',
  description: 'Your changes have been saved.',
  btnText: 'OK'
})
```

**Use:** Sonner Toast (Secondary)
- Use Sonner toast for non-critical, transient notifications only
- Use for: background operations, non-blocking status updates, low-priority information
- Toast messages should not require user action or acknowledgment
- Avoid for errors or important confirmations - use Prompt components instead

**When to Use Each:**
- ✅ **Prompt Component**: Payment confirmations, delete confirmations, errors, success messages requiring acknowledgment
- ✅ **Toast**: "Item added to cart", "Settings auto-saved", "Syncing in background"
- ❌ **DON'T use shadcn Alert component** - use Prompt components instead

## Benefits of Following These Standards

- **Consistency**: Uniform user experience across the application
- **Maintainability**: Centralized component updates affect all usage
- **Performance**: Reduced bundle size by avoiding duplicate implementations
- **Accessibility**: Standard components include proper ARIA attributes and keyboard navigation
- **Development Speed**: Pre-built, tested components reduce implementation time

## Implementation Notes

- When implementing new features, always check if these standard components meet your needs before considering alternatives
- If you need to extend functionality, prefer enhancing the standard component over creating a new one
- Document any deviations from these standards with clear justification

---

*This steering file ensures consistent component usage across all development work.*