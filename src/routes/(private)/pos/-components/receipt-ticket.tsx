import { VAT_RATE } from '@/lib/constants'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import { CreatePosTransactionResponse } from '@/lib/server-fn/create-pos-transaction'
import { authStore } from '@/store/auth-store'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { useStore } from '@tanstack/react-store'
import { posFormOpts } from '..'

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

export const ReceiptPDF = ({ transaction, data }: { transaction: CreatePosTransactionResponse; data: NonNullable<(typeof posFormOpts)['defaultValues']> }) => {
  const user = useStore(authStore, state => state.user)
  const t = transaction.data
  const payment = t.payments?.[0]

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

  // 2. Kitchen Slip Height (Larger fonts)
  const kitchenHeader = 80
  const kitchenFooter = 60
  const kitchenItemsHeight = data.items.reduce((acc, item) => {
    const itemLines = item.product.name.length > 18 ? 28 : 18
    const addonsHeight = (item.addons?.length || 0) * 12
    return acc + itemLines + addonsHeight + 8 // 8 is marginBottom
  }, 0)

  const kitchenHeight = kitchenHeader + kitchenItemsHeight + kitchenFooter + vPadding + 20

  return (
    <Document>
      {/* CUSTOMER RECEIPT */}
      <Page size={[PAGE_WIDTH, totalHeight]} style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.storeName}>{user?.branch.name}</Text>
          <Text style={styles.address}>{user?.branch.address}</Text>
          <Text style={styles.address}>VAT REG TIN: {user?.organization.tin}</Text>
          <Text style={styles.address}>SN: {user?.branch.serialNumber}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text>OR#:</Text>
          <Text>{t.invoiceNo}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text>Date:</Text>
          <Text>{dayjs(t.createdAt).format('DD/MM/YYYY HH:mm')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text>Cashier:</Text>
          <Text>{t.cashierId.slice(-6).toUpperCase()}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.tableHeader}>
          <Text style={styles.columnItem}>DESCRIPTION</Text>
          <Text style={styles.columnQty}>QTY</Text>
          <Text style={styles.columnPrice}>AMOUNT</Text>
        </View>

        {data.items.map((item, i) => (
          <View key={i} style={{ marginBottom: 4 }}>
            <View style={styles.row}>
              <Text style={styles.columnItem}>{[item.product.name, item.variant?.name ? `(${item.variant.name})` : ''].filter(Boolean).join(' ')}</Text>
              <Text style={styles.columnQty}>{item.quantity}</Text>
              <Text style={styles.columnPrice}>{PriceEngine.toDollars(Number(item.variant?.price) * item.quantity).toFixed(2)}</Text>
            </View>

            {item.addons?.map((addon, ai) => (
              <View key={ai} style={styles.addonRow}>
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
            <Text>Vatable Sales</Text>
            <Text>{PriceEngine.toDollars(t.totalAmount / 1.12).toFixed(2)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text>VAT Amount ({VAT_RATE * 100}%)</Text>
            <Text>{PriceEngine.toDollars(t.taxAmount).toFixed(2)}</Text>
          </View>
          <View style={[styles.infoRow, styles.totalText]}>
            <Text>TOTAL AMOUNT</Text>
            <Text>
              {user?.branch.currency} {PriceEngine.toDollars(t.totalAmount).toFixed(2)}
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
          <Text>THIS SERVES AS YOUR SALES INVOICE</Text>
          <Text>Thank you for shopping!</Text>
          <Text>Please come again.</Text>
        </View>
      </Page>

      {/* KITCHEN SLIP */}
      <Page size={[PAGE_WIDTH, kitchenHeight]} style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.kitchenTitle}>** ORDER SLIP **</Text>
          <Text style={styles.kitchenSub}>Order #{t.invoiceNo.slice(-6)}</Text>
          <Text>{dayjs(t.createdAt).format('hh:mm A')}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.tableHeader}>
          <Text style={{ flex: 4 }}>ITEM</Text>
          <Text style={{ flex: 1, textAlign: 'right' }}>QTY</Text>
        </View>

        {data.items.map((item, i) => (
          <View key={i} style={{ marginBottom: 8, borderBottomWidth: 0.5, borderBottomColor: '#EEE', paddingBottom: 4 }}>
            <View style={styles.row}>
              <Text style={[styles.columnItem, styles.kitchenItem]}>
                {[item.product.name, item.variant?.name ? `(${item.variant?.name})` : ''].filter(Boolean).join(' ')}
              </Text>
              <Text style={[styles.columnQty, styles.kitchenItem]}>{item.quantity}</Text>
            </View>

            {item.addons?.map((addon, ai) => (
              <View key={ai} style={styles.addonRow}>
                <Text style={styles.kitchenAddon}>+ {addon.material.product.name}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.divider} />

        <View style={styles.footer}>
          <Text>Prepared by: ________________</Text>
          <Text style={{ marginTop: 5 }}>{dayjs(t.createdAt).format('DD MMM YYYY')}</Text>
        </View>
      </Page>
    </Document>
  )
}
