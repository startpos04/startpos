import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { useStore } from '@tanstack/react-store'
import { useCapability } from '@startpos-core/hooks/use-capability'
import { getComplianceLines, getReceiptFooterText, getTaxRateLabel } from '@/lib/compliance/receipt-helper'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@startpos-core/lib/dayjs'
import { Capabilities } from '@startpos-core/lib/entitlement/capability-keys'
import type { CreatePosTransactionResponse } from '@/lib/queries/create-pos-transaction'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'
import type { posFormOpts } from '..'

// Constants for predictable math
const PAGE_WIDTH = 204 // Standard 58mm thermal paper
const FONT_SIZE_MAIN = 9
const FONT_SIZE_KITCHEN = 11
const LINE_HEIGHT = 1.2
const PADDING = 15

const styles = StyleSheet.create({
  page: {
    padding: PADDING,
    fontSize: FONT_SIZE_MAIN,
    lineHeight: LINE_HEIGHT,
    fontFamily: 'Courier',
    backgroundColor: '#FFFFFF',
  },
  header: { textAlign: 'center', marginBottom: 10 },
  storeName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  address: { fontSize: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#000', borderBottomStyle: 'dashed', marginVertical: 5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  tableHeader: { flexDirection: 'row', fontWeight: 'bold', marginTop: 5, marginBottom: 5 },
  row: { flexDirection: 'row', paddingVertical: 2 },
  columnItem: { flex: 3 },
  columnQty: { flex: 0.5, textAlign: 'center' },
  columnPrice: { flex: 1.5, textAlign: 'right' },
  addonRow: { flexDirection: 'row', paddingLeft: 10, fontSize: 8, color: '#444' },
  totalsContainer: { marginTop: 10, borderTopWidth: 1, borderTopStyle: 'dashed', paddingTop: 5 },
  totalText: { fontSize: 11, fontWeight: 'bold' },
  footer: { textAlign: 'center', marginTop: 15, fontSize: 8 },
  kitchenTitle: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  kitchenSub: { fontSize: 10, textAlign: 'center', marginBottom: 8 },
  kitchenItem: { fontSize: FONT_SIZE_KITCHEN, fontWeight: 'bold' },
  kitchenAddon: { fontSize: 9, marginLeft: 10, fontStyle: 'italic' },
})

export const ReceiptPDF = ({ result, data }: { result: CreatePosTransactionResponse; data: NonNullable<(typeof posFormOpts)['defaultValues']> }) => {
  const user = useStore(authStore, state => state.user)
  const canCreateOrder = useCapability(Capabilities.CREATE_ORDER)
  if (result.error || !result.data || !user) return null
  const { transaction, payments } = result.data
  const payment = payments[0]

  // --- Phase 11: Get country-agnostic compliance lines for receipt header ---
  const complianceLines = getComplianceLines(user.compliance, user.branch.serialNumber)
  const footerText = getReceiptFooterText(user.business?.registrationStatus)
  const taxLabel = getTaxRateLabel()

  // --- ACCURATE HEIGHT CALCULATION ---
  const vPadding = PADDING * 2

  // 1. Receipt Slip Height
  const receiptHeader = 105
  const receiptInfo = 65
  const receiptFooter = 140 // Includes VAT breakdown and "Thank you"
  const receiptItemsHeight = data.items.reduce((acc, item) => {
    const itemLines = item.product.name.length > 22 ? 24 : 14 // Account for text wrap
    const addonsHeight = (item.addons?.length || 0) * 12
    return acc + itemLines + addonsHeight + 4 // 4 is marginBottom
  }, 0)

  const totalHeight = receiptHeader + receiptInfo + receiptItemsHeight + receiptFooter + vPadding + 20 // 20pt safety buffer

  let kitchenHeight = 0
  if (canCreateOrder) {
    const kitchenHeader = 80
    const kitchenFooter = 60
    const kitchenItemsHeight = data.items.reduce((acc, item) => {
      const itemLines = item.product.name.length > 18 ? 28 : 18
      const addonsHeight = (item.addons?.length || 0) * 12
      return acc + itemLines + addonsHeight + 8 // 8 is marginBottom
    }, 0)
    kitchenHeight = kitchenHeader + kitchenItemsHeight + kitchenFooter + vPadding + 20
  }

  return (
    <Document>
      {/* CUSTOMER RECEIPT */}
      <Page size={[PAGE_WIDTH, totalHeight]} style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.storeName}>{user?.branch.name}</Text>
          <Text style={styles.address}>{user?.branch.address}</Text>
          {complianceLines.map((line, index) => (
            <Text key={index} style={styles.address}>
              {line.label}: {line.value}
            </Text>
          ))}
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text>OR#:</Text>
          <Text>{transaction.invoiceNo}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text>Date:</Text>
          <Text>{dayjs(transaction.createdAt).format('DD/MM/YYYY HH:mm')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text>Cashier:</Text>
          <Text>{transaction.cashierId.slice(-6).toUpperCase()}</Text>
        </View>

        {/* If custom order tab references exist (like tables or buzzers), display them on the receipt */}
        {canCreateOrder && transaction.notes && (
          <View style={styles.infoRow}>
            <Text>Routing:</Text>
            <Text>{(transaction.notes as string).replace('Order Tab Ref: ', '')}</Text>
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.tableHeader}>
          <Text style={styles.columnItem}>DESCRIPTION</Text>
          <Text style={styles.columnQty}>QTY</Text>
          <Text style={styles.columnPrice}>AMOUNT</Text>
        </View>

        {data.items.map(item => (
          <View key={item.cartId} style={{ marginBottom: 4 }}>
            <View style={styles.row}>
              <Text style={styles.columnItem}>{[item.product.name, item.variant?.name ? `(${item.variant.name})` : ''].filter(Boolean).join(' ')}</Text>
              <Text style={styles.columnQty}>{item.quantity}</Text>
              <Text style={styles.columnPrice}>{PriceEngine.toDollars(Number(item.variant?.price) * item.quantity).toFixed(2)}</Text>
            </View>
            {item.variant?.sku && <Text style={{ fontSize: 7, color: '#888', paddingLeft: 2, marginTop: 1 }}>SKU: {item.variant.sku}</Text>}

            {item.addons?.map(addon => (
              <View key={addon.id} style={styles.addonRow}>
                <Text style={styles.columnItem}>+ {addon.material.product.name}</Text>
                <Text style={styles.columnQty}>1</Text>
                <Text style={styles.columnPrice}>{PriceEngine.toDollars(Number(addon.priceOverride)).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.divider} />

        <View style={styles.totalsContainer}>
          <View style={styles.infoRow}>
            <Text>Taxable Sales</Text>
            <Text>{PriceEngine.toDollars(transaction.totalAmount / (1 + (user.configs?.VAT_RATE ?? 0.12))).toFixed(2)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text>
              {taxLabel} Amount ({(user.configs?.VAT_RATE ?? 0.12) * 100}%)
            </Text>
            <Text>{PriceEngine.toDollars(transaction.taxAmount).toFixed(2)}</Text>
          </View>
          <View style={[styles.infoRow, styles.totalText]}>
            <Text>TOTAL AMOUNT</Text>
            <Text>
              {user?.configs?.CURRENCY} {PriceEngine.toDollars(transaction.totalAmount).toFixed(2)}
            </Text>
          </View>
          <View style={{ marginTop: 5, borderTopWidth: 0.5, borderTopStyle: 'dashed', paddingTop: 5 }}>
            <View style={styles.infoRow}>
              <Text>Payment Method:</Text>
              <Text>{payment?.method || 'CASH'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text>Tendered:</Text>
              <Text>{PriceEngine.toDollars(payment?.tendered || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text>Change:</Text>
              <Text>{PriceEngine.toDollars(payment?.change || 0).toFixed(2)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          {footerText.map((line, index) => (
            <Text key={index}>{line}</Text>
          ))}
        </View>
      </Page>

      {/* KITCHEN SLIP */}
      {canCreateOrder && (
        <Page size={[PAGE_WIDTH, kitchenHeight]} style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.kitchenTitle}>** ORDER SLIP **</Text>
            <Text style={styles.kitchenSub}>Order #{transaction.invoiceNo.slice(-6)}</Text>
            <Text>{dayjs(transaction.createdAt).format('hh:mm A')}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.tableHeader}>
            <Text style={{ flex: 4 }}>ITEM</Text>
            <Text style={{ flex: 1, textAlign: 'right' }}>QTY</Text>
          </View>

          {data.items.map(item => (
            <View key={item.cartId} style={{ marginBottom: 8, borderBottomWidth: 0.5, borderBottomColor: '#EEE', paddingBottom: 4 }}>
              <View style={styles.row}>
                <Text style={[styles.columnItem, styles.kitchenItem]}>
                  {[item.product.name, item.variant?.name ? `(${item.variant?.name})` : ''].filter(Boolean).join(' ')}
                </Text>
                <Text style={[styles.columnQty, styles.kitchenItem]}>{item.quantity}</Text>
              </View>

              {item.addons?.map(addon => (
                <View key={addon.id} style={styles.addonRow}>
                  <Text style={styles.kitchenAddon}>+ {addon.material.product.name}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.footer}>
            <Text>Prepared by: ________________</Text>
            <Text style={{ marginTop: 5 }}>{dayjs(transaction.createdAt).format('DD MMM YYYY')}</Text>
          </View>
        </Page>
      )}
    </Document>
  )
}
