/**
 * prompts.test.tsx
 *
 * Unit tests for the custom prompt/dialog components:
 *   src/components/custom/prompt/warning-prompt.tsx
 *   src/components/custom/prompt/success-prompt.tsx
 *   src/components/custom/prompt/loading-prompt.tsx
 *   src/components/custom/prompt/alert-prompt.tsx
 *
 * Coverage targets:
 *  ✅ WarningPrompt renders title, description, Cancel + Confirm buttons
 *  ✅ WarningPrompt Confirm calls onConfirm and closes when it returns true
 *  ✅ WarningPrompt stays open when onConfirm returns false
 *  ✅ WarningPrompt Cancel calls onClose
 *  ✅ SuccessPrompt renders title, description, OK button
 *  ✅ SuccessPrompt OK button calls onClose
 *  ✅ LoadingPrompt renders title, description, spinner
 *  ✅ LoadingPrompt renders custom icon when provided
 *  ✅ AlertPrompt renders title, description, action button
 *  ✅ AlertPrompt button calls onClick then onClose
 *  ✅ AlertPrompt button calls only onClose when no onClick
 *  ✅ All prompts render nothing when open=false
 *
 * Run with: pnpm test prompts
 */

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { SuccessPrompt } from '@/components/custom/prompt/success-prompt'
import { LoadingPrompt } from '@/components/custom/prompt/loading-prompt'
import { AlertPrompt } from '@/components/custom/prompt/alert-prompt'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// WarningPrompt
// ---------------------------------------------------------------------------

describe('WarningPrompt', () => {
  it('renders title and description when open', () => {
    render(
      <WarningPrompt
        open={true}
        onClose={vi.fn()}
        title='Delete Item'
        description='This cannot be undone.'
        onConfirm={async () => true}
      />,
    )
    expect(screen.getByText('Delete Item')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
  })

  it('renders Cancel and Confirm buttons', () => {
    render(<WarningPrompt open={true} onClose={vi.fn()} onConfirm={async () => true} />)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  it('uses custom btnText', () => {
    render(<WarningPrompt open={true} onClose={vi.fn()} btnText='Yes, delete it' onConfirm={async () => true} />)
    expect(screen.getByText('Yes, delete it')).toBeInTheDocument()
  })

  it('calls onConfirm and then onClose when confirm returns true', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn().mockResolvedValue(true)
    render(<WarningPrompt open={true} onClose={onClose} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('does NOT call onClose when onConfirm returns false', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn().mockResolvedValue(false)
    render(<WarningPrompt open={true} onClose={onClose} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancel button calls onClose', () => {
    const onClose = vi.fn()
    render(<WarningPrompt open={true} onClose={onClose} onConfirm={async () => true} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not render dialog content when open=false', () => {
    render(<WarningPrompt open={false} onClose={vi.fn()} onConfirm={async () => true} title='Hidden' />)
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// SuccessPrompt
// ---------------------------------------------------------------------------

describe('SuccessPrompt', () => {
  it('renders title and description when open', () => {
    render(
      <SuccessPrompt
        open={true}
        onClose={vi.fn()}
        title='Saved!'
        description='Your changes have been saved.'
      />,
    )
    expect(screen.getByText('Saved!')).toBeInTheDocument()
    expect(screen.getByText('Your changes have been saved.')).toBeInTheDocument()
  })

  it('renders OK button with default btnText', () => {
    render(<SuccessPrompt open={true} onClose={vi.fn()} />)
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('calls onClose when OK button is clicked', () => {
    const onClose = vi.fn()
    render(<SuccessPrompt open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('OK'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders custom btnText', () => {
    render(<SuccessPrompt open={true} onClose={vi.fn()} btnText='Next Customer' />)
    expect(screen.getByText('Next Customer')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    render(<SuccessPrompt open={false} onClose={vi.fn()} title='Hidden Success' />)
    expect(screen.queryByText('Hidden Success')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// LoadingPrompt
// ---------------------------------------------------------------------------

describe('LoadingPrompt', () => {
  it('renders title and description when open', () => {
    render(
      <LoadingPrompt
        open={true}
        onClose={vi.fn()}
        title='Processing...'
        description='Please wait.'
        icon={undefined}
      />,
    )
    expect(screen.getByText('Processing...')).toBeInTheDocument()
    expect(screen.getByText('Please wait.')).toBeInTheDocument()
  })

  it('renders default spinner when no icon provided', () => {
    render(
      <LoadingPrompt open={true} onClose={vi.fn()} title='Loading' description='Wait' icon={undefined} />,
    )
    // Radix Dialog renders into a portal — use document.querySelector
    expect(document.querySelector('.animate-spin')).not.toBeNull()
  })

  it('renders custom icon when provided', () => {
    render(
      <LoadingPrompt
        open={true}
        onClose={vi.fn()}
        title='Loading'
        description='Wait'
        icon={<div data-testid='custom-icon'>⚡</div>}
      />,
    )
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    render(<LoadingPrompt open={false} onClose={vi.fn()} title='Hidden' description='' icon={undefined} />)
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// AlertPrompt
// ---------------------------------------------------------------------------

describe('AlertPrompt', () => {
  it('renders title and description when open', () => {
    render(
      <AlertPrompt
        open={true}
        onClose={vi.fn()}
        title='Unverified Shift'
        description='Please reconcile before continuing.'
      />,
    )
    expect(screen.getByText('Unverified Shift')).toBeInTheDocument()
    expect(screen.getByText('Please reconcile before continuing.')).toBeInTheDocument()
  })

  it('renders default btnText "Close"', () => {
    render(<AlertPrompt open={true} onClose={vi.fn()} />)
    // Target the amber action button specifically by data-slot=button (not the Radix X-close)
    const actionBtn = document.querySelector('[data-slot="dialog-footer"] button')
    expect(actionBtn?.textContent).toBe('Close')
  })

  it('renders custom btnText', () => {
    render(<AlertPrompt open={true} onClose={vi.fn()} btnText='Logout' />)
    expect(document.body.textContent).toContain('Logout')
  })

  it('calls onClick then onClose when button is clicked', () => {
    const onClick = vi.fn()
    const onClose = vi.fn()
    render(<AlertPrompt open={true} onClose={onClose} onClick={onClick} />)
    const actionBtn = document.querySelector('[data-slot="dialog-footer"] button') as HTMLElement
    fireEvent.click(actionBtn)
    expect(onClick).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('calls only onClose when no onClick prop provided', () => {
    const onClose = vi.fn()
    render(<AlertPrompt open={true} onClose={onClose} />)
    const actionBtn = document.querySelector('[data-slot="dialog-footer"] button') as HTMLElement
    fireEvent.click(actionBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not render when open=false', () => {
    render(<AlertPrompt open={false} onClose={vi.fn()} title='Hidden Alert' />)
    expect(screen.queryByText('Hidden Alert')).not.toBeInTheDocument()
  })
})
