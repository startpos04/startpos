import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useForm, useStore } from '@tanstack/react-form'
import { Layers } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DefineVariantsStep } from './add-variant-step-1'
import { ReviewVariantsStep } from './add-variant-step-2'

export interface VariantPreview {
  enabled: boolean
  variantType: string
  variantValue: string
  sku: string
  price: number
}

interface AddVariantModalProps {
  open: boolean
  onClose: () => void
  onAdd: (variants: Omit<VariantPreview, 'enabled'>[]) => void
  variants: Omit<VariantPreview, 'enabled'>[]
}

export function AddVariantModal({ open, onClose, onAdd, variants }: AddVariantModalProps) {
  const [step, setStep] = useState<'define' | 'review'>('define')
  const [previews, setPreviews] = useState<VariantPreview[]>([])
  const [tempInputs, setTempInputs] = useState<Record<number, string>>({})

  const restructuredAttributes = useMemo(() => {
    if (!variants || variants.length === 0) {
      return [{ variantType: '', values: [] }]
    }

    const attrMap: Record<string, Record<string, number>> = {}

    variants.forEach(v => {
      const types = v.variantType.split('-')
      const names = v.variantValue.split('-')

      types.forEach((type: string, index: number) => {
        if (!type) return
        if (!attrMap[type]) attrMap[type] = {}

        const valueName = names[index]
        if (valueName) {
          if (!(valueName in attrMap[type]) || v.price > 0) {
            attrMap[type][valueName] = v.price
          }
        }
      })
    })

    return Object.entries(attrMap).map(([variantType, valueObj]) => ({
      variantType,
      values: Object.entries(valueObj).map(([variantValue, price]) => ({
        variantValue,
        price,
      })),
    }))
  }, [variants])

  const form = useForm({
    defaultValues: {
      attributes: restructuredAttributes,
    },
    onSubmit: async ({ value }) => {
      const activeAttrs = value.attributes.filter(a => a.variantType.trim() !== '' && a.values.length > 0)
      if (activeAttrs.length === 0) return

      const combinations = activeAttrs.reduce(
        (acc, attr) => {
          if (acc.length === 0) {
            return attr.values.map(v => ({
              variantType: attr.variantType,
              variantValue: v.variantValue,
              price: v.price || 0,
            }))
          }

          return acc.flatMap(prev =>
            attr.values.map(v => ({
              variantType: `${prev.variantType}-${attr.variantType}`,
              variantValue: `${prev.variantValue}-${v.variantValue}`,
              price: v.price || 0,
            })),
          )
        },
        [] as { variantType: string; variantValue: string; price: number }[],
      )

      const generated: VariantPreview[] = combinations.map(combo => {
        return {
          enabled: variants?.length ? variants.some(variant => variant.variantType === combo.variantType) : true,
          variantType: combo.variantType,
          variantValue: combo.variantValue,
          sku: combo.variantValue,
          price: combo.price,
        }
      })

      setPreviews(generated)
      setStep('review')
    },
  })

  const handleSave = () => {
    onAdd(previews.filter(p => p.enabled))
    onClose()
  }

  const attributes = useStore(form.store, s => s.values.attributes)
  const canPreview = useMemo(() => attributes.some(a => a.values.length > 0), [attributes])

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onClose()
        setStep('define')
      }}
    >
      <DialogContent className='sm:max-w-3xl max-h-[90vh] flex flex-col bg-background border-border shadow-2xl overflow-hidden'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Layers className='w-5 h-5 text-amber-500' />
            {step === 'define' ? 'Step 1: Define Variants' : 'Step 2: Review Combinations'}
          </DialogTitle>
        </DialogHeader>

        {step === 'define' ? (
          <DefineVariantsStep form={form} tempInputs={tempInputs} setTempInputs={setTempInputs} canPreview={canPreview} />
        ) : (
          <ReviewVariantsStep previews={previews} setPreviews={setPreviews} onBack={() => setStep('define')} onSave={handleSave} />
        )}
      </DialogContent>
    </Dialog>
  )
}
