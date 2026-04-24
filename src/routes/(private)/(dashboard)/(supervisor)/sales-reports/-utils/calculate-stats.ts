import dayjs from '@/lib/dayjs'
import { TransactionReport } from './fetch-transaction-reports'

export const calculateStats = (transactions: TransactionReport[]) => {
  const totalRevenue = transactions.reduce((acc, curr) => acc + curr.totalAmount, 0)
  const totalCost = transactions.reduce((acc, curr) => acc + curr.totalCost, 0)
  const grossProfit = totalRevenue - totalCost
  const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // 2. Maps for specific charts
  const productMap: Record<string, { name: string; qty: number; revenue: number }> = {}
  const cashierMap: Record<string, { name: string; total: number; count: number }> = {}

  // Hourly trend (24-hour slots)
  const hourMap = Array.from({ length: 24 }, (_, i) => ({
    time: `${i === 0 ? 12 : i > 12 ? i - 12 : i}${i >= 12 ? 'PM' : 'AM'}`,
    amount: 0,
    hour: i,
  }))

  // Daily trend for Revenue vs Cost Chart
  const dailyMap: Record<string, { date: string; revenue: number; cost: number }> = {}

  transactions.forEach(tx => {
    const dateKey = dayjs(tx.createdAt).format('MMM DD')
    const hour = dayjs(tx.createdAt).hour()

    // Aggregate Daily
    if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, revenue: 0, cost: 0 }
    dailyMap[dateKey].revenue += tx.totalAmount / 100
    dailyMap[dateKey].cost += tx.totalCost / 100

    // Aggregate Hourly
    if (hourMap[hour]) hourMap[hour].amount += tx.totalAmount / 100

    // Aggregate Cashier
    if (!cashierMap[tx.cashierId]) {
      cashierMap[tx.cashierId] = { name: tx.cashier.name, total: 0, count: 0 }
    }

    cashierMap[tx.cashierId]!.total += tx.totalAmount / 100
    cashierMap[tx.cashierId]!.count += 1

    // Aggregate Products
    tx.order.items.forEach(item => {
      const key = item.variantId
      if (!productMap[key]) {
        productMap[key] = { name: item.variant.product.name, qty: 0, revenue: 0 }
      }
      productMap[key].qty += item.quantity
      productMap[key].revenue += (item.unitPrice * item.quantity) / 100
    })
  })

  return {
    totalRevenue,
    totalCost,
    grossProfit,
    margin,
    chartData: Object.values(dailyMap).reverse(),
    activeHours: hourMap.filter(h => h.hour >= 6 && h.hour <= 23),
    topCashiers: Object.values(cashierMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4),
    topProducts: Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
  }
}

export type TransactionReportStats = ReturnType<typeof calculateStats>
