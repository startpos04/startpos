import { PaymentMethod } from 'prisma/generated/prisma/enums'

export const APP_NAME = 'StartPOS'
export const APP_SHORT_NAME = 'POS'

export type PaymentMethodType = (typeof PaymentMethod)[keyof typeof PaymentMethod]
export const PAYMENT_PLATFORMS = {
  GCASH: { id: 'gcash', name: 'GCash', type: PaymentMethod.E_WALLET },
  MAYA: { id: 'maya', name: 'Maya', type: PaymentMethod.E_WALLET },
  BDO: { id: 'bdo_card', name: 'BDO Credit/Debit', type: PaymentMethod.CARD },
} as const satisfies Record<string, { id: string; name: string; type: PaymentMethodType }>

export type PaymentPlatformId = (typeof PAYMENT_PLATFORMS)[keyof typeof PAYMENT_PLATFORMS]['id']
