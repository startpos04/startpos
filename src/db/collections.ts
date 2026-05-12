import { QueryClient } from '@tanstack/react-query'
import type {
  Branch,
  Category,
  Inventory,
  InventoryMovement,
  Membership,
  Notification,
  Order,
  OrderItem,
  OrderItemAddon,
  Organization,
  Payment,
  Product,
  ProductComponent,
  ProductVariant,
  Purchase,
  PurchaseItem,
  SequenceCounter,
  Session,
  Transaction,
  Unit,
  User,
} from 'prisma/generated/prisma/browser'
import { createSyncableCollection } from '.'

const queryClient = new QueryClient()

export const organizationCollection = createSyncableCollection<Organization>({
  id: 'organizations',
  apiKey: 'organization',
  schemaVersion: 6,
  syncMode: 'eager',
  queryClient,
})

export const branchCollection = createSyncableCollection<Branch>({
  id: 'branches',
  apiKey: 'branch',
  schemaVersion: 6,
  syncMode: 'eager',
  queryClient,
})

export const categoryCollection = createSyncableCollection<Category>({
  id: 'categories',
  apiKey: 'category',
  schemaVersion: 6,
  syncMode: 'eager',
  queryClient,
})

export const unitCollection = createSyncableCollection<Unit>({
  id: 'units',
  apiKey: 'unit',
  schemaVersion: 6,
  syncMode: 'eager',
  queryClient,
})

export const productCollection = createSyncableCollection<Product>({
  id: 'products',
  apiKey: 'product',
  schemaVersion: 6,
  syncMode: 'eager',
  queryClient,
})

export const productVariantCollection = createSyncableCollection<ProductVariant>({
  id: 'productVariants',
  apiKey: 'productVariant',
  schemaVersion: 6,
  syncMode: 'eager',
  queryClient,
})

export const productComponentCollection = createSyncableCollection<ProductComponent>({
  id: 'productComponents',
  apiKey: 'productComponent',
  schemaVersion: 6,
  syncMode: 'eager',
  queryClient,
})

export const sequenceCounterCollection = createSyncableCollection<SequenceCounter>({
  id: 'sequenceCounters',
  apiKey: 'sequenceCounter',
  schemaVersion: 6,
  syncMode: 'eager',
  queryClient,
})

export const userCollection = createSyncableCollection<User>({
  id: 'users',
  apiKey: 'user',
  schemaVersion: 6,
  syncMode: 'eager',
  queryClient,
})

export const membershipCollection = createSyncableCollection<Membership>({
  id: 'memberships',
  apiKey: 'membership',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const sessionCollection = createSyncableCollection<Session>({
  id: 'sessions',
  apiKey: 'session',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const inventoryCollection = createSyncableCollection<Inventory>({
  id: 'inventories',
  apiKey: 'inventory',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const inventoryMovementCollection = createSyncableCollection<InventoryMovement>({
  id: 'inventoryMovements',
  apiKey: 'inventoryMovement',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const transactionCollection = createSyncableCollection<Transaction>({
  id: 'transactions',
  apiKey: 'transaction',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const paymentCollection = createSyncableCollection<Payment>({
  id: 'payments',
  apiKey: 'payment',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const orderCollection = createSyncableCollection<Order>({
  id: 'orders',
  apiKey: 'order',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const orderItemCollection = createSyncableCollection<OrderItem>({
  id: 'orderItems',
  apiKey: 'orderItem',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const orderItemAddonCollection = createSyncableCollection<OrderItemAddon>({
  id: 'orderItemAddons',
  apiKey: 'orderItemAddon',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const purchaseCollection = createSyncableCollection<Purchase>({
  id: 'purchases',
  apiKey: 'purchase',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const purchaseItemCollection = createSyncableCollection<PurchaseItem>({
  id: 'purchaseItems',
  apiKey: 'purchaseItem',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})

export const notificationsCollection = createSyncableCollection<Notification>({
  id: 'notifications',
  apiKey: 'notification',
  schemaVersion: 6,
  syncMode: 'on-demand',
  queryClient,
})
