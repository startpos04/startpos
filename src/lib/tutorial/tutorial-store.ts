/**
 * tutorial-store.ts
 *
 * TutorialStore — session-scoped dismiss state for tutorials.
 *
 * Design decisions:
 *   - Session memory only: not persisted to DB or localStorage.
 *   - Cleared on logout (logout calls resetAuth which recreates the store).
 *   - Tutorials reappear on next login until the underlying condition resolves.
 *   - No migration needed — zero write path to the database.
 */

import { Store } from '@tanstack/react-store'

interface TutorialStoreState {
  /** IDs of tutorials dismissed this session */
  dismissed: Set<string>
}

const createStore = () =>
  new Store<TutorialStoreState>({
    dismissed: new Set<string>(),
  })

export const tutorialStore = createStore()

/**
 * Dismiss a tutorial for this session.
 * The tutorial will reappear on next login.
 */
export function dismissTutorial(id: string): void {
  tutorialStore.setState(state => ({
    dismissed: new Set([...state.dismissed, id]),
  }))
}

/**
 * Check whether a tutorial has been dismissed this session.
 */
export function isTutorialDismissed(id: string): boolean {
  return tutorialStore.state.dismissed.has(id)
}

/**
 * Reset all dismissals (called on logout to restore a clean session state).
 */
export function resetTutorialStore(): void {
  tutorialStore.setState(() => ({ dismissed: new Set() }))
}
