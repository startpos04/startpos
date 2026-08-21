/**
 * bluetooth-printer.ts
 * 
 * Bluetooth ESC/POS printer integration for receipt printing and cash drawer control
 * Works on tablets, mobile devices, and desktops via Web Bluetooth API
 * 
 * Supports:
 * - Receipt printing with ESC/POS commands
 * - Cash drawer opening
 * - Bluetooth device pairing and connection
 */

// ESC/POS command bytes
const ESC = 0x1b
const GS = 0x1d

export class BluetoothPrinter {
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
  private encoder = new TextEncoder()

  /**
   * Check if Web Bluetooth API is supported
   */
  static isSupported(): boolean {
    return 'bluetooth' in navigator
  }

  /**
   * Connect to a Bluetooth printer
   * Opens device selection dialog for the user
   */
  async connect(): Promise<void> {
    if (!BluetoothPrinter.isSupported()) {
      throw new Error('Web Bluetooth API is not supported in this browser')
    }

    try {
      // Request Bluetooth device - shows browser's device picker
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // ESC/POS service
        ],
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Some printers use this
        ],
      })

      if (!this.device.gatt) {
        throw new Error('Device does not support GATT')
      }

      // Connect to GATT server
      const server = await this.device.gatt.connect()

      // Get primary service
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')

      // Get write characteristic
      this.characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb')

      // Listen for disconnection
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected)
    } catch (error) {
      console.error('Bluetooth connection failed:', error)
      throw new Error(`Failed to connect to printer: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Disconnect from the printer
   */
  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect()
    }
    this.device = null
    this.characteristic = null
  }

  /**
   * Check if printer is currently connected
   */
  isConnected(): boolean {
    return this.device?.gatt?.connected ?? false
  }

  /**
   * Get the connected device name
   */
  getDeviceName(): string | null {
    return this.device?.name ?? null
  }

  /**
   * Open the cash drawer
   * Sends ESC/POS command: ESC p m t1 t2
   * Default values: m=0, t1=25, t2=250 (standard cash drawer kick pulse)
   */
  async openCashDrawer(): Promise<void> {
    if (!this.isConnected() || !this.characteristic) {
      throw new Error('Printer not connected')
    }

    // ESC p 0 25 250 - Standard cash drawer open command
    const command = new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xfa])

    try {
      await this.characteristic.writeValue(command)
    } catch (error) {
      console.error('Failed to open cash drawer:', error)
      throw new Error('Failed to open cash drawer')
    }
  }

  /**
   * Print a text receipt
   * Uses ESC/POS commands for formatting
   */
  async printReceipt(lines: ReceiptLine[]): Promise<void> {
    if (!this.isConnected() || !this.characteristic) {
      throw new Error('Printer not connected')
    }

    try {
      // Initialize printer
      await this.sendCommand([ESC, 0x40]) // ESC @ - Initialize

      // Print each line
      for (const line of lines) {
        await this.printLine(line)
      }

      // Feed paper and cut
      await this.sendCommand([ESC, 0x64, 0x03]) // ESC d 3 - Feed 3 lines
      await this.sendCommand([GS, 0x56, 0x00]) // GS V 0 - Full cut

      console.log('Receipt printed successfully')
    } catch (error) {
      console.error('Failed to print receipt:', error)
      throw new Error('Failed to print receipt')
    }
  }

  /**
   * Print a single line with formatting
   */
  private async printLine(line: ReceiptLine): Promise<void> {
    const commands: number[] = []

    // Set alignment
    if (line.align === 'center') {
      commands.push(ESC, 0x61, 0x01) // ESC a 1 - Center
    } else if (line.align === 'right') {
      commands.push(ESC, 0x61, 0x02) // ESC a 2 - Right
    } else {
      commands.push(ESC, 0x61, 0x00) // ESC a 0 - Left
    }

    // Set text size
    if (line.size === 'large') {
      commands.push(GS, 0x21, 0x11) // GS ! 17 - Double height and width
    } else if (line.size === 'medium') {
      commands.push(GS, 0x21, 0x01) // GS ! 1 - Double height
    } else {
      commands.push(GS, 0x21, 0x00) // GS ! 0 - Normal
    }

    // Set bold
    if (line.bold) {
      commands.push(ESC, 0x45, 0x01) // ESC E 1 - Bold on
    }

    // Send formatting commands
    if (commands.length > 0) {
      await this.sendCommand(commands)
    }

    // Send text
    await this.sendText(line.text)

    // Reset formatting
    await this.sendCommand([ESC, 0x45, 0x00]) // ESC E 0 - Bold off
    await this.sendCommand([GS, 0x21, 0x00]) // GS ! 0 - Normal size

    // Line feed
    await this.sendText('\n')
  }

  /**
   * Send raw command bytes to printer
   */
  private async sendCommand(command: number[]): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Printer not connected')
    }

    const data = new Uint8Array(command)
    await this.characteristic.writeValue(data)
  }

  /**
   * Send text to printer
   */
  private async sendText(text: string): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Printer not connected')
    }

    const data = this.encoder.encode(text)
    await this.characteristic.writeValue(data)
  }

  /**
   * Handle disconnection event
   */
  private onDisconnected = () => {
    console.log('Bluetooth printer disconnected')
    this.characteristic = null
  }
}

// Receipt line interface
export interface ReceiptLine {
  text: string
  align?: 'left' | 'center' | 'right'
  size?: 'normal' | 'medium' | 'large'
  bold?: boolean
}

// Singleton instance for app-wide use
let printerInstance: BluetoothPrinter | null = null

/**
 * Get or create the global printer instance
 */
export function getBluetoothPrinter(): BluetoothPrinter {
  if (!printerInstance) {
    printerInstance = new BluetoothPrinter()
  }
  return printerInstance
}

/**
 * Helper function to check if we should use Bluetooth printing
 * Can be configured via system settings
 */
export function shouldUseBluetoothPrinter(): boolean {
  // Check if Bluetooth is supported
  if (!BluetoothPrinter.isSupported()) {
    return false
  }

  // Check if user has enabled Bluetooth printing in settings
  // For now, we'll check if a printer is connected
  const printer = getBluetoothPrinter()
  return printer.isConnected()
}
