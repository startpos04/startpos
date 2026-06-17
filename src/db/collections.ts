import { QueryClient } from '@tanstack/react-query'
import type {
  Branch,
  Business,
  Category,
  Customer,
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

const queryClient = new QueryClient()
const SCHEMA_VERSION = 10

export const businessCollection = createSyncableCollection<Business>({
  id: 'businesses',
  apiKey: 'business',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const branchCollection = createSyncableCollection<Branch>({
  id: 'branches',
  apiKey: 'branch',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const categoryCollection = createSyncableCollection<Category>({
  id: 'categories',
  apiKey: 'category',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const unitCollection = createSyncableCollection<Unit>({
  id: 'units',
  apiKey: 'unit',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const productCollection = createSyncableCollection<Product>({
  id: 'products',
  apiKey: 'product',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const productVariantCollection = createSyncableCollection<ProductVariant>({
  id: 'productVariants',
  apiKey: 'productVariant',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const productComponentCollection = createSyncableCollection<ProductComponent>({
  id: 'productComponents',
  apiKey: 'productComponent',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const sequenceCounterCollection = createSyncableCollection<SequenceCounter>({
  id: 'sequenceCounters',
  apiKey: 'sequenceCounter',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const userCollection = createSyncableCollection<User>({
  id: 'users',
  apiKey: 'user',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const locationCollection = createSyncableCollection<Location>({
  id: 'locations',
  apiKey: 'location',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const supplierCollection = createSyncableCollection<Supplier>({
  id: 'suppliers',
  apiKey: 'supplier',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const customerCollection = createSyncableCollection<Customer>({
  id: 'customers',
  apiKey: 'customer',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',
  queryClient,
})

export const membershipCollection = createSyncableCollection<Membership>({
  id: 'memberships',
  apiKey: 'membership',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const sessionCollection = createSyncableCollection<Session>({
  id: 'sessions',
  apiKey: 'session',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const inventoryCollection = createSyncableCollection<Inventory>({
  id: 'inventories',
  apiKey: 'inventory',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const inventoryMovementCollection = createSyncableCollection<InventoryMovement>({
  id: 'inventoryMovements',
  apiKey: 'inventoryMovement',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const transactionCollection = createSyncableCollection<Omit<Transaction, 'complianceData'> & { complianceData: TransactionComplianceData }>({
  id: 'transactions',
  apiKey: 'transaction',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const transactionTaxLineCollection = createSyncableCollection<TransactionTaxLine>({
  id: 'transactionTaxLines',
  apiKey: 'transactionTaxLine',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const paymentCollection = createSyncableCollection<Payment>({
  id: 'payments',
  apiKey: 'payment',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const orderCollection = createSyncableCollection<Order>({
  id: 'orders',
  apiKey: 'order',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const orderItemCollection = createSyncableCollection<OrderItem>({
  id: 'orderItems',
  apiKey: 'orderItem',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const orderItemAddonCollection = createSyncableCollection<OrderItemAddon>({
  id: 'orderItemAddons',
  apiKey: 'orderItemAddon',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const purchaseCollection = createSyncableCollection<Purchase>({
  id: 'purchases',
  apiKey: 'purchase',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const purchaseItemCollection = createSyncableCollection<PurchaseItem>({
  id: 'purchaseItems',
  apiKey: 'purchaseItem',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const notificationCollection = createSyncableCollection<Notification>({
  id: 'notifications',
  apiKey: 'notification',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const operationalTaskCollection = createSyncableCollection<Omit<OperationalTask, 'metadata'> & { metadata: TaskMetadata }>({
  id: 'operationalTasks',
  apiKey: 'operationalTask',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})

export const vendorSessionCollection = createSyncableCollection<VendorSession>({
  id: 'vendorSessions',
  apiKey: 'vendorSession',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'on-demand',
  queryClient,
})
