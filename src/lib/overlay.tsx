/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import moment from 'dayjs'
import { Component } from 'react'
import { v4 as uuid } from 'uuid'

type ComponentProps<T> = T extends React.ComponentType<infer P> ? P : never

export type MountProps = {
  open: boolean
  onClose: () => void
}

type IOptions<T> = {
  key?: string
  /**
   * Which <Overlay id="..." /> instance to mount this into.
   * Omit to use the default instance (the one mounted without an `id`, usually in root).
   */
  target?: string
  /**
   * When true, this call behaves like `toggleOverlay`: if the dialog matching
   * `key` is already open, it closes it instead of re-showing it.
   * Requires `key` to know which dialog to check.
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
interface IDialogProps<T = any> {
  key: string | undefined
  id: string
  open: boolean
  props: Omit<IComponentProps<T>, 'open' | 'onClose'>
  Component: React.FC<IComponentProps<T>>
}
interface IOverlayState {
  dialogs: IDialogProps[]
  isMounted: boolean
}
type IMountProps = {
  /** Identifier for this mount point. Omit for the default/global overlay. */
  id?: string
}

const DEFAULT_INSTANCE_ID = '__default__'

class Overlay extends Component<IMountProps, IOverlayState> {
  /** All currently-mounted Overlay instances, keyed by their `id` prop (or DEFAULT_INSTANCE_ID). */
  static instances: Map<string, Overlay> = new Map()

  instanceId: string

  constructor(props: IMountProps) {
    super(props)

    this.instanceId = props.id || DEFAULT_INSTANCE_ID

    this.state = {
      dialogs: [],
      isMounted: false,
    }
  }

  componentDidMount() {
    Overlay.instances.set(this.instanceId, this)
    this.setState({ isMounted: true })
  }

  componentWillUnmount() {
    if (Overlay.instances.get(this.instanceId) === this) {
      Overlay.instances.delete(this.instanceId)
    }
  }

  showDialog<T extends React.FC<ComponentProps<T>>>(Component: T, options?: IOptions<Omit<ComponentProps<T>, 'open' | 'onClose'>>): string {
    const id = uuid().split('-')[0] || ''
    const { key, target, toggle, ...props } = (options || {}) as any

    const [...dialogs] = this.state.dialogs.filter(({ key, open }) => open || key)

    const dialogIndex = dialogs.findIndex(dialog => dialog.key && dialog.key === key)

    if (dialogIndex > -1) {
      const dialog = dialogs.splice(dialogIndex, 1)[0]
      if (dialog) {
        // Reuse the existing dialog's id (so React key + onClose stay stable),
        // but take everything else - Component included - from this call.
        dialogs.push({ ...dialog, Component, open: true, props })
        this.setState({ dialogs })
        return dialog.id
      }
    }

    dialogs.push({ Component, props, open: true, key, id })
    this.setState({ dialogs })

    return id
  }

  /**
   * Shows the dialog if it's not currently open, closes it if it is.
   * Relies on `key` to know whether "the same" overlay is already open.
   */
  toggleDialog<T extends React.FC<ComponentProps<T>>>(Component: T, options?: IOptions<Omit<ComponentProps<T>, 'open' | 'onClose'>>): string {
    const { key } = (options || {}) as any

    const existing = key ? this.state.dialogs.find(dialog => dialog.key === key && dialog.open) : undefined

    if (existing) {
      this.delDialog(existing.id)
      return existing.id
    }

    return this.showDialog(Component, options)
  }

  delDueToBackButton(id: string): string {
    this.setState(state => {
      const dialog = state.dialogs.find(dialog => dialog.id === id)
      if (dialog) dialog.open = false
      return { ...state }
    })

    return id
  }

  delDialog(id: string): string {
    return this.delDueToBackButton(id)
  }

  clear(): void {
    const dialogs = this.state.dialogs.map(dialog => ({
      ...dialog,
      open: false,
      key: undefined,
    }))

    this.setState({ dialogs })
  }

  deleteChildDialog(id: string): void {
    const startIndex = this.state.dialogs.findIndex((dialog: IDialogProps) => id === dialog.id)
    const dialogs = this.state.dialogs.map((dialog, i: number) => {
      if (i > startIndex) return { ...dialog, open: false, key: undefined }
      return dialog
    })

    this.setState({ dialogs })
  }

  render() {
    return this.state.dialogs.map(({ Component, open, props, id }) => <Component key={id} {...props} open={open} onClose={() => this.delDialog(id)} />)
  }
}

/** Finds whichever mounted Overlay instance currently owns the dialog with this id. */
const findInstanceForDialog = (id: string): Overlay | undefined => {
  for (const instance of Overlay.instances.values()) {
    if (instance.state.dialogs.some(dialog => dialog.id === id)) return instance
  }
  return undefined
}

export const showOverlay = async <T extends React.FC<ComponentProps<T>>>(
  Component: T,
  options?: IOptions<Omit<ComponentProps<T>, 'open' | 'onClose'>>,
): Promise<string> => {
  const { activeKey, onYes, target, toggle, key }: any = options || {}

  if (activeKey) {
    const expiration: { value: string } = JSON.parse(localStorage.getItem(activeKey) || '{}')
    if (moment(new Date(expiration.value)).isAfter(moment(new Date()))) {
      await onYes?.({ ...options, open: true, onClose: () => {} })
      return ''
    }
    localStorage.removeItem(activeKey)
  }

  if (toggle && !key) {
    console.error('showOverlay({ toggle: true }) requires a `key` to know which overlay to toggle.')
  }

  const instance = Overlay.instances.get(target || DEFAULT_INSTANCE_ID)

  if (!instance) {
    console.error(
      target
        ? `Overlay instance with id "${target}" not found. Make sure <Overlay id="${target}" /> is mounted in your tree.`
        : 'Default Overlay instance not found. Make sure <Overlay /> is mounted in your App root.',
    )
    return ''
  }

  return toggle ? instance.toggleDialog(Component, options) : instance.showDialog(Component, options)
}

/** @deprecated use `showOverlay` instead - kept temporarily for a gradual rename */
export const showModal = showOverlay

/**
 * Opens the overlay if it's closed, closes it if it's open.
 * Requires a stable `key` in options so repeated calls can find the same dialog.
 */
export const toggleOverlay = <T extends React.FC<ComponentProps<T>>>(Component: T, options?: IOptions<Omit<ComponentProps<T>, 'open' | 'onClose'>>): string => {
  const { key, target }: any = options || {}

  if (!key) {
    console.error('toggleOverlay requires a `key` in options to know which overlay instance to toggle.')
  }

  const instance = Overlay.instances.get(target || DEFAULT_INSTANCE_ID)

  if (!instance) {
    console.error(
      target
        ? `Overlay instance with id "${target}" not found. Make sure <Overlay id="${target}" /> is mounted in your tree.`
        : 'Default Overlay instance not found. Make sure <Overlay /> is mounted in your App root.',
    )
    return ''
  }

  return instance.toggleDialog(Component, options)
}

export const delModal = (id: string) => findInstanceForDialog(id)?.delDialog(id)
export const delChildModals = (id: string) => findInstanceForDialog(id)?.deleteChildDialog(id)

/** Clears a specific overlay instance by id, or every mounted instance when no target is given. */
export const clearModals = (target?: string) => {
  if (target) {
    Overlay.instances.get(target)?.clear()
    return
  }
  for (const instance of Overlay.instances.values()) instance.clear()
}

export default Overlay
