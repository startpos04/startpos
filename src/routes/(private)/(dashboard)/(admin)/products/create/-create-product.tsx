import { ImageInput } from '@/components/custom/form/image-input'
import { MoneyInput } from '@/components/custom/form/money-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { showModal } from '@/lib/Overlay'
import { fetchCategoryOptions } from '@/lib/queries/fetch-category-options'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { authStore } from '@/store/auth-store'
import { useForm, useStore } from '@tanstack/react-form'
import { Layers, Package, Plus, PlusCircle, Save, Utensils, Warehouse, X } from 'lucide-react'
import { Unit } from 'prisma/generated/prisma/browser'
import { ReactNode } from 'react'
import { z } from 'zod'
import { AddAddonModal } from './-add-addon'
import { AddIngredientModal } from './-add-ingredient'
import { AddVariantModal } from './-add-variant'

interface CreateProductProps {
  defaultValues: CreateProductFormData
  onSubmit: ({ value }: { value: CreateProductFormData }) => Promise<void>
  children: ReactNode
  textBtn: {
    default: string
    isSubmitting: string
  }
}

export const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().min(1, 'SKU is required'),
  price: z.number().nonnegative('Price must be 0 or greater'),
  type: z.enum(['BUNDLE', 'SINGLE', 'SERVICE']), // Assuming ResourceType values
  categoryId: z.string('Invalid Category ID'), // Or .min(1) if not a UUID
  baseUnitId: z.string().min(1, 'Base Unit is required'),
  image: z.string(),
  isAvailable: z.boolean(),
  hasExpiry: z.boolean(),

  // Ingredients: feIngredient properties + quantityUsed
  ingredients: z.array(
    z.object({
      id: z.string(),
      material: z.object({
        id: z.string(),
        name: z.string(),
      }),
      quantityUsed: z.number().positive(),
      unit: z.custom<Unit>(),
    }),
  ),

  // Variants
  variants: z.array(
    z.object({
      id: z.string(),
      variantType: z.string().nullable(),
      variantValue: z.string().nullable(),
      sku: z.string().nullable(),
      price: z.number().nonnegative(),
    }),
  ),

  // Allowed Addons
  allowedAddons: z.array(
    z.object({
      id: z.string(),
      addon: z.object({
        id: z.string(),
        name: z.string(),
        baseUnit: z.custom<Unit>(),
      }),
      defaultQuantity: z.number().nonnegative(),
      priceOverride: z.number().nonnegative(),
    }),
  ),
})

export type CreateProductFormData = z.infer<typeof createProductSchema>

