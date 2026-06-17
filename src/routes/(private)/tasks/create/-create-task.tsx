import { useLiveQuery } from '@tanstack/react-db'
import { formOptions, useStore } from '@tanstack/react-form'
import { Save } from 'lucide-react'
import { TaskType } from 'prisma/generated/prisma/enums'
import type { ReactNode } from 'react'
import z from 'zod'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextAreaInput } from '@/components/custom/form/text-area-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { userCollection } from '@/db/collections'
import { useAppForm, withForm } from '@/hooks/form'
import { fetchBranchOptions } from '@/lib/queries/fetch-branch-options'
import { fetchLocationOptions } from '@/lib/queries/fetch-location-options'
import { fetchProductVariantOptions } from '@/lib/queries/fetch-product-variant-options'
import { fetchSupplierOptions } from '@/lib/queries/fetch-supplier-options'

const TASK_CONFIG = {
  [TaskType.BRANCH_TRANSFER]: {
    label: 'Branch Transfer',
    validator: z.object({
      variantId: z.string().nullable(),
      suggestedQty: z.number().min(0, 'Quantity must be 0 or more').nullable(),
      targetBranchId: z.string().nullable(),
    }),
  },
  [TaskType.SHELF_REFILL]: {
    label: 'Shelf Refill (Bodega to Front)',
    validator: z.object({
      variantId: z.string().nullable(),
      suggestedQty: z.number().min(0, 'Quantity must be 0 or more').nullable(),
      sourceLocationId: z.string().nullable(),
      targetLocationId: z.string().nullable(),
    }),
  },
  [TaskType.STOCK_COUNT]: {
    label: 'Inventory Audit / Stock Count',
    validator: z.object({
      locationId: z.string().nullable(),
      variantId: z.string().nullable(),
      suggestedQty: z.number().min(0, 'Count must be 0 or more').nullable(),
    }),
  },
  [TaskType.WASTE_DISPOSAL]: {
    label: 'Waste / Damage Log',
    validator: z.object({
      variantId: z.string().nullable(),
      suggestedQty: z.number().min(0, 'Quantity must be 0 or more').nullable(),
      locationId: z.string().nullable(),
      batchNumber: z.string().nullable(),
    }),
  },
  [TaskType.PURCHASE_REQUEST]: {
    label: 'Purchase Request (Supplier)',
    validator: z.object({
      supplierId: z.string().nullable(),
      variantId: z.string().nullable(),
      suggestedQty: z.number().min(1, 'Quantity must be 1 or more').nullable(),
    }),
  },
  [TaskType.GENERAL_CHORE]: {
    label: 'General Chore (Cleaning/Maintenance)',
    validator: z.object({}),
  },
}

// Shared base schema mapping directly to common properties
const baseTaskSchema = z.object({
  type: z.enum(TaskType),
  clerkId: z.string().nullable(),
  approverId: z.string().nullable(),
  notes: z.string().max(200, 'Notes are too long').nullable(),
})

// Unified discriminatedUnion validator across all task types (Zero-casting, inline loop)
export const createTaskSchema = z.discriminatedUnion('type', [
  baseTaskSchema.extend({ type: z.literal(TaskType.GENERAL_CHORE) }).extend(TASK_CONFIG[TaskType.GENERAL_CHORE].validator.shape),
  ...(Object.keys(TASK_CONFIG) as Array<keyof typeof TASK_CONFIG>)
    .filter(key => key !== TaskType.GENERAL_CHORE)
    .map(key => baseTaskSchema.extend({ type: z.literal(key) }).extend(TASK_CONFIG[key].validator.shape)),
])

export type CreateTaskFormData = z.infer<typeof createTaskSchema>

export const taskFormOpts = formOptions({
  defaultValues: {
    type: TaskType.GENERAL_CHORE,
    clerkId: null,
    approverId: null,
    notes: null,
    suggestedQty: null,
    sourceLocation: null,
    targetLocation: null,
  } as CreateTaskFormData,
})

