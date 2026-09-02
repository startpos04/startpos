// AUTO-GENERATED - DO NOT EDIT
export const SCHEMA_METADATA = {
  "Business": {
    "relations": {
      "philippinesCompliance": "PhilippinesCompliance",
      "members": "Membership",
      "branches": "Branch",
      "products": "Product",
      "categories": "Category",
      "units": "Unit",
      "customers": "Customer",
      "productComponents": "ProductComponent",
      "productUnits": "ProductUnit",
      "purchaseItems": "PurchaseItem",
      "inventory": "Inventory",
      "inventoryMovements": "InventoryMovement",
      "transactions": "Transaction",
      "orders": "Order",
      "orderItems": "OrderItem",
      "orderItemAddons": "OrderItemAddon",
      "vendorSessions": "VendorSession",
      "payments": "Payment",
      "variants": "ProductVariant",
      "notifications": "Notification",
      "sequenceCounters": "SequenceCounter",
      "sequenceAudits": "SequenceAudit",
      "purchases": "Purchase",
      "operationalTasks": "OperationalTask",
      "configurations": "Configuration",
      "locations": "Location",
      "suppliers": "Supplier",
      "entitlementOverrides": "EntitlementOverride",
      "goodsReceipts": "GoodsReceipt",
      "goodsReceiptItems": "GoodsReceiptItem",
      "subscription": "BusinessSubscription",
      "productionOrders": "ProductionOrder",
      "productionOrderItems": "ProductionOrderItem",
      "usageCounters": "UsageCounter",
      "billingInvoices": "BillingInvoice",
      "creditLedger": "CreditLedger",
      "subscriptionAddons": "BusinessSubscriptionAddon",
      "billingPayments": "BillingPayment",
      "paymentNotifications": "PaymentNotification",
      "capabilityStates": "BusinessCapabilityState",
      "eventLog": "BusinessEventLog",
      "recalculationQueue": "CharacteristicsRecalculationQueue",
      "usageSummaries": "BusinessUsageSummary",
      "auditLogs": "AuditLog",
      "capabilityConfigurations": "CapabilityConfiguration"
    }
  },
  "Branch": {
    "relations": {
      "philippinesBranchCompliance": "PhilippinesBranchCompliance",
      "members": "Membership",
      "inventory": "Inventory",
      "transactions": "Transaction",
      "orders": "Order",
      "movements": "InventoryMovement",
      "receivedTransfers": "InventoryMovement",
      "purchases": "Purchase",
      "vendorSessions": "VendorSession",
      "purchaseItems": "PurchaseItem",
      "orderItems": "OrderItem",
      "orderItemAddons": "OrderItemAddon",
      "payments": "Payment",
      "notifications": "Notification",
      "sequenceCounters": "SequenceCounter",
      "sequenceAudits": "SequenceAudit",
      "operationalTasks": "OperationalTask",
      "configurations": "Configuration",
      "locations": "Location",
      "goodsReceipts": "GoodsReceipt",
      "goodsReceiptItems": "GoodsReceiptItem",
      "productionOrders": "ProductionOrder",
      "capabilityConfigs": "BranchCapabilityConfig",
      "capabilityConfigurations": "CapabilityConfiguration",
      "usageCounters": "UsageCounter",
      "creditLedger": "CreditLedger",
      "business": "Business"
    }
  },
  "Membership": {
    "relations": {
      "user": "User",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "User": {
    "relations": {
      "sessions": "Session",
      "accounts": "Account",
      "processedSales": "Transaction",
      "performedServices": "Transaction",
      "inventoryMovements": "InventoryMovement",
      "memberships": "Membership",
      "vendorSessions": "VendorSession",
      "notifications": "Notification",
      "createdTasks": "OperationalTask",
      "approvedTasks": "OperationalTask",
      "fulfilledTasks": "OperationalTask",
      "reviewedTasks": "OperationalTask",
      "canceledTasks": "OperationalTask",
      "receivedGoods": "GoodsReceipt",
      "configurations": "Configuration",
      "productionOrders": "ProductionOrder",
      "userPermissions": "UserPermission",
      "permissionsGranted": "UserPermission",
      "sequenceAudits": "SequenceAudit",
      "approvedPayments": "BillingPayment",
      "goodsReceipts": "GoodsReceipt"
    }
  },
  "AuditLog": {
    "relations": {
      "business": "Business"
    }
  },
  "Session": {
    "relations": {
      "user": "User"
    }
  },
  "Account": {
    "relations": {
      "user": "User"
    }
  },
  "Verification": {
    "relations": {}
  },
  "Transaction": {
    "relations": {
      "order": "Order",
      "customer": "Customer",
      "cashier": "User",
      "provider": "User",
      "session": "VendorSession",
      "originalTransaction": "Transaction",
      "refunds": "Transaction",
      "payments": "Payment",
      "taxLines": "TransactionTaxLine",
      "usageCounter": "UsageCounter",
      "business": "Business",
      "branch": "Branch",
      "inventoryMovements": "InventoryMovement"
    }
  },
  "TransactionTaxLine": {
    "relations": {
      "transaction": "Transaction"
    }
  },
  "Order": {
    "relations": {
      "transaction": "Transaction",
      "items": "OrderItem",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "OrderItem": {
    "relations": {
      "order": "Order",
      "variant": "ProductVariant",
      "unit": "Unit",
      "selectedAddons": "OrderItemAddon",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "OrderItemAddon": {
    "relations": {
      "orderItem": "OrderItem",
      "addon": "ProductVariant",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "Category": {
    "relations": {
      "products": "Product",
      "business": "Business"
    }
  },
  "Product": {
    "relations": {
      "category": "Category",
      "baseUnit": "Unit",
      "variants": "ProductVariant",
      "business": "Business"
    }
  },
  "ProductVariant": {
    "relations": {
      "product": "Product",
      "components": "ProductComponent",
      "usedIn": "ProductComponent",
      "inventory": "Inventory",
      "orderItems": "OrderItem",
      "inventoryMovements": "InventoryMovement",
      "orderItemAddons": "OrderItemAddon",
      "productUnits": "ProductUnit",
      "purchaseItems": "PurchaseItem",
      "goodsReceiptItems": "GoodsReceiptItem",
      "productionTargets": "ProductionOrder",
      "productionMaterials": "ProductionOrderItem",
      "business": "Business"
    }
  },
  "ProductComponent": {
    "relations": {
      "unit": "Unit",
      "host": "ProductVariant",
      "material": "ProductVariant",
      "business": "Business"
    }
  },
  "Unit": {
    "relations": {
      "products": "Product",
      "components": "ProductComponent",
      "inventory": "Inventory",
      "movements": "InventoryMovement",
      "orderItems": "OrderItem",
      "productUnits": "ProductUnit",
      "purchaseItems": "PurchaseItem",
      "goodsReceiptItems": "GoodsReceiptItem",
      "productionTargetUnits": "ProductionOrder",
      "productionMaterialUnits": "ProductionOrderItem",
      "business": "Business"
    }
  },
  "ProductUnit": {
    "relations": {
      "variant": "ProductVariant",
      "unit": "Unit",
      "business": "Business"
    }
  },
  "Location": {
    "relations": {
      "inventories": "Inventory",
      "inventoryMovements": "InventoryMovement",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "Inventory": {
    "relations": {
      "variant": "ProductVariant",
      "unit": "Unit",
      "location": "Location",
      "productionOrder": "ProductionOrder",
      "inventoryMovements": "InventoryMovement",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "InventoryMovement": {
    "relations": {
      "variant": "ProductVariant",
      "user": "User",
      "unit": "Unit",
      "inventory": "Inventory",
      "targetBranch": "Branch",
      "location": "Location",
      "transaction": "Transaction",
      "purchase": "Purchase",
      "productionOrder": "ProductionOrder",
      "operationalTask": "OperationalTask",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "Customer": {
    "relations": {
      "transactions": "Transaction",
      "business": "Business"
    }
  },
  "Supplier": {
    "relations": {
      "business": "Business",
      "purchases": "Purchase"
    }
  },
  "Purchase": {
    "relations": {
      "supplier": "Supplier",
      "items": "PurchaseItem",
      "goodsReceipts": "GoodsReceipt",
      "inventoryMovements": "InventoryMovement",
      "operationalTask": "OperationalTask",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "PurchaseItem": {
    "relations": {
      "purchase": "Purchase",
      "variant": "ProductVariant",
      "unit": "Unit",
      "goodsReceiptItems": "GoodsReceiptItem",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "ConfigurationDefinition": {
    "relations": {
      "configurations": "Configuration"
    }
  },
  "Configuration": {
    "relations": {
      "definition": "ConfigurationDefinition",
      "user": "User",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "BranchCapabilityConfig": {
    "relations": {
      "branch": "Branch"
    }
  },
  "CapabilityConfiguration": {
    "relations": {
      "branch": "Branch",
      "business": "Business"
    }
  },
  "BusinessSubscription": {
    "relations": {
      "business": "Business",
      "plan": "SubscriptionPlan",
      "statusHistory": "SubscriptionStatusHistory",
      "notifications": "PaymentNotification",
      "businessSubscriptionFeatures": "BusinessSubscriptionFeature",
      "billingPayments": "BillingPayment"
    }
  },
  "SubscriptionStatusHistory": {
    "relations": {
      "subscription": "BusinessSubscription"
    }
  },
  "Feature": {
    "relations": {
      "entitlements": "PlanEntitlement",
      "overrides": "EntitlementOverride",
      "prices": "FeaturePrice",
      "bundleItems": "FeatureBundleItem",
      "dependencies": "FeatureDependency",
      "dependents": "FeatureDependency",
      "businessSubscriptionFeatures": "BusinessSubscriptionFeature"
    }
  },
  "SubscriptionPlan": {
    "relations": {
      "entitlements": "PlanEntitlement",
      "businessSubscriptions": "BusinessSubscription"
    }
  },
  "PlanEntitlement": {
    "relations": {
      "plan": "SubscriptionPlan",
      "feature": "Feature"
    }
  },
  "EntitlementOverride": {
    "relations": {
      "business": "Business",
      "feature": "Feature"
    }
  },
  "UsageCounter": {
    "relations": {
      "business": "Business",
      "branch": "Branch",
      "transactions": "Transaction"
    }
  },
  "BillingInvoice": {
    "relations": {
      "business": "Business",
      "items": "BillingInvoiceItem",
      "billingPayments": "BillingPayment"
    }
  },
  "BillingInvoiceItem": {
    "relations": {
      "invoice": "BillingInvoice"
    }
  },
  "CreditLedger": {
    "relations": {
      "business": "Business",
      "branch": "Branch"
    }
  },
  "BusinessSubscriptionAddon": {
    "relations": {
      "business": "Business"
    }
  },
  "BusinessSubscriptionFeature": {
    "relations": {
      "subscription": "BusinessSubscription",
      "feature": "Feature"
    }
  },
  "BillingPayment": {
    "relations": {
      "business": "Business",
      "subscription": "BusinessSubscription",
      "invoice": "BillingInvoice",
      "approvedBy": "User",
      "attempts": "BillingPaymentAttempt"
    }
  },
  "BillingPaymentAttempt": {
    "relations": {
      "payment": "BillingPayment"
    }
  },
  "WebhookEvent": {
    "relations": {}
  },
  "PaymentNotification": {
    "relations": {
      "business": "Business",
      "subscription": "BusinessSubscription"
    }
  },
  "Permission": {
    "relations": {
      "userPermissions": "UserPermission",
      "roleDefaults": "RoleDefaultPermission"
    }
  },
  "UserPermission": {
    "relations": {
      "user": "User",
      "permission": "Permission",
      "grantor": "User"
    }
  },
  "RoleDefaultPermission": {
    "relations": {
      "permission": "Permission"
    }
  },
  "VendorSession": {
    "relations": {
      "user": "User",
      "transactions": "Transaction",
      "operationalTask": "OperationalTask",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "Payment": {
    "relations": {
      "transaction": "Transaction",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "Notification": {
    "relations": {
      "user": "User",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "SequenceCounter": {
    "relations": {
      "business": "Business",
      "branch": "Branch"
    }
  },
  "SequenceAudit": {
    "relations": {
      "business": "Business",
      "branch": "Branch",
      "user": "User"
    }
  },
  "OperationalTask": {
    "relations": {
      "creator": "User",
      "approver": "User",
      "clerk": "User",
      "reviewer": "User",
      "canceler": "User",
      "purchases": "Purchase",
      "vendorSessions": "VendorSession",
      "inventoryMovements": "InventoryMovement",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "BusinessCapabilityState": {
    "relations": {
      "business": "Business"
    }
  },
  "BusinessEventLog": {
    "relations": {
      "business": "Business"
    }
  },
  "CharacteristicsRecalculationQueue": {
    "relations": {
      "business": "Business"
    }
  },
  "BusinessUsageSummary": {
    "relations": {
      "business": "Business"
    }
  },
  "Hint": {
    "relations": {
      "logs": "HintLog"
    }
  },
  "HintLog": {
    "relations": {
      "hint": "Hint"
    }
  },
  "ProductionOrder": {
    "relations": {
      "targetVariant": "ProductVariant",
      "targetUnit": "Unit",
      "producedBy": "User",
      "items": "ProductionOrderItem",
      "inventoryMovements": "InventoryMovement",
      "finishedInventory": "Inventory",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "ProductionOrderItem": {
    "relations": {
      "productionOrder": "ProductionOrder",
      "materialVariant": "ProductVariant",
      "unit": "Unit",
      "business": "Business"
    }
  },
  "GoodsReceipt": {
    "relations": {
      "purchase": "Purchase",
      "receivedBy": "User",
      "items": "GoodsReceiptItem",
      "business": "Business",
      "branch": "Branch",
      "user": "User"
    }
  },
  "GoodsReceiptItem": {
    "relations": {
      "receipt": "GoodsReceipt",
      "purchaseItem": "PurchaseItem",
      "variant": "ProductVariant",
      "unit": "Unit",
      "business": "Business",
      "branch": "Branch"
    }
  },
  "PricingCatalog": {
    "relations": {
      "featurePrices": "FeaturePrice",
      "bundleVersions": "FeatureBundleVersion",
      "pricingQuotes": "PricingQuote"
    }
  },
  "FeaturePrice": {
    "relations": {
      "catalog": "PricingCatalog",
      "feature": "Feature"
    }
  },
  "FeatureDependency": {
    "relations": {
      "feature": "Feature",
      "dependsOn": "Feature"
    }
  },
  "FeatureBundle": {
    "relations": {
      "versions": "FeatureBundleVersion",
      "items": "FeatureBundleItem"
    }
  },
  "FeatureBundleItem": {
    "relations": {
      "bundle": "FeatureBundle",
      "feature": "Feature"
    }
  },
  "FeatureBundleVersion": {
    "relations": {
      "bundle": "FeatureBundle",
      "catalog": "PricingCatalog"
    }
  },
  "PricingQuote": {
    "relations": {
      "catalog": "PricingCatalog",
      "items": "PricingQuoteItem"
    }
  },
  "PricingQuoteItem": {
    "relations": {
      "quote": "PricingQuote"
    }
  },
  "PhilippinesCompliance": {
    "relations": {
      "business": "Business"
    }
  },
  "PhilippinesBranchCompliance": {
    "relations": {
      "branch": "Branch"
    }
  }
} as const;