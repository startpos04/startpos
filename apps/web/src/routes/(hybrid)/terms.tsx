/**
 * terms.tsx — /terms
 *
 * StartPOS Terms of Service
 * Version: 2026-08-01
 *
 * Publicly accessible — no auth required.
 * Linked from: registration checkbox, re-acceptance modal, Settings â†’ Account tab.
 */

import { LegalFooter } from '@platform/components/custom/legal-footer'
import { ThemeToggle } from '@platform/components/custom/theme/theme-toggle'
import { APP_NAME } from '@platform/lib/constants'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/(hybrid)/terms')({
  component: TermsPage,
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

function TermsPage() {
  return (
    <div className='min-h-screen bg-background'>
      {/* Header */}
      <header className='border-b bg-card sticky top-0 z-10'>
        <div className='max-w-3xl mx-auto px-4 py-3 flex items-center justify-between'>
          <Link to='/' className='text-base font-bold text-foreground'>
            {APP_NAME}
          </Link>
          <div className='flex items-center gap-3'>
            <Link to='/privacy' className='text-xs text-primary hover:underline underline-offset-4'>
              Privacy Policy
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className='max-w-3xl mx-auto px-4 py-10 space-y-8'>
        {/* Title block */}
        <div className='space-y-2'>
          <h1 className='text-2xl font-bold text-foreground'>Terms of Service</h1>
          <p className='text-sm text-muted-foreground'>Effective date: {EFFECTIVE_DATE} · Version: 2026-08-01</p>
          <p className='text-sm text-muted-foreground'>
            These Terms of Service ("Terms") govern your access to and use of {APP_NAME} ("we", "us", "our"), a cloud-based point-of-sale and business
            management platform. By creating an account or using the service, you agree to be bound by these Terms. If you do not agree, do not use the service.
          </p>
        </div>

        {/* Table of contents */}
        <nav className='rounded-xl border bg-muted/50 p-4 space-y-1'>
          <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2'>Contents</p>
          {[
            ['#eligibility', '1. Eligibility and Account Registration'],
            ['#service', '2. Description of Service'],
            ['#freemium', '3. Free Plan and the 50-Transaction Limit'],
            ['#subscription', '4. Subscriptions and Billing'],
            ['#data-controller', '5. Your Role as Data Controller'],
            ['#bir-retention', '6. BIR Data Retention Requirements'],
            ['#merchant-data', '7. Merchant Data Responsibilities'],
            ['#account-deletion', '8. Account Deletion and Termination'],
            ['#acceptable-use', '9. Acceptable Use'],
            ['#intellectual-property', '10. Intellectual Property'],
            ['#disclaimers', '11. Disclaimers and Limitation of Liability'],
            ['#governing-law', '12. Governing Law'],
            ['#changes', '13. Changes to These Terms'],
            ['#contact', '14. Contact'],
          ].map(([href, label]) => (
            <a key={href} href={href as string} className='block text-xs text-primary hover:underline underline-offset-4 py-0.5'>
              {label}
            </a>
          ))}
        </nav>

        {/* Sections */}
        <Section id='eligibility' title='1. Eligibility and Account Registration'>
          <p>
            {APP_NAME} is intended for use by businesses and their authorized staff in the Philippines. By registering, you represent that you are at least 18
            years old and have the legal authority to enter into these Terms on behalf of your business.
          </p>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us
            immediately at {SUPPORT_EMAIL} if you suspect unauthorized access.
          </p>
          <p>
            You must provide accurate and complete information during registration, including your business name, contact number, and BIR compliance data (TIN,
            PTU number). {APP_NAME} is not responsible for any errors on official receipts caused by inaccurate compliance data you provide.
          </p>
        </Section>

        <Section id='service' title='2. Description of Service'>
          <p>
            {APP_NAME} provides a cloud-based point-of-sale and business management platform including, but not limited to: sales recording, inventory
            management, employee access management, supplier and purchase tracking, operational task management, billing and subscription management, and
            BIR-format official receipt generation.
          </p>
          <p>
            The service is provided on an "as available" basis. We do not guarantee uninterrupted or error-free operation. Scheduled maintenance, force majeure
            events, and third-party service disruptions (including payment processors and email providers) may temporarily affect availability.
          </p>
        </Section>

        <Section id='freemium' title='3. Free Plan and the 50-Transaction Limit'>
          <p>
            New accounts are provisioned with a free trial that includes <strong className='text-foreground'>50 complimentary transactions</strong>. No payment
            method is required to start.
          </p>
          <p>
            Once the 50-transaction limit is reached, the POS checkout function will be blocked. You will not be able to process new sales transactions until
            you upgrade to a paid subscription. All existing data — your products, customers, employees, and transaction history — remains intact and accessible
            after the limit is reached.
          </p>
          <p>
            The 50-transaction limit applies to completed POS sales transactions only. Refunds, voided purchases, and administrative actions do not count toward
            this limit.
          </p>
          <p>
            If you never upgrade, your data is retained subject to the retention policy described in Section 6. You will not lose access to your historical data
            solely because you did not upgrade.
          </p>
        </Section>

        <Section id='subscription' title='4. Subscriptions and Billing'>
          <p>
            Paid subscriptions are available on monthly and annual billing cycles. Subscription fees are charged in Philippine Peso (PHP) and processed through
            our payment provider (Stripe). By subscribing, you authorize us to charge your payment method on the applicable billing cycle.
          </p>
          <p>
            <strong className='text-foreground'>Cancellation:</strong> You may cancel your subscription at any time from the billing settings page. Cancellation
            takes effect at the end of the current billing period. No refunds are issued for partial billing periods.
          </p>
          <p>
            <strong className='text-foreground'>Grace period:</strong> If a payment fails, your account enters a grace period (typically 7 days). During this
            period, the service remains accessible while we attempt to collect payment. If payment is not received by the end of the grace period, checkout
            access may be suspended.
          </p>
          <p>
            <strong className='text-foreground'>Credits:</strong> Prepaid transaction credits are non-refundable unless otherwise required by applicable law.
            Credits are consumed one per completed POS transaction and are not restored upon refund.
          </p>
          <p>
            <strong className='text-foreground'>Plan changes:</strong> Upgrading or downgrading your plan takes effect immediately. Downgrades that reduce
            included transaction limits may restrict checkout access if your current usage exceeds the new plan's allowance.
          </p>
        </Section>

        <Section id='data-controller' title='5. Your Role as Data Controller'>
          <p>Under the Philippine Data Privacy Act of 2012 (RA 10173) and its Implementing Rules and Regulations, the following data roles apply:</p>
          <ul className='list-disc list-inside space-y-1 pl-2'>
            <li>
              <strong className='text-foreground'>{APP_NAME} as Data Controller</strong> — for data we collect about you (the merchant): your account
              information, subscription records, billing history, and platform usage analytics.
            </li>
            <li>
              <strong className='text-foreground'>{APP_NAME} as Data Processor</strong> — for data about your employees and your customers that you enter into
              the platform. We process this data on your behalf and under your instruction.
            </li>
            <li>
              <strong className='text-foreground'>You as Data Controller</strong> — for your employees' personal information and for your customers' personal
              information recorded through the POS. You are responsible for obtaining all necessary consents from your employees and customers before entering
              their data into {APP_NAME}.
            </li>
          </ul>
          <p>
            By accepting these Terms, you acknowledge that you are the Data Controller for your employees' and customers' data and that you accept the
            obligations of a Data Controller under RA 10173 toward those data subjects.
          </p>
          <p>
            We will process your employees' and customers' data only as necessary to provide the service, maintain security, and comply with applicable law. We
            do not sell or share your data with third parties for advertising purposes.
          </p>
        </Section>

        <Section id='bir-retention' title='6. BIR Data Retention Requirements'>
          <p>
            Under BIR Revenue Regulations 17-2013 and related issuances, official receipts and supporting accounting records must be retained for{' '}
            <strong className='text-foreground'>ten (10) years</strong> from the date of the transaction.
          </p>
          <p>
            Transaction records in {APP_NAME} that contain BIR-required data — including official receipt (OR) numbers, TIN information, SC/PWD beneficiary
            names and ID numbers, and transaction amounts — cannot be permanently deleted on request, even if you request account deletion or cancellation.
          </p>
          <p>
            <strong className='text-foreground'>Account deletion means access termination, not data erasure.</strong> When your account is deleted, your login
            access is revoked and your non-financial operational data (products, categories, settings) is scheduled for deletion. Your financial transaction
            records are retained for the legally mandated 10-year period and are accessible to you only upon a formal written request to {SUPPORT_EMAIL}.
          </p>
          <p>
            This retention policy takes precedence over any request to exercise the Right to Erasure under RA 10173. The legal basis for retaining this data is
            compliance with BIR regulations, which constitutes a legitimate legal obligation under RA 10173 Section 12(b).
          </p>
        </Section>

        <Section id='merchant-data' title='7. Merchant Data Responsibilities'>
          <p>You warrant and agree that:</p>
          <ul className='list-disc list-inside space-y-1 pl-2'>
            <li>
              All BIR compliance data you enter (TIN, PTU number, permit-to-operate details) is accurate and up to date. You are solely responsible for the
              accuracy of this data on all generated official receipts.
            </li>
            <li>
              You have obtained all necessary consents from your employees to collect, store, and process their personal information (including names, email
              addresses, contact numbers, and work activity records) in {APP_NAME}.
            </li>
            <li>
              You have obtained all necessary consents from your customers to collect, store, and process their personal information (including names, phone
              numbers, email addresses, and for PWD/SC transactions, their PWD/SC ID numbers) in {APP_NAME}.
            </li>
            <li>
              You will inform your customers about how their data is processed in {APP_NAME}, consistent with your obligations as a Data Controller under RA
              10173.
            </li>
          </ul>
          <p>
            You indemnify {APP_NAME} against any claims, penalties, or liabilities arising from your failure to comply with data protection obligations toward
            your employees and customers.
          </p>
        </Section>

        <Section id='account-deletion' title='8. Account Deletion and Termination'>
          <p>
            <strong className='text-foreground'>Voluntary deletion:</strong> You may request account deletion at any time from Settings â†’ Account â†’ Request
            Deletion, or by emailing {SUPPORT_EMAIL}. Upon receiving your request, we will contact you to confirm and process the deletion within 30 days.
          </p>
          <p>
            <strong className='text-foreground'>What is deleted:</strong> Upon confirmed deletion, we will revoke your login access, delete your user profile
            and business settings, and schedule non-financial operational data (products, categories, units, locations, employees, and operational tasks) for
            permanent deletion within 90 days.
          </p>
          <p>
            <strong className='text-foreground'>What is retained:</strong> Transaction records, official receipt data, payment records, inventory movement
            history, credit ledger entries, and billing invoice records are retained for 10 years as required by BIR regulations. See Section 6.
          </p>
          <p>
            <strong className='text-foreground'>Termination by us:</strong> We may suspend or terminate your account immediately if we determine that you have
            violated these Terms, misused the service, or engaged in fraudulent activity. We will make reasonable efforts to notify you before termination
            except where doing so would be harmful or impractical.
          </p>
        </Section>

        <Section id='acceptable-use' title='9. Acceptable Use'>
          <p>You may not use {APP_NAME} to:</p>
          <ul className='list-disc list-inside space-y-1 pl-2'>
            <li>Process transactions for goods or services that are illegal under Philippine law.</li>
            <li>Record false or fabricated official receipt data with the intent to misrepresent tax obligations to the BIR.</li>
            <li>Enter personal data of individuals without their knowledge or consent.</li>
            <li>Attempt to reverse-engineer, circumvent, or exploit security features of the platform.</li>
            <li>Share account credentials with individuals outside your registered business.</li>
            <li>Automate requests in a manner that places unreasonable load on the platform's infrastructure.</li>
          </ul>
          <p>Violation of these restrictions may result in immediate account suspension and, where applicable, referral to relevant authorities.</p>
        </Section>

        <Section id='intellectual-property' title='10. Intellectual Property'>
          <p>
            {APP_NAME} and all associated software, designs, trademarks, and documentation are owned by or licensed to us. Nothing in these Terms transfers any
            ownership right to you.
          </p>
          <p>
            You retain ownership of all data you enter into {APP_NAME}: your product catalog, customer records, transaction history, and business settings. You
            may export your data at any time using the platform's export features, or by requesting a data extract from {SUPPORT_EMAIL}.
          </p>
        </Section>

        <Section id='disclaimers' title='11. Disclaimers and Limitation of Liability'>
          <p>
            {APP_NAME} is provided "as is" and "as available" without warranties of any kind, express or implied. We do not warrant that the service will be
            error-free, uninterrupted, or suitable for any particular purpose.
          </p>
          <p>
            We are not liable for any direct, indirect, incidental, consequential, or punitive damages arising from your use of or inability to use the service,
            including but not limited to loss of revenue, loss of data, or business interruption.
          </p>
          <p>
            In no event will our aggregate liability to you exceed the total fees paid by you in the three months preceding the event giving rise to the claim,
            or PHP 1,000, whichever is greater.
          </p>
          <p>
            We are not a BIR-certified or BIR-accredited receipting system provider unless explicitly stated. You are responsible for ensuring that your use of{' '}
            {APP_NAME} complies with all applicable BIR requirements for your business.
          </p>
        </Section>

        <Section id='governing-law' title='12. Governing Law'>
          <p>
            These Terms are governed by the laws of the Republic of the Philippines. Any dispute arising from these Terms shall be subject to the exclusive
            jurisdiction of the appropriate courts in the Philippines.
          </p>
        </Section>

        <Section id='changes' title='13. Changes to These Terms'>
          <p>
            We may update these Terms from time to time. When we make material changes — changes to data retention policy, new data categories collected,
            changed merchant obligations, or changed billing terms — we will notify you through the platform by displaying a re-acceptance prompt on your next
            login. Your continued use of the service after accepting the updated Terms constitutes your agreement to the new Terms.
          </p>
          <p>
            The version date in the header of this document identifies the current version. Previous versions are available upon request by emailing{' '}
            {SUPPORT_EMAIL}.
          </p>
        </Section>

        <Section id='contact' title='14. Contact'>
          <p>For questions about these Terms, please contact us at:</p>
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
        </Section>

        {/* Footer */}
        <LegalFooter />
      </main>
    </div>
  )
}