// Definition for dynamic form block renderers with rigid type protection
const TASK_FIELD = {
  [TaskType.BRANCH_TRANSFER]: withForm({
    ...taskFormOpts,
    render: ({ form }) => {
      const { data: variantOptions = [] } = fetchProductVariantOptions()
      const { data: branchOptions = [] } = fetchBranchOptions()
      return (
        <>
          <form.Field name='variantId' children={field => <SelectInput field={field} label='Select Item' options={variantOptions} />} />
          <form.Field name='suggestedQty' children={field => <TextInput field={field} label='Transfer Quantity' type='number' />} />
          <form.Field name='targetBranchId' children={field => <SelectInput field={field} label='Destination Branch' options={branchOptions} />} />
        </>
      )
    },
  }),
  [TaskType.SHELF_REFILL]: withForm({
    ...taskFormOpts,
    render: ({ form }) => {
      const { data: variantOptions = [] } = fetchProductVariantOptions()
      const { data: locationOptions = [] } = fetchLocationOptions()
      return (
        <>
          <form.Field name='variantId' children={field => <SelectInput field={field} label='Select Item' options={variantOptions} />} />
          <form.Field name='suggestedQty' children={field => <TextInput field={field} label='Suggested Quantity' type='number' />} />
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            <form.Field name='sourceLocationId' children={field => <SelectInput field={field} label='Source Location' options={locationOptions} />} />
            <form.Field name='targetLocationId' children={field => <SelectInput field={field} label='Target Location' options={locationOptions} />} />
          </div>
        </>
      )
    },
  }),
  [TaskType.STOCK_COUNT]: withForm({
    ...taskFormOpts,
    render: ({ form }) => {
      const { data: locationOptions = [] } = fetchLocationOptions()
      const { data: variantOptions = [] } = fetchProductVariantOptions()

      return (
        <>
          <form.Field name='locationId' children={field => <SelectInput field={field} label='Audit Location' options={locationOptions} />} />
          <form.Field name='variantId' children={field => <SelectInput field={field} label='Target Variant' options={variantOptions} />} />
          <form.Field name='suggestedQty' children={field => <TextInput field={field} label='Physical Counted Quantity' type='number' />} />
        </>
      )
    },
  }),
  [TaskType.WASTE_DISPOSAL]: withForm({
    ...taskFormOpts,
    render: ({ form }) => {
      const { data: variantOptions = [] } = fetchProductVariantOptions()
      const { data: locationOptions = [] } = fetchLocationOptions()

      return (
        <>
          <form.Field name='variantId' children={field => <SelectInput field={field} label='Damaged/Expired Item' options={variantOptions} />} />
          <form.Field name='suggestedQty' children={field => <TextInput field={field} label='Waste Quantity' type='number' />} />
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            <form.Field name='locationId' children={field => <SelectInput field={field} label='From Location' options={locationOptions} />} />
            <form.Field name='batchNumber' children={field => <TextInput field={field} label='Batch/Lot Number (Optional)' />} />
          </div>
        </>
      )
    },
  }),
  [TaskType.PURCHASE_REQUEST]: withForm({
    ...taskFormOpts,
    render: ({ form }) => {
      const { data: supplierOptions = [] } = fetchSupplierOptions()
      const { data: variantOptions = [] } = fetchProductVariantOptions()
      return (
        <>
          <form.Field name='supplierId' children={field => <SelectInput field={field} label='Target Supplier' options={supplierOptions} />} />
          <form.Field name='variantId' children={field => <SelectInput field={field} label='Item to Order' options={variantOptions} />} />
          <form.Field name='suggestedQty' children={field => <TextInput field={field} label='Order Quantity' type='number' />} />
        </>
      )
    },
  }),
  [TaskType.GENERAL_CHORE]: withForm({ ...taskFormOpts, render: () => null }),
}

interface CreateTaskProps {
  defaultValues: CreateTaskFormData
  onSubmit: ({ value }: { value: CreateTaskFormData }) => Promise<void>
  children: ReactNode
  textBtn: {
    default: string
    isSubmitting: string
  }
}

export function CreateTask({ onSubmit, defaultValues, children, textBtn }: CreateTaskProps) {
  const form = useAppForm({
    ...taskFormOpts,
    defaultValues,
    onSubmit,
    validators: {
      onChange: createTaskSchema,
    },
  })

  const { data: employees } = useLiveQuery(q => q.from({ user: userCollection }))
  const currentType = useStore(form.store, state => state.values.type)
  const Field = TASK_FIELD[currentType]

  const userOptions = (employees ?? []).map(emp => ({
    value: emp.id,
    label: emp.name || emp.email || 'Unknown User',
  }))

  const taskTypeOptions = (Object.keys(TASK_CONFIG) as Array<keyof typeof TASK_CONFIG>).map(key => ({
    value: key,
    label: TASK_CONFIG[key].label,
  }))

  return (
    <div className='p-4 w-full'>
      <div className='flex flex-col gap-6 max-w-4xl mx-auto'>
        {children}

        <form.Field name='type' children={field => <SelectInput field={field} label='Operation Type' options={taskTypeOptions} />} />

        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
          <form.Field
            name='clerkId'
            children={field => <SelectInput field={field} label='Assigned Clerk' placeholder='Who will perform this?' options={userOptions} />}
          />
          <form.Field
            name='approverId'
            children={field => <SelectInput field={field} label='Designated Approver' placeholder='Who will verify this?' options={userOptions} />}
          />
        </div>

        {/* Dynamic fields read seamlessly from the shared form context */}
        <Field form={form} />

        <form.Field
          name='notes'
          children={field => <TextAreaInput field={field} label='Instructions / Reason' placeholder='Add specific details or instructions here...' />}
        />

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
    </div>
  )
}
