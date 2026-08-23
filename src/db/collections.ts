import type {
  AuditLog,
  Branch,
  Business,
  BusinessSubscription,
  Category,
  CreditLedger,
  Customer,
  Feature,
  FeatureBundle,
  FeatureDependency,
  GoodsReceipt,
  GoodsReceiptItem,
  Hint,
  HintLog,
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
  Permission,
  Product,
  ProductComponent,
  ProductionOrder,
  ProductionOrderItem,
  ProductVariant,
  Purchase,
  PurchaseItem,
  SequenceCounter,
  Session,
  Supplier,
  Transaction,
  TransactionTaxLine,
  Unit,
  UsageCounter,
  User,
  UserPermission,
  VendorSession,
} from 'prisma/generated/prisma/browser'
import type { TaskMetadata, TransactionComplianceData } from '@/lib/types'
import { createSyncableCollection } from '.'

const SCHEMA_VERSION = 2

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

export const businessSubscriptionCollection = createSyncableCollection<BusinessSubscription>({
  apiKey: 'businessSubscription',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const usageCounterCollection = createSyncableCollection<UsageCounter>({
  apiKey: 'usageCounter',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const creditLedgerCollection = createSyncableCollection<CreditLedger>({
  apiKey: 'creditLedger',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
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

export const featureCollection = createSyncableCollection<Feature>({
  apiKey: 'feature',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
})

export const featureDependencyCollection = createSyncableCollection<FeatureDependency>({
  apiKey: 'featureDependency',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const featureBundleCollection = createSyncableCollection<FeatureBundle>({
  apiKey: 'featureBundle',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const auditLogCollection = createSyncableCollection<AuditLog>({
  apiKey: 'auditLog',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand', // Write locally, sync to server automatically
})

export const productionOrderCollection = createSyncableCollection<ProductionOrder>({
  apiKey: 'productionOrder',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

export const productionOrderItemCollection = createSyncableCollection<ProductionOrderItem>({
  apiKey: 'productionOrderItem',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
})

// --- AUTHORIZATION SYSTEM COLLECTIONS (Phase 1: Offline Support) ---

export const permissionCollection = createSyncableCollection<Permission>({
  apiKey: 'permission',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager', // Always sync on login for offline authorization
})

export const userPermissionCollection = createSyncableCollection<UserPermission>({
  apiKey: 'userPermission',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager', // Always sync on login for offline authorization
})

// --- HINT SYSTEM COLLECTIONS (Phase 4: Optional Offline Enhancements) ---

export const hintCollection = createSyncableCollection<Hint>({
  apiKey: 'hint',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand', // Sync when dashboard is accessed, cache for offline
})

export const hintLogCollection = createSyncableCollection<HintLog>({
  apiKey: 'hintLog',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand', // Track hint viewing history, sync when needed
})
