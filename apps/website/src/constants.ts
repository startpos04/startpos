// ---------------------------------------------------------------------------
// Site-wide constants — edit these to configure the website
// ---------------------------------------------------------------------------

/** The URL to the hosted application (trial signup destination) */
export const APP_URL = 'https://start-pos-two.vercel.app'

/** Formspree endpoint for the contact form */
export const FORMSPREE_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID'

/** Annual billing discount as a percentage (e.g. 20 = 20% off) */
export const ANNUAL_DISCOUNT_PCT = 20

/** Base path */
export const BASE_PATH = ''

// ---------------------------------------------------------------------------
// Plan data
// ---------------------------------------------------------------------------

export interface Plan {
  name: string
  price: number | null   // monthly price in PHP; null = contact
  annualPrice: number | null // annual total in PHP; null = contact
  txPerMonth: number | null  // null = unlimited
  branches: number | null    // null = unlimited
  employees: number | null   // null = unlimited
  tagline: string
  highlighted: boolean
  badge?: string
  features: string[]
  cta: string
  ctaUrl: string
}

export const PLANS: Plan[] = [
  {
    name: 'Trial',
    price: 0,
    annualPrice: 0,
    txPerMonth: 500,
    branches: 1,
    employees: 1,
    tagline: 'Try everything free. Ends after 1 month or 500 transactions — whichever comes first.',
    highlighted: false,
    features: [
      '1 month or 500 transactions — whichever comes first',
      '1 branch',
      '1 employee account',
      'POS checkout & payments',
      'Product catalogue & variants',
      'Customer directory',
      'Receipt printing',
    ],
    cta: 'Start free trial',
    ctaUrl: APP_URL,
  },
  {
    name: 'Basic',
    price: 299,
    annualPrice: 2870,
    txPerMonth: 1000,
    branches: 1,
    employees: 1,
    tagline: 'Everything a solo operator needs to run a single location.',
    highlighted: false,
    features: [
      '1,000 transactions / month',
      '1 branch',
      '1 employee account',
      'POS checkout, payments & refunds',
      'Customer orders & kitchen workflow',
      'Product catalogue & variants',
      'Customer directory',
      'Full transaction & order history',
      'Receipt printing & download',
    ],
    cta: 'Get started',
    ctaUrl: APP_URL,
  },
  {
    name: 'Premium',
    price: 799,
    annualPrice: 7670,
    txPerMonth: 5000,
    branches: 3,
    employees: null,
    tagline: 'For growing teams that need inventory control.',
    highlighted: true,
    badge: 'Most popular',
    features: [
      'Everything in Basic',
      '5,000 transactions / month',
      'Up to 3 branches',
      'Unlimited employees',
      'Inventory adjustments & transfers',
      'Vendor cash sessions & reconciliation',
      'Sales & inventory reports',
      'CSV data export',
    ],
    cta: 'Get started',
    ctaUrl: APP_URL,
  },
  {
    name: 'Enterprise',
    price: 1999,
    annualPrice: 19190,
    txPerMonth: 10000,
    branches: 5,
    employees: null,
    tagline: 'For multi-location operations running at scale.',
    highlighted: false,
    features: [
      'Everything in Premium',
      '10,000 transactions / month',
      'Up to 5 branches',
      'Unlimited employees',
      'Supplier records & management',
      'Purchase orders & stock receiving',
      'Restocking tasks & approvals',
      'Priority support',
    ],
    cta: 'Get started',
    ctaUrl: APP_URL,
  },
  {
    name: 'Perpetual License',
    price: null,
    annualPrice: null,
    txPerMonth: null,
    branches: null,
    employees: null,
    tagline: 'Own your license forever. One-time fee, no recurring subscription.',
    highlighted: false,
    badge: 'Enterprise',
    features: [
      'Unlimited transactions',
      'Unlimited branches',
      'Unlimited employees',
      'All current V1 features included',
      'Self-hosted deployment option',
      'Dedicated onboarding',
      'Priority support SLA',
      'Perpetual usage rights',
    ],
    cta: 'Contact us for a quote',
    ctaUrl: 'contact',
  },
]

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

