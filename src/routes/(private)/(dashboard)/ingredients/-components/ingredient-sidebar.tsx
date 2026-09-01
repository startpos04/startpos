import type { ReactNode } from 'react'
import { Aside } from '@startpos-core/components/custom/aside'
import MountManager from '@/lib/mount-manager'

export const INGREDIENT_ASIDE_ID = 'ingredient-aside'

export const showIngredientSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: INGREDIENT_ASIDE_ID,
    target: INGREDIENT_ASIDE_ID,
    toggle,
    children,
  })
}

export const closeIngredientSidebar = () => {
  MountManager.clear(INGREDIENT_ASIDE_ID)
}
