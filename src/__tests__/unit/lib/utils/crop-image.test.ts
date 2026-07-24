/**
 * crop-image.test.ts
 *
 * Tests for getCroppedImg — dual-environment image cropper.
 *
 * Strategy:
 *  - Browser path: mock window.Image, document.createElement (canvas),
 *    and CanvasRenderingContext2D methods.  The test exercises the entire
 *    canvas pipeline by spying on drawImage / toDataURL.
 *  - Node path: delete window so the browser branch is skipped, then mock
 *    the 'jimp' module so Jimp.read() returns a controlled image object.
 *  - Each describe block restores window afterwards.
 *
 * Coverage:
 *  Browser path:
 *    - Returns string from canvas.toDataURL
 *    - Uses explicit pixelCrop (x, y, w, h) when provided
 *    - Auto-centers crop when no pixelCrop — wider source
 *    - Auto-centers crop when no pixelCrop — taller source
 *    - Auto-centers crop when no pixelCrop — square source (same aspect)
 *    - Passes custom targetWidth / targetHeight to canvas
 *    - Passes custom format and quality to toDataURL
 *    - Throws when canvas context returns null
 *
 *  Node path:
 *    - Returns base64 string from Jimp
 *    - Calls Jimp.crop with pixelCrop coordinates
 *    - Calls Jimp.resize with targetWidth / targetHeight
 *    - Auto-centers crop when no pixelCrop — wider Jimp image
 *    - Auto-centers crop when no pixelCrop — taller Jimp image
 *    - Uses jpeg mime when format is webp (Jimp limitation)
 *    - Uses png mime when format is image/png
 *
 * Run with: pnpm test crop-image
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers — build mock canvas / context
// ---------------------------------------------------------------------------

function makeMockCtx() {
  return {
    drawImage: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: '',
  }
}

function makeMockCanvas(ctx: ReturnType<typeof makeMockCtx>, dataUrl = 'data:image/webp;base64,FAKE') {
  return {
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => dataUrl),
    width: 0,
    height: 0,
  }
}

function makeMockImage(width = 800, height = 600) {
  const img: any = {
    setAttribute: vi.fn(),
    width,
    height,
    src: '',
    onload: null as (() => void) | null,
    onerror: null as ((e: any) => void) | null,
  }
  // When src is set, trigger onload on next tick
  Object.defineProperty(img, 'src', {
    set(value: string) {
      this._src = value
      // schedule onload
      Promise.resolve().then(() => this.onload?.())
    },
    get() { return this._src },
  })
  return img
}

// ---------------------------------------------------------------------------
// Browser environment setup
// ---------------------------------------------------------------------------

function setupBrowserEnv(imageW = 800, imageH = 600, dataUrl = 'data:image/webp;base64,FAKE') {
  const img = makeMockImage(imageW, imageH)
  const ctx = makeMockCtx()
  const canvas = makeMockCanvas(ctx, dataUrl)

  // Mock Image as a constructor (class mock)
  function ImageMock(this: any) { return img }
  const ImageMockFn = vi.fn().mockImplementation(function (this: any) { return img })

  // Mock document.createElement to return our canvas
  const createElementMock = vi.fn(() => canvas as any)

  Object.defineProperty(globalThis, 'window', {
    value: { document: {} },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: createElementMock },
    writable: true,
    configurable: true,
  })
  // Assign directly (not defineProperty) so the constructor check passes
  ;(globalThis as any).Image = ImageMockFn

  return { img, ctx, canvas, ImageMockFn, createElementMock }
}

function teardownBrowserEnv() {
  // Restore to jsdom's defaults by deleting our overrides
  // (jsdom has its own window/document so just let the test env handle it)
}

// ---------------------------------------------------------------------------
// Node environment setup — remove window so browser branch is skipped
// ---------------------------------------------------------------------------

let savedWindow: typeof globalThis.window

function setupNodeEnv() {
  savedWindow = globalThis.window
  // @ts-expect-error intentionally removing window for Node path
  delete globalThis.window
}

function teardownNodeEnv() {
  Object.defineProperty(globalThis, 'window', {
    value: savedWindow,
    writable: true,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// Jimp mock
// ---------------------------------------------------------------------------

const mockCrop = vi.fn()
const mockResize = vi.fn()
const mockGetBase64 = vi.fn(() => Promise.resolve('data:image/jpeg;base64,JIMPFAKE'))

function makeMockJimpImage(width = 800, height = 600) {
  return {
    bitmap: { width, height },
    crop: mockCrop,
    resize: mockResize,
    getBase64: mockGetBase64,
  }
}

vi.mock('jimp', () => ({
  Jimp: {
    read: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Post-mock import
// ---------------------------------------------------------------------------

import { getCroppedImg } from '@/lib/utils/crop-image'
import { Jimp } from 'jimp'

const mockJimpRead = vi.mocked(Jimp.read)

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBase64.mockResolvedValue('data:image/jpeg;base64,JIMPFAKE')
})

// ---------------------------------------------------------------------------
// Browser path
// ---------------------------------------------------------------------------

describe('getCroppedImg — browser path', () => {
  afterEach(() => {
    teardownBrowserEnv()
  })

  it('returns the data URL from canvas.toDataURL', async () => {
    const { canvas } = setupBrowserEnv()
    canvas.toDataURL.mockReturnValue('data:image/webp;base64,ABC')
    const result = await getCroppedImg('http://example.com/img.jpg')
    expect(result).toBe('data:image/webp;base64,ABC')
  })

  it('calls ctx.drawImage with explicit pixelCrop values', async () => {
    const { ctx } = setupBrowserEnv(800, 600)
    const pixelCrop = { x: 10, y: 20, width: 300, height: 200 }
    await getCroppedImg('http://example.com/img.jpg', pixelCrop)
    expect(ctx.drawImage).toHaveBeenCalledOnce()
    const args = ctx.drawImage.mock.calls[0] as any[]
    // args: [image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight]
    expect(args[1]).toBe(10)  // cropX
    expect(args[2]).toBe(20)  // cropY
    expect(args[3]).toBe(300) // cropW
    expect(args[4]).toBe(200) // cropH
  })

  it('uses full image dimensions when no pixelCrop provided', async () => {
    const { ctx } = setupBrowserEnv(800, 600) // square-ish, same aspect
    await getCroppedImg('http://example.com/img.jpg')
    expect(ctx.drawImage).toHaveBeenCalledOnce()
    // cropX and cropY should be 0
    const args = ctx.drawImage.mock.calls[0] as any[]
    expect(args[1]).toBe(0) // cropX
    expect(args[2]).toBe(0) // cropY
  })

  it('auto-crops width for wider source (landscape vs square target)', async () => {
    // Source: 1200×600 (aspect 2:1), target: 600×600 (aspect 1:1)
    // Expected: cropW = height * targetAspect = 600 * 1 = 600 (narrower than full width)
    const { ctx } = setupBrowserEnv(1200, 600)
    await getCroppedImg('http://example.com/img.jpg', undefined, { targetWidth: 600, targetHeight: 600 })
    const args = ctx.drawImage.mock.calls[0] as any[]
    expect(args[3]).toBe(600)  // cropW = image.height * targetAspect
    expect(args[4]).toBe(600)  // cropH = image.height (unchanged)
  })

  it('auto-crops height for taller source (portrait vs square target)', async () => {
    // Source: 600×1200 (aspect 0.5:1), target: 600×600 (aspect 1:1)
    // Expected: cropH = image.width / targetAspect = 600 / 1 = 600
    const { ctx } = setupBrowserEnv(600, 1200)
    await getCroppedImg('http://example.com/img.jpg', undefined, { targetWidth: 600, targetHeight: 600 })
    const args = ctx.drawImage.mock.calls[0] as any[]
    expect(args[3]).toBe(600)  // cropW = image.width (unchanged)
    expect(args[4]).toBe(600)  // cropH = image.width / targetAspect
  })

  it('sets canvas dimensions to targetWidth and targetHeight', async () => {
    const { canvas } = setupBrowserEnv()
    await getCroppedImg('http://example.com/img.jpg', undefined, { targetWidth: 300, targetHeight: 200 })
    expect(canvas.width).toBe(300)
    expect(canvas.height).toBe(200)
  })

  it('passes custom format and quality to toDataURL', async () => {
    const { canvas } = setupBrowserEnv()
    await getCroppedImg('http://example.com/img.jpg', undefined, { format: 'image/jpeg', quality: 0.7 })
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7)
  })

  it('uses default format=image/webp and quality=0.9 when not specified', async () => {
    const { canvas } = setupBrowserEnv()
    await getCroppedImg('http://example.com/img.jpg')
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/webp', 0.9)
  })

  it('throws when canvas.getContext returns null', async () => {
    const { canvas } = setupBrowserEnv()
    canvas.getContext.mockReturnValue(null)
    await expect(getCroppedImg('http://example.com/img.jpg')).rejects.toThrow('Could not get 2D Canvas context.')
  })
})

// ---------------------------------------------------------------------------
// Node / Jimp path
// ---------------------------------------------------------------------------

describe('getCroppedImg — Node/Jimp path', () => {
  beforeEach(() => {
    setupNodeEnv()
    mockCrop.mockReturnThis()
    mockResize.mockReturnThis()
  })

  afterEach(() => {
    teardownNodeEnv()
  })

  it('returns a base64 string from Jimp.getBase64', async () => {
    mockJimpRead.mockResolvedValue(makeMockJimpImage() as any)
    const result = await getCroppedImg('path/to/image.jpg')
    expect(result).toBe('data:image/jpeg;base64,JIMPFAKE')
  })

  it('calls Jimp.read with the imageSrc', async () => {
    mockJimpRead.mockResolvedValue(makeMockJimpImage() as any)
    await getCroppedImg('path/to/image.jpg')
    expect(mockJimpRead).toHaveBeenCalledWith('path/to/image.jpg')
  })

  it('calls image.crop with pixelCrop coordinates', async () => {
    mockJimpRead.mockResolvedValue(makeMockJimpImage() as any)
    const pixelCrop = { x: 10, y: 20, width: 300, height: 200 }
    await getCroppedImg('path/to/image.jpg', pixelCrop)
    expect(mockCrop).toHaveBeenCalledWith({ x: 10, y: 20, w: 300, h: 200 })
  })

  it('calls image.resize with targetWidth and targetHeight', async () => {
    mockJimpRead.mockResolvedValue(makeMockJimpImage() as any)
    await getCroppedImg('path/to/image.jpg', { x: 0, y: 0, width: 300, height: 300 }, { targetWidth: 400, targetHeight: 400 })
    expect(mockResize).toHaveBeenCalledWith({ w: 400, h: 400 })
  })

  it('auto-crops width for wider Jimp image (landscape vs square target)', async () => {
    // Source: 1200×600, target: 600×600
    // cropW = height * targetAspect = 600 * 1 = 600, cropX = (1200 - 600) / 2 = 300
    mockJimpRead.mockResolvedValue(makeMockJimpImage(1200, 600) as any)
    await getCroppedImg('path/to/image.jpg', undefined, { targetWidth: 600, targetHeight: 600 })
    expect(mockCrop).toHaveBeenCalledWith({ x: 300, y: 0, w: 600, h: 600 })
  })

  it('auto-crops height for taller Jimp image (portrait vs square target)', async () => {
    // Source: 600×1200, target: 600×600
    // cropH = width / targetAspect = 600 / 1 = 600, cropY = (1200 - 600) / 2 = 300
    mockJimpRead.mockResolvedValue(makeMockJimpImage(600, 1200) as any)
    await getCroppedImg('path/to/image.jpg', undefined, { targetWidth: 600, targetHeight: 600 })
    expect(mockCrop).toHaveBeenCalledWith({ x: 0, y: 300, w: 600, h: 600 })
  })

  it('uses image/jpeg mime for webp format (Jimp limitation)', async () => {
    mockJimpRead.mockResolvedValue(makeMockJimpImage() as any)
    await getCroppedImg('path/to/image.jpg', undefined, { format: 'image/webp' })
    expect(mockGetBase64).toHaveBeenCalledWith('image/jpeg')
  })

  it('uses image/jpeg mime for jpeg format', async () => {
    mockJimpRead.mockResolvedValue(makeMockJimpImage() as any)
    await getCroppedImg('path/to/image.jpg', undefined, { format: 'image/jpeg' })
    expect(mockGetBase64).toHaveBeenCalledWith('image/jpeg')
  })

  it('uses image/png mime when format is image/png', async () => {
    mockJimpRead.mockResolvedValue(makeMockJimpImage() as any)
    await getCroppedImg('path/to/image.jpg', undefined, { format: 'image/png' })
    expect(mockGetBase64).toHaveBeenCalledWith('image/png')
  })
})
