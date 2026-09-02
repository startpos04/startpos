/**
 * capability-guide.ts
 *
 * Centralized documentation for all business capabilities.
 * Contains user-facing information about benefits, usage steps, and guides.
 *
 * This is the single source of truth for capability help content shown in the UI.
 */

interface CapabilityStep {
  title: string
  description: string
}

interface CapabilityGuide {
  benefits: string[]
  steps: CapabilityStep[]
}

/**
 * Capability guides mapped by capability ID.
 * Each guide includes:
 * - benefits: What the user gets when they enable this capability
 * - steps: How to use the capability once enabled
 */
export const CAPABILITY_GUIDES: Record<string, CapabilityGuide> = {
  // ── Sales & Checkout ────────────────────────────────────────────────────
  COMPLETE_CHECKOUT: {
    benefits: [
      'Process sales transactions at your point of sale',
      'Accept multiple payment methods (cash, card, e-wallet)',
      'Automatic receipt generation for every transaction',
    ],
    steps: [
      { title: 'Ready to Use', description: 'This capability is already enabled and ready to use at your POS.' },
      { title: 'Process Sales', description: 'Go to the POS screen, add items, and complete the checkout.' },
      { title: 'View History', description: 'Review all transactions in the Transaction History page.' },
    ],
  },

  RECORD_PAYMENT: {
    benefits: [
      'Split payments across multiple methods (cash + card)',
      'Track payment breakdowns for each transaction',
      'Reconcile cash and card payments at end of day',
    ],
    steps: [
      { title: 'Already Active', description: 'Payment recording is enabled automatically with checkout.' },
      { title: 'Split Payments', description: 'At checkout, add multiple payment methods to split the total.' },
      { title: 'Review Splits', description: 'View payment breakdowns in transaction details.' },
    ],
  },

  ISSUE_REFUND: {
    benefits: [
      'Process returns and refunds for prior transactions',
      'Maintain accurate sales and inventory records',
      'Build customer trust with hassle-free returns',
    ],
    steps: [
      { title: 'Find Transaction', description: 'Go to Transaction History and locate the transaction to refund.' },
      { title: 'Issue Refund', description: 'Click Refund, select items and refund method, then confirm.' },
      { title: 'Print Receipt', description: 'Provide the customer with a refund receipt.' },
    ],
  },

  // ── Orders ──────────────────────────────────────────────────────────────
  CREATE_ORDER: {
    benefits: [
      'Take orders before collecting payment (tab system)',
      'Perfect for restaurants, cafes, and service businesses',
      'Track orders separately from completed transactions',
    ],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to activate order queue functionality.' },
      { title: 'Create Orders', description: 'At POS, use "Create Order" to start a tab for customers.' },
      { title: 'Complete Later', description: 'When ready, find the order and process payment to close it.' },
    ],
  },

  VIEW_ORDER_HISTORY: {
    benefits: ['Browse all orders created at your business', 'Search and filter by date, customer, or status', 'Track pending orders waiting for payment'],
    steps: [
      { title: 'Access Orders', description: 'Navigate to Order History from the main menu.' },
      { title: 'View Details', description: 'Click any order to see items, timing, and customer info.' },
      { title: 'Complete Orders', description: 'Process payment for pending orders directly from the list.' },
    ],
  },

  // ── Products & Inventory ────────────────────────────────────────────────
  MANAGE_PRODUCTS: {
    benefits: ['Build and organize your product catalogue', 'Set prices, SKUs, and product variants', 'Track which products are selling best'],
    steps: [
      { title: 'Add Products', description: 'Go to Products and click Add Product to create your first item.' },
      { title: 'Organize', description: 'Create categories and units to keep your catalogue organized.' },
      { title: 'Sell', description: 'Products appear automatically in your POS for quick checkout.' },
    ],
  },

  MANAGE_INVENTORY: {
    benefits: ['Track stock levels in real-time across locations', 'Get low-stock alerts before you run out', 'See stock movement history and adjustments'],
    steps: [
      { title: 'Enable Tracking', description: 'Click Enable below, then go to Products to set initial stock levels.' },
      { title: 'Add Stock', description: 'Use stock adjustments or purchase orders to add inventory.' },
      { title: 'Monitor Levels', description: 'Check Inventory Reports to see current stock and movements.' },
    ],
  },

  VIEW_INVENTORY_REPORTS: {
    benefits: ['See stock levels, movements, and valuations', 'Identify fast-moving and slow-moving items', 'Make informed restock decisions'],
    steps: [
      { title: 'Access Reports', description: 'Navigate to Reports → Inventory from the main menu.' },
      { title: 'View Insights', description: 'Review stock levels, movement trends, and valuations.' },
      { title: 'Take Action', description: 'Use insights to plan restocking and adjust purchasing.' },
    ],
  },

  // ── Procurement ─────────────────────────────────────────────────────────
  MANAGE_SUPPLIERS: {
    benefits: ['Keep all supplier contacts in one place', 'Track which suppliers provide which products', 'Streamline your ordering process'],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to activate supplier management.' },
      { title: 'Add Suppliers', description: 'Go to Suppliers and add your vendor details (name, contact, terms).' },
      { title: 'Link Products', description: 'Associate products with their suppliers for easier ordering.' },
    ],
  },

  CREATE_PURCHASE: {
    benefits: ['Create and track purchase orders to suppliers', 'Reconcile deliveries against orders', 'Maintain accurate records of what you ordered'],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to activate purchase orders.' },
      { title: 'Create PO', description: 'Go to Purchases → New Purchase Order, select supplier and items.' },
      { title: 'Receive Goods', description: 'When delivery arrives, mark items as received to update inventory.' },
    ],
  },

  // ── People & Access ─────────────────────────────────────────────────────
  MANAGE_EMPLOYEES: {
    benefits: ['Add staff members and assign roles', 'Control who can access what features', 'Track employee activity across branches'],
    steps: [
      { title: 'Invite Staff', description: 'Go to Employees and click Invite to add team members.' },
      { title: 'Assign Roles', description: 'Choose roles (Cashier, Supervisor, Admin) to control access.' },
      { title: 'Manage Access', description: 'Update roles or revoke access anytime from employee settings.' },
    ],
  },

  MANAGE_CUSTOMERS: {
    benefits: [
      'Track regular customers and their purchase history',
      'Apply discounts (senior citizen, PWD, corporate)',
      'Issue VAT receipts with customer TIN details',
    ],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to activate customer profiles.' },
      { title: 'Add Customers', description: 'At POS or in Customers page, create profiles with name and details.' },
      { title: 'Apply at Checkout', description: 'Select customer at POS to apply discounts or print VAT receipt.' },
    ],
  },

  // ── Reporting ───────────────────────────────────────────────────────────
  VIEW_SALES_REPORTS: {
    benefits: ['Understand your revenue, margins, and trends', 'See which products are selling best', 'Identify peak sales hours and days'],
    steps: [
      { title: 'Access Reports', description: 'Navigate to Reports → Sales from the main menu.' },
      { title: 'View Insights', description: 'Review revenue, product performance, and trends.' },
      { title: 'Export Data', description: 'Download reports as CSV for further analysis.' },
    ],
  },

  VIEW_TRANSACTION_HISTORY: {
    benefits: [
      'Full audit trail of every transaction',
      'Search and filter by date, amount, or payment method',
      'Review transaction details including items and payments',
    ],
    steps: [
      { title: 'Access History', description: 'Navigate to Transactions from the main menu.' },
      { title: 'Search', description: 'Use filters to find specific transactions by date or amount.' },
      { title: 'View Details', description: 'Click any transaction to see full breakdown and receipt.' },
    ],
  },

  VIEW_ANALYTICS: {
    benefits: ['Advanced insights into business performance', 'Identify trends and patterns in your sales', 'Make data-driven decisions for growth'],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to unlock analytics dashboard.' },
      { title: 'View Dashboard', description: 'Navigate to Analytics to see charts and insights.' },
      { title: 'Analyze Trends', description: 'Review peak hours, top products, and revenue trends.' },
    ],
  },

  EXPORT_DATA: {
    benefits: [
      'Download transaction and inventory data as CSV',
      'Share data with accountants or external systems',
      'Keep backup records of your business data',
    ],
    steps: [
      { title: 'Access Export', description: 'Go to any report page (Sales, Inventory, Transactions).' },
      { title: 'Choose Data', description: 'Select date range and data type to export.' },
      { title: 'Download', description: 'Click Export to download CSV file to your device.' },
    ],
  },

  // ── Finance & Compliance ────────────────────────────────────────────────
  PRINT_RECEIPT: {
    benefits: ['Print or generate receipts for every transaction', 'Comply with VAT and OR requirements', 'Provide proof of purchase to customers'],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to activate receipt printing.' },
      { title: 'Configure Printer', description: 'Go to Settings → Devices to connect your receipt printer.' },
      { title: 'Print Receipts', description: 'Receipts print automatically at checkout or on demand.' },
    ],
  },

  START_VENDOR_SESSION: {
    benefits: [
      'Open and close shifts to reconcile cash',
      'Track exactly how much each cashier collected',
      'Identify discrepancies between expected and actual cash',
    ],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to activate cash reconciliation.' },
      { title: 'Start Shift', description: 'At POS, click Start Session and enter opening cash amount.' },
      { title: 'End Shift', description: 'Click End Session, count cash, and reconcile against sales.' },
    ],
  },

  // ── Operations ──────────────────────────────────────────────────────────
  CREATE_TASK: {
    benefits: [
      'Assign tasks to staff members (stock counts, restocking)',
      'Track task completion and accountability',
      'Improve team coordination and workflows',
    ],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to activate task management.' },
      { title: 'Create Tasks', description: 'Go to Tasks and assign work items to specific employees.' },
      { title: 'Track Progress', description: 'Monitor task status and completion from the tasks dashboard.' },
    ],
  },

  BATCH_PREPARATION: {
    benefits: [
      'Prepare items in batches ahead of time (sandwiches, meals, baked goods)',
      'Track shelf life and reduce waste from expired items',
      'Deduct ingredients automatically using recipes',
    ],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to activate batch preparation.' },
      { title: 'Create Recipe', description: 'Go to Products and define recipes with ingredients for batch items.' },
      { title: 'Produce Batches', description: 'Use Production Orders to create batches and track shelf life.' },
    ],
  },

  // ── Multi-Branch ────────────────────────────────────────────────────────
  MANAGE_BRANCHES: {
    benefits: ['Manage multiple locations from one account', 'Track inventory and sales separately per branch', 'Assign employees to specific branches'],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to unlock multi-branch management.' },
      { title: 'Add Branches', description: 'Go to Business → Branches and add your additional locations.' },
      { title: 'Manage Per Branch', description: 'Switch between branches to view inventory, sales, and staff.' },
    ],
  },

  // ── Platform ────────────────────────────────────────────────────────────
  MANAGE_SETTINGS: {
    benefits: ['Configure units, categories, and business details', 'Customize your POS and business settings', 'Set tax rates and compliance options'],
    steps: [
      { title: 'Access Settings', description: 'Navigate to Settings from the main menu.' },
      { title: 'Configure', description: 'Set up units, categories, tax settings, and business info.' },
      { title: 'Save Changes', description: 'Settings apply immediately across all devices.' },
    ],
  },

  MANAGE_BILLING: {
    benefits: ['View and manage your subscription plan', 'Update payment method and billing details', 'Review transaction usage and limits'],
    steps: [
      { title: 'Access Billing', description: 'Navigate to Settings → Billing from the main menu.' },
      { title: 'Manage Plan', description: 'Upgrade, downgrade, or cancel your subscription.' },
      { title: 'Update Payment', description: 'Change your payment method or billing information.' },
    ],
  },

  REACTIVATE_SUBSCRIPTION: {
    benefits: ['Resume operations after subscription expires', 'Restore access to all your business data', 'Continue where you left off without data loss'],
    steps: [
      { title: 'Review Plan', description: 'Choose a subscription plan that fits your needs.' },
      { title: 'Update Payment', description: 'Add or update your payment method.' },
      { title: 'Reactivate', description: 'Click Reactivate to restore full access immediately.' },
    ],
  },

  ACCESS_API: {
    benefits: [
      'Connect external systems (accounting, e-commerce)',
      'Build custom integrations with your tools',
      'Access your data programmatically via REST API',
    ],
    steps: [
      { title: 'Enable Capability', description: 'Click Enable below to request API access.' },
      { title: 'Generate Keys', description: 'Go to Settings → API to create your API credentials.' },
      { title: 'Integrate', description: 'Use our API documentation to connect your external systems.' },
    ],
  },

  // ── Future Capabilities ─────────────────────────────────────────────────
  LOYALTY_POINTS: {
    benefits: ['Reward returning customers with points', 'Customers redeem points for discounts', 'Build customer loyalty and repeat visits'],
    steps: [
      { title: 'Coming Soon', description: 'This capability is under development and will be available soon.' },
      { title: 'Enable When Ready', description: 'Return to this page when the feature launches to enable it.' },
    ],
  },

  KITCHEN_DISPLAY: {
    benefits: [
      'Display orders on kitchen screens as they arrive',
      'Eliminate paper tickets and manual coordination',
      'Keep kitchen staff in sync with front-of-house',
    ],
    steps: [
      { title: 'Coming Soon', description: 'This capability is under development and will be available soon.' },
      { title: 'Enable When Ready', description: 'Return to this page when the feature launches to enable it.' },
    ],
  },

  DELIVERY_MANAGEMENT: {
    benefits: ['Manage delivery orders and track drivers', 'Coordinate deliveries from your dashboard', 'Assign orders to specific drivers'],
    steps: [
      { title: 'Coming Soon', description: 'This capability is under development and will be available soon.' },
      { title: 'Enable When Ready', description: 'Return to this page when the feature launches to enable it.' },
    ],
  },
}

/**
 * Get benefits list for a capability.
 * Returns empty array if capability not found.
 */
export function getCapabilityBenefits(capabilityId: string): string[] {
  return CAPABILITY_GUIDES[capabilityId]?.benefits ?? []
}

/**
 * Get usage steps for a capability.
 * Returns empty array if capability not found.
 */
export function getCapabilitySteps(capabilityId: string): CapabilityStep[] {
  return CAPABILITY_GUIDES[capabilityId]?.steps ?? []
}
