/**
 * configuration/types.ts
 *
 * Type definitions for Configuration System
 */

import type { ConfigCategory, ConfigDataType, ConfigurationKey, ConfigurationScope } from 'prisma/generated/prisma/enums'

export type { ConfigCategory, ConfigDataType, ConfigurationKey, ConfigurationScope }

export type CountryCode = 'PH' | 'SG' | 'US'

export type ConfigContext = {
  businessId?: string
  branchId?: string
  userId?: string
}

export type ValidationRule = {
  min?: number
  max?: number
  regex?: string
  enum?: string[]
  required?: boolean
}

export type ConfigurationDefinitionDTO = {
  id: string
  key: ConfigurationKey
  label: string
  description?: string
  category: ConfigCategory
  dataType: ConfigDataType
  defaultValue: string
  scope: ConfigurationScope
  required: boolean
  validation?: ValidationRule
  countryCode?: string
}

export type BusinessConfigurationDTO = {
  id: string
  key: ConfigurationKey
  value: string
  scope: ConfigurationScope
  businessId?: string
  branchId?: string
  userId?: string
  createdAt: Date
  updatedAt: Date
}
