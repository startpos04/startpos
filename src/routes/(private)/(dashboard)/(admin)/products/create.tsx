import { ImageInput } from '@/components/custom/form/image-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { showModal } from '@/lib/Overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { fetchCategoryOptions } from '@/lib/queries/fetch-category-options'
import { feIngredient } from '@/lib/queries/fetch-ingredients'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { Prettify } from '@/lib/types'
import { authStore } from '@/store/auth-store'
import { useForm, useStore } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Layers, Package, Plus, PlusCircle, Save, Utensils, Warehouse, X } from 'lucide-react'
import numeral from 'numeral'
import { ResourceType } from 'prisma/generated/prisma/enums'
import { z } from 'zod'
import { AddAddonModal } from './-components/add-addon'
import { AddIngredientModal } from './-components/add-ingredient'
import { AddVariantModal } from './-components/add-variant'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/products/create')({
  component: () => <RouteComponent />,
})

export function CreateProductDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const user = useStore(authStore, state => state.user)
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const { data: categoryOptions = [] } = fetchCategoryOptions()
  const { data: unitOptions = [] } = fetchUnitOptions()

  const form = useForm({
    defaultValues: {
      name: '',
      sku: '',
      price: 0,
      type: 'BUNDLE' as ResourceType,
      categoryId: '',
      baseUnitId: '',
      image: '',
      isAvailable: true,
      hasExpiry: false,
      ingredients: [] as Prettify<feIngredient & { quantityUsed: number }>[],
      variants: [] as { variantType: string; variantValue: string; sku: string; price: number }[],
      allowedAddons: [] as Prettify<feIngredient & { defaultQuantity: number; priceOverride: number }>[],
    },
    onSubmit: async ({ value }) => {
      const { variants, ingredients, allowedAddons, ...product } = value

      try {
        await crudAPI({
          data: {
            action: 'create',
            table: 'product',
            args: {
              data: {
                ...product,
                organizationId: '',
                ingredients: {
                  createMany: {
                    data: ingredients.map(ingredient => ({ materialId: ingredient.id, quantityUsed: ingredient.quantityUsed, unitId: ingredient.baseUnitId })),
                  },
                },
                allowedAddons: {
                  createMany: {
                    data: allowedAddons.map(addon => ({ addonId: addon.id, priceOverride: addon.priceOverride, defaultQuantity: addon.defaultQuantity })),
                  },
                },
                variants: {
                  createMany: {
                    data: variants.map(variant => ({
                      ...product,
                      organizationId: '',
                      variantType: variant.variantType,
                      variantValue: variant.variantValue,
                      sku: `${product.sku}-${variant.sku}`,
                      price: variant.price,
                    })),
                  },
                },
              },
            },
          },
        })

        await queryClient.invalidateQueries({ queryKey: ['products'] })
        onClose?.() || navigate({ to: '..' })
      } catch (error) {
        console.error('Failed to create product:', error)
      }
    },
  })

  const handleAddIngredient = () => {
    showModal(AddIngredientModal, {
      onAdd: ingredient => {
        form.pushFieldValue('ingredients', ingredient)
      },
    })
  }

  const handleAddVariants = () => {
    showModal(AddVariantModal, {
      variants: form.getFieldValue('variants'),
      onAdd: variants => {
        form.setFieldValue('variants', variants)
      },
    })
  }

  const handleAddAddons = () => {
    showModal(AddAddonModal, {
      onAdd: addon => {
        form.pushFieldValue('allowedAddons', addon)
      },
    })
  }

  const removeItem = (field: 'ingredients' | 'variants' | 'allowedAddons', index: number) => {
    form.setFieldValue(field, (prev: any[]) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className='flex flex-col gap-6 max-w-5xl mx-auto'>
      {/* Header */}
      <div>
        <h1 className='text-3xl font-bold tracking-tight'>New Product</h1>
        <p className='text-muted-foreground text-sm'>Define your item, recipe, and variants.</p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
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
                <form.Field name='price' children={field => <TextInput field={field} label='Base Price' type='number' />} />
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
                            <span className='font-medium text-sm'>{ing.name}</span>
                            <span className='text-xs text-muted-foreground'>
                              {ing.quantityUsed} {ing.baseUnit.abbreviation}
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
                            <span className='font-medium text-foreground leading-none'>{a.name}</span>
                            <span className='text-xs text-muted-foreground'>
                              {a.defaultQuantity} {a.baseUnit.abbreviation} • Base Rate
                            </span>
                          </div>

                          {/* Right Side: Price & Action */}
                          <div className='flex items-center gap-4'>
                            <span className='font-mono font-semibold text-sm'>{numeral(a.priceOverride).format('$0,0.00')}</span>

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

      {/* Submit Button */}
      <form.Subscribe
        selector={state => [state.canSubmit, state.isSubmitting]}
        children={([canSubmit, isSubmitting]) => (
          <Button onClick={() => form.handleSubmit()} disabled={!canSubmit} className='px-8 shadow-lg shadow-primary/20'>
            {isSubmitting ? (
              'Creating...'
            ) : (
              <>
                <Save className='w-4 h-4 mr-2' /> Save Product
              </>
            )}
          </Button>
        )}
      />
    </div>
  )
}
