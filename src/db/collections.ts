import type {
  Branch,
  Business,
  Category,
  Customer,
  GoodsReceipt,
  GoodsReceiptItem,
  Inventory,
  InventoryMovement,
  Location,
  Membership,
  Notification,
  OperationalTask,
  Order,
  OrderItem,
  OrderItemAddon,
  Payment,
  Product,
  ProductComponent,
  ProductVariant,
  Purchase,
  PurchaseItem,
  SequenceCounter,
  Session,
  Supplier,
  Transaction,
  TransactionTaxLine,
  Unit,
  User,
  VendorSession,
} from 'prisma/generated/prisma/browser'
import type { TaskMetadata, TransactionComplianceData } from '@/lib/types'
import { createSyncableCollection } from '.'

// Bumped from 10 → 11 after Phase E schema additions (GoodsReceipt, GoodsReceiptItem)
const SCHEMA_VERSION = 11

export const businessCollection = createSyncableCollection<Business>({
  apiKey: 'business',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const branchCollection = createSyncableCollection<Branch>({
  apiKey: 'branch',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const categoryCollection = createSyncableCollection<Category>({
  apiKey: 'category',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const unitCollection = createSyncableCollection<Unit>({
  apiKey: 'unit',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const productCollection = createSyncableCollection<Product>({
  apiKey: 'product',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const productVariantCollection = createSyncableCollection<ProductVariant>({
  apiKey: 'productVariant',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const productComponentCollection = createSyncableCollection<ProductComponent>({
  apiKey: 'productComponent',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const sequenceCounterCollection = createSyncableCollection<SequenceCounter>({
  apiKey: 'sequenceCounter',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const userCollection = createSyncableCollection<User>({
  apiKey: 'user',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const locationCollection = createSyncableCollection<Location>({
  apiKey: 'location',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const supplierCollection = createSyncableCollection<Supplier>({
  apiKey: 'supplier',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const customerCollection = createSyncableCollection<Customer>({
  apiKey: 'customer',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const membershipCollection = createSyncableCollection<Membership>({
  apiKey: 'membership',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const sessionCollection = createSyncableCollection<Session>({
  apiKey: 'session',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const inventoryCollection = createSyncableCollection<Inventory>({
  apiKey: 'inventory',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const inventoryMovementCollection = createSyncableCollection<InventoryMovement>({
  apiKey: 'inventoryMovement',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const transactionCollection = createSyncableCollection<Omit<Transaction, 'complianceData'> & { complianceData: TransactionComplianceData }>({
  apiKey: 'transaction',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const transactionTaxLineCollection = createSyncableCollection<TransactionTaxLine>({
  apiKey: 'transactionTaxLine',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const paymentCollection = createSyncableCollection<Payment>({
  apiKey: 'payment',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const orderCollection = createSyncableCollection<Order>({
  apiKey: 'order',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const orderItemCollection = createSyncableCollection<OrderItem>({
  apiKey: 'orderItem',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const orderItemAddonCollection = createSyncableCollection<OrderItemAddon>({
  apiKey: 'orderItemAddon',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const purchaseCollection = createSyncableCollection<Purchase>({
  apiKey: 'purchase',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const purchaseItemCollection = createSyncableCollection<PurchaseItem>({
  apiKey: 'purchaseItem',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const notificationCollection = createSyncableCollection<Notification>({
  apiKey: 'notification',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const operationalTaskCollection = createSyncableCollection<Omit<OperationalTask, 'metadata'> & { metadata: TaskMetadata }>({
  apiKey: 'operationalTask',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const vendorSessionCollection = createSyncableCollection<VendorSession>({
  apiKey: 'vendorSession',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

// Phase E — Receiving Domain
// syncMode: 'on-demand' — receipts are loaded only when the purchase detail
// page is open. They are not needed globally.

export const goodsReceiptCollection = createSyncableCollection<GoodsReceipt>({
  apiKey: 'goodsReceipt',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const goodsReceiptItemCollection = createSyncableCollection<GoodsReceiptItem>({
  apiKey: 'goodsReceiptItem',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})
