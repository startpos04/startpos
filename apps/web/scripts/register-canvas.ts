// fallow-ignore-file unused-file
// Optional Node polyfill for @react-pdf/renderer (browser APIs in server-side scripts).
// Do NOT import this for database seeding — seeders do not use canvas or react-pdf.
// Usage: tsx --import ./scripts/register-canvas.ts your-script.ts
// Requires native canvas (Linux/Docker dev image has cairo libs; Windows often does not).
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
    throw new Error(`Unsupported element creation: ${type}`)
  },
}
