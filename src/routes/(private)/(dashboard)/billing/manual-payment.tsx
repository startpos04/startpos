/**
 * manual-payment.tsx
 * 
 * Manual payment submission page for GCash, Bank Transfer, Maya, etc.
 * Follows component standards:
 * - Uses custom form components
 * - Uses Sonner for toast notifications
 * - Responsive design with proper validation
 * - Image upload for payment proof
 */

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ArrowLeftIcon, CreditCardIcon, InfoIcon, UploadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import MountManager from '@/lib/mount-manager'
import { AlertPrompt } from '@/components/custom/prompt/alert-prompt'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { submitManualPayment } from '@/lib/server-fn/submit-manual-payment'
import { paymentProviderRegistry } from '@/lib/billing/payment-provider-registry'
import { authStore } from '@/lib/better-auth/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/billing/manual-payment')({
  validateSearch: (search: Record<string, unknown>) => ({
    planId: (search['planId'] as string) || '',
    amount: search['amount'] ? parseInt(search['amount'] as string) : 0,
    periodsAdvancePaid: search['periodsAdvancePaid'] ? Math.min(3, Math.max(1, parseInt(search['periodsAdvancePaid'] as string))) : 1,
  }),
  component: ManualPaymentPage,
})

function ManualPaymentPage() {
  const navigate = useNavigate()
  const { planId, amount, periodsAdvancePaid: initialPeriods } = useSearch({ from: Route.fullPath })
  const user = useStore(authStore, s=>s.user)

  // Form state
  const [paymentMethod, setPaymentMethod] = useState<'GCASH' | 'BANK_TRANSFER' | 'MAYA'>('GCASH')
  const [referenceNo, setReferenceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [proofImage, setProofImage] = useState<string>('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  
  // Advance payment state
  const [periodsAdvancePaid, setPeriodsAdvancePaid] = useState<number>(initialPeriods || 1)
  const [calculatedAmount, setCalculatedAmount] = useState<number>(amount * (initialPeriods || 1))

  // Get manual provider config
  const manualConfig = paymentProviderRegistry.getConfig('manual')
  
  // Calculate amount based on periods
  const handlePeriodsChange = (periods: number) => {
    setPeriodsAdvancePaid(periods)
    setCalculatedAmount(amount * periods)
  }

  // Form validation
  const canSubmit = proofImage && calculatedAmount > 0 && planId && periodsAdvancePaid >= 1 && periodsAdvancePaid <= 3

  // Mutation for submitting payment
  const submitMutation = useMutation({
    mutationFn: submitManualPayment,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Payment submitted successfully', {
          description: result.message,
        })
        navigate({ to: '/billing?tab=payments' })
      } else {
        MountManager.show(AlertPrompt, {
          title: 'Payment Submission Failed',
          description: result.error || 'Unable to submit payment. Please try again.',
          btnText: 'OK'
        })
      }
    },
    onError: (error: Error) => {
      MountManager.show(AlertPrompt, {
        title: 'Payment Submission Failed',
        description: error.message || 'An unexpected error occurred. Please try again.',
        btnText: 'OK'
      })
    },
  })

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }

    setImageFile(file)

    // Convert to base64 for preview and submission
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64String = e.target?.result as string
      setProofImage(base64String)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canSubmit) {
      toast.error('Please fill in all required fields')
      return
    }

    submitMutation.mutate({
      data: {
        planId,
        amount: calculatedAmount,
        paymentMethod,
        periodsAdvancePaid,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        proofImageUrl: proofImage,
      },
    })
  }

  if (!manualConfig) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30">
          <InfoIcon className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm">Manual payment is not available at this time.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/billing/plans' })} className="mb-2 -ml-2">
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back to Plans
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Manual Payment</h1>
        <p className="text-muted-foreground mt-1">Submit your payment proof for admin review</p>
      </div>

      {/* Payment Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <CreditCardIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Payment Details</CardTitle>
              <CardDescription>Amount to pay and payment instructions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Advance Payment Period Selector */}
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 dark:from-blue-950/20 dark:to-indigo-950/20 dark:border-blue-800">
            <div className="flex items-start gap-3 mb-3">
              <InfoIcon className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100">
                  Pay in Advance & Save Time
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Pay for multiple billing periods upfront. Your subscription will remain active without requiring monthly payments.
                </p>
              </div>
            </div>
            
            <div className="space-y-3 mt-4">
              <Label htmlFor="periods" className="text-blue-900 dark:text-blue-100">
                Number of Billing Periods (Max 3 months for manual payments)
              </Label>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <input
                    id="periods"
                    type="range"
                    min="1"
                    max="3"
                    value={periodsAdvancePaid}
                    onChange={(e) => handlePeriodsChange(Number.parseInt(e.target.value))}
                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer dark:bg-blue-700"
                  />
                </div>
                <div className="flex items-baseline gap-1 min-w-[80px]">
                  <span className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                    {periodsAdvancePaid}
                  </span>
                  <span className="text-sm text-blue-600 dark:text-blue-300">
                    {periodsAdvancePaid === 1 ? 'month' : 'months'}
                  </span>
                </div>
              </div>
              
              {/* Quick select buttons */}
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3].map((period) => (
                  <Button
                    key={period}
                    type="button"
                    variant={periodsAdvancePaid === period ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePeriodsChange(period)}
                    className={periodsAdvancePaid === period ? "bg-blue-600 hover:bg-blue-700" : "border-blue-300 text-blue-700 hover:bg-blue-100"}
                  >
                    {period} {period === 1 ? 'month' : 'months'}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Amount Breakdown */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Monthly Rate</p>
              <p className="text-lg font-semibold">₱{(amount / 100).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Periods Selected</p>
              <p className="text-lg font-semibold">{periodsAdvancePaid} {periodsAdvancePaid === 1 ? 'month' : 'months'}</p>
            </div>
            <div className="col-span-2 pt-3 border-t">
              <p className="text-sm text-muted-foreground mb-1">Total Amount to Pay</p>
              <p className="text-3xl font-bold text-primary">₱{(calculatedAmount / 100).toFixed(2)}</p>
              {periodsAdvancePaid > 1 && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  ✓ Covers {periodsAdvancePaid} billing periods • No payments needed until {new Date(Date.now() + periodsAdvancePaid * 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {/* Original payment info */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg border">
            <div>
              <p className="text-sm text-muted-foreground">Plan</p>
              <p className="font-medium">{planId}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Billing Cycle</p>
              <p className="font-medium">Monthly</p>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Payment Instructions</h4>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
              <div className="space-y-2 text-sm">
                <p><strong>Account Name:</strong> {manualConfig.config.accountName}</p>
                <p><strong>Account Number:</strong> {manualConfig.config.accountNumber}</p>
                <p className="mt-3">{manualConfig.config.paymentInstructions}</p>
                {periodsAdvancePaid > 1 && (
                  <div className="mt-3 pt-3 border-t border-blue-300 dark:border-blue-700">
                    <p className="text-blue-800 dark:text-blue-200">
                      <strong>💡 Advance Payment:</strong> You're paying for {periodsAdvancePaid} months. 
                      Make sure to transfer the full amount of ₱{(calculatedAmount / 100).toFixed(2)}.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Form */}
      <Card>
        <CardHeader>
          <CardTitle>Submit Payment Proof</CardTitle>
          <CardDescription>Upload proof of payment for admin verification</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GCASH">GCash</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="MAYA">Maya</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reference Number */}
            <div className="space-y-2">
              <Label htmlFor="referenceNo">Reference Number (Optional)</Label>
              <Input
                id="referenceNo"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="Transaction reference or confirmation number"
              />
            </div>

            {/* Payment Proof Upload */}
            <div className="space-y-2">
              <Label htmlFor="proofImage">Payment Proof *</Label>
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                {proofImage ? (
                  <div className="space-y-4">
                    <img
                      src={proofImage}
                      alt="Payment proof"
                      className="max-w-full h-48 mx-auto object-contain rounded-lg"
                    />
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {imageFile?.name}
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('imageUpload')?.click()}>
                        Change Image
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <UploadIcon className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Upload screenshot of payment</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => document.getElementById('imageUpload')?.click()}>
                      Select Image
                    </Button>
                  </div>
                )}
                <input
                  id="imageUpload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional information about the payment..."
                rows={3}
              />
            </div>

            {/* Warning */}
            <div className="flex items-start gap-3 p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <InfoIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-300">
                <p className="font-medium mb-1">Payment Review Process</p>
                <p>
                  ⏱️ Your payment will be reviewed by our admin team within 24 hours. 
                  {periodsAdvancePaid > 1 && (
                    <> Once approved, your subscription will be active for <strong>{periodsAdvancePaid} months</strong> without requiring additional payments.</>
                  )}
                  {periodsAdvancePaid === 1 && (
                    <> Once approved, your subscription will be activated.</>
                  )}
                </p>
                {user?.business?.preferredPaymentProvider === 'stripe' && periodsAdvancePaid > 1 && (
                  <p className="mt-2 text-blue-700 dark:text-blue-300">
                    🔄 <strong>Auto-sync enabled:</strong> Your advance payment will be synced to Stripe to prevent duplicate charges during the advance period.
                  </p>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <Button 
                type="submit" 
                size="lg"
                disabled={!canSubmit || submitMutation.isPending}
                className="min-w-[140px]"
              >
                {submitMutation.isPending ? 'Submitting...' : 'Submit Payment'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}