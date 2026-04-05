// AUTO-GENERATED - DO NOT EDIT
export const SCHEMA_METADATA = {
  "Organization": {
    "hasOrg": false,
    "hasBranch": false,
    "relations": {
      "members": "Membership",
      "branches": "Branch",
      "products": "Product",
      "categories": "Category",
      "units": "Unit",
      "customers": "Customer",
      "productIngredients": "ProductIngredient",
      "productAddons": "ProductAddon",
      "productUnits": "ProductUnit",
      "purchaseItems": "PurchaseItem",
      "inventory": "Inventory",
      "inventoryMovements": "InventoryMovement",
      "transactions": "Transaction",
      "orderItems": "OrderItem",
      "orderItemAddons": "OrderItemAddon",
      "vendorSessions": "VendorSession",
      "payments": "Payment"
    }
  },
  "Branch": {
    "hasOrg": true,
    "hasBranch": false,
    "relations": {
      "organization": "Organization",
      "members": "Membership",
      "inventory": "Inventory",
      "transactions": "Transaction",
      "movements": "InventoryMovement",
      "receivedTransfers": "InventoryMovement",
      "purchases": "Purchase",
      "vendorSessions": "VendorSession",
      "purchaseItems": "PurchaseItem",
      "orderItems": "OrderItem",
      "orderItemAddons": "OrderItemAddon",
      "payments": "Payment"
    }
  },
  "Membership": {
    "hasOrg": true,
    "hasBranch": true,
    "relations": {
      "user": "User",
      "organization": "Organization",
      "branch": "Branch"
    }
  },
  "User": {
    "hasOrg": false,
    "hasBranch": false,
    "relations": {
      "sessions": "Session",
      "accounts": "Account",
      "processedSales": "Transaction",
      "performedServices": "Transaction",
      "inventoryMovements": "InventoryMovement",
      "memberships": "Membership",
      "vendorSessions": "VendorSession"
    }
  },
  "Session": {
    "hasOrg": true,
    "hasBranch": true,
    "relations": {
      "user": "User"
    }
  },
  "Account": {
    "hasOrg": false,
    "hasBranch": false,
    "relations": {
      "user": "User"
    }
  },
  "Category": {
    "hasOrg": true,
    "hasBranch": false,
    "relations": {
      "products": "Product",
      "organization": "Organization"
    }
  },
  "Product": {
    "hasOrg": true,
    "hasBranch": false,
    "relations": {
      "category": "Category",
      "baseUnit": "Unit",
      "variantOf": "Product",
      "variants": "Product",
      "ingredients": "ProductIngredient",
      "usedIn": "ProductIngredient",
      "allowedAddons": "ProductAddon",
      "usedAsAddonIn": "ProductAddon",
      "inventory": "Inventory",
      "orderItems": "OrderItem",
      "inventoryMovements": "InventoryMovement",
      "orderItemAddons": "OrderItemAddon",
      "productUnits": "ProductUnit",
      "purchaseItems": "PurchaseItem",
      "organization": "Organization"
    }
  },
  "ProductIngredient": {
    "hasOrg": true,
    "hasBranch": false,
    "relations": {
      "unit": "Unit",
      "host": "Product",
      "material": "Product",
      "organization": "Organization"
    }
  },
  "ProductAddon": {
    "hasOrg": true,
    "hasBranch": false,
    "relations": {
      "host": "Product",
      "addon": "Product",
      "organization": "Organization"
    }
  },
  "Unit": {
    "hasOrg": true,
    "hasBranch": false,
    "relations": {
      "organization": "Organization",
      "products": "Product",
      "ingredients": "ProductIngredient",
      "inventory": "Inventory",
      "movements": "InventoryMovement",
      "orderItems": "OrderItem",
      "productUnits": "ProductUnit",
      "purchaseItems": "PurchaseItem"
    }
  },
  "ProductUnit": {
    "hasOrg": true,
    "hasBranch": false,
    "relations": {
      "product": "Product",
      "unit": "Unit",
      "organization": "Organization"
    }
  },
  "Purchase": {
    "hasOrg": false,
    "hasBranch": true,
    "relations": {
      "branch": "Branch",
      "items": "PurchaseItem"
    }
  },
  "PurchaseItem": {
    "hasOrg": true,
    "hasBranch": true,
    "relations": {
      "purchase": "Purchase",
      "product": "Product",
      "unit": "Unit",
      "organization": "Organization",
      "branch": "Branch"
    }
  },
  "Inventory": {
    "hasOrg": true,
    "hasBranch": true,
    "relations": {
      "product": "Product",
      "unit": "Unit",
      "branch": "Branch",
      "organization": "Organization"
    }
  },
  "InventoryMovement": {
    "hasOrg": true,
    "hasBranch": true,
    "relations": {
      "product": "Product",
      "user": "User",
      "unit": "Unit",
      "branch": "Branch",
      "targetBranch": "Branch",
      "organization": "Organization"
    }
  },
  "Customer": {
    "hasOrg": true,
    "hasBranch": false,
    "relations": {
      "organization": "Organization",
      "transactions": "Transaction"
    }
  },
  "Transaction": {
    "hasOrg": true,
    "hasBranch": true,
    "relations": {
      "cashier": "User",
      "provider": "User",
      "customer": "Customer",
      "branch": "Branch",
      "session": "VendorSession",
      "items": "OrderItem",
      "payments": "Payment",
      "organization": "Organization"
    }
  },
  "OrderItem": {
    "hasOrg": true,
    "hasBranch": true,
    "relations": {
      "unit": "Unit",
      "selectedAddons": "OrderItemAddon",
      "transaction": "Transaction",
      "product": "Product",
      "organization": "Organization",
      "branch": "Branch"
    }
  },
  "OrderItemAddon": {
    "hasOrg": true,
    "hasBranch": true,
    "relations": {
      "orderItem": "OrderItem",
      "addon": "Product",
      "organization": "Organization",
      "branch": "Branch"
    }
  },
  "VendorSession": {
    "hasOrg": true,
    "hasBranch": true,
    "relations": {
      "user": "User",
      "branch": "Branch",
      "transactions": "Transaction",
      "organization": "Organization"
    }
  },
  "Payment": {
    "hasOrg": true,
    "hasBranch": true,
    "relations": {
      "transaction": "Transaction",
      "organization": "Organization",
      "branch": "Branch"
    }
  }
} as const;