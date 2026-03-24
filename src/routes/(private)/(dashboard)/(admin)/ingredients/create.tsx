import { ImageInput } from '@/components/custom/form/image-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { fetchCategoryOptions } from '@/lib/queries/fetch-category-options'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Info, Save, Warehouse } from 'lucide-react'
import { z } from 'zod'

const ingredientSchema = z.object({
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
type FormData = z.infer<typeof ingredientSchema>

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/ingredients/create')({
  component: () => <RouteComponent />,
})

export function CreateIngredientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-3xl'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()

  const { data: categoryOptions = [] } = fetchCategoryOptions()
  const { data: unitOptions = [] } = fetchUnitOptions()

  const handleSubmit = async ({ value }: { value: FormData }) => {
    try {
      await crudAPI({
        data: {
          action: 'create',
          table: 'product',
          args: {
            data: {
              ...value,
              image: value.image || null,
            },
          },
        },
      })

      await queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      onClose?.() || navigate({ to: '..' })
    } catch (error) {
      console.error('Failed to create ingredient:', error)
    }
  }

  const form = useForm({
    defaultValues: {
      name: '',
      sku: '',
      image: '',
      type: 'RAW_MATERIAL' as const,
      categoryId: '',
      baseUnitId: '',
      price: 0,
      isAvailable: false,
      hasExpiry: true,
    },
    onSubmit: handleSubmit,
    validators: {
      onBlur: ingredientSchema,
      onSubmit: ingredientSchema,
    },
  })

  return (
    <div className='flex flex-col gap-6 max-w-4xl mx-auto'>
      {/* Header */}
      <div>
        <h1 className='text-3xl font-bold'>New Ingredient</h1>
        <p className='text-muted-foreground'>Register a new raw material and define its tracking units.</p>
      </div>

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
      <form.Subscribe
        selector={state => [state.canSubmit, state.isSubmitting]}
        children={([canSubmit, isSubmitting]) => (
          <Button onClick={() => form.handleSubmit()} disabled={!canSubmit}>
            <Save className='w-4 h-4 mr-2' />
            {isSubmitting ? 'Saving...' : 'Save Ingredient'}
          </Button>
        )}
      />
    </div>
  )
}
