/**
 * Device Identifier - Generates and persists unique device IDs for offline mode tracking
 * 
 * Used for:
 * - Offline mode single-cashier restriction
 * - Sequence number audit trail
 * - Multi-device conflict detection
 */

export const DeviceIdentifier = {
  /**
   * Gets or generates a persistent device ID stored in localStorage
   * Format: device_{timestamp}_{random}_{fingerprint}
   */
  getDeviceId(): string {
    const key = 'pos_device_id'
    let deviceId = localStorage.getItem(key)

    if (!deviceId) {
      // Generate unique ID: timestamp + random + browser fingerprint
      const timestamp = Date.now().toString(36)
      const random = Math.random().toString(36).substring(2, 15)
      const fingerprint = this.getBrowserFingerprint()

      deviceId = `device_${timestamp}_${random}_${fingerprint}`
      localStorage.setItem(key, deviceId)
    }

    return deviceId
  },

  /**
   * Generates a simple browser fingerprint for device identification
   * NOT for security - just for distinguishing between different devices/browsers
   */
  getBrowserFingerprint(): string {
    const nav = navigator
    const screen = window.screen

    const components = [
      nav.userAgent,
      nav.language,
      screen.colorDepth.toString(),
      screen.width.toString(),
      screen.height.toString(),
      new Date().getTimezoneOffset().toString(),
    ]

    // Simple hash function
    const str = components.join('|')
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }

    return Math.abs(hash).toString(36).substring(0, 8)
  },

  /**
   * Clears the persisted device ID (useful for testing or troubleshooting)
   */
  clearDeviceId(): void {
    localStorage.removeItem('pos_device_id')
  },
}
