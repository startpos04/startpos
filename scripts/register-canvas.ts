// fallow-ignore-file unused-file
import { Image as CanvasImage, createCanvas } from 'canvas'

const globalAny = globalThis as unknown as {
  Image: unknown
  document: unknown
}

globalAny.Image = CanvasImage

globalAny.document = {
  createElement: (type: string) => {
    if (type === 'canvas') {
      return createCanvas(1, 1)
    }
    throw new Error(`Unsupported element creation in seeder: ${type}`)
  },
}
