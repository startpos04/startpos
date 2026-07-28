import { useForm } from '@tanstack/react-form'
import { Layers, Package, Plus, PlusCircle, Save, Utensils, Warehouse, X } from 'lucide-react'
import { ResourceType, type Unit, VariantAttributeType } from 'prisma/generated/prisma/browser'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { Form } from '@/components/custom/form'
import { ImageInput } from '@/components/custom/form/image-input'
import { MoneyInput } from '@/components/custom/form/money-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { productVariantCollection } from '@/db/collections'
import { PriceEngine } from '@/lib/conversion/price-engine'
import MountManager from '@/lib/mount-manager'
import { fetchCategoryOptions } from '@/lib/queries/fetch-category-options'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { AddAddonModal } from './-add-addon'
import { AddIngredientModal } from './-add-ingredient'

interface CreateProductProps {
  variantId?: string | undefined
  defaultValues: CreateProductFormData
  onSubmit: ({ value }: { value: CreateProductFormData }) => Promise<void>
  children?: ReactNode
  textBtn: {
    default: string
    isSubmitting: string
  }
}
const createProductSchema = (variantId?: string) =>
  z.object({
    name: z.string().min(1, 'Name is required'),
    sku: z
      .string()
      .min(1, 'SKU is required')
      .refine(
        val => {
          const existingVariant = [...productVariantCollection.values()].find(u => u.sku === val)
          if (existingVariant?.id === variantId) return true
          return !existingVariant
        },
        { message: 'This SKU is already in use', path: ['sku'] },
      ),
    price: z.number().nonnegative('Price must be 0 or greater'),
    type: z.enum(ResourceType),
    categoryId: z.string().min(1, 'Category is required'),
    baseUnitId: z.string().min(1, 'Base Unit is required'),
    image: z.string(),
    isAvailable: z.boolean(),
    hasExpiry: z.boolean(),

    // These will be mapped to Variants in the handleSubmit
    ingredients: z.array(
      z.object({
        id: z.string(),
        material: z.object({
          id: z.string(), // This is a Product ID (the raw material)
          name: z.string(),
        }),
        variant: z.object({
          id: z.string(), // This is the Variant ID of the raw material
          name: z.string().nullable(),
        }),
        quantityUsed: z.number().positive(),
        unit: z.custom<Unit>(),
      }),
    ),

    variants: z
      .array(
        z.object({
          id: z.string(),
          attributeType: z.enum(VariantAttributeType),
          name: z.string().nullable(),
          sku: z.string().nullable(),
          price: z.number().nonnegative(),
        }),
      )
      .superRefine((variants, ctx) => {
        const formSkus = new Set<string>()

        variants.forEach((variant, index) => {
          if (!variant.sku) return

          const currentSku = variant.sku.trim()

          if (formSkus.has(currentSku)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Duplicate SKU inside this product builder',
              path: [index, 'sku'],
            })
            return
          }
          formSkus.add(currentSku)

          const dbConflict = [...productVariantCollection.values()].find(u => u.sku === currentSku)

          if (dbConflict && dbConflict.id !== variant.id && dbConflict.id !== variantId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'This SKU is already in use by another product',
              path: [index, 'sku'],
            })
          }
        })
      }),

    allowedAddons: z.array(
      z.object({
        id: z.string(),
        addon: z.object({
          id: z.string().nullable(),
          name: z.string().nullable(),
        }),
        variant: z.object({
          id: z.string(),
          name: z.string().nullable(),
        }),
        unit: z.custom<Unit>(),
        defaultQuantity: z.number().nonnegative(),
        priceOverride: z.number().nonnegative(),
      }),
    ),
  })

const schema = createProductSchema()
export type CreateProductFormData = z.infer<typeof schema>

