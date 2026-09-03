/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import moment from 'dayjs'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { v4 as uuid } from 'uuid'

type ComponentProps<T> = T extends React.ComponentType<infer P> ? P : never

/**
 * Props every mounted component must accept. MountManager only guarantees
 * `open` / `onClose` - everything else (animation, focus trapping, escape
 * key, scroll locking, backdrop, etc.) is entirely up to the mounted
 * component itself.
 */
export type MountProps = {
  open: boolean
  onClose: () => void
}

export type MountTarget = string

/**
 * Strongly-typed collection of mount targets, so consumers don't sprinkle
 * raw string literals around the app.
 *
 * `Default` is the only target the framework itself knows about - it's the
 * host mounted without an `id` (usually in your app root). Feature modules
 * should define their own target maps (or extend this one) for their own
 * hosts, e.g.:
 *
 * ```ts
 * export const MountTargets = {
 *   ...BaseMountTargets,
 *   ProductSidebar: 'product-sidebar',
 *   CustomerSidebar: 'customer-sidebar',
 * } as const
 * ```
 */
export const MountTargets = {
  Default: '__default__',
} as const

type IOptions<T> = {
  key?: string
  /**
   * Which <MountManager id="..." /> host to mount this into.
   * Omit to use the default host (the one mounted without an `id`, usually in root).
   */
  target?: string
  /**
   * When true, this call behaves like `MountManager.toggle`: if the mounted
   * component matching `key` is already open, it closes it instead of
   * re-showing it. Requires `key` to know which one to check.
   */
  toggle?: boolean
} & Omit<T, 'onYes'> &
  (
    | {
        activeKey?: undefined
      }
    | {
        activeKey: string
        onYes: (props: IComponentProps<T>) => void
      }
  )

type IComponentProps<T> = MountProps & T

type IMountManagerProps = {
  /** Identifier for this mount host. Omit for the default/global host. */
  id?: string
}

// ---------------------------------------------------------------------------
// Centralized Mount Registry
//
// This is the single source of truth for every mounted component, across
// every host. Hosts no longer own state - they subscribe to the slice of
// the registry that targets them and render whatever they're handed.
// ---------------------------------------------------------------------------

/** A single mounted component tracked by the registry. */
interface MountedComponent {
  id: string
  key?: string
  target: MountTarget
  Component: React.ComponentType<any>
  props: Record<string, unknown>
  /** Reserved for future nested/dockable relationships - not yet used by closeChildren(). */
  parentId?: string
  opened: boolean
}

type Listener = () => void

class MountRegistry {
  /** id -> mounted component. The single source of truth. */
  private mounts = new Map<string, MountedComponent>()
  /** key -> id, for O(1) key-based lookups (update, key-based reuse). */
  private keyIndex = new Map<string, string>()
  /** target -> ordered list of ids. Order is preserved because rendering (z-order/stacking) depends on it. */
  private targetOrder = new Map<MountTarget, string[]>()
  /** target -> subscribed render callbacks. Only these get notified when that target's mounts change. */
  private listeners = new Map<MountTarget, Set<Listener>>()
  /** Cached, referentially-stable snapshot per target, recomputed lazily when dirty. Required for useSyncExternalStore. */
  private snapshots = new Map<MountTarget, MountedComponent[]>()
  private dirty = new Set<MountTarget>()
  /** Which targets currently have a <MountManager /> host mounted. */
  private hosts = new Set<MountTarget>()
  /** Calls queued before the host was registered — drained on registerHost(). */
  private pendingQueue = new Map<MountTarget, Array<() => void>>()

  private batchDepth = 0
  private pendingTargets = new Set<MountTarget>()

  // ---- host bookkeeping ----

  registerHost(target: MountTarget) {
    this.hosts.add(target)
    // Drain any calls that were made before this host mounted
    const queued = this.pendingQueue.get(target)
    if (queued && queued.length > 0) {
      this.pendingQueue.delete(target)
      for (const fn of queued) fn()
    }
  }

