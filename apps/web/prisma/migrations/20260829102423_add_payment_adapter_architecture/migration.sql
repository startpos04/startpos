-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('STANDARD', 'REDUCED', 'EXEMPT', 'ZERO_RATED');

-- CreateEnum
CREATE TYPE "TaxCalculationType" AS ENUM ('VAT', 'SALES_TAX');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'GROCERY', 'RETAIL');

-- CreateEnum
CREATE TYPE "ConfigCategory" AS ENUM ('TAX', 'LOCALE', 'OPERATIONAL', 'BILLING', 'ADDON_PRICING', 'COMPOSABLE_PRICING', 'GUIDANCE');

-- CreateEnum
CREATE TYPE "ConfigDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENUM');

-- CreateEnum
CREATE TYPE "ConfigurationScope" AS ENUM ('PLATFORM', 'BUSINESS', 'BRANCH', 'USER');

-- CreateEnum
CREATE TYPE "ConfigurationKey" AS ENUM ('LOW_STOCK_THRESHOLD', 'VAT_RATE', 'IS_VAT_REGISTERED', 'PRICE_CONFIGURATION', 'BUFFER_RATE', 'LOCALE', 'CURRENCY', 'AUTO_APPROVE_LOW_STOCK_REFILL', 'TRIAL_DURATION_DAYS', 'GRACE_PERIOD_DAYS', 'LONG_TERM_INACTIVE_DAYS', 'CREDIT_LOW_BALANCE_THRESHOLD', 'OVERAGE_BILLING_ENABLED', 'COMPOSABLE_BRANCH_MONTHLY_RATE', 'COMPOSABLE_MAX_FEATURES', 'COMPOSABLE_ANNUAL_DISCOUNT_PCT', 'COMPOSABLE_TAX_RATE', 'COMPOSABLE_QUOTE_VALIDITY_DAYS', 'COMPOSABLE_PARTNER_MARGIN_PCT', 'COMPOSABLE_PROMO_CODE_ENABLED', 'HINT_FREQUENCY_DAYS', 'HINT_DISPLAY_SECONDS', 'ADDON_ANALYTICS_PRICE', 'ADDON_API_PRICE', 'ADDON_BRANCH_PRICE', 'ADDON_EMPLOYEE_PRICE', 'ADDON_TX_500_PRICE_ID', 'ADDON_TX_1000_PRICE_ID', 'ADDON_TX_5000_PRICE_ID', 'ADDON_TX_500_PRICE', 'ADDON_TX_1000_PRICE', 'ADDON_TX_5000_PRICE', 'ADDON_ANALYTICS_PRICE_ID', 'ADDON_API_PRICE_ID', 'ADDON_BRANCH_PRICE_ID', 'ADDON_EMPLOYEE_PRICE_ID', 'ADDON_TX_RECURRING_500_PRICE_ID', 'ADDON_TX_RECURRING_1000_PRICE_ID', 'ADDON_TX_RECURRING_5000_PRICE_ID', 'ADDON_TX_RECURRING_500_PRICE', 'ADDON_TX_RECURRING_1000_PRICE', 'ADDON_TX_RECURRING_5000_PRICE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'SUPERVISOR', 'CASHIER', 'SERVICE_PROVIDER');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('BUSINESS', 'BRANCH', 'USER');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('VIEW', 'MANAGE', 'CREATE', 'EDIT', 'DELETE', 'EXPORT', 'INVITE', 'ADJUST', 'CANCEL', 'REFUND', 'CHANGE');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PHYSICAL_GOOD', 'SERVICE', 'RAW_MATERIAL', 'BUNDLE');

-- CreateEnum
CREATE TYPE "VariantAttributeType" AS ENUM ('SIZE', 'COLOR', 'FLAVOR', 'MATERIAL', 'PORTION', 'STYLE', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('WEIGHT', 'VOLUME', 'VOLUME_DRY', 'LENGTH', 'AREA', 'COUNT', 'TIME');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RECEIVED', 'VOIDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('IN', 'OUT', 'ADJUST', 'WASTE', 'EXTERNAL_TRANSFER', 'INTERNAL_TRANSFER', 'PRODUCTION_IN', 'PRODUCTION_OUT');

-- CreateEnum
CREATE TYPE "InventoryType" AS ENUM ('RAW_MATERIAL', 'FINISHED_GOOD');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PREPARING', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEOUT', 'DELIVERY');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALE', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PriceConfiguration" AS ENUM ('INCLUSIVE', 'EXCLUSIVE');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('SALES_INVOICE', 'COLLECTION_RECEIPT');

-- CreateEnum
CREATE TYPE "TaxLineType" AS ENUM ('VAT', 'GST', 'SALES_TAX');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'E_WALLET', 'CARD', 'CREDIT');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LOW_STOCK', 'NEW_ORDER', 'SYSTEM_ALERT', 'TASK_ASSIGNED', 'TASK_OVERDUE', 'COMPLIANCE_REMINDER', 'PURCHASE_PENDING_APPROVAL', 'CREDIT_LOW_BALANCE', 'GROWTH_MILESTONE', 'USAGE_THRESHOLD');

