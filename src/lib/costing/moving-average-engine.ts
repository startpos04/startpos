export class MovingAverageEngine {
  static consume(totalQty: number, avgCost: number, requiredQty: number) {
    if (requiredQty > totalQty + 0.000001) {
      throw new Error('Insufficient stock for moving average')
    }

    return {
      totalCost: requiredQty * avgCost,
      remainingQty: totalQty - requiredQty,
    }
  }
}