export function CreateProduct({ onSubmit, defaultValues, children, textBtn }: CreateProductProps) {
  const user = useStore(authStore, state => state.user)
  const { data: categoryOptions = [] } = fetchCategoryOptions()
  const { data: unitOptions = [] } = fetchUnitOptions()

  const form = useForm({
    defaultValues,
    onSubmit,
    validators: {
      onChange: createProductSchema,
    },
  })

  const handleAddIngredient = () => {
    showModal(AddIngredientModal, {
      onAdd: ingredient => {
        form.pushFieldValue('ingredients', {
          id: '',
          material: {
            id: ingredient.material.id,
            name: ingredient.material.name,
          },
          quantityUsed: ingredient.quantityUsed,
          unit: ingredient.unit,
        })
      },
    })
  }

  const handleAddVariants = () => {
    showModal(AddVariantModal, {
      variants: form.getFieldValue('variants'),
      onAdd: variants => {
        form.setFieldValue(
          'variants',
          variants.map(variant => variant),
        )
      },
    })
  }

  const handleAddAddons = () => {
    showModal(AddAddonModal, {
      onAdd: addon => {
        form.pushFieldValue('allowedAddons', {
          id: '',
          addon: addon.addon,
          defaultQuantity: addon.defaultQuantity,
          priceOverride: addon.priceOverride,
        })
      },
    })
  }

  const removeItem = (field: 'ingredients' | 'variants' | 'allowedAddons', index: number) => {
    form.setFieldValue(field, (prev: any[]) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className='flex flex-col gap-4 max-w-5xl mx-auto grow'>
      {children}

      <ScrollArea className=' h-1 grow w-full'>
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 p-2 w-full'>
          {/* Left Column: Basic Details & Media */}
          <div className='lg:col-span-2 space-y-6'>
            <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Package className='w-5 h-5 text-primary' /> General Information
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <form.Field
                  name='name'
                  validators={{ onChange: z.string().min(3, 'Required') }}
                  children={field => <TextInput field={field} label='Name' placeholder='e.g. Classic Cheeseburger' />}
                />

                <div className='grid grid-cols-2 gap-4'>
                  <form.Field name='sku' children={field => <TextInput field={field} label='SKU / Barcode' placeholder='BRG-001' />} />
                  <form.Field name='price' children={field => <MoneyInput field={field} label='Base Price' type='number' />} />
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <form.Field
                    name='categoryId'
                    children={field => <SelectInput field={field} label='Category' placeholder='Select Category...' options={categoryOptions} />}
                  />

                  <form.Field
                    name='baseUnitId'
                    children={field => <SelectInput field={field} label='Base Unit (e.g., pc, kg)' placeholder='Select Unit...' options={unitOptions} />}
                  />
                </div>

                <form.Field name='image' children={field => <ImageInput label='Drag product image here' field={field} />} />
              </CardContent>
            </Card>

            {/* Recipe / Ingredients Builder (Visual Placeholder) */}
            <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
              <CardHeader className='flex flex-row items-center justify-between'>
                <div>
                  <CardTitle className='flex items-center gap-2'>
                    <Utensils className='w-5 h-5 text-emerald-500' /> Recipe & Ingredients
                  </CardTitle>
                  <CardDescription>Select items this product consumes.</CardDescription>
                </div>
                <Button variant='outline' size='sm' className='rounded-full' onClick={handleAddIngredient}>
                  <Plus className='w-4 h-4 mr-1' /> Add Ingredient
                </Button>
              </CardHeader>
              <CardContent>
                <form.Subscribe
                  selector={state => state.values.ingredients}
                  children={ingredients => (
                    <div className='space-y-2'>
                      {ingredients.length > 0 ? (
                        ingredients.map((ing, idx) => (
                          <div key={idx} className='flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50'>
                            <div className='flex flex-col'>
                              <span className='font-medium text-sm'>{ing.material.name}</span>
                              <span className='text-xs text-muted-foreground'>
                                {ing.quantityUsed} {ing.unit.abbreviation}
                              </span>
                            </div>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-8 w-8 rounded-full text-muted-foreground hover:text-destructive'
                              onClick={() => removeItem('ingredients', idx)}
                            >
                              <X className='w-4 h-4' />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <div className='bg-muted/30 rounded-2xl p-8 border-2 border-dashed border-muted flex flex-col items-center justify-center text-center'>
                          <Utensils className='w-10 h-10 text-muted-foreground/20 mb-2' />
                          <p className='text-sm text-muted-foreground'>Search and add products from your pantry.</p>
                        </div>
                      )}
                    </div>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Settings, Add-ons & Variants */}
          <div className='space-y-6'>
            <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
              <CardHeader>
                <CardTitle className='text-lg flex items-center gap-2'>
                  <Warehouse className='w-5 h-5 text-emerald-500' /> Inventory Logic
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <form.Field
                  name='isAvailable'
                  children={field => (
                    <div className='flex items-center justify-between'>
                      <Label>Active in POS</Label>
                      <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                    </div>
                  )}
                />
                <form.Field
                  name='hasExpiry'
                  children={field => (
                    <div className='flex items-center justify-between'>
                      <Label>Track Expiry Date</Label>
                      <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                    </div>
                  )}
                />
              </CardContent>
            </Card>

            {/* Variants Summary */}
            <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
              <CardHeader>
                <CardTitle className='text-lg flex items-center gap-2'>
                  <Layers className='w-5 h-5 text-amber-500' /> Variants
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-xs text-muted-foreground mb-4'>Create size or color variations of this product.</p>
                <div className='space-y-4'>
                  <form.Subscribe
                    selector={state => state.values.variants}
                    children={variants => (
                      <div className='space-y-2'>
                        {variants.map((v, idx) => (
                          <div key={idx} className='flex items-center justify-between p-2 bg-background/50 rounded-lg border border-border/40 text-sm'>
                            <span>
                              {v.variantValue}{' '}
                              {v.price ? <span className='text-muted-foreground ml-2'>{`${PriceEngine.format(v.price)} ${user.branch.currency}`}</span> : null}
                            </span>
                            <Button variant='ghost' size='icon' className='h-6 w-6' onClick={() => removeItem('variants', idx)}>
                              <X className='w-3 h-3' />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  />
                  <Button variant='outline' className='w-full rounded-xl border-dashed' onClick={handleAddVariants}>
                    <Plus className='w-4 h-4 mr-2' /> Configure Variants
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Add-ons Summary */}
            <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
              <CardHeader>
                <CardTitle className='text-lg flex items-center gap-2'>
                  <PlusCircle className='w-5 h-5 text-blue-500' /> Add-ons
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-xs text-muted-foreground mb-4'>Define optional extras like 'Extra Cheese'.</p>
                <div className='space-y-4'>
                  <form.Subscribe
                    selector={state => state.values.allowedAddons}
                    children={addons => (
                      <div className='space-y-3'>
                        {addons.map((a, idx) => (
                          <div
                            key={idx}
                            className='group flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border border-border/50 shadow-sm'
                          >
                            {/* Left Side: Info */}
                            <div className='flex flex-col gap-0.5'>
                              <span className='font-medium text-foreground leading-none'>{a.addon.name}</span>
                              <span className='text-xs text-muted-foreground'>
                                {a.defaultQuantity} {a.addon.baseUnit.abbreviation} • Base Rate
                              </span>
                            </div>

                            {/* Right Side: Price & Action */}
                            <div className='flex items-center gap-4'>
                              <span className='font-mono font-semibold text-sm'>{PriceEngine.format(a.priceOverride)}</span>

                              <Button variant='destructive' size='icon' className='h-7 w-7' onClick={() => removeItem('allowedAddons', idx)}>
                                <X className='w-3.5 h-3.5' />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  />
                  <Button variant='outline' className='w-full rounded-xl border-dashed' onClick={handleAddAddons}>
                    <Plus className='w-4 h-4 mr-2' /> Add Add-ons
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>

      {/* Submit Button */}
      <div className='pt-4'>
        <form.Subscribe
          selector={state => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button
              onClick={() => form.handleSubmit()}
              disabled={!canSubmit || isSubmitting}
              className='w-full h-14 rounded-2xl text-lg font-bold shadow-xl active:scale-95 flex gap-2 shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'
            >
              <Save className='w-5! h-5!' />
              {isSubmitting ? textBtn.isSubmitting : textBtn.default}
            </Button>
          )}
        />
      </div>
    </div>
  )
}