-- CreateEnum
CREATE TYPE "SequenceType" AS ENUM ('INVOICE', 'ORDER', 'PURCHASE', 'STOCK_TRANSFER', 'COLLECTION_RECEIPT', 'REFUND', 'PRODUCTION_ORDER');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('SHELF_REFILL', 'PURCHASE_REQUEST', 'BRANCH_TRANSFER', 'STOCK_COUNT', 'WASTE_DISPOSAL', 'CASH_RECONCILIATION', 'GENERAL_CHORE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'IN_PROGRESS', 'FULFILLED', 'REVIEWED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED', 'LONG_TERM_INACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingModel" AS ENUM ('MONTHLY_SUBSCRIPTION', 'YEARLY_SUBSCRIPTION', 'PREPAID_CREDITS', 'HYBRID', 'COMPOSABLE_FEATURES');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "InvoiceItemType" AS ENUM ('SUBSCRIPTION_FEE', 'OVERAGE_CHARGE', 'CREDIT_PURCHASE', 'ADJUSTMENT', 'ONE_TIME_FEE');

-- CreateEnum
CREATE TYPE "CreditEventType" AS ENUM ('PURCHASE', 'CONSUMED', 'REFUNDED', 'EXPIRED', 'ADJUSTMENT', 'PROMOTIONAL');

-- CreateEnum
CREATE TYPE "PricingCategory" AS ENUM ('CORE', 'OPERATIONAL', 'MANAGEMENT', 'INTEGRATION', 'ADVANCED');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BundlePricingType" AS ENUM ('PERCENTAGE_DISCOUNT', 'FIXED_PRICE', 'FLAT_DISCOUNT');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'CALCULATED', 'SENT', 'ACCEPTED', 'CONVERTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteLineType" AS ENUM ('FEATURE', 'BUNDLE_DISCOUNT', 'PROMO_DISCOUNT', 'SURCHARGE', 'TAX', 'ONE_TIME_FEE');

-- CreateEnum
CREATE TYPE "AddonType" AS ENUM ('TX_TOPUP', 'TX_RECURRING', 'ANALYTICS', 'API_ACCESS', 'BRANCH', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "BusinessRegistrationStatus" AS ENUM ('UNREGISTERED', 'PENDING', 'REGISTERED', 'EXPIRED');

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "businessType" "BusinessType" NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'PH',
    "complianceId" TEXT,
    "registrationStatus" "BusinessRegistrationStatus" NOT NULL DEFAULT 'UNREGISTERED',
    "registrationCompletedAt" TIMESTAMP(3),
    "onboardingSurveyAnswers" JSONB,
    "onboardingProfile" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "onboardingVariantId" TEXT,
    "currentProfile" TEXT,
    "livingCharacteristics" JSONB,
    "characteristicsVersion" INTEGER NOT NULL DEFAULT 0,
    "characteristicsComputedAt" TIMESTAMP(3),
    "healthStage" TEXT,
    "lastCharacteristicsEvent" TIMESTAMP(3),
    "deferredCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "country" TEXT NOT NULL DEFAULT 'PH',
    "serialNumber" TEXT NOT NULL,
    "minInvoiceNo" INTEGER NOT NULL,
    "maxInvoiceNo" INTEGER NOT NULL,
    "branchCode" TEXT NOT NULL DEFAULT '00001',
    "offlineTerminalId" TEXT,
    "txQuotaLimit" INTEGER,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CASHIER',
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "contactNumber" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CASHIER',
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,
    "privacyAcceptedAt" TIMESTAMP(3),
    "privacyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'SALE',
    "priceConfiguration" "PriceConfiguration" NOT NULL DEFAULT 'INCLUSIVE',
    "invoiceType" "InvoiceType" NOT NULL DEFAULT 'SALES_INVOICE',
    "orderId" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "snapshotBufferRate" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "notes" TEXT,
    "complianceData" JSONB DEFAULT '{}',
    "customerId" TEXT,
    "snapshotCustomerName" TEXT,
    "snapshotCustomerTaxId" TEXT,
    "snapshotCustomerAddress" TEXT,
    "snapshotBusinessName" TEXT,
    "snapshotBranchName" TEXT,
    "snapshotBranchAddress" TEXT,
    "snapshotCurrency" TEXT,
    "snapshotCashierName" TEXT,
    "snapshotBusinessTIN" TEXT,
    "snapshotBranchSN" TEXT,
    "snapshotBranchCode" TEXT,
    "snapshotIsVATRegistered" BOOLEAN,
    "snapshotPTUNumber" TEXT,
    "snapshotRDOCode" TEXT,
    "snapshotCustomerTIN" TEXT,
    "snapshotScPwdId" TEXT,
    "snapshotScPwdName" TEXT,
    "snapshotScPwdDiscount" INTEGER,
    "snapshotBuyerName" TEXT,
    "snapshotBuyerTIN" TEXT,
    "snapshotBuyerAddress" TEXT,
    "snapshotBuyerBusinessStyle" TEXT,
    "cashierId" TEXT NOT NULL,
    "providerId" TEXT,
    "sessionId" TEXT,
    "originalTransactionId" TEXT,
    "usageCounterId" TEXT,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_tax_lines" (
    "id" TEXT NOT NULL,
    "type" "TaxLineType" NOT NULL,
    "category" "TaxCategory" NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "taxableAmount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,

    CONSTRAINT "transaction_tax_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerReference" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PREPARING',
    "orderType" "OrderType" NOT NULL DEFAULT 'DINE_IN',
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL DEFAULT 0,
    "unitId" TEXT NOT NULL,
    "snapshotProductName" TEXT,
    "snapshotVariantName" TEXT,
    "snapshotCategoryName" TEXT,
    "snapshotSku" TEXT,
    "snapshotProductType" "ResourceType",
    "snapshotProductImage" TEXT,
    "snapshotUnitName" TEXT,
    "snapshotUnitAbbrev" TEXT,
    "snapshotUnitType" TEXT,
    "snapshotTaxCategory" "TaxCategory",
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_addons" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "addonId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "snapshotUnitPrice" INTEGER NOT NULL,
    "snapshotUnitCost" INTEGER NOT NULL DEFAULT 0,
    "snapshotAddonProductName" TEXT,
    "snapshotAddonVariantName" TEXT,
    "snapshotAddonSku" TEXT,
    "snapshotAddonUnitName" TEXT,
    "snapshotAddonUnitAbbrev" TEXT,
    "snapshotAddonTaxCategory" "TaxCategory",
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_item_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "type" "ResourceType" NOT NULL DEFAULT 'PHYSICAL_GOOD',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "hasExpiry" BOOLEAN NOT NULL DEFAULT false,
    "requiresDeposit" BOOLEAN NOT NULL DEFAULT false,
    "depositAmount" INTEGER,
    "durationMinutes" INTEGER,
    "categoryId" TEXT NOT NULL,
    "baseUnitId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "sku" TEXT,
    "price" INTEGER NOT NULL,
    "costPrice" INTEGER NOT NULL DEFAULT 0,
    "attributeType" "VariantAttributeType" NOT NULL DEFAULT 'UNSPECIFIED',
    "taxCategory" "TaxCategory" NOT NULL DEFAULT 'STANDARD',
    "lowStockThreshold" INTEGER,
    "isBatchPrepared" BOOLEAN NOT NULL DEFAULT false,
    "productionUsesRecipe" BOOLEAN NOT NULL DEFAULT true,
    "shelfLifeHours" INTEGER,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_components" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "quantityUsed" DOUBLE PRECISION NOT NULL,
    "isAddon" BOOLEAN NOT NULL DEFAULT false,
    "priceOverride" INTEGER,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "type" "UnitType" NOT NULL,
    "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isBaseUnit" BOOLEAN NOT NULL DEFAULT false,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_units" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isPurchaseUnit" BOOLEAN NOT NULL DEFAULT false,
    "isSalesUnit" BOOLEAN NOT NULL DEFAULT true,
    "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "businessId" TEXT NOT NULL,

    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contact" TEXT,
    "address" TEXT,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" DOUBLE PRECISION NOT NULL,
    "costPrice" INTEGER NOT NULL DEFAULT 0,
    "locationId" TEXT,
    "inventoryType" "InventoryType" NOT NULL DEFAULT 'RAW_MATERIAL',
    "productionOrderId" TEXT,
    "producedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "lastRestocked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "unitId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "targetBranchId" TEXT,
    "locationId" TEXT,
    "transactionId" TEXT,
    "purchaseId" TEXT,
    "productionOrderId" TEXT,
    "operationalTaskId" TEXT,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "taxId" TEXT,
    "address" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "contactNo" TEXT,
    "email" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'RECEIVED',
    "totalCost" INTEGER NOT NULL,
    "notes" TEXT,
    "supplierId" TEXT,
    "operationalTaskId" TEXT,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitId" TEXT NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuration_definitions" (
    "id" TEXT NOT NULL,
    "key" "ConfigurationKey" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" "ConfigCategory" NOT NULL,
    "dataType" "ConfigDataType" NOT NULL,
    "defaultValue" TEXT NOT NULL,
    "scope" "ConfigurationScope" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "validation" JSONB,
    "countryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuration_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configurations" (
    "id" TEXT NOT NULL,
    "key" "ConfigurationKey" NOT NULL,
    "value" TEXT NOT NULL,
    "scope" "ConfigurationScope" NOT NULL,
    "userId" TEXT,
    "businessId" TEXT,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_capability_configs" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_capability_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_configurations" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "dataType" "ConfigDataType" NOT NULL,
    "scope" "ConfigurationScope" NOT NULL,
    "branchId" TEXT,
    "businessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capability_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_subscriptions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "billingModel" "BillingModel" NOT NULL DEFAULT 'MONTHLY_SUBSCRIPTION',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "longTermInactiveAt" TIMESTAMP(3),
    "txUsedThisPeriod" INTEGER NOT NULL DEFAULT 0,
    "creditBalance" INTEGER,
    "cancelReason" TEXT,
    "externalId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_status_history" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "fromStatus" "SubscriptionStatus",
    "toStatus" "SubscriptionStatus" NOT NULL,
    "reason" TEXT,
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "features" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isOperational" BOOLEAN NOT NULL DEFAULT false,
    "isSelectableByCustomer" BOOLEAN NOT NULL DEFAULT false,
    "pricingCategory" "PricingCategory",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "monthlyPrice" INTEGER NOT NULL,
    "annualPrice" INTEGER,
    "includedTxPerMonth" INTEGER NOT NULL,
    "overagePerTx" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlements" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "usageLimit" INTEGER,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_overrides" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entitlement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "billingPeriodStart" TIMESTAMP(3) NOT NULL,
    "billingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "txCount" INTEGER NOT NULL DEFAULT 0,
    "overageTxCount" INTEGER NOT NULL DEFAULT 0,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "billingPeriodStart" TIMESTAMP(3) NOT NULL,
    "billingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "externalInvoiceId" TEXT,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "InvoiceItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmount" INTEGER NOT NULL,
    "lineAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "eventType" "CreditEventType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "transactionId" TEXT,
    "note" TEXT,
    "actorId" TEXT,
    "stripeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_subscription_addons" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "addonType" "AddonType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "externalSessionId" TEXT,
    "externalSubscriptionId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_subscription_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_subscription_features" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "snapshotPrice" INTEGER NOT NULL,
    "catalogVersion" INTEGER NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_subscription_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "PermissionScope" NOT NULL,
    "resource" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "category" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_default_permissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_default_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "openingCash" INTEGER NOT NULL DEFAULT 0,
    "closingCash" INTEGER,
    "expectedCash" INTEGER,
    "verifiedCash" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "operationalTaskId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "vendor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "tendered" INTEGER NOT NULL,
    "change" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "platform" TEXT,
    "referenceNo" TEXT,
    "transactionId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "metadata" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_counters" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "SequenceType" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "day" INTEGER,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "offlineCashierId" TEXT,
    "offlineDeviceId" TEXT,
    "isOfflineMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequence_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_audits" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "SequenceType" NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "deviceId" TEXT,
    "wasOffline" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_tasks" (
    "id" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "creatorId" TEXT,
    "approverId" TEXT,
    "clerkId" TEXT,
    "reviewerId" TEXT,
    "cancelerId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "approvedAt" TIMESTAMP(3),
    "inProgressAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_capability_states" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredBy" TEXT,
    "recommendationReason" TEXT,
    "recommendationScore" DOUBLE PRECISION,
    "recommendedAt" TIMESTAMP(3),
    "enabledAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "dismissalCount" INTEGER NOT NULL DEFAULT 0,
    "permanentlyIgnored" BOOLEAN NOT NULL DEFAULT false,
    "previousState" TEXT,
    "stateHistory" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_capability_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_event_log" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "actorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "business_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characteristics_recalculation_queue" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characteristics_recalculation_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_usage_summaries" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "txCount" INTEGER NOT NULL DEFAULT 0,
    "activeBranchCount" INTEGER NOT NULL DEFAULT 0,
    "activeUserCount" INTEGER NOT NULL DEFAULT 0,
    "additionalMetrics" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_usage_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hints" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "page" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hint_logs" (
    "id" TEXT NOT NULL,
    "hintId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hint_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "ProductionStatus" NOT NULL DEFAULT 'DRAFT',
    "targetVariantId" TEXT NOT NULL,
    "targetQuantity" DOUBLE PRECISION NOT NULL,
    "targetUnitId" TEXT NOT NULL,
    "actualQuantity" DOUBLE PRECISION,
    "usesRecipe" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "producedById" TEXT,
    "notes" TEXT,
    "totalCost" INTEGER NOT NULL DEFAULT 0,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_items" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "materialVariantId" TEXT NOT NULL,
    "quantityUsed" DOUBLE PRECISION NOT NULL,
    "unitId" TEXT NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "businessId" TEXT NOT NULL,

    CONSTRAINT "production_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "receivedById" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseItemId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "orderedQty" DOUBLE PRECISION NOT NULL,
    "receivedQty" DOUBLE PRECISION NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "discrepancyNotes" TEXT,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_catalogs" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_prices" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "monthlyPrice" INTEGER NOT NULL,
    "annualPrice" INTEGER,
    "isIncludedInBase" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_dependencies" (
    "id" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "dependsOnKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_bundles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_bundle_items" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,

    CONSTRAINT "feature_bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_bundle_versions" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "pricingType" "BundlePricingType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "minimumItems" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_bundle_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_quotes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalMonthly" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "grandTotal" INTEGER NOT NULL DEFAULT 0,
    "annualTotal" INTEGER,
    "annualSavings" INTEGER,
    "oneTimeFees" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "generatedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "pricing_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_quote_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "lineType" "QuoteLineType" NOT NULL,
    "featureKey" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmount" INTEGER NOT NULL,
    "lineAmount" INTEGER NOT NULL,
    "negotiatedPrice" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pricing_quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "philippines_compliance" (
    "id" TEXT NOT NULL,
    "birTin" TEXT NOT NULL,
    "birPtuNumber" TEXT,
    "birPtuIssuedAt" TIMESTAMP(3),
    "birRdoCode" TEXT,
    "secRegistration" TEXT,
    "mayorPermit" TEXT,
    "dtiRegistration" TEXT,
    "vatRegistrationDate" TIMESTAMP(3),
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "philippines_compliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "philippines_branch_compliance" (
    "id" TEXT NOT NULL,
    "branchSerialNumber" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "ptuNumber" TEXT,
    "rdoCode" TEXT,
    "mayorPermit" TEXT,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "philippines_branch_compliance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_complianceId_key" ON "businesses"("complianceId");

-- CreateIndex
CREATE INDEX "businesses_deletedAt_idx" ON "businesses"("deletedAt");

-- CreateIndex
CREATE INDEX "branches_deletedAt_idx" ON "branches"("deletedAt");

-- CreateIndex
CREATE INDEX "branches_offlineTerminalId_idx" ON "branches"("offlineTerminalId");

-- CreateIndex
CREATE INDEX "memberships_deletedAt_idx" ON "memberships"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_businessId_key" ON "memberships"("userId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "audit_logs_businessId_createdAt_idx" ON "audit_logs"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_businessId_idx" ON "audit_logs"("action", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_invoiceNo_key" ON "transactions"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_orderId_key" ON "transactions"("orderId");

-- CreateIndex
CREATE INDEX "transactions_businessId_branchId_createdAt_idx" ON "transactions"("businessId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_cashierId_idx" ON "transactions"("cashierId");

-- CreateIndex
CREATE INDEX "transactions_usageCounterId_idx" ON "transactions"("usageCounterId");

-- CreateIndex
CREATE INDEX "orders_businessId_branchId_idx" ON "orders"("businessId", "branchId");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_businessId_orderId_idx" ON "order_items"("businessId", "orderId");

-- CreateIndex
CREATE INDEX "order_item_addons_orderItemId_idx" ON "order_item_addons"("orderItemId");

-- CreateIndex
CREATE INDEX "order_item_addons_businessId_orderItemId_idx" ON "order_item_addons"("businessId", "orderItemId");

-- CreateIndex
CREATE INDEX "order_item_addons_businessId_branchId_idx" ON "order_item_addons"("businessId", "branchId");

-- CreateIndex
CREATE INDEX "categories_deletedAt_idx" ON "categories"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_businessId_key" ON "categories"("name", "businessId");

-- CreateIndex
CREATE INDEX "products_deletedAt_idx" ON "products"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_businessId_sku_idx" ON "product_variants"("businessId", "sku");

-- CreateIndex
CREATE INDEX "product_variants_isBatchPrepared_idx" ON "product_variants"("isBatchPrepared");

-- CreateIndex
CREATE INDEX "product_components_businessId_idx" ON "product_components"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "product_components_hostId_materialId_isAddon_key" ON "product_components"("hostId", "materialId", "isAddon");

-- CreateIndex
CREATE INDEX "units_deletedAt_idx" ON "units"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "units_name_businessId_key" ON "units"("name", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "units_abbreviation_businessId_key" ON "units"("abbreviation", "businessId");

-- CreateIndex
CREATE INDEX "product_units_businessId_idx" ON "product_units"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_variantId_unitId_key" ON "product_units"("variantId", "unitId");

-- CreateIndex
CREATE INDEX "locations_deletedAt_idx" ON "locations"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_branchId_key" ON "locations"("name", "branchId");

-- CreateIndex
CREATE INDEX "inventory_businessId_branchId_variantId_idx" ON "inventory"("businessId", "branchId", "variantId");

-- CreateIndex
CREATE INDEX "inventory_inventoryType_branchId_idx" ON "inventory"("inventoryType", "branchId");

-- CreateIndex
CREATE INDEX "inventory_movements_businessId_branchId_variantId_createdAt_idx" ON "inventory_movements"("businessId", "branchId", "variantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_deletedAt_idx" ON "customers"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_businessId_key" ON "suppliers"("name", "businessId");

-- CreateIndex
CREATE INDEX "purchase_items_businessId_branchId_idx" ON "purchase_items"("businessId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "configuration_definitions_key_key" ON "configuration_definitions"("key");

-- CreateIndex
CREATE INDEX "configurations_key_idx" ON "configurations"("key");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_key_businessId_scope_key" ON "configurations"("key", "businessId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_key_branchId_scope_key" ON "configurations"("key", "branchId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_key_userId_scope_key" ON "configurations"("key", "userId", "scope");

-- CreateIndex
CREATE INDEX "branch_capability_configs_branchId_idx" ON "branch_capability_configs"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_capability_configs_branchId_capabilityId_key" ON "branch_capability_configs"("branchId", "capabilityId");

-- CreateIndex
CREATE INDEX "capability_configurations_capabilityId_branchId_idx" ON "capability_configurations"("capabilityId", "branchId");

-- CreateIndex
CREATE INDEX "capability_configurations_capabilityId_businessId_idx" ON "capability_configurations"("capabilityId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "capability_configurations_capabilityId_key_branchId_scope_key" ON "capability_configurations"("capabilityId", "key", "branchId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "capability_configurations_capabilityId_key_businessId_scope_key" ON "capability_configurations"("capabilityId", "key", "businessId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "business_subscriptions_businessId_key" ON "business_subscriptions"("businessId");

-- CreateIndex
CREATE INDEX "business_subscriptions_businessId_status_idx" ON "business_subscriptions"("businessId", "status");

-- CreateIndex
CREATE INDEX "subscription_status_history_subscriptionId_createdAt_idx" ON "subscription_status_history"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "features_key_key" ON "features"("key");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "plan_entitlements_planId_featureKey_key" ON "plan_entitlements"("planId", "featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_overrides_businessId_featureKey_key" ON "entitlement_overrides"("businessId", "featureKey");

-- CreateIndex
CREATE INDEX "usage_counters_businessId_isClosed_idx" ON "usage_counters"("businessId", "isClosed");

-- CreateIndex
CREATE INDEX "usage_counters_branchId_isClosed_idx" ON "usage_counters"("branchId", "isClosed");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_businessId_branchId_billingPeriodStart_key" ON "usage_counters"("businessId", "branchId", "billingPeriodStart");

-- CreateIndex
CREATE INDEX "billing_invoices_businessId_billingPeriodStart_idx" ON "billing_invoices"("businessId", "billingPeriodStart");

-- CreateIndex
CREATE INDEX "billing_invoices_status_idx" ON "billing_invoices"("status");

-- CreateIndex
CREATE INDEX "billing_invoice_items_invoiceId_idx" ON "billing_invoice_items"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_stripeSessionId_key" ON "credit_ledger"("stripeSessionId");

-- CreateIndex
CREATE INDEX "credit_ledger_businessId_branchId_createdAt_idx" ON "credit_ledger"("businessId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_ledger_branchId_createdAt_idx" ON "credit_ledger"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_ledger_transactionId_idx" ON "credit_ledger"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "business_subscription_addons_externalSessionId_key" ON "business_subscription_addons"("externalSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "business_subscription_addons_externalSubscriptionId_key" ON "business_subscription_addons"("externalSubscriptionId");

-- CreateIndex
CREATE INDEX "business_subscription_addons_businessId_addonType_idx" ON "business_subscription_addons"("businessId", "addonType");

-- CreateIndex
CREATE INDEX "business_subscription_addons_businessId_expiresAt_idx" ON "business_subscription_addons"("businessId", "expiresAt");

-- CreateIndex
CREATE INDEX "business_subscription_features_subscriptionId_idx" ON "business_subscription_features"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "business_subscription_features_subscriptionId_featureKey_key" ON "business_subscription_features"("subscriptionId", "featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_scope_resource_action_idx" ON "permissions"("scope", "resource", "action");

-- CreateIndex
CREATE INDEX "permissions_category_idx" ON "permissions"("category");

-- CreateIndex
CREATE INDEX "user_permissions_userId_granted_idx" ON "user_permissions"("userId", "granted");

-- CreateIndex
CREATE INDEX "user_permissions_permissionId_idx" ON "user_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_userId_permissionId_key" ON "user_permissions"("userId", "permissionId");

-- CreateIndex
CREATE INDEX "role_default_permissions_role_idx" ON "role_default_permissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX "role_default_permissions_role_permissionId_key" ON "role_default_permissions"("role", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_sessions_operationalTaskId_key" ON "vendor_sessions"("operationalTaskId");

-- CreateIndex
CREATE INDEX "vendor_sessions_businessId_branchId_idx" ON "vendor_sessions"("businessId", "branchId");

-- CreateIndex
CREATE INDEX "payments_businessId_branchId_idx" ON "payments"("businessId", "branchId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_archivedAt_idx" ON "notifications"("userId", "isRead", "archivedAt");

-- CreateIndex
CREATE INDEX "notifications_businessId_idx" ON "notifications"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "sequence_counters_businessId_branchId_type_year_month_day_key" ON "sequence_counters"("businessId", "branchId", "type", "year", "month", "day");

-- CreateIndex
CREATE INDEX "sequence_audits_businessId_branchId_type_idx" ON "sequence_audits"("businessId", "branchId", "type");

-- CreateIndex
CREATE INDEX "sequence_audits_generatedBy_idx" ON "sequence_audits"("generatedBy");

-- CreateIndex
CREATE INDEX "sequence_audits_transactionId_idx" ON "sequence_audits"("transactionId");

-- CreateIndex
CREATE INDEX "operational_tasks_businessId_branchId_status_idx" ON "operational_tasks"("businessId", "branchId", "status");

-- CreateIndex
CREATE INDEX "operational_tasks_type_idx" ON "operational_tasks"("type");

-- CreateIndex
CREATE INDEX "operational_tasks_clerkId_idx" ON "operational_tasks"("clerkId");

-- CreateIndex
CREATE INDEX "operational_tasks_reviewerId_idx" ON "operational_tasks"("reviewerId");

-- CreateIndex
CREATE INDEX "business_capability_states_businessId_state_idx" ON "business_capability_states"("businessId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "business_capability_states_businessId_capabilityId_key" ON "business_capability_states"("businessId", "capabilityId");

-- CreateIndex
CREATE INDEX "business_event_log_businessId_occurredAt_idx" ON "business_event_log"("businessId", "occurredAt");

-- CreateIndex
CREATE INDEX "business_event_log_type_businessId_idx" ON "business_event_log"("type", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "characteristics_recalculation_queue_business_id_key" ON "characteristics_recalculation_queue"("business_id");

-- CreateIndex
CREATE INDEX "characteristics_recalculation_queue_processed_at_priority_idx" ON "characteristics_recalculation_queue"("processed_at", "priority");

-- CreateIndex
CREATE INDEX "business_usage_summaries_businessId_periodEnd_idx" ON "business_usage_summaries"("businessId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "business_usage_summaries_businessId_periodEnd_key" ON "business_usage_summaries"("businessId", "periodEnd");

-- CreateIndex
CREATE INDEX "hint_logs_userId_hintId_idx" ON "hint_logs"("userId", "hintId");

-- CreateIndex
CREATE INDEX "hint_logs_userId_shownAt_idx" ON "hint_logs"("userId", "shownAt");

-- CreateIndex
CREATE INDEX "production_orders_businessId_branchId_status_idx" ON "production_orders"("businessId", "branchId", "status");

-- CreateIndex
CREATE INDEX "production_orders_targetVariantId_idx" ON "production_orders"("targetVariantId");

-- CreateIndex
CREATE INDEX "production_orders_completedAt_idx" ON "production_orders"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_orderNumber_businessId_key" ON "production_orders"("orderNumber", "businessId");

-- CreateIndex
CREATE INDEX "production_order_items_productionOrderId_idx" ON "production_order_items"("productionOrderId");

-- CreateIndex
CREATE INDEX "production_order_items_materialVariantId_idx" ON "production_order_items"("materialVariantId");

-- CreateIndex
CREATE INDEX "goods_receipts_businessId_branchId_purchaseId_idx" ON "goods_receipts"("businessId", "branchId", "purchaseId");

-- CreateIndex
CREATE INDEX "goods_receipts_status_idx" ON "goods_receipts"("status");

-- CreateIndex
CREATE INDEX "goods_receipt_items_receiptId_idx" ON "goods_receipt_items"("receiptId");

-- CreateIndex
CREATE INDEX "goods_receipt_items_businessId_branchId_idx" ON "goods_receipt_items"("businessId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_catalogs_version_key" ON "pricing_catalogs"("version");

-- CreateIndex
CREATE INDEX "pricing_catalogs_status_idx" ON "pricing_catalogs"("status");

-- CreateIndex
CREATE INDEX "feature_prices_catalogId_idx" ON "feature_prices"("catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_prices_catalogId_featureKey_key" ON "feature_prices"("catalogId", "featureKey");

-- CreateIndex
CREATE INDEX "feature_dependencies_featureKey_idx" ON "feature_dependencies"("featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "feature_dependencies_featureKey_dependsOnKey_key" ON "feature_dependencies"("featureKey", "dependsOnKey");

-- CreateIndex
CREATE UNIQUE INDEX "feature_bundles_key_key" ON "feature_bundles"("key");

-- CreateIndex
CREATE INDEX "feature_bundle_items_bundleId_idx" ON "feature_bundle_items"("bundleId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_bundle_items_bundleId_featureKey_key" ON "feature_bundle_items"("bundleId", "featureKey");

-- CreateIndex
CREATE INDEX "feature_bundle_versions_catalogId_idx" ON "feature_bundle_versions"("catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_bundle_versions_bundleId_catalogId_key" ON "feature_bundle_versions"("bundleId", "catalogId");

-- CreateIndex
CREATE INDEX "pricing_quotes_businessId_status_idx" ON "pricing_quotes"("businessId", "status");

-- CreateIndex
CREATE INDEX "pricing_quotes_status_validUntil_idx" ON "pricing_quotes"("status", "validUntil");

-- CreateIndex
CREATE INDEX "pricing_quote_items_quoteId_idx" ON "pricing_quote_items"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "philippines_compliance_businessId_key" ON "philippines_compliance"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "philippines_branch_compliance_branchId_key" ON "philippines_branch_compliance"("branchId");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "vendor_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_originalTransactionId_fkey" FOREIGN KEY ("originalTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_usageCounterId_fkey" FOREIGN KEY ("usageCounterId") REFERENCES "usage_counters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_tax_lines" ADD CONSTRAINT "transaction_tax_lines_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_targetBranchId_fkey" FOREIGN KEY ("targetBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_operationalTaskId_fkey" FOREIGN KEY ("operationalTaskId") REFERENCES "operational_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_operationalTaskId_fkey" FOREIGN KEY ("operationalTaskId") REFERENCES "operational_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_key_fkey" FOREIGN KEY ("key") REFERENCES "configuration_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_capability_configs" ADD CONSTRAINT "branch_capability_configs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_configurations" ADD CONSTRAINT "capability_configurations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_configurations" ADD CONSTRAINT "capability_configurations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_subscriptions" ADD CONSTRAINT "business_subscriptions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_subscriptions" ADD CONSTRAINT "business_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "business_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "features"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_overrides" ADD CONSTRAINT "entitlement_overrides_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_overrides" ADD CONSTRAINT "entitlement_overrides_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "features"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoice_items" ADD CONSTRAINT "billing_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "billing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_subscription_addons" ADD CONSTRAINT "business_subscription_addons_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_subscription_features" ADD CONSTRAINT "business_subscription_features_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "business_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_subscription_features" ADD CONSTRAINT "business_subscription_features_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "features"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_default_permissions" ADD CONSTRAINT "role_default_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_sessions" ADD CONSTRAINT "vendor_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_sessions" ADD CONSTRAINT "vendor_sessions_operationalTaskId_fkey" FOREIGN KEY ("operationalTaskId") REFERENCES "operational_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_sessions" ADD CONSTRAINT "vendor_sessions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_sessions" ADD CONSTRAINT "vendor_sessions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_counters" ADD CONSTRAINT "sequence_counters_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_counters" ADD CONSTRAINT "sequence_counters_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_audits" ADD CONSTRAINT "sequence_audits_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_audits" ADD CONSTRAINT "sequence_audits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_audits" ADD CONSTRAINT "sequence_audits_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_clerkId_fkey" FOREIGN KEY ("clerkId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_cancelerId_fkey" FOREIGN KEY ("cancelerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_capability_states" ADD CONSTRAINT "business_capability_states_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_event_log" ADD CONSTRAINT "business_event_log_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characteristics_recalculation_queue" ADD CONSTRAINT "characteristics_recalculation_queue_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_usage_summaries" ADD CONSTRAINT "business_usage_summaries_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hint_logs" ADD CONSTRAINT "hint_logs_hintId_fkey" FOREIGN KEY ("hintId") REFERENCES "hints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_targetVariantId_fkey" FOREIGN KEY ("targetVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_targetUnitId_fkey" FOREIGN KEY ("targetUnitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_producedById_fkey" FOREIGN KEY ("producedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_materialVariantId_fkey" FOREIGN KEY ("materialVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_prices" ADD CONSTRAINT "feature_prices_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "pricing_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_prices" ADD CONSTRAINT "feature_prices_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "features"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_dependencies" ADD CONSTRAINT "feature_dependencies_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "features"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_dependencies" ADD CONSTRAINT "feature_dependencies_dependsOnKey_fkey" FOREIGN KEY ("dependsOnKey") REFERENCES "features"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_bundle_items" ADD CONSTRAINT "feature_bundle_items_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "feature_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_bundle_items" ADD CONSTRAINT "feature_bundle_items_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "features"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_bundle_versions" ADD CONSTRAINT "feature_bundle_versions_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "feature_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_bundle_versions" ADD CONSTRAINT "feature_bundle_versions_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "pricing_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_quotes" ADD CONSTRAINT "pricing_quotes_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "pricing_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_quote_items" ADD CONSTRAINT "pricing_quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "pricing_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "philippines_compliance" ADD CONSTRAINT "philippines_compliance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "philippines_branch_compliance" ADD CONSTRAINT "philippines_branch_compliance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
