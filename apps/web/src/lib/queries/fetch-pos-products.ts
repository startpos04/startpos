/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */

import {
  categoryCollection,
  inventoryCollection,
  productCollection,
  productComponentCollection,
  productVariantCollection,
  unitCollection,
} from '@platform/db/collections'
import type { Prettify } from '@platform/lib/types'
import { and, count, eq, gt, type InitialQueryBuilder, ilike, not, or, toArray, useLiveQuery } from '@tanstack/react-db'
import type { Prisma } from 'prisma/generated/prisma/client'
import { ResourceType } from 'prisma/generated/prisma/enums'

export interface fetchPosProductsProps {
  searchQuery?: string | undefined
  page: number
  pageSize: number
  all?: boolean
}

const posProductSchema = {
  category: true,
  baseUnit: true,
  variants: {
    include: {
      inventory: true,
      components: {
        include: {
          unit: true,
          material: {
            include: {
              inventory: true,
              product: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProductInclude
export type posProduct = Prettify<Prisma.ProductGetPayload<{ include: typeof posProductSchema }>>

export const fetchPosProducts = ({ searchQuery, page, pageSize, all }: fetchPosProductsProps) => {
  const inventories = useLiveQuery(q => q.from({ inv: inventoryCollection }), [])

  const baseQuery = (q: InitialQueryBuilder) => {
    if (all) return q.from({ product: productCollection }).where(({ product }) => not(eq(product.type, ResourceType.RAW_MATERIAL)))
    else return q.from({ product: productCollection }).where(({ product }) => eq(product.isAvailable, true))
  }

  const totalCountResult = useLiveQuery(
    q =>
      baseQuery(q)
        .join({ variant: productVariantCollection }, ({ product, variant }) => eq(product.id, variant.productId))
        .where(({ variant, product }) =>
          and(
            gt(variant.price, 0),
            or(
              searchQuery ? ilike(product.name, `%${searchQuery}%`) : undefined,
              searchQuery ? ilike(variant.name, `%${searchQuery}%`) : undefined,
              searchQuery ? ilike(variant.sku, `%${searchQuery}%`) : undefined,
            ),
          ),
        )
        .distinct()
        .leftJoin({ category: categoryCollection }, ({ product, category }) => eq(product.categoryId, category.id))
        .leftJoin({ baseUnit: unitCollection }, ({ product, baseUnit }) => eq(product.baseUnitId, baseUnit.id))
        .select(({ product }) => ({
          total: count(product.id),
        })),
    [searchQuery],
  )

  const result = useLiveQuery(
    q =>
      baseQuery(q)
        .join({ variant: productVariantCollection }, ({ product, variant }) => eq(product.id, variant.productId))
        .where(({ variant, product }) =>
          and(
            gt(variant.price, 0),
            or(
              searchQuery ? ilike(product.name, `%${searchQuery}%`) : undefined,
              searchQuery ? ilike(variant.name, `%${searchQuery}%`) : undefined,
              searchQuery ? ilike(variant.sku, `%${searchQuery}%`) : undefined,
            ),
          ),
        )
        .distinct()
        .leftJoin({ category: categoryCollection }, ({ product, category }) => eq(product.categoryId, category.id))
        .leftJoin({ baseUnit: unitCollection }, ({ product, baseUnit }) => eq(product.baseUnitId, baseUnit.id))
        .orderBy(({ product }) => product.name, 'desc')
        .limit(pageSize)
        .offset((page - 1) * pageSize)
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
    [searchQuery],
  )

  result.data.forEach(product => {
    product.variants.forEach(variant => {
      variant.inventory = inventories.data.filter(inventory => inventory.variantId === variant.id) as any
      variant.components.forEach(component => {
        component.material.inventory = inventories.data.filter(inventory => inventory.variantId === component.materialId) as any
      })
    })
  })

  return {
    ...result,
    data: result.data as unknown as posProduct[],
    totalItems: Math.max((totalCountResult.data?.[0]?.total ?? 0) - (searchQuery ? 0 : 2), 0),
    isLoading: totalCountResult.isLoading || result.isLoading,
  }
}