  unregisterHost(target: MountTarget) {
    this.hosts.delete(target)
  }

  hasHost(target: MountTarget) {
    return this.hosts.has(target)
  }

  /** Queue a call to run once the host for `target` is registered. */
  queueForHost(target: MountTarget, fn: () => void) {
    const queue = this.pendingQueue.get(target) ?? []
    queue.push(fn)
    this.pendingQueue.set(target, queue)
  }

  // ---- subscriptions ----

  /** Subscribes to changes for a single target. Returns an unsubscribe function. */
  subscribe(target: MountTarget, listener: Listener): () => void {
    let set = this.listeners.get(target)
    if (!set) {
      set = new Set()
      this.listeners.set(target, set)
    }
    set.add(listener)
    return () => set?.delete(listener)
  }

  private notify(target: MountTarget) {
    this.markDirty(target)

    if (this.batchDepth > 0) {
      this.pendingTargets.add(target)
      return
    }

    this.emit(target)
  }

  private emit(target: MountTarget) {
    const set = this.listeners.get(target)
    if (!set) return
    for (const listener of set) listener()
  }

  private markDirty(target: MountTarget) {
    this.dirty.add(target)
  }

  /**
   * Runs `fn`, deferring all notifications until it (and any batches nested
   * inside it) finish. Subscribers for each affected target are notified at
   * most once, no matter how many operations touched that target.
   */
  batch(fn: () => void) {
    this.batchDepth++
    try {
      fn()
    } finally {
      this.batchDepth--
      if (this.batchDepth === 0) {
        const targets = this.pendingTargets
        this.pendingTargets = new Set()
        for (const target of targets) this.emit(target)
      }
    }
  }

  // ---- snapshot for rendering ----

  /** Stable-reference snapshot of the live, ordered mounts for a target. Safe to call from useSyncExternalStore. */
  getMounts(target: MountTarget): MountedComponent[] {
    if (this.dirty.has(target) || !this.snapshots.has(target)) {
      const ids = this.targetOrder.get(target) || []
      const snapshot: MountedComponent[] = []
      for (const id of ids) {
        const mount = this.mounts.get(id)
        if (mount) snapshot.push(mount)
      }
      this.snapshots.set(target, snapshot)
      this.dirty.delete(target)
    }
    return this.snapshots.get(target) || []
  }

  getByKey(key: string): MountedComponent | undefined {
    const id = this.keyIndex.get(key)
    return id ? this.mounts.get(id) : undefined
  }

  // ---- core operations ----

  /** Mounts a component into `target`, reusing the existing instance if `key` already matches one. */
  create(target: MountTarget, Component: React.ComponentType<any>, props: Record<string, unknown>, key?: string): string {
    // Garbage-collect closed, keyless mounts for this target - mirrors the
    // legacy per-host behavior where `showDialog` dropped dead entries.
    this.gc(target)

    if (key) {
      const existing = this.getByKey(key)
      if (existing) {
        this.mounts.set(existing.id, { ...existing, Component, props, opened: true })
        this.moveToEnd(target, existing.id)
        this.notify(target)
        return existing.id
      }
    }

    const id = uuid().split('-')[0] || ''
    this.mounts.set(id, key ? { id, key, target, Component, props, opened: true } : { id, target, Component, props, opened: true })
    if (key) this.keyIndex.set(key, id)

    const order = this.targetOrder.get(target) || []
    order.push(id)
    this.targetOrder.set(target, order)

    this.notify(target)
    return id
  }

  /** Merges new props into an already-mounted component, found by `key`. No-op (never throws) if nothing matches. */
  update(key: string, props: Record<string, unknown>) {
    const mount = this.getByKey(key)
    if (!mount) return

    this.mounts.set(mount.id, { ...mount, props: { ...mount.props, ...props } })
    this.notify(mount.target)
  }

  /** Marks a mounted component closed. Keeps it (and its key) around so it can be reused later. */
  close(id: string): string {
    const mount = this.mounts.get(id)
    if (!mount) return id

    this.mounts.set(id, { ...mount, opened: false })
    this.notify(mount.target)
    return id
  }

