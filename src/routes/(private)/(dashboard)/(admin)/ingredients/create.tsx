import { ImageInput } from '@/components/custom/form/image-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useForm } from '@tanstack/react-form'
import { createFileRoute } from '@tanstack/react-router'
import { Info, Save, Warehouse } from 'lucide-react'
import { z } from 'zod'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/ingredients/create')({
  component: () => <RouteComponent />,
})

export function CreateIngredientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl'>
        <RouteComponent />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent() {
  const form = useForm({
    defaultValues: {
      name: '',
      sku: '', // e.g., ING-BEEF
      image: '',
      categoryId: '', // Usually the 'Pantry' ID from your seeder
      type: 'RAW_MATERIAL',
      price: 0, // Ingredients usually have 0 sale price in your schema
      isAvailable: false, // Usually false for POS since you don't sell raw flour
      hasExpiry: true, // Based on your seeder logic
    },
    onSubmit: async ({ value }) => {
      console.log('Creating Raw Material:', value)
      // Logic: crudAPI.post('/products', value)
    },
  })

  return (
    <div className='flex flex-col gap-6 max-w-4xl mx-auto'>
      {/* Header */}
      <div>
        <h1 className='text-3xl font-bold'>New Ingredient</h1>
        <p className='text-muted-foreground'>Add a raw material to your pantry inventory.</p>
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
              <form.Field
                name='name'
                validators={{ onChange: z.string().min(2, 'Name required') }}
                children={field => <TextInput field={field} label='Ingredient Name' placeholder='e.g. Whole Milk' />}
              />
              <form.Field
                name='sku'
                validators={{ onChange: z.string().min(1, 'SKU required') }}
                children={field => <TextInput field={field} label='Internal SKU' placeholder='ING-001' />}
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
                      <p className='text-[0.7rem] text-muted-foreground'>Requires date on restock.</p>
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
                      <Label>Sellable Item</Label>
                      <p className='text-[0.7rem] text-muted-foreground'>Can be sold directly at POS.</p>
                    </div>
                    <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                  </div>
                )}
              />

              <div className='pt-4 border-t border-dashed'>
                <p className='text-[0.7rem] text-muted-foreground italic text-center'>
                  Note: Ingredients are tracked in the <b>Inventory Movements</b> table when restocked.
                </p>
              </div>
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
