import { eq, toArray, useLiveQuery } from '@tanstack/react-db'
import {
  categoryCollection,
  inventoryCollection,
  locationCollection,
  productCollection,
  productComponentCollection,
  productVariantCollection,
  unitCollection,
} from '@/db/collections'

export const fetchIngredients = (ingredientId?: string) => {
  const result = useLiveQuery(
    q =>
      q
        .from({ product: productCollection })
        .where(({ product }) => eq(product.type, 'RAW_MATERIAL'))
        .leftJoin({ category: categoryCollection }, ({ product, category }) => eq(product.categoryId, category.id))
        .leftJoin({ baseUnit: unitCollection }, ({ product, baseUnit }) => eq(product.baseUnitId, baseUnit.id))
        .select(({ product, baseUnit, category }) => ({
          ...product,
          baseUnit,
          category,
          variants: toArray(
            q
              .from({ variant: productVariantCollection })
              .where(({ variant }) => eq(variant.productId, product.id))
              .leftJoin({ p: productCollection }, ({ variant, p }) => eq(variant.productId, p.id))
              .leftJoin({ vpu: unitCollection }, ({ vpu, p }) => eq(vpu.id, p.baseUnitId))
              .select(({ variant, p, vpu }) => ({
                ...variant,
                product: { ...p, baseUnit: vpu },
                inventory: toArray(
                  q
                    .from({ inv: inventoryCollection })
                    .where(({ inv }) => eq(inv.variantId, variant.id))
                    .leftJoin({ unit: unitCollection }, ({ inv, unit }) => eq(inv.unitId, unit.id))
                    .leftJoin({ location: locationCollection }, ({ inv, location }) => eq(inv.locationId, location.id))
                    .select(({ inv, unit, location }) => ({ ...inv, unit, location })),
                ),
                components: [],
                usedIn: toArray(
                  q
                    .from({ comp: productComponentCollection })
                    .where(({ comp }) => eq(comp.materialId, variant.id))
                    .leftJoin({ hostVariant: productVariantCollection }, ({ comp, hostVariant }) => eq(comp.hostId, hostVariant.id))
                    .leftJoin({ hostProduct: productCollection }, ({ hostVariant, hostProduct }) => eq(hostVariant.productId, hostProduct.id))
                    .leftJoin({ compUnit: unitCollection }, ({ comp, compUnit }) => eq(comp.unitId, compUnit.id))
                    .select(({ comp, hostVariant, hostProduct, compUnit }) => ({
                      ...comp,
                      unit: compUnit,
                      host: {
                        ...hostVariant,
                        product: hostProduct,
                      },
                    })),
                ),
              })),
          ),
        })),
    [ingredientId],
  )

  return result
}

type IngredientData = ReturnType<typeof fetchIngredients>['data']
export type feIngredient = NonNullable<IngredientData>[number]