  /** Closes every mounted component that was mounted after `id` within the same target. */
  closeChildren(id: string) {
    const mount = this.mounts.get(id)
    if (!mount) return

    const order = this.targetOrder.get(mount.target) || []
    const startIndex = order.indexOf(id)
    if (startIndex === -1) return

    for (let i = startIndex + 1; i < order.length; i++) {
      const childId = order[i]
      if (!childId) continue
      const child = this.mounts.get(childId)
      if (!child) continue

      if (child.key) this.keyIndex.delete(child.key)
      const { key: _key, ...rest } = child
      this.mounts.set(childId, { ...rest, opened: false })
    }

    this.notify(mount.target)
  }

  /** Closes every mount for `target`, or for every target when none is given. */
  clear(target?: MountTarget) {
    const targets = target ? [target] : Array.from(this.targetOrder.keys())

    for (const t of targets) {
      const order = this.targetOrder.get(t) || []
      for (const id of order) {
        const mount = this.mounts.get(id)
        if (!mount) continue
        if (mount.key) this.keyIndex.delete(mount.key)
        const { key: _key, ...rest } = mount
        this.mounts.set(id, { ...rest, opened: false })
      }
      this.notify(t)
    }
  }

  private moveToEnd(target: MountTarget, id: string) {
    const order = this.targetOrder.get(target) || []
    const idx = order.indexOf(id)
    if (idx > -1) order.splice(idx, 1)
    order.push(id)
    this.targetOrder.set(target, order)
  }

  /** Drops entries that are both closed and keyless - they can never be found or reopened again. */
  private gc(target: MountTarget) {
    const order = this.targetOrder.get(target)
    if (!order) return

    const kept: string[] = []
    for (const id of order) {
      const mount = this.mounts.get(id)
      if (!mount) continue
      if (mount.opened || mount.key) {
        kept.push(id)
      } else {
        this.mounts.delete(id)
      }
    }
    this.targetOrder.set(target, kept)
  }
}

/** Singleton registry backing every MountManager host. Exposed for advanced/testing use only - not part of the stable public API. */
export const __mountRegistry = new MountRegistry()

const hostNotFoundError = (target: MountTarget) =>
  target === MountTargets.Default
    ? 'Default MountManager host not found. Make sure <MountManager /> is mounted in your App root.'
    : `MountManager host with id "${target}" not found. Make sure <MountManager id="${target}" /> is mounted in your tree.`

// ---------------------------------------------------------------------------
// Host component
//
// Almost entirely stateless: it subscribes to its own slice of the registry
// and renders it. It owns no mount state itself, so a change to one host's
// mounts never causes any other host to re-render.
// ---------------------------------------------------------------------------

