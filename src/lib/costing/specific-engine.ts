export class SpecificEngine {
  static consume(
    batches: {
      batchId: string
      quantity: number
      costPrice: number
    }[],
  ) {
    let totalCost = 0

    for (const b of batches) {
      totalCost += b.quantity * b.costPrice
    }

    return { totalCost }
  }
}
