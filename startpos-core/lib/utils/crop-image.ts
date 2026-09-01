import type { Area } from 'react-easy-crop'

interface CropOptions {
  targetWidth?: number
  targetHeight?: number
  format?: 'image/jpeg' | 'image/png' | 'image/webp'
  quality?: number
}

/**
 * A truly unified, cross-platform image cropper.
 * Uses standard HTML5 Canvas on the client-side browser, and fallback
 * native JS (Jimp) on Windows / Server-side seeders.
 */
export async function getCroppedImg(imageSrc: string, pixelCrop?: Area, options: CropOptions = {}): Promise<string> {
  const { targetWidth = 600, targetHeight = 600, format = 'image/webp', quality = 0.9 } = options

  // =========================================================================
  // ENVIRONMENT 1: THE BROWSER (Standard Pure HTML5 Canvas Pipeline)
  // =========================================================================
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const image = new Image()
    image.setAttribute('crossOrigin', 'anonymous')

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = err => reject(err)
      image.src = imageSrc
    })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D Canvas context.')

    canvas.width = targetWidth
    canvas.height = targetHeight
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const cropX = pixelCrop?.x ?? 0
    const cropY = pixelCrop?.y ?? 0
    let cropW = pixelCrop?.width ?? image.width
    let cropH = pixelCrop?.height ?? image.height

    if (!pixelCrop) {
      const srcAspect = image.width / image.height
      const targetAspect = targetWidth / targetHeight
      if (srcAspect > targetAspect) {
        cropW = image.height * targetAspect
      } else if (srcAspect < targetAspect) {
        cropH = image.width / targetAspect
      }
    }

    const scale = Math.min(targetWidth / cropW, targetHeight / cropH)
    const destWidth = cropW * scale
    const destHeight = cropH * scale
    const destX = (targetWidth - destWidth) / 2
    const destY = (targetHeight - destHeight) / 2

    ctx.drawImage(image, cropX, cropY, cropW, cropH, destX, destY, destWidth, destHeight)
    return canvas.toDataURL(format, quality)
  }

  // =========================================================================
  // ENVIRONMENT 2: NODE.JS / SEEDER (Pure JS Jimp Processing Layer)
  // =========================================================================
  const { Jimp } = await import('jimp')
  const image = await Jimp.read(imageSrc)

  let cropX = pixelCrop?.x ?? 0
  let cropY = pixelCrop?.y ?? 0
  let cropW = pixelCrop?.width ?? image.bitmap.width
  let cropH = pixelCrop?.height ?? image.bitmap.height

  if (!pixelCrop) {
    const srcAspect = image.bitmap.width / image.bitmap.height
    const targetAspect = targetWidth / targetHeight
    if (srcAspect > targetAspect) {
      cropW = image.bitmap.height * targetAspect
      cropX = (image.bitmap.width - cropW) / 2
    } else if (srcAspect < targetAspect) {
      cropH = image.bitmap.width / targetAspect
      cropY = (image.bitmap.height - cropH) / 2
    }
  }

  image.crop({ x: Math.round(cropX), y: Math.round(cropY), w: Math.round(cropW), h: Math.round(cropH) })
  image.resize({ w: targetWidth, h: targetHeight })

  // Since Node Jimp doesn't natively do webp without extra plugins, export as image/jpeg or image/png for the seeder base64
  const mimeType = format === 'image/png' ? 'image/png' : 'image/jpeg'
  return await image.getBase64(mimeType)
}
