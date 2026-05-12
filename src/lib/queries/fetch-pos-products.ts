/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import { and, eq, gt, ilike, or, toArray, useLiveQuery } from '@tanstack/react-db'
import {
  categoryCollection,
  inventoryCollection,
  productCollection,
  productComponentCollection,
  productVariantCollection,
  unitCollection,
} from '@/db/collections'
import type { PosProduct } from '../conversion/inventory-engine'

export const fetchPosProducts = (searchQuery: string | undefined) => {
  const inventories = useLiveQuery(q => q.from({ inv: inventoryCollection }), [])
  // searchQuery = 'Diet Soda'

  const result = useLiveQuery(
    q =>
      q
        .from({ product: productCollection })
        .where(({ product }) => eq(product.isAvailable, true))
        .join({ variant: productVariantCollection }, ({ product, variant }) => eq(product.id, variant.productId))
        .where(({ variant, product }) =>
          and(gt(variant.price, 0), or(searchQuery ? ilike(product.name, searchQuery) : undefined, searchQuery ? ilike(variant.name, searchQuery) : undefined)),
        )
        .distinct()
        .leftJoin({ category: categoryCollection }, ({ product, category }) => eq(product.categoryId, category.id))
        .leftJoin({ baseUnit: unitCollection }, ({ product, baseUnit }) => eq(product.baseUnitId, baseUnit.id))
        .orderBy(({ product }) => product.name, 'desc')
        .select(({ product, baseUnit, category }) => ({
          ...product,
          category,
          baseUnit,
          variants: toArray(
            q
              .from({ variant: productVariantCollection })
              .where(({ variant }) => eq(variant.productId, product.id))
              .select(({ variant }) => ({
                ...variant,
                inventory: [] as unknown as typeof inventories.data,
                components: toArray(
                  q
                    .from({ comp: productComponentCollection })
                    .where(({ comp }) => eq(comp.hostId, variant.id))
                    .leftJoin({ vpu: unitCollection }, ({ vpu, comp }) => eq(vpu.id, comp.unitId))
                    .leftJoin({ material: productVariantCollection }, ({ material, comp }) => eq(material.id, comp.materialId))
                    .leftJoin({ p: productCollection }, ({ p, material }) => eq(p.id, material.productId))
                    .select(({ comp, vpu, material, p }) => ({
                      ...comp,
                      unit: vpu,
                      material: {
                        ...material,
                        product: p,
                        inventory: [] as unknown as typeof inventories.data,
                      },
                    })),
                ),
              })),
          ),
        })),
    [],
  )

  result.data.forEach(product => {
    product.variants.forEach(variant => {
      variant.inventory = inventories.data.filter(inventory => inventory.variantId === variant.id) as any
      variant.components.forEach(component => {
        component.material.inventory = inventories.data.filter(inventory => inventory.variantId === component.materialId) as any
      })
    })
  })

  return { ...result, data: result.data as unknown as PosProduct[] }
}
