import { ImageInput } from '@/components/custom/form/image-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { fetchCategoryOptions } from '@/lib/queries/fetch-category-options'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { useForm } from '@tanstack/react-form'
import { Info, Save, Warehouse } from 'lucide-react'
import { ReactNode } from 'react'
import { z } from 'zod'

interface CreateIngredientProps {
  defaultValues: CreateIngredientFormData
  onSubmit: ({ value }: { value: CreateIngredientFormData }) => Promise<void>
  children: ReactNode
  textBtn: {
    default: string
    isSubmitting: string
  }
}

const createIngredientSchema = z.object({
  name: z.string().min(2, 'Name required'),
  sku: z.string().min(1, 'SKU required'),
  image: z.string(),
  categoryId: z.string().min(1, 'Category required'),
  baseUnitId: z.string().min(1, 'Base unit required'),
  type: z.literal('RAW_MATERIAL'),
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
    <div className='flex flex-col gap-6 max-w-4xl mx-auto'>
      {children}

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {/* Main Details */}
        <div className='md:col-span-2 space-y-6'>
          <Card className='rounded-[2rem] border-none shadow-sm bg-card/50'>
            <CardHeader>
              <CardTitle className='text-lg flex items-center gap-2'>
                <Info className='w-5 h-5 text-blue-500' /> Basic Info
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <form.Field name='name' children={field => <TextInput field={field} label='Ingredient Name' placeholder='e.g. Beef Patty' />} />

              <div className='grid grid-cols-2 gap-4'>
                <form.Field name='sku' children={field => <TextInput field={field} label='Internal SKU' placeholder='ING-BEEF-01' />} />
                <form.Field name='categoryId' children={field => <SelectInput field={field} label='Category' options={categoryOptions} />} />
              </div>

              {/* Unit Selection - Critical for Recipe Math */}
              <form.Field
                name='baseUnitId'
                children={field => (
                  <SelectInput field={field} label='Inventory Base Unit' placeholder='Select Unit (e.g. Grams, Pieces)' options={unitOptions} />
                )}
              />

              <form.Field name='image' children={field => <ImageInput label='Ingredient Photo' field={field} />} />
            </CardContent>
          </Card>
        </div>

        {/* Inventory Settings */}
        <div className='space-y-6'>
          <Card className='rounded-[2rem] border-none shadow-sm bg-card/50'>
            <CardHeader>
              <CardTitle className='text-lg flex items-center gap-2'>
                <Warehouse className='w-5 h-5 text-emerald-500' /> Inventory Logic
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
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
      </div>
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
