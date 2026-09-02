/**
 * privacy.tsx â€” /privacy
 *
 * StartPOS Privacy Policy
 * Version: 2026-08-01
 *
 * Publicly accessible â€” no auth required.
 * Linked from: registration checkbox, re-acceptance modal, Settings â†’ Account tab.
 */

import { LegalFooter } from '@platform/components/custom/legal-footer'
import { ThemeToggle } from '@platform/components/custom/theme/theme-toggle'
import { APP_NAME } from '@platform/lib/constants'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/(hybrid)/privacy')({
  component: PrivacyPage,
})

const EFFECTIVE_DATE = 'August 1, 2026'
const SUPPORT_EMAIL = 'support@start-pos.app'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className='space-y-3'>
      <h2 className='text-lg font-semibold text-foreground border-b pb-1'>{title}</h2>
      <div className='space-y-3 text-sm text-muted-foreground leading-relaxed'>{children}</div>
    </section>
  )
}

function PrivacyPage() {
  return (
    <div className='min-h-screen bg-background'>
      {/* Header */}
      <header className='border-b bg-card sticky top-0 z-10'>
        <div className='max-w-3xl mx-auto px-4 py-3 flex items-center justify-between'>
          <Link to='/' className='text-base font-bold text-foreground'>
            {APP_NAME}
          </Link>
          <div className='flex items-center gap-3'>
            <Link to='/terms' className='text-xs text-primary hover:underline underline-offset-4'>
              Terms of Service
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className='max-w-3xl mx-auto px-4 py-10 space-y-8'>
        {/* Title block */}
        <div className='space-y-2'>
          <h1 className='text-2xl font-bold text-foreground'>Privacy Policy</h1>
          <p className='text-sm text-muted-foreground'>Effective date: {EFFECTIVE_DATE} Â· Version: 2026-08-01</p>
          <p className='text-sm text-muted-foreground'>
            This Privacy Policy explains how {APP_NAME} ("we", "us", "our") collects, uses, stores, and protects personal information in connection with our
            point-of-sale and business management platform. We are committed to compliance with the Philippine Data Privacy Act of 2012 (RA 10173) and its
            Implementing Rules and Regulations.
          </p>
        </div>

        {/* Table of contents */}
        <nav className='rounded-xl border bg-muted/50 p-4 space-y-1'>
          <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2'>Contents</p>
          {[
            ['#dual-role', '1. Our Dual Data Role'],
            ['#data-we-collect', '2. Personal Information We Collect'],
            ['#sensitive-data', '3. Sensitive Personal Information'],
            ['#how-we-use', '4. How We Use Personal Information'],
            ['#data-processor', '5. Our Role as Data Processor'],
            ['#sharing', '6. Sharing and Disclosure'],
            ['#retention', '7. Retention Periods'],
            ['#security', '8. Security Measures'],
            ['#rights', '9. Your Rights as a Data Subject'],
            ['#merchant-customers', '10. A Note for Merchant Customers'],
            ['#cookies', '11. Cookies and Local Storage'],
            ['#changes', '12. Changes to This Policy'],
            ['#contact', '13. Contact and Data Protection'],
          ].map(([href, label]) => (
            <a key={href} href={href as string} className='block text-xs text-primary hover:underline underline-offset-4 py-0.5'>
              {label}
            </a>
          ))}
        </nav>

        {/* Sections */}
        <Section id='dual-role' title='1. Our Dual Data Role'>
          <p>{APP_NAME} operates in two distinct data roles under RA 10173:</p>
          <ul className='list-disc list-inside space-y-2 pl-2'>
            <li>
              <strong className='text-foreground'>Data Controller</strong> â€” for personal information we collect directly about merchants (business owners and
              their staff who register and use {APP_NAME}). We determine the purposes and means of processing this data.
            </li>
            <li>
              <strong className='text-foreground'>Data Processor</strong> â€” for personal information that merchants enter about their own customers and
              employees. We process this data on the merchant's behalf, under the merchant's instruction, and the merchant is the Data Controller for that data.
            </li>
          </ul>
          <p>
            This distinction is important. If you are a customer of a business using {APP_NAME}, your rights regarding that data should be directed to the
            merchant, not to {APP_NAME}. See Section 10.
          </p>
        </Section>

        <Section id='data-we-collect' title='2. Personal Information We Collect'>
          <p>We collect the following categories of personal information when you use {APP_NAME}:</p>

          <div className='space-y-4'>
            {/* Account data */}
            <div className='rounded-lg border bg-card p-3 space-y-1.5'>
              <p className='text-xs font-semibold uppercase tracking-wide text-foreground'>Account and Identity Data</p>
              <ul className='list-disc list-inside space-y-0.5 text-xs pl-1'>
                <li>Full name and email address (required for account creation)</li>
                <li>Contact number (provided at registration)</li>
                <li>Profile image (optional, uploaded by user)</li>
                <li>Account role (ADMIN, SUPERVISOR, CASHIER, SERVICE_PROVIDER)</li>
              </ul>
              <p className='text-xs italic'>Legal basis: Performance of contract (providing the service).</p>
            </div>

            {/* Business and compliance data */}
            <div className='rounded-lg border bg-card p-3 space-y-1.5'>
              <p className='text-xs font-semibold uppercase tracking-wide text-foreground'>Business and BIR Compliance Data</p>
              <ul className='list-disc list-inside space-y-0.5 text-xs pl-1'>
                <li>Business name, branch name, business address</li>
                <li>BIR Taxpayer Identification Number (TIN)</li>
                <li>BIR Permit to Operate (PTU) number and issuance date</li>
                <li>Value-added tax (VAT) registration status and rate</li>
              </ul>
              <p className='text-xs italic'>Legal basis: Compliance with legal obligation (BIR requirements for official receipt generation).</p>
            </div>

            {/* Transaction data */}
            <div className='rounded-lg border bg-card p-3 space-y-1.5'>
              <p className='text-xs font-semibold uppercase tracking-wide text-foreground'>Transaction and Financial Data</p>
              <ul className='list-disc list-inside space-y-0.5 text-xs pl-1'>
                <li>Official receipt numbers (OR numbers) and sales amounts</li>
                <li>Payment method and reference numbers (no card numbers stored)</li>
                <li>Subscription and billing invoice records</li>
                <li>Credit ledger entries (transaction credit consumption and top-ups)</li>
                <li>Cashier ID linked to each transaction (for audit trail)</li>
              </ul>
              <p className='text-xs italic'>Legal basis: Compliance with legal obligation (BIR 10-year retention) and performance of contract.</p>
            </div>

            {/* Session and device data */}
            <div className='rounded-lg border bg-card p-3 space-y-1.5'>
              <p className='text-xs font-semibold uppercase tracking-wide text-foreground'>Session and Device Data</p>
              <ul className='list-disc list-inside space-y-0.5 text-xs pl-1'>
                <li>IP address at login</li>
                <li>Browser user agent string (device/browser type)</li>
                <li>Session creation and expiry timestamps</li>
              </ul>
              <p className='text-xs italic'>Legal basis: Legitimate interest (security monitoring, account protection).</p>
            </div>

            {/* Legal consent data */}
            <div className='rounded-lg border bg-card p-3 space-y-1.5'>
              <p className='text-xs font-semibold uppercase tracking-wide text-foreground'>Legal Consent Records</p>
              <ul className='list-disc list-inside space-y-0.5 text-xs pl-1'>
                <li>Timestamp of Terms of Service acceptance</li>
                <li>Version of Terms of Service accepted</li>
                <li>Timestamp of Privacy Policy acceptance</li>
                <li>Version of Privacy Policy accepted</li>
              </ul>
              <p className='text-xs italic'>Legal basis: Legal obligation (RA 10173 consent documentation requirement).</p>
            </div>
          </div>
        </Section>

        <Section id='sensitive-data' title='3. Sensitive Personal Information'>
          <p>
            RA 10173 classifies certain categories of information as sensitive personal information, which requires a higher standard of protection. The
            following sensitive data may be present in {APP_NAME}:
          </p>

          <div className='rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2'>
            <p className='text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300'>SC/PWD Beneficiary Information</p>
            <p className='text-xs text-amber-800 dark:text-amber-400 leading-relaxed'>
              When a merchant processes a Senior Citizen (SC) or Person with Disability (PWD) discounted transaction, Philippine law (BIR RR 11-2014) requires
              that the beneficiary's name and PWD/SC ID number be recorded on the official receipt. {APP_NAME} stores this information in the transaction's
              compliance data field (<code className='bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs'>complianceData</code>) as part of the official
              receipt record.
            </p>
            <ul className='list-disc list-inside space-y-0.5 text-xs text-amber-800 dark:text-amber-400 pl-1'>
              <li>This data constitutes health-related PII under RA 10173.</li>
              <li>It is recorded because BIR regulations mandate it, not for any other purpose.</li>
              <li>It is retained for 10 years as part of the official receipt record and cannot be deleted on request (see Section 7).</li>
              <li>It is not shared with any third party except as required by law or a valid court order.</li>
              <li>Access is restricted to authorized users of the merchant's account and to {APP_NAME} system administrators.</li>
            </ul>
          </div>

          <div className='rounded-lg border bg-card p-3 space-y-1.5 mt-2'>
            <p className='text-xs font-semibold uppercase tracking-wide text-foreground'>Buyer TIN and Address</p>
            <p className='text-xs'>
              For corporate or VAT-registered buyer transactions above PHP 1,000, the buyer's TIN and registered address may be recorded on the official receipt
              as required by BIR. This constitutes fiscal personal data and is subject to the same retention and access controls as other BIR-required data.
            </p>
          </div>
        </Section>

        <Section id='how-we-use' title='4. How We Use Personal Information'>
          <p>We use the personal information we collect for the following purposes:</p>
          <ul className='list-disc list-inside space-y-1 pl-2'>
            <li>To create, authenticate, and manage your user account and session.</li>
            <li>To provide the POS, inventory, employee management, and billing features of the service.</li>
            <li>To generate BIR-format official receipts using the compliance data you provide.</li>
            <li>To send transactional emails â€” email verification codes, billing notifications, and support responses â€” via Resend.</li>
            <li>To process subscription payments via Stripe (we do not store card data; Stripe handles all card processing).</li>
            <li>To detect and prevent unauthorized access, fraud, and security threats.</li>
            <li>To comply with BIR, NPC, and other applicable regulatory requirements.</li>
            <li>To analyze anonymized platform usage patterns to improve the service.</li>
          </ul>
          <p>We do not use your personal information for advertising, profiling unrelated to service delivery, or to sell to third parties.</p>
        </Section>

        <Section id='data-processor' title='5. Our Role as Data Processor'>
          <p>
            When merchants use {APP_NAME} to manage their employees and customers, they are the Data Controller for that data and {APP_NAME} is the Data
            Processor. As a Processor, we:
          </p>
          <ul className='list-disc list-inside space-y-1 pl-2'>
            <li>Process employee and customer data only as directed by the merchant and as necessary to provide the service.</li>
            <li>Do not use employee or customer data for purposes beyond the service without the merchant's instruction.</li>
            <li>Implement appropriate technical and organizational security measures to protect the data.</li>
            <li>Notify merchants of any personal data breach affecting their employees' or customers' data as soon as practicable upon discovery.</li>
            <li>
              Delete or return employee and customer data upon termination of the merchant's account, subject to the mandatory BIR retention periods described
              in Section 7.
            </li>
          </ul>
          <p>
            This constitutes our Data Processing Agreement (DPA) with merchants, as required by Section 16 of the IRR of RA 10173. By accepting these Terms,
            merchants acknowledge and agree to this DPA.
          </p>
        </Section>

        <Section id='sharing' title='6. Sharing and Disclosure'>
          <p>We share personal information only in the following circumstances:</p>

          <div className='space-y-3'>
            <div>
              <p className='text-xs font-semibold text-foreground'>Service Providers (Sub-processors)</p>
              <p>We engage the following third-party service providers who may process personal data on our behalf:</p>
              <ul className='list-disc list-inside space-y-0.5 pl-2 text-xs'>
                <li>
                  <strong>Stripe</strong> â€” payment processing. Handles card data; we receive only payment reference numbers. Stripe Privacy Policy:
                  stripe.com/privacy
                </li>
                <li>
                  <strong>Resend</strong> â€” transactional email delivery. Processes email addresses to deliver verification codes and billing notifications.
                  Resend Privacy Policy: resend.com/legal/privacy-policy
                </li>
                <li>
                  <strong>Hosting provider</strong> â€” cloud infrastructure and database hosting. Stores all platform data within their data centers.
                </li>
              </ul>
              <p className='text-xs mt-1'>
                All sub-processors are contractually bound to process data only as directed and to maintain appropriate security standards.
              </p>
            </div>

            <div>
              <p className='text-xs font-semibold text-foreground'>Legal Requirements</p>
              <p>
                We may disclose personal information if required by law, court order, or regulatory authority, including the BIR, the National Privacy
                Commission (NPC), or other Philippine government agencies with lawful jurisdiction.
              </p>
            </div>

            <div>
              <p className='text-xs font-semibold text-foreground'>Business Transfer</p>
              <p>
                In the event of a merger, acquisition, or sale of substantially all of our assets, personal data held by us may be transferred to the acquiring
                entity, subject to equivalent privacy protections.
              </p>
            </div>
          </div>
        </Section>

        <Section id='retention' title='7. Retention Periods'>
          <p>We retain personal information for the following periods:</p>

          <div className='overflow-x-auto'>
            <table className='w-full text-xs border-collapse'>
              <thead>
                <tr className='bg-muted/50'>
                  <th className='text-left border p-2 font-semibold text-foreground'>Data Category</th>
                  <th className='text-left border p-2 font-semibold text-foreground'>Retention Period</th>
                  <th className='text-left border p-2 font-semibold text-foreground'>Legal Basis</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Transaction records (OR numbers, amounts, cashier ID)', '10 years from transaction date', 'BIR Revenue Regulations 17-2013'],
                  ['SC/PWD compliance data in transaction records', '10 years from transaction date', 'BIR RR 17-2013; RA 10173 Â§12(b)'],
                  ['Buyer TIN / address on official receipts', '10 years from transaction date', 'BIR Revenue Regulations 17-2013'],
                  ['Billing invoices and credit ledger', '7 years from invoice date', 'Standard accounting records requirement'],
                  ['Account and profile data', 'Duration of account + 90 days after deletion', 'Performance of contract'],
                  ['Session data (IP, user agent)', '90 days from session expiry', 'Legitimate interest (security)'],
                  ['Legal consent records (ToS/Privacy acceptance)', 'Duration of account + 7 years', 'Legal obligation (RA 10173 documentation)'],
                  ['Non-financial operational data (products, categories, settings)', '90 days after account deletion', 'Performance of contract'],
                  ['Employee work history records (inventory movements, tasks)', '3 years from record creation', 'Legitimate interest (dispute resolution)'],
                ].map(([category, period, basis]) => (
                  <tr key={category} className='border-b'>
                    <td className='border p-2 align-top'>{category}</td>
                    <td className='border p-2 align-top font-medium text-foreground'>{period}</td>
                    <td className='border p-2 align-top italic'>{basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p>
            After the applicable retention period, data is permanently deleted from our systems unless we are under a legal hold or ongoing regulatory
            investigation that requires extended retention.
          </p>
        </Section>

        <Section id='security' title='8. Security Measures'>
          <p>We implement the following technical and organizational security measures:</p>
          <ul className='list-disc list-inside space-y-1 pl-2'>
            <li>All passwords are hashed using bcrypt â€” we never store plaintext passwords.</li>
            <li>Email verification is required at registration via a 6-digit OTP with a 10-minute expiry.</li>
            <li>All data in transit is encrypted using TLS/HTTPS.</li>
            <li>Authentication sessions have defined expiry periods and are enforced by our session management system.</li>
            <li>Rate limiting and account lockout are enforced on authentication endpoints to prevent brute-force attacks.</li>
            <li>Administrative access to production systems is restricted and logged.</li>
            <li>Role-based access control (RBAC) limits what each staff member can see and do within the platform.</li>
            <li>All destructive and privilege-elevating actions are recorded in an immutable audit log.</li>
            <li>Payment card data is never stored â€” all card processing is handled exclusively by Stripe.</li>
          </ul>
          <p>
            No security measure is completely infallible. In the event of a personal data breach that is likely to result in a risk to your rights and freedoms,
            we will notify the National Privacy Commission (NPC) within 72 hours of discovery and notify affected users without undue delay, as required by RA
            10173.
          </p>
        </Section>

        <Section id='rights' title='9. Your Rights as a Data Subject'>
          <p>Under RA 10173, you have the following rights regarding your personal information:</p>

          <div className='space-y-2'>
            {[
              [
                'Right to be Informed',
                'You have the right to know what personal information we collect, how we use it, and with whom we share it. This Privacy Policy is our primary disclosure.',
              ],
              ['Right to Access', `You may request a copy of the personal information we hold about you by emailing ${SUPPORT_EMAIL}.`],
              [
                'Right to Rectification',
                'You may correct inaccurate personal information by updating your account profile. For data that cannot be self-corrected, contact ' +
                  SUPPORT_EMAIL +
                  '.',
              ],
              [
                'Right to Erasure',
                'You may request deletion of your personal information. This right is subject to our legal obligation to retain BIR-required transaction records for 10 years (see Section 7). Requests that conflict with this obligation will be partially fulfilled â€” we will delete what we can and explain what we cannot delete and why.',
              ],
              [
                'Right to Restrict Processing',
                'You may request that we restrict processing of your personal information in certain circumstances, such as while a dispute about the accuracy of the data is being resolved.',
              ],
              [
                'Right to Data Portability',
                "You may request a copy of your business data in a machine-readable format (CSV). The platform's Export features provide self-service access to transaction and inventory data.",
              ],
              [
                'Right to Object',
                'You may object to processing based on legitimate interest. We will cease such processing unless we can demonstrate compelling legitimate grounds that override your interests.',
              ],
              [
                'Right to Damages',
                'If you have suffered harm due to a violation of RA 10173, you may seek compensation through the NPC or through the courts.',
              ],
            ].map(([title, description]) => (
              <div key={title as string} className='rounded border p-2.5'>
                <p className='text-xs font-semibold text-foreground'>{title}</p>
                <p className='text-xs mt-0.5'>{description}</p>
              </div>
            ))}
          </div>

          <p>
            To exercise any of these rights, contact us at{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className='text-primary hover:underline underline-offset-4'>
              {SUPPORT_EMAIL}
            </a>
            . We will respond within 15 business days as required by RA 10173.
          </p>
        </Section>

        <Section id='merchant-customers' title='10. A Note for Merchant Customers'>
          <p>
            If you are a customer of a business using {APP_NAME} â€” for example, if a store recorded your name, phone number, or PWD/SC information during a
            transaction â€” your data was entered by that merchant, not by {APP_NAME} directly.
          </p>
          <p>
            The merchant is the Data Controller for your data. Your data subject rights under RA 10173 regarding that information (access, correction, deletion)
            should be directed to the merchant.
          </p>
          <p>
            {APP_NAME} processes your data only as a Data Processor on behalf of the merchant, consistent with our role described in Section 1. We cannot modify
            or delete transaction records that contain BIR-required information (such as SC/PWD ID numbers on official receipts) even upon request, because this
            data is part of a legally mandated accounting record.
          </p>
        </Section>

        <Section id='cookies' title='11. Cookies and Local Storage'>
          <p>{APP_NAME} uses only the following storage mechanisms:</p>
          <ul className='list-disc list-inside space-y-1 pl-2'>
            <li>
              <strong className='text-foreground'>Session cookies</strong> â€” strictly necessary for authentication. These cookies contain only a session token
              used to identify your authenticated session. They are deleted when you sign out or when the session expires. No consent banner is required for
              strictly necessary cookies under applicable guidelines.
            </li>
            <li>
              <strong className='text-foreground'>LocalStorage</strong> â€” used to store offline-capable data for the local-first POS functionality (product
              catalog, inventory, transaction queue) and user interface state (e.g., whether you have dismissed the welcome modal). This data does not leave
              your device except through the normal sync process.
            </li>
          </ul>
          <p>We do not use advertising cookies, third-party tracking cookies, or analytics cookies.</p>
        </Section>

        <Section id='changes' title='12. Changes to This Policy'>
          <p>
            We may update this Privacy Policy from time to time. When we make material changes â€” changes that affect your rights, add new data categories, or
            change how we share data â€” we will display a re-acceptance prompt on your next login to ensure you are informed and have consented to the updated
            policy.
          </p>
          <p>
            The version date in the header of this document identifies the current version. Previous versions are available upon request by emailing{' '}
            {SUPPORT_EMAIL}.
          </p>
        </Section>

        <Section id='contact' title='13. Contact and Data Protection'>
          <p>For privacy-related inquiries, data subject requests, or to report a concern:</p>
          <div className='rounded-lg border bg-muted/50 p-3 text-sm text-foreground space-y-0.5'>
            <p className='font-semibold'>{APP_NAME}</p>
            <p>
              Email:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className='text-primary hover:underline underline-offset-4'>
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p>Philippines</p>
          </div>
          <p>
            You also have the right to lodge a complaint with the{' '}
            <a href='https://www.privacy.gov.ph' target='_blank' rel='noopener noreferrer' className='text-primary hover:underline underline-offset-4'>
              National Privacy Commission (NPC)
            </a>{' '}
            if you believe your data protection rights have been violated.
          </p>
        </Section>

        {/* Footer */}
        <LegalFooter />
      </main>
    </div>
  )
}
