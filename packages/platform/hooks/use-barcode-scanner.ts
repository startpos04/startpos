import { useEffect, useRef, useState } from 'react'

export interface BarcodeScannerOptions {
  /**
   * Minimum time between characters in milliseconds to be considered a scan
   * Barcode scanners typically type much faster than humans
   * @default 50
   */
  minCharacterInterval?: number

  /**
   * Maximum time to wait for scan completion in milliseconds
   * @default 100
   */
  scanTimeout?: number

  /**
   * Minimum length of barcode to be considered valid
   * @default 3
   */
  minLength?: number

  /**
   * Character that indicates end of scan (some scanners send Enter)
   * @default 'Enter'
   */
  endCharacter?: string

  /**
   * Callback when a valid barcode is scanned
   */
  onScan: (barcode: string) => void

  /**
   * Callback when scan fails validation
   */
  onError?: (error: string) => void

  /**
   * Whether the scanner is enabled
   * @default true
   */
  enabled?: boolean
}

/**
 * Hook for detecting barcode scanner input
 *
 * Barcode scanners work by rapidly typing characters as if from a keyboard.
 * This hook detects that rapid input pattern and distinguishes it from manual typing.
 *
 * @example
 * ```tsx
 * useBarcodeScanner({
 *   onScan: (barcode) => {
 *     console.log('Scanned:', barcode)
 *   },
 *   onError: (error) => {
 *     console.error('Scan error:', error)
 *   }
 * })
 * ```
 */
export function useBarcodeScanner(options: BarcodeScannerOptions) {
  const { minCharacterInterval = 50, scanTimeout = 100, minLength = 3, endCharacter = 'Enter', onScan, onError, enabled = true } = options

  const bufferRef = useRef<string>('')
  const lastKeyTimeRef = useRef<number>(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  useEffect(() => {
    if (!enabled) return

    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input field (except our barcode input)
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Allow if it's specifically marked as barcode input
        if (!target.dataset.barcodeInput) {
          return
        }
      }

      const currentTime = Date.now()
      const timeSinceLastKey = currentTime - lastKeyTimeRef.current

      // If this is the end character (Enter), process the buffer
      if (event.key === endCharacter) {
        event.preventDefault()
        processScan()
        return
      }

      // Reset buffer if too much time has passed (human typing speed)
      if (timeSinceLastKey > minCharacterInterval && bufferRef.current.length > 0) {
        bufferRef.current = ''
      }

      // Only capture printable characters
      if (event.key.length === 1) {
        event.preventDefault()
        bufferRef.current += event.key
        lastKeyTimeRef.current = currentTime
        setIsScanning(true)

        // Clear existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }

        // Set new timeout to process scan
        timeoutRef.current = setTimeout(() => {
          processScan()
        }, scanTimeout)
      }
    }

    const processScan = () => {
      const scannedValue = bufferRef.current.trim()

      if (scannedValue.length >= minLength) {
        onScan(scannedValue)
      } else if (scannedValue.length > 0) {
        onError?.(`Barcode too short: ${scannedValue.length} characters (minimum: ${minLength})`)
      }

      // Reset
      bufferRef.current = ''
      setIsScanning(false)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    // Add event listener
    window.addEventListener('keypress', handleKeyPress)

    // Cleanup
    return () => {
      window.removeEventListener('keypress', handleKeyPress)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [enabled, minCharacterInterval, scanTimeout, minLength, endCharacter, onScan, onError])

  return { isScanning }
}