function useMountHost(target: MountTarget): MountedComponent[] {
  const subscribe = useCallback((onStoreChange: () => void) => __mountRegistry.subscribe(target, onStoreChange), [target])
  const getSnapshot = useCallback(() => __mountRegistry.getMounts(target), [target])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function MountManagerHost({ id }: IMountManagerProps) {
  const target = id || MountTargets.Default
  const mounts = useMountHost(target)

  useEffect(() => {
    __mountRegistry.registerHost(target)
    return () => __mountRegistry.unregisterHost(target)
  }, [target])

  return (
    <>
      {mounts.map(({ id, Component, props, opened }) => (
        <Component key={id} {...props} open={opened} onClose={() => __mountRegistry.close(id)} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Public API (static, attached to the host component itself so
// `<MountManager />` and `MountManager.show(...)` come from one import)
// ---------------------------------------------------------------------------

interface MountManagerComponent extends React.FC<IMountManagerProps> {
  show<T extends React.FC<ComponentProps<T>>>(Component: T, options?: IOptions<Omit<ComponentProps<T>, 'open' | 'onClose'>>): Promise<string>
  toggle<T extends React.FC<ComponentProps<T>>>(Component: T, options?: IOptions<Omit<ComponentProps<T>, 'open' | 'onClose'>>): string
  update(key: string, props: Record<string, unknown>): void
  close(id: string): string | undefined
  closeChildren(id: string): void
  clear(target?: string): void
  batch(fn: () => void): void
}

const MountManager = MountManagerHost as MountManagerComponent

/**
 * Mounts `Component` into the host identified by `options.target` (or the
 * default host). If `options.key` matches an already-mounted component,
 * that instance is reused (props updated, state preserved) instead of
 * being remounted.
 */
MountManager.show = async (Component, options) => {
  const { activeKey, onYes, target, toggle, key, ...props } = (options || {}) as any
  const resolvedTarget = target || MountTargets.Default

  if (activeKey) {
    const expiration: { value: string } = JSON.parse(localStorage.getItem(activeKey) || '{}')
    if (moment(new Date(expiration.value)).isAfter(moment(new Date()))) {
      await onYes?.({ ...options, open: true, onClose: () => {} })
      return ''
    }
    localStorage.removeItem(activeKey)
  }

  if (toggle && !key) {
    console.error('MountManager.show({ toggle: true }) requires a `key` to know which mounted component to toggle.')
  }

  if (toggle) return MountManager.toggle(Component, options)

  if (!__mountRegistry.hasHost(resolvedTarget)) {
    // Host not yet mounted — queue and retry once it registers.
    // This handles the race where show() is called during initial render
    // before the <MountManager /> host's useEffect has fired.
    return new Promise(resolve => {
      __mountRegistry.queueForHost(resolvedTarget, async () => {
        const id = await MountManager.show(Component, options)
        resolve(id)
      })
    })
  }

  return __mountRegistry.create(resolvedTarget, Component as any, props, key)
}

/**
 * Opens the component if it's closed, closes it if it's open. Requires a
 * stable `key` in options so repeated calls can find the same mounted
 * component.
 */
MountManager.toggle = (Component, options) => {
  const { key, target, toggle: _toggle, ...props } = (options || {}) as any
  const resolvedTarget = target || MountTargets.Default

  if (!key) {
    console.error('MountManager.toggle requires a `key` in options to know which mounted component to toggle.')
  }

  if (!__mountRegistry.hasHost(resolvedTarget)) {
    console.error(hostNotFoundError(resolvedTarget))
    return ''
  }

  const existing = key ? __mountRegistry.getByKey(key) : undefined
  if (existing?.opened) {
    return __mountRegistry.close(existing.id)
  }

  return __mountRegistry.create(resolvedTarget, Component as any, props, key)
}

/**
 * Updates the props of an already-mounted component, found by its stable
 * `key` (not the internal, random `id`). Returns gracefully if nothing
 * matches - it never throws.
 */
MountManager.update = (key, props) => __mountRegistry.update(key, props)

/** Closes a mounted component by its internal `id`. */
MountManager.close = id => __mountRegistry.close(id)

/** Closes every mounted component nested after `id` within its host. */
MountManager.closeChildren = id => __mountRegistry.closeChildren(id)

/** Clears a specific host by target id, or every mounted host when no target is given. */
MountManager.clear = target => __mountRegistry.clear(target)

/**
 * Runs multiple MountManager operations while deferring re-renders until
 * the whole batch completes - each affected host re-renders at most once.
 * Batches may be nested; only the outermost batch triggers notifications.
 *
 * ```ts
 * MountManager.batch(() => {
 *   MountManager.show(Aside, { target: MountTargets.ProductSidebar, key: PRODUCT_SIDEBAR })
 *   MountManager.update(PRODUCT_SIDEBAR, { loading: true })
 *   MountManager.close(otherId)
 * })
 * ```
 *
 * Note: `MountManager.show` resolves its `activeKey` check asynchronously
 * before mutating the registry. If a batched `show()` call takes that
 * branch, its actual mutation happens after the synchronous batch body
 * returns and will be notified on its own, outside the batch.
 */
MountManager.batch = fn => __mountRegistry.batch(fn)

export default MountManager
