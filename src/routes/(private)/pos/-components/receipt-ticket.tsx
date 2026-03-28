import dayjs from '@/lib/dayjs'
import { CreatePosTransactionResponse } from '@/lib/server-fn/create-pos-transaction'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { posFormOpts } from '..'

const styles = StyleSheet.create({
  page: {
    padding: 15,
    fontSize: 9,
    fontFamily: 'Courier', // Standard receipt font
    backgroundColor: '#FFFFFF',
  },
  header: { textAlign: 'center', marginBottom: 10 },
  storeName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  address: { fontSize: 8, marginBottom: 10 },

  divider: { borderBottomWidth: 1, borderBottomColor: '#000', borderBottomStyle: 'dashed', marginVertical: 5 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },

  tableHeader: { flexDirection: 'row', fontWeight: 'bold', marginTop: 5 },
  row: { flexDirection: 'row', paddingVertical: 2 },
  columnItem: { flex: 3 },
  columnQty: { flex: 0.5, textAlign: 'center' },
  columnPrice: { flex: 1.5, textAlign: 'right' },

  // Addon Styling
  addonRow: { flexDirection: 'row', paddingLeft: 10, fontSize: 8, color: '#444' },

  totalsContainer: { marginTop: 10, borderTopWidth: 1, borderTopStyle: 'dashed', paddingTop: 5 },
  totalText: { fontSize: 11, fontWeight: 'bold' },
  footer: { textAlign: 'center', marginTop: 15, fontSize: 8 },
})

export const ReceiptPDF = ({ transaction, data }: { transaction: CreatePosTransactionResponse; data: NonNullable<(typeof posFormOpts)['defaultValues']> }) => {
  const t = transaction.data

  // --- DYNAMIC HEIGHT CALCULATION (in points) ---
  const headerHeight = 120 // Store name, address, TIN
  const infoHeight = 60 // OR#, Date, Cashier
  const footerHeight = 100 // VAT breakdown, Thank you

  // Estimate height per item line (approx 20pt)
  // and per addon line (approx 12pt)
  const itemsHeight = data.items.reduce((acc: number, item: any) => {
    const addonsCount = item.addons?.length || 0
    return acc + 20 + addonsCount * 12
  }, 0)

  const totalHeight = headerHeight + infoHeight + itemsHeight + footerHeight

  return (
    <Document>
      <Page size={[204, totalHeight]} style={styles.page}>
        {/* Header - Typical PH Style */}
        <View style={styles.header}>
          <Text style={styles.storeName}>YOUR STORE NAME</Text>
          <Text style={styles.address}>123 Rizal Ave, Makati City</Text>
          <Text style={styles.address}>VAT REG TIN: 000-123-456-000</Text>
          <Text style={styles.address}>SN: {t.invoiceNo}</Text>
        </View>

        <View style={styles.divider} />

        {/* Transaction Info */}
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

        {/* Items Table */}
        <View style={styles.tableHeader}>
          <Text style={styles.columnItem}>DESCRIPTION</Text>
          <Text style={styles.columnQty}>QTY</Text>
          <Text style={styles.columnPrice}>AMOUNT</Text>
        </View>

        {data.items.map((item, i) => (
          <View key={i} style={{ marginBottom: 4 }}>
            <View style={styles.row}>
              <Text style={styles.columnItem}>
                {item.product.name}
                {item.variant ? ` (${item.variant.name})` : ''}
              </Text>
              <Text style={styles.columnQty}>{item.quantity}</Text>
              <Text style={styles.columnPrice}>{(Number(item.variant?.price || item.product.price) * item.quantity).toFixed(2)}</Text>
            </View>

            {/* Render Add-ons */}
            {item.addons?.map((addon, ai) => (
              <View key={ai} style={styles.addonRow}>
                <Text style={styles.columnItem}>+ {addon.addon.name}</Text>
                <Text style={styles.columnQty}>1</Text>
                <Text style={styles.columnPrice}>{Number(addon.priceOverride).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.divider} />

        {/* Totals & VAT Breakdown (PH Requirement) */}
        <View style={styles.totalsContainer}>
          <View style={styles.infoRow}>
            <Text>Vatable Sales</Text>
            <Text>{(t.totalAmount / 1.12).toFixed(2)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text>VAT Amount (12%)</Text>
            <Text>{t.taxAmount.toFixed(2)}</Text>
          </View>
          <View style={[styles.infoRow, styles.totalText]}>
            <Text>TOTAL AMOUNT</Text>
            <Text>PHP {t.totalAmount.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>THIS SERVES AS YOUR SALES INVOICE</Text>
          <Text>Thank you for shopping!</Text>
          <Text>Please come again.</Text>
        </View>
      </Page>
    </Document>
  )
}
