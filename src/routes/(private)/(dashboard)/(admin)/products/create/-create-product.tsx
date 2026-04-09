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
import { showModal } from '@/lib/overlay'
import { fetchCategoryOptions } from '@/lib/queries/fetch-category-options'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { useForm } from '@tanstack/react-form'
import { Package, Plus, PlusCircle, Save, Utensils, Warehouse, X } from 'lucide-react'
import { Unit } from 'prisma/generated/prisma/browser'
import { ReactNode } from 'react'
import { z } from 'zod'
import { AddAddonModal } from './-add-addon'
import { AddIngredientModal } from './-add-ingredient'

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
  type: z.enum(['BUNDLE', 'SINGLE', 'SERVICE']),
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

  variants: z.array(
    z.object({
      id: z.string(),
      variantType: z.string().nullable(),
      name: z.string().nullable(),
      sku: z.string().nullable(),
      price: z.number().nonnegative(),
      // Optional: You could allow per-variant ingredients here in the future
    }),
  ),

  allowedAddons: z.array(
    z.object({
      id: z.string(),
      addon: z.object({
        id: z.string(), // This is the Product ID
        name: z.string().nullable(),
      }),
      variant: z.object({
        id: z.string(), // This is the Variant ID of the raw material
        name: z.string().nullable(),
      }),
      unit: z.custom<Unit>(), // Added unit for the addon relation
      defaultQuantity: z.number().nonnegative(),
      priceOverride: z.number().nonnegative(),
    }),
  ),
})

export type CreateProductFormData = z.infer<typeof createProductSchema>

export function CreateProduct({ onSubmit, defaultValues, children, textBtn }: CreateProductProps) {
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
          material: ingredient.product,
          variant: ingredient.variant,
          quantityUsed: ingredient.quantityUsed,
          unit: ingredient.unit,
        })
      },
    })
  }

  const handleAddAddons = () => {
    showModal(AddAddonModal, {
      onAdd: addon => {
        form.pushFieldValue('allowedAddons', {
          id: '',
          addon: addon.product,
          variant: addon.variant,
          unit: addon.unit, // Pass the unit used for this addon
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
    <div className='flex flex-col gap-4 grow'>
      {children}

      <ScrollArea className='h-1 grow w-full'>
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 p-2 w-full'>
          {/* Left Column */}
          <div className='lg:col-span-2 space-y-6'>
            {/* General Info Card */}
            <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Package className='w-5 h-5 text-primary' /> General Information
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <form.Field name='name' children={field => <TextInput field={field} label='Name' placeholder='e.g. Latte' />} />
                <div className='grid grid-cols-2 gap-4'>
                  <form.Field name='sku' children={field => <TextInput field={field} label='SKU Base' placeholder='LAT-00' />} />
                  <form.Field name='price' children={field => <MoneyInput field={field} label='Base Price' />} />
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <form.Field name='categoryId' children={field => <SelectInput field={field} label='Category' options={categoryOptions} />} />
                  <form.Field name='baseUnitId' children={field => <SelectInput field={field} label='Base Unit' options={unitOptions} />} />
                </div>
                <form.Field name='image' children={field => <ImageInput label='Product Image' field={field} />} />
              </CardContent>
            </Card>

            {/* Recipe Builder Card */}
            <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
              <CardHeader className='flex flex-row items-center justify-between'>
                <div>
                  <CardTitle className='flex items-center gap-2'>
                    <Utensils className='w-5 h-5 text-emerald-500' /> Master Recipe
                  </CardTitle>
                  <CardDescription>These ingredients will apply to all variants.</CardDescription>
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
                      {ingredients.map((ing, idx) => (
                        <div key={idx} className='flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50'>
                          <div className='flex flex-col'>
                            <span className='font-medium text-sm'>
                              {[ing.material.name, ing.variant?.name ? `(${ing.variant.name})` : ''].filter(Boolean).join(' ')}
                            </span>
                            <span className='text-[10px] text-muted-foreground uppercase font-bold'>
                              {ing.quantityUsed} {ing.unit.abbreviation}
                            </span>
                          </div>
                          <Button variant='ghost' size='icon' className='h-8 w-8 text-muted-foreground' onClick={() => removeItem('ingredients', idx)}>
                            <X className='w-4 h-4' />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className='space-y-6'>
            {/* Inventory Logic Card */}
            <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
              <CardHeader>
                <CardTitle className='text-lg flex items-center gap-2'>
                  <Warehouse className='w-5 h-5 text-emerald-500' /> Inventory
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
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
              </CardContent>
            </Card>

            {/* Add-ons Card */}
            <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
              <CardHeader>
                <CardTitle className='text-lg flex items-center gap-2'>
                  <PlusCircle className='w-5 h-5 text-blue-500' /> Add-ons
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <form.Subscribe
                  selector={state => state.values.allowedAddons}
                  children={addons => (
                    <div className='space-y-2'>
                      {addons.map((a, idx) => (
                        <div key={idx} className='flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50'>
                          <div className='flex flex-col'>
                            <span className='font-medium text-xs'>{a.addon.name}</span>
                            <span className='text-[10px] text-muted-foreground'>{PriceEngine.format(a.priceOverride)}</span>
                          </div>
                          <Button variant='ghost' size='icon' className='h-7 w-7' onClick={() => removeItem('allowedAddons', idx)}>
                            <X className='w-3.5 h-3.5' />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                />
                <Button variant='outline' className='w-full rounded-xl border-dashed' onClick={handleAddAddons}>
                  + Add Extras
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>

      <div className='pt-4'>
        <form.Subscribe
          selector={state => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button
              onClick={() => form.handleSubmit()}
              disabled={!canSubmit || isSubmitting}
              className='w-full h-14 rounded-2xl text-lg font-bold shadow-xl flex gap-2 transition-all hover:scale-[1.01]'
            >
              <Save className='w-5 h-5' /> {isSubmitting ? textBtn.isSubmitting : textBtn.default}
            </Button>
          )}
        />
      </div>
    </div>
  )
}
