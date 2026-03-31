export class MovingAverageEngine {
  static computeAverage(totalQty: number, totalValue: number) {
    if (totalQty === 0) {
      throw new Error('No inventory available')
    }

    return totalValue / totalQty
  }

  static consume(totalQty: number, avgCost: number, requiredQty: number) {
    if (requiredQty > totalQty) {
      throw new Error('Insufficient stock')
    }

    return {
      totalCost: requiredQty * avgCost,
      remainingQty: totalQty - requiredQty,
    }
  }
}
