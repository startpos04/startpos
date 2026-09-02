import { ImageInput } from '@platform/components/custom/form/image-input'
import { SelectInput } from '@platform/components/custom/form/select-input'
import { TextInput } from '@platform/components/custom/form/text-input'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Label } from '@platform/components/ui/label'
import { Switch } from '@platform/components/ui/switch'
import { productVariantCollection } from '@platform/db/collections'
import { useForm } from '@tanstack/react-form'
import { Info, Save, Warehouse } from 'lucide-react'
import { ResourceType } from 'prisma/generated/prisma/enums'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { fetchCategoryOptions } from '@/lib/queries/fetch-category-options'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'

interface CreateIngredientProps {
  defaultValues: CreateIngredientFormData
  onSubmit: ({ value }: { value: CreateIngredientFormData }) => Promise<void>
  children?: ReactNode
  textBtn: {
    default: string
    isSubmitting: string
  }
}

const createIngredientSchema = z.object({
  name: z.string().min(2, 'Name required'),
  sku: z
    .string()
    .min(1, 'SKU required')
    .refine(
      val => {
        const existingVariant = [...productVariantCollection.values()].find(u => u.sku === val)
        return !existingVariant
      },
      { message: 'This SKU is already in use' },
    ),
  image: z.string(),
  categoryId: z.string().min(1, 'Category required'),
  baseUnitId: z.string().min(1, 'Base unit required'),
  type: z.enum(ResourceType),
  price: z.number().min(0),
  isAvailable: z.boolean(),
  hasExpiry: z.boolean(),
})

export type CreateIngredientFormData = z.infer<typeof createIngredientSchema>

export function CreateIngredient({ onSubmit, defaultValues, children, textBtn }: CreateIngredientProps) {
  const { data: categoryOptions = [] } = fetchCategoryOptions()
  const { data: unitOptions = [] } = fetchUnitOptions()

  const form = useForm({
    defaultValues,
    onSubmit,
    validators: {
      onChange: createIngredientSchema,
    },
  })

  return (
    <div className='flex flex-col h-full'>
      {/* Scrollable form body */}
      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        {children && <div className='pb-2'>{children}</div>}

        {/* Basic Info */}
        <Card className='rounded-[2rem] border-none shadow-sm bg-card/50'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center gap-2'>
              <Info className='w-4 h-4 text-blue-500' /> Basic Info
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <form.Field name='name' children={field => <TextInput field={field} label='Ingredient Name' placeholder='e.g. Beef Patty' />} />

            <div className='grid grid-cols-2 gap-4'>
              <form.Field name='sku' children={field => <TextInput field={field} label='Internal SKU' placeholder='ING-BEEF-01' />} />
              <form.Field name='categoryId' children={field => <SelectInput field={field} label='Category' options={categoryOptions} />} />
            </div>

            <form.Field
              name='baseUnitId'
              children={field => <SelectInput field={field} label='Inventory Base Unit' placeholder='Select Unit (e.g. Grams, Pieces)' options={unitOptions} />}
            />

            <form.Field name='image' children={field => <ImageInput label='Ingredient Photo' field={field} />} />
          </CardContent>
        </Card>

        {/* Inventory Logic */}
        <Card className='rounded-[2rem] border-none shadow-sm bg-card/50'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center gap-2'>
              <Warehouse className='w-4 h-4 text-emerald-500' /> Inventory Logic
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-5'>
            <form.Field
              name='hasExpiry'
              children={field => (
                <div className='flex items-center justify-between'>
                  <div className='space-y-0.5'>
                    <Label>Track Expiry</Label>
                    <p className='text-[0.7rem] text-muted-foreground tracking-tight'>Monitors shelf-life per batch.</p>
                  </div>
                  <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                </div>
              )}
            />

            <form.Field
              name='isAvailable'
              children={field => (
                <div className='flex items-center justify-between'>
                  <div className='space-y-0.5'>
                    <Label>Direct Sale</Label>
                    <p className='text-[0.7rem] text-muted-foreground tracking-tight'>Can be sold as a standalone item.</p>
                  </div>
                  <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                </div>
              )}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sticky footer */}
      <div className='p-4 border-t shrink-0'>
        <form.Subscribe
          selector={state => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button
              onClick={() => form.handleSubmit()}
              disabled={!canSubmit || isSubmitting}
              className='w-full h-11 rounded-xl font-semibold shadow-lg flex gap-2 shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'
            >
              <Save className='w-4! h-4!' />
              {isSubmitting ? textBtn.isSubmitting : textBtn.default}
            </Button>
          )}
        />
      </div>
    </div>
  )
}
