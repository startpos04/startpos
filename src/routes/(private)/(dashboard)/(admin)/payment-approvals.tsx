/**
 * payment-approvals.tsx
 * 
 * Admin page for reviewing and approving manual payments.
 * Uses Table View component following component standards.
 * Requires admin permissions to access.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CheckIcon, XIcon, EyeIcon, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useState } from 'react'
import { reviewManualPayment } from '@/lib/server-fn/review-manual-payment'
import { crudAPI } from '@/lib/prisma-client/crud-api' // Using existing API patterns

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/payment-approvals')({
  component: PaymentApprovalsPage,
})

function PaymentApprovalsPage() {
  const queryClient = useQueryClient()
  const [reviewDialog, setReviewDialog] = useState<{
    paymentId: string
    businessName: string
    amount: number
    paymentMethod: string
    proofImageUrl?: string
    referenceNo?: string
    notes?: string
  } | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  // Fetch pending payments for admin review
  const { data: pendingPayments = [], isLoading } = useQuery({
    queryKey: ['admin', 'pending-payments'],
    queryFn: async () => {
      // This would use crudAPI to fetch pending payments
      // For now, return empty array - will be implemented when we have the API
      return []
      /*
      const result = await crudAPI.billingPayment('findMany', {
        where: { 
          status: 'PENDING_APPROVAL',
          requiresApproval: true 
        },
        include: {
          business: {
            select: { name: true, id: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      })
      
      if (result.isErr()) {
        throw new Error(result.error)
      }
      
      return result.value
      */
    },
  })

  // Mutation for approving/rejecting payments
  const reviewMutation = useMutation({
    mutationFn: reviewManualPayment,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Payment reviewed successfully', {
          description: result.message,
        })
        queryClient.invalidateQueries({ queryKey: ['admin', 'pending-payments'] })
        setReviewDialog(null)
        setRejectionReason('')
      } else {
        toast.error('Review failed', {
          description: result.error,
        })
      }
    },
    onError: (error: Error) => {
      toast.error('Review failed', {
        description: error.message,
      })
    },
  })

  const handleApprove = (paymentId: string) => {
    reviewMutation.mutate({
      data: {
        paymentId,
        approved: true,
      },
    })
  }

  const handleReject = (paymentId: string) => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }

    reviewMutation.mutate({
      data: {
        paymentId,
        approved: false,
        rejectionReason: rejectionReason.trim(),
      },
    })
  }

  const formatAmount = (amount: number) => {
    return `₱${(amount / 100).toFixed(2)}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return <Badge variant="secondary">Pending Review</Badge>
      case 'SUCCEEDED':
        return <Badge variant="default" className="bg-green-100 text-green-800">Approved</Badge>
      case 'FAILED':
        return <Badge variant="destructive">Rejected</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment Approvals</h1>
        <p className="text-muted-foreground mt-1">
          Review and approve manual payment submissions
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingPayments.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatAmount(pendingPayments.reduce((sum: number, payment: any) => sum + payment.amount, 0))}
            </div>
            <p className="text-xs text-muted-foreground">Pending payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4h</div>
            <p className="text-xs text-muted-foreground">Target: &lt;24h</p>
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Payments</CardTitle>
          <CardDescription>
            Review payment proofs and approve or reject manual payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading payments...</div>
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <CheckIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">All caught up!</h3>
                <p className="text-muted-foreground">No pending payments to review</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingPayments.map((payment: any) => (
                <div key={payment.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{payment.business?.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {new Date(payment.createdAt).toLocaleDateString()} • {payment.paymentMethod}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{formatAmount(payment.amount)}</p>
                      {getStatusBadge(payment.status)}
                    </div>
                  </div>

                  {payment.referenceNo && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Reference:</span> {payment.referenceNo}
                    </p>
                  )}

                  {payment.notes && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Notes:</span> {payment.notes}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReviewDialog({
                        paymentId: payment.id,
                        businessName: payment.business?.name || 'Unknown',
                        amount: payment.amount,
                        paymentMethod: payment.paymentMethod,
                        proofImageUrl: payment.proofImageUrl,
                        referenceNo: payment.referenceNo,
                        notes: payment.notes,
                      })}
                    >
                      <EyeIcon className="h-4 w-4 mr-2" />
                      Review
                    </Button>
                    
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleApprove(payment.id)}
                      disabled={reviewMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckIcon className="h-4 w-4 mr-2" />
                      Approve
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setReviewDialog({
                        paymentId: payment.id,
                        businessName: payment.business?.name || 'Unknown',
                        amount: payment.amount,
                        paymentMethod: payment.paymentMethod,
                        proofImageUrl: payment.proofImageUrl,
                        referenceNo: payment.referenceNo,
                        notes: payment.notes,
                      })}
                    >
                      <XIcon className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Payment</DialogTitle>
            <DialogDescription>
              {reviewDialog?.businessName} • {reviewDialog && formatAmount(reviewDialog.amount)}
            </DialogDescription>
          </DialogHeader>

          {reviewDialog && (
            <div className="space-y-4">
              {/* Payment Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium">{formatAmount(reviewDialog.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Method</p>
                  <p className="font-medium">{reviewDialog.paymentMethod}</p>
                </div>
                {reviewDialog.referenceNo && (
                  <>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Reference Number</p>
                      <p className="font-medium">{reviewDialog.referenceNo}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Payment Proof */}
              {reviewDialog.proofImageUrl && (
                <div>
                  <p className="text-sm font-medium mb-2">Payment Proof</p>
                  <div className="border rounded-lg p-4">
                    <img
                      src={reviewDialog.proofImageUrl}
                      alt="Payment proof"
                      className="max-w-full h-64 mx-auto object-contain rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              {reviewDialog.notes && (
                <div>
                  <p className="text-sm font-medium mb-2">Customer Notes</p>
                  <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                    {reviewDialog.notes}
                  </p>
                </div>
              )}

              {/* Rejection Reason */}
              <div>
                <label className="text-sm font-medium">Rejection Reason (if rejecting)</label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide reason for rejection..."
                  className="mt-2"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => reviewDialog && handleReject(reviewDialog.paymentId)}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
            <Button
              variant="default"
              onClick={() => reviewDialog && handleApprove(reviewDialog.paymentId)}
              disabled={reviewMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {reviewMutation.isPending ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}