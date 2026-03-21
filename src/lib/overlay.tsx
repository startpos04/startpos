import moment from 'dayjs'
import { Component } from 'react'
import { v4 as uuid } from 'uuid'

type ComponentProps<T> = T extends React.ComponentType<infer P> ? P : never

type IOptions<T> = {
  key?: string
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

type IComponentProps<T> = {
  open: boolean
  onClose: () => void
} & T
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
interface IOverlayProps {}

class Overlay extends Component<IOverlayProps, IOverlayState> {
  static instance: Overlay = null as any

  constructor(props: IOverlayProps) {
    super(props)

    const defaultState = {
      dialogs: [],
      isMounted: false,
    }

    if (Overlay.instance) {
      const dialogs = Overlay.instance.state.dialogs.map(dialog => ({
        ...dialog,
        open: false,
        key: undefined,
      }))

      Overlay.instance.state = { ...defaultState, ...props, dialogs }
      return Overlay.instance
    }

    this.state = { ...defaultState, ...props }
    Overlay.instance = this
  }

  showDialog<T extends React.FC<ComponentProps<T>>>(Component: T, options?: IOptions<Omit<ComponentProps<T>, 'open' | 'onClose'>>): string {
    const id = uuid().split('-')[0]
    const { key, ...props } = options || {}

    const [...dialogs] = this.state.dialogs.filter(({ key, open }) => open || key)

    let dialogIndex = dialogs.findIndex(dialog => dialog.key && dialog.key === key)

    if (dialogIndex > -1) {
      const dialog = dialogs.splice(dialogIndex, 1)[0]
      dialogs.push({ ...dialog, open: true, props })
    } else dialogs.push({ Component, props, open: true, key, id })

    this.setState({ dialogs })

    return id
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

export const showModal = async <T extends React.FC<ComponentProps<T>>>(
  Component: T,
  options?: IOptions<Omit<ComponentProps<T>, 'open' | 'onClose'>>,
): Promise<string> => {
  const { activeKey, onYes }: any = options || {}

  if (activeKey) {
    const expiration: { value: string } = JSON.parse(localStorage.getItem(activeKey) || '{}')
    if (moment(new Date(expiration.value)).isAfter(moment(new Date()))) {
      await onYes?.({ ...options, open: true, onClose: () => {} })
      return ''
    }
    localStorage.removeItem(activeKey)
  }

  return Overlay.instance.showDialog(Component, options)
}
export const delModal = (id: string) => Overlay.instance.delDialog(id)
export const clearModals = () => Overlay.instance?.clear()
export const delChildModals = (id: string) => Overlay.instance?.deleteChildDialog(id)

export default Overlay