export function CreateProduct({ variantId, onSubmit, defaultValues, children, textBtn }: CreateProductProps) {
  const { data: categoryOptions = [] } = fetchCategoryOptions()
  const { data: unitOptions = [] } = fetchUnitOptions()

  const form = useForm({
    defaultValues,
    onSubmit,
    validators: {
      onChange: createProductSchema(variantId),
    },
  })

  const handleAddIngredient = () => {
    MountManager.show(AddIngredientModal, {
      onAdd: ingredient => {
        form.pushFieldValue('ingredients', {
          id: '',
          material: ingredient.product,
          variant: ingredient.variant,
          quantityUsed: ingredient.quantityUsed,
          unit: ingredient.unit,
        })
      },
    })
  }

  const handleAddAddons = () => {
    MountManager.show(AddAddonModal, {
      onAdd: addon => {
        form.pushFieldValue('allowedAddons', {
          id: '',
          addon: addon.product,
          variant: addon.variant,
          unit: addon.unit,
          defaultQuantity: addon.defaultQuantity,
          priceOverride: addon.priceOverride,
        })
      },
    })
  }

  const removeItem = (field: 'ingredients' | 'variants' | 'allowedAddons', index: number) => {
    // biome-ignore lint/suspicious/noExplicitAny: TanStack Form's recursive types make generic array filtering difficult to type-narrow; logic is safe.
    form.setFieldValue(field, (prev: any[]) => prev.filter((_, i) => i !== index))
  }

  return (
    <Form onSubmit={form.handleSubmit} className='flex flex-col h-full'>
      {/* Scrollable form body */}
      <div className='flex-1 overflow-y-auto p-4 space-y-5'>
        {children && <div className='pb-2'>{children}</div>}

        {/* General Info */}
        <div className='space-y-3'>
          <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
            <Package className='w-3 h-3' /> General Information
          </h4>
          <form.Field name='name' children={field => <TextInput field={field} label='Name' placeholder='e.g. Latte' />} />
          <div className='grid grid-cols-2 gap-3'>
            <form.Field name='sku' children={field => <TextInput field={field} label='SKU Base' placeholder='LAT-00' />} />
            <form.Field name='price' children={field => <MoneyInput field={field} label='Base Price' />} />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <form.Field name='categoryId' children={field => <SelectInput field={field} label='Category' options={categoryOptions} />} />
            <form.Field name='baseUnitId' children={field => <SelectInput field={field} label='Base Unit' options={unitOptions} />} />
          </div>
          <form.Field name='image' children={field => <ImageInput label='Product Image' field={field} />} />
        </div>

        <Separator />

        {/* Inventory */}
        <div className='space-y-3'>
          <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
            <Warehouse className='w-3 h-3 text-emerald-500' /> Inventory
          </h4>
          <form.Field
            name='isAvailable'
            children={field => (
              <div className='flex items-center justify-between'>
                <Label>POS Visible</Label>
                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
              </div>
            )}
          />
          <form.Field
            name='hasExpiry'
            children={field => (
              <div className='flex items-center justify-between'>
                <Label>Track Expiry</Label>
                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
              </div>
            )}
          />
        </div>

        <Separator />

        {/* Variants */}
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <div>
              <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
                <Layers className='w-3 h-3 text-blue-500' /> Variants
              </h4>
              <p className='text-[10px] text-muted-foreground mt-0.5'>Leave empty for a single default variant.</p>
            </div>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='rounded-full shrink-0'
              onClick={() =>
                form.pushFieldValue('variants', {
                  id: crypto.randomUUID(),
                  attributeType: VariantAttributeType.SIZE,
                  name: '',
                  sku: '',
                  price: 0,
                })
              }
            >
              <Plus className='size-4 mr-1' /> Add
            </Button>
          </div>
          <form.Subscribe
            selector={state => state.values.variants}
            children={variants => (
              <div className='space-y-2'>
                {variants.length === 0 && <p className='text-[11px] text-muted-foreground py-2 text-center'>Single default variant will be created.</p>}
                {variants.map((v, idx) => (
                  <div key={v.id} className='p-2.5 bg-muted/30 rounded-xl border border-border/50 space-y-2'>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>Variant {idx + 1}</span>
                      <Button type='button' variant='ghost' size='icon' className='h-6 w-6 text-muted-foreground' onClick={() => removeItem('variants', idx)}>
                        <X className='size-3.5' />
                      </Button>
                    </div>
                    <div className='grid grid-cols-2 gap-2'>
                      <form.Field name={`variants[${idx}].name`} children={field => <TextInput field={field} label='Name' placeholder='e.g. Large' />} />
                      <form.Field name={`variants[${idx}].sku`} children={field => <TextInput field={field} label='SKU Suffix' placeholder='e.g. LG' />} />
                    </div>
                    <form.Field name={`variants[${idx}].price`} children={field => <MoneyInput field={field} label='Price' />} />
                  </div>
                ))}
              </div>
            )}
          />
        </div>

        <Separator />
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <div>
              <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
                <Utensils className='w-3 h-3 text-emerald-500' /> Master Recipe
              </h4>
              <p className='text-[10px] text-muted-foreground mt-0.5'>Applies to all variants.</p>
            </div>
            <Button type='button' variant='outline' size='sm' className='rounded-full shrink-0' onClick={handleAddIngredient}>
              <Plus className='size-4 mr-1' /> Add
            </Button>
          </div>
          <form.Subscribe
            selector={state => state.values.ingredients}
            children={ingredients => (
              <div className='space-y-2'>
                {ingredients.length === 0 && <p className='text-[11px] text-muted-foreground py-2 text-center'>No ingredients added yet.</p>}
                {ingredients.map((ing, idx) => (
                  <div key={ing.id || idx} className='flex items-center justify-between p-2.5 bg-muted/30 rounded-xl border border-border/50'>
                    <div className='flex flex-col min-w-0'>
                      <span className='font-medium text-sm truncate'>
                        {[ing.material.name, ing.variant?.name ? `(${ing.variant.name})` : ''].filter(Boolean).join(' ')}
                      </span>
                      <span className='text-[10px] text-muted-foreground uppercase font-bold'>
                        {ing.quantityUsed} {ing.unit.abbreviation}
                      </span>
                    </div>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8 text-muted-foreground shrink-0'
                      onClick={() => removeItem('ingredients', idx)}
                    >
                      <X className='size-4' />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          />
        </div>

        <Separator />

        {/* Add-ons */}
        <div className='space-y-3'>
          <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
            <PlusCircle className='w-3 h-3 text-blue-500' /> Add-ons
          </h4>
          <form.Subscribe
            selector={state => state.values.allowedAddons}
            children={addons => (
              <div className='space-y-2'>
                {addons.map((a, idx) => (
                  <div key={a.id || idx} className='flex items-center justify-between p-2.5 bg-muted/30 rounded-xl border border-border/50'>
                    <div className='flex flex-col min-w-0'>
                      <span className='font-medium text-xs truncate'>{a.addon.name}</span>
                      <span className='text-[10px] text-muted-foreground'>{PriceEngine.format(a.priceOverride)}</span>
                    </div>
                    <Button type='button' variant='ghost' size='icon' className='h-7 w-7 shrink-0' onClick={() => removeItem('allowedAddons', idx)}>
                      <X className='size-3.5' />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          />
          <Button type='button' variant='outline' className='w-full rounded-xl border-dashed' onClick={handleAddAddons}>
            + Add Extras
          </Button>
        </div>
      </div>

      {/* Sticky footer */}
      <div className='p-4 border-t shrink-0 space-y-2'>
        <form.Subscribe
          selector={state => ({ errors: state.errors, isSubmitted: state.isSubmitted })}
          children={({ errors, isSubmitted }) =>
            isSubmitted &&
            errors.length > 0 && (
              <div className='p-3 text-xs font-mono text-red-600 rounded-xl border border-red-200 max-h-32 overflow-y-auto'>
                <strong>Form Errors:</strong>
                <pre className='whitespace-pre-wrap break-words'>{JSON.stringify(errors, null, 2)}</pre>
              </div>
            )
          }
        />
        <form.Subscribe
          selector={state => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button
              type='submit'
              disabled={!canSubmit || isSubmitting}
              className='w-full h-11 rounded-xl font-semibold flex gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'
            >
              <Save className='size-4' /> {isSubmitting ? textBtn.isSubmitting : textBtn.default}
            </Button>
          )}
        />
      </div>
    </Form>
  )
}
