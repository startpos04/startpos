import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Input } from '@platform/components/ui/input'
import { Label } from '@platform/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/components/ui/select'
import { Separator } from '@platform/components/ui/separator'
import { Switch } from '@platform/components/ui/switch'
import { AlertCircleIcon, CheckCircleIcon, SaveIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { refreshAuthUser, useAuthenticatedUser } from '@/lib/better-auth/auth-store'
import { extractComplianceFromForm, getComplianceErrorMessage, validateComplianceData } from '@/lib/compliance'
import { fetchComplianceData } from '@/lib/server-fn/fetch-compliance-data'
import { saveComplianceData } from '@/lib/server-fn/save-compliance-data'

/**
 * CompliancePage
 *
 * Settings page for managing business registration status and compliance data.
 *
 * Route: /settings?tab=Compliance or /settings/compliance
 *
 * Features:
 * - Registration status selector (UNREGISTERED, PENDING, REGISTERED, EXPIRED)
 * - Tax information form (TIN, RDO, VAT registration)
 * - Business permits form (PTU, DTI/SEC registration)
 * - Branch information form (Serial number, branch code)
 * - Validation logic that blocks REGISTERED status if required fields are missing
 * - Test compliance button to validate without saving
 * - Save draft button (allows partial data)
 * - Save & mark registered button (requires complete data)
 */
export function CompliancePage() {
  const user = useAuthenticatedUser()
  const business = user.business
  const branch = user.branch

  // Form state
  const [registrationStatus, setRegistrationStatus] = useState(business?.registrationStatus ?? 'UNREGISTERED')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [formData, setFormData] = useState({
    // Tax Information
    birTin: '',
    rdoCode: '',
    isVatRegistered: false,
    vatRegistrationDate: '',

    // Business Permits
    ptuNumber: '',
    ptuIssueDate: '',
    dtiSecNumber: '',

    // Branch Information
    branchSerialNumber: '',
    branchCode: '',
    branchPtuNumber: '',
  })

  // Load compliance data on mount
  useEffect(() => {
    const loadData = async () => {
      if (!business?.id || !branch?.id) {
        setIsLoading(false)
        return
      }

      try {
        const result = await fetchComplianceData({
          businessId: business.id,
          branchId: branch.id,
          countryCode: business.countryCode ?? 'PH',
        })

        if (result.success) {
          setRegistrationStatus(result.registrationStatus ?? 'UNREGISTERED')
          setFormData(result.formData as typeof formData)
        } else {
          toast.error('Failed to load compliance data', {
            description: result.error,
          })
        }
      } catch (error) {
        toast.error('Failed to load compliance data', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [business?.id, branch?.id, business?.countryCode])

  const handleFieldChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const validateCompliance = () => {
    // Use compliance adapter validation with extracted form data
    const complianceData = extractComplianceFromForm(formData)
    return validateComplianceData(complianceData, business?.countryCode)
  }

  const handleTest = () => {
    setIsTesting(true)
    const missingFields = validateCompliance()

    if (missingFields.length === 0) {
      toast.success('âœ“ All required fields are complete', {
        description: 'You can now save and mark your business as registered.',
      })
    } else {
      toast.error('Missing required fields', {
        description: getComplianceErrorMessage(missingFields),
      })
    }

    setIsTesting(false)
  }

  const handleSaveDraft = async () => {
    if (!business?.id || !branch?.id) {
      toast.error('Missing business or branch information')
      return
    }

    setIsSaving(true)
    try {
      const result = await saveComplianceData({
        businessId: business.id,
        branchId: branch.id,
        registrationStatus,
        formData,
        countryCode: business.countryCode ?? 'PH',
      })

      if (result.success) {
        toast.success('Draft saved', {
          description: 'Your changes have been saved. Complete when ready.',
        })
      } else {
        toast.error('Failed to save draft', {
          description: result.error,
        })
      }
    } catch (error) {
      toast.error('Failed to save draft', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAndRegister = async () => {
    const missingFields = validateCompliance()

    if (missingFields.length > 0) {
      toast.error('Cannot mark as REGISTERED', {
        description: getComplianceErrorMessage(missingFields),
      })
      return
    }

    if (!business?.id || !branch?.id) {
      toast.error('Missing business or branch information')
      return
    }

    setIsSaving(true)
    try {
      const result = await saveComplianceData({
        businessId: business.id,
        branchId: branch.id,
        registrationStatus: 'REGISTERED',
        formData,
        countryCode: business.countryCode ?? 'PH',
      })

      if (result.success) {
        toast.success('âœ“ Business registration complete!', {
          description: 'Your business is now marked as registered.',
        })
        setRegistrationStatus('REGISTERED')

        // Refresh auth store to update user context
        await refreshAuthUser()
      } else {
        toast.error('Failed to save', {
          description: result.error,
        })
      }
    } catch (error) {
      toast.error('Failed to save', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'REGISTERED') {
      const missingFields = validateCompliance()
      if (missingFields.length > 0) {
        toast.warning('Required fields are missing', {
          description: 'Please complete them before marking as REGISTERED.',
        })
      }
    }
    setRegistrationStatus(newStatus)
  }

  return (
    <div className='px-4 pb-6 space-y-6 max-w-5xl'>
      {/* Loading State */}
      {isLoading ? (
        <div className='flex items-center justify-center py-12'>
          <div className='text-center space-y-2'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto' />
            <p className='text-sm text-muted-foreground'>Loading compliance data...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Page Header */}
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold tracking-tight'>Business Compliance</h1>
            <p className='text-sm text-muted-foreground'>Manage your business registration status and tax compliance information.</p>
          </div>

          {/* Registration Status Control */}
          <Card>
            <CardHeader>
              <CardTitle>Registration Status</CardTitle>
              <CardDescription>Current status of your business registration with the government.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='registration-status'>Status</Label>
                <Select value={registrationStatus} onValueChange={handleStatusChange}>
                  <SelectTrigger id='registration-status'>
                    <SelectValue placeholder='Select status' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='UNREGISTERED'>Unregistered — Not registered with government yet</SelectItem>
                    <SelectItem value='PENDING'>Pending — Registration in progress</SelectItem>
                    <SelectItem value='REGISTERED'>Registered — Fully registered (fill data below)</SelectItem>
                    <SelectItem value='EXPIRED'>Expired — Registration has expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='rounded-md border border-muted bg-muted/50 p-3 text-sm space-y-1'>
                <p className='font-medium'>Status meanings:</p>
                <ul className='list-disc list-inside space-y-0.5 text-muted-foreground'>
                  <li>
                    <span className='font-medium text-foreground'>UNREGISTERED:</span> Not registered with government yet
                  </li>
                  <li>
                    <span className='font-medium text-foreground'>PENDING:</span> Registration in progress
                  </li>
                  <li>
                    <span className='font-medium text-foreground'>REGISTERED:</span> Fully registered (must fill required fields below)
                  </li>
                  <li>
                    <span className='font-medium text-foreground'>EXPIRED:</span> Registration has expired and needs renewal
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Tax Information */}
          <Card>
            <CardHeader>
              <CardTitle>Tax Information</CardTitle>
              <CardDescription>Your business tax identification and registration details (Philippines - BIR).</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='bir-tin'>
                  BIR TIN (Tax Identification Number) <span className='text-destructive'>*</span>
                </Label>
                <Input id='bir-tin' placeholder='000-000-000-000' value={formData.birTin} onChange={e => handleFieldChange('birTin', e.target.value)} />
                <p className='text-xs text-muted-foreground'>Format: XXX-XXX-XXX-XXX</p>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='rdo-code'>RDO Code (Revenue District Office)</Label>
                <Input id='rdo-code' placeholder='000' value={formData.rdoCode} onChange={e => handleFieldChange('rdoCode', e.target.value)} />
              </div>

              <div className='flex items-center justify-between rounded-lg border p-4'>
                <div className='space-y-0.5'>
                  <Label htmlFor='vat-registered'>VAT Registered?</Label>
                  <p className='text-sm text-muted-foreground'>Is your business registered for VAT/GST?</p>
                </div>
                <Switch id='vat-registered' checked={formData.isVatRegistered} onCheckedChange={checked => handleFieldChange('isVatRegistered', checked)} />
              </div>

              {formData.isVatRegistered && (
                <div className='space-y-2'>
                  <Label htmlFor='vat-reg-date'>VAT Registration Date</Label>
                  <Input
                    id='vat-reg-date'
                    type='date'
                    value={formData.vatRegistrationDate}
                    onChange={e => handleFieldChange('vatRegistrationDate', e.target.value)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Business Permits */}
          <Card>
            <CardHeader>
              <CardTitle>Business Permits</CardTitle>
              <CardDescription>Official permits and registration numbers issued by government agencies.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='ptu-number'>PTU Number (Permit to Use) {formData.isVatRegistered && <span className='text-destructive'>*</span>}</Label>
                <Input id='ptu-number' placeholder='PTU-YYYY-NNNNN' value={formData.ptuNumber} onChange={e => handleFieldChange('ptuNumber', e.target.value)} />
                <p className='text-xs text-muted-foreground'>
                  {formData.isVatRegistered ? 'Required for VAT-registered businesses' : 'Optional for non-VAT businesses'}
                </p>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='ptu-issue-date'>PTU Issue Date</Label>
                <Input id='ptu-issue-date' type='date' value={formData.ptuIssueDate} onChange={e => handleFieldChange('ptuIssueDate', e.target.value)} />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='dti-sec'>DTI/SEC Registration Number</Label>
                <Input
                  id='dti-sec'
                  placeholder='Enter DTI or SEC number'
                  value={formData.dtiSecNumber}
                  onChange={e => handleFieldChange('dtiSecNumber', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Branch Information */}
          <Card>
            <CardHeader>
              <CardTitle>Branch Information</CardTitle>
              <CardDescription>Branch-specific registration details for receipt printing.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='branch-sn'>
                  Branch Serial Number <span className='text-destructive'>*</span>
                </Label>
                <Input
                  id='branch-sn'
                  placeholder='SN__________'
                  value={formData.branchSerialNumber}
                  onChange={e => handleFieldChange('branchSerialNumber', e.target.value)}
                />
                <p className='text-xs text-muted-foreground'>BIR-issued serial number for this branch</p>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='branch-code'>Branch Code</Label>
                <Input id='branch-code' placeholder='00001' value={formData.branchCode} onChange={e => handleFieldChange('branchCode', e.target.value)} />
                <p className='text-xs text-muted-foreground'>The suffix code for the TIN (e.g., "00001")</p>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='branch-ptu'>Branch PTU (if different from main)</Label>
                <Input
                  id='branch-ptu'
                  placeholder='PTU-YYYY-NNNNN'
                  value={formData.branchPtuNumber}
                  onChange={e => handleFieldChange('branchPtuNumber', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Help Section */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <AlertCircleIcon className='h-5 w-5 text-primary' />
                Need help?
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              <div className='space-y-1 text-sm'>
                <a href='https://www.dti.gov.ph/' target='_blank' rel='noopener noreferrer' className='text-primary hover:underline block'>
                  â†’ DTI Registration Guide
                </a>
                <a href='https://www.bir.gov.ph/' target='_blank' rel='noopener noreferrer' className='text-primary hover:underline block'>
                  â†’ How to get a BIR TIN
                </a>
                <a href='https://www.bir.gov.ph/' target='_blank' rel='noopener noreferrer' className='text-primary hover:underline block'>
                  â†’ How to apply for Permit to Use (PTU)
                </a>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Action Buttons */}
          <div className='flex flex-col sm:flex-row gap-3'>
            <Button variant='outline' onClick={handleTest} disabled={isTesting || isSaving}>
              <CheckCircleIcon className='h-4 w-4' />
              Test Compliance
            </Button>

            <Button variant='outline' onClick={handleSaveDraft} disabled={isSaving || isTesting}>
              <SaveIcon className='h-4 w-4' />
              Save Draft
            </Button>

            <Button onClick={handleSaveAndRegister} disabled={isSaving || isTesting || registrationStatus !== 'REGISTERED'}>
              <SaveIcon className='h-4 w-4' />
              Save & Mark Registered
            </Button>
          </div>

          <div className='text-xs text-muted-foreground'>
            <p>* Required fields are marked with an asterisk</p>
            <p className='mt-1'>Required fields vary by country and VAT registration status</p>
          </div>
        </>
      )}
    </div>
  )
}
