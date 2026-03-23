import { ImageInput } from '@/components/custom/form/image-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { showModal } from '@/lib/Overlay'
import { useForm } from '@tanstack/react-form'
import { createFileRoute } from '@tanstack/react-router'
import { Layers, Package, Plus, PlusCircle, Save, Utensils, Warehouse } from 'lucide-react'
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
        <RouteComponent />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent() {
  const form = useForm({
    defaultValues: {
      name: '',
      sku: '',
      price: 0,
      type: 'BUNDLE',
      categoryId: '',
      image: '',
      isAvailable: true,
      hasExpiry: false,
    },
    onSubmit: async ({ value }) => {
      console.log('Submit Product:', value)
      // Logic for crudAPI create goes here
    },
  })

  const handleAddIngredient = () => {
    showModal(AddIngredientModal)
  }

  const handleAddVariants = () => {
    showModal(AddVariantModal)
  }

  const handleAddAddons = () => {
    showModal(AddAddonModal)
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
                <form.Field name='sku' children={field => <TextInput field={field} label='Base Price' type='number' />} />
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
              <div className='bg-muted/30 rounded-2xl p-8 border-2 border-dashed border-muted flex flex-col items-center justify-center text-center'>
                <Utensils className='w-10 h-10 text-muted-foreground/20 mb-2' />
                <p className='text-sm text-muted-foreground'>Search and add products from your pantry.</p>
              </div>
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
              <Button variant='outline' className='w-full rounded-xl border-dashed' onClick={handleAddVariants}>
                Configure Variants
              </Button>
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
              <Button variant='outline' className='w-full rounded-xl border-dashed' onClick={handleAddAddons}>
                Manage Add-ons
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
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