export interface Addon {
  name: string
  price: string
  description: string
}

export const ADDONS: Addon[] = [
  {
    name: 'Analytics Dashboard',
    price: '₱299 / mo',
    description: 'Advanced charts, trend analysis, and custom date ranges.',
  },
  {
    name: 'API Access',
    price: '₱499 / mo',
    description: 'Full REST API access for integrations and custom builds.',
  },
  {
    name: 'Extra Branch',
    price: '₱199 / mo',
    description: 'Add an additional branch beyond your plan limit.',
  },
  {
    name: 'Extra Employee',
    price: '₱49 / mo',
    description: 'Add an extra employee account (Basic plan only).',
  },
  {
    name: '+500 TX Top-up',
    price: '₱99 one-time',
    description: 'Add 500 transactions to your monthly allowance.',
  },
  {
    name: '+1,000 TX Top-up',
    price: '₱179 one-time',
    description: 'Add 1,000 transactions to your monthly allowance.',
  },
  {
    name: '+5,000 TX Top-up',
    price: '₱799 one-time',
    description: 'Add 5,000 transactions to your monthly allowance.',
  },
]

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export interface FAQ {
  question: string
  answer: string
}

export const FAQS: FAQ[] = [
  {
    question: 'What counts as a transaction?',
    answer:
      'A transaction is any completed sale — whether cash, card, or e-wallet. Refunds do not count. Voided orders and test sales in development mode are also excluded.',
  },
  {
    question: 'Why does the trial have a 500-transaction limit?',
    answer:
      '500 transactions is enough to fully evaluate Start POS in a real business environment — most businesses take weeks to reach that volume. The limit creates a natural conversion point: when you\'ve processed enough real sales to know the system works for you, it\'s the right time to choose a plan. Your data is always preserved when you upgrade.',
  },
  {
    question: 'Can I switch plans at any time?',
    answer:
      'Yes. You can upgrade or downgrade your plan at any time. Upgrades take effect immediately; downgrades take effect at the start of your next billing cycle.',
  },
  {
    question: 'What happens at the end of the trial?',
    answer:
      'Your trial ends after 1 month or 500 completed transactions — whichever comes first. When it ends, your account enters a 7-day grace period where you can still access your data and reports, but new transactions are paused until you subscribe to a plan. No data is deleted.',
  },
  {
    question: 'Is there a refund policy?',
    answer:
      'We offer a pro-rated refund within the first 14 days of any paid plan. After 14 days, the current billing period is non-refundable. Contact us to request a refund.',
  },
  {
    question: 'What is the Perpetual License?',
    answer:
      'The Perpetual License is a one-time payment that gives you a permanent license to use Start POS without monthly fees. It includes all current V1 features and optional self-hosted deployment. Pricing is quoted based on your specific requirements.',
  },
  {
    question: 'Does Start POS work offline?',
    answer:
      'Yes. Start POS uses a local-first architecture — all data is stored on the device first and synced to the cloud when connectivity is available. Checkout never stops during a network outage.',
  },
  {
    question: 'Is Start POS BIR-compliant?',
    answer:
      'Yes. Start POS supports BIR PTU registration, invoice numbering, VAT computation (inclusive and exclusive), and compliance registry management for Philippines tax requirements.',
  },
]

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export const NAV_LINKS = [
  { label: 'Product', href: 'product-intro' },
  { label: 'Features', href: 'features' },
  { label: 'Pricing', href: 'pricing' },
  { label: 'Use Cases', href: '#', children: [
    { label: 'Retail', href: 'use-cases/retail' },
    { label: 'Restaurant', href: 'use-cases/restaurant' },
    { label: 'Grocery', href: 'use-cases/grocery' },
  ]},
  { label: 'About', href: 'about' },
]
