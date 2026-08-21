import { eq, toArray, useLiveQuery } from '@tanstack/react-db'
import {
  productCollection,
  productVariantCollection,
  productComponentCollection,
  unitCollection,
} from '@/db/collections'

export interface BatchPreparedProduct {
  id: string
  name: string | null
  image: string | null
  isBatchPrepared: boolean
  productionUsesRecipe: boolean
  shelfLifeHours: number | null
  lowStockThreshold: number | null
  product: {
    id: string
    name: string
    image: string | null
    baseUnitId: string
    baseUnit: {
      abbreviation: string
    }
  }
  components: Array<{
    id: string
    quantityUsed: number
    isAddon: boolean
    unit: {
      abbreviation: string
    }
    material: {
      product: {
        name: string
      }
    }
  }>
}

export function fetchBatchPreparedProducts() {
  return useLiveQuery(
    q =>
      q
        .from({ variant: productVariantCollection })
        .where(({ variant }) => eq(variant.isBatchPrepared, true))
        .leftJoin({ product: productCollection }, ({ variant, product }) => eq(variant.productId, product.id))
        .leftJoin({ baseUnit: unitCollection }, ({ product, baseUnit }) => eq(product.baseUnitId, baseUnit.id))
        .select(({ variant, product, baseUnit }) => ({
          id: variant.id,
          name: variant.name,
          image: variant.image,
          isBatchPrepared: variant.isBatchPrepared,
          productionUsesRecipe: variant.productionUsesRecipe,
          shelfLifeHours: variant.shelfLifeHours,
          lowStockThreshold: variant.lowStockThreshold,
          product: {
            id: product.id,
            name: product.name,
            image: product.image,
            baseUnitId: product.baseUnitId,
            baseUnit: {
              abbreviation: baseUnit.abbreviation,
            },
          },
          components: toArray(
            q
              .from({ comp: productComponentCollection })
              .where(({ comp }) => eq(comp.hostId, variant.id))
              .leftJoin({ compUnit: unitCollection }, ({ comp, compUnit }) => eq(comp.unitId, compUnit.id))
              .leftJoin({ material: productVariantCollection }, ({ comp, material }) => eq(comp.materialId, material.id))
              .leftJoin({ materialProduct: productCollection }, ({ material, materialProduct }) => eq(material.productId, materialProduct.id))
              .select(({ comp, compUnit, materialProduct }) => ({
                id: comp.id,
                quantityUsed: comp.quantityUsed,
                isAddon: comp.isAddon,
                unit: {
                  abbreviation: compUnit.abbreviation,
                },
                material: {
                  product: {
                    name: materialProduct.name,
                  },
                },
              }))
          ),
        })),
    []
  )
}
