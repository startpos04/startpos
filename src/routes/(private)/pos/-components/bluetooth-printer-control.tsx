/**
 * bluetooth-printer-control.tsx
 *
 * UI component for connecting and managing Bluetooth printer/cash drawer
 * Shows connection status and provides manual drawer open button
 */

import { Bluetooth, BluetoothConnected, DollarSign } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@startpos-core/components/ui/button'
import { BluetoothPrinter, getBluetoothPrinter } from '@/lib/bluetooth-printer'

export function BluetoothPrinterControl() {
  const [printer] = useState(() => getBluetoothPrinter())
  const [isConnected, setIsConnected] = useState(false)
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isOpening, setIsOpening] = useState(false)

  // Check if Web Bluetooth is supported
  const isSupported = BluetoothPrinter.isSupported()

  useEffect(() => {
    // Check initial connection status
    setIsConnected(printer.isConnected())
    setDeviceName(printer.getDeviceName())
  }, [printer])

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      await printer.connect()
      setIsConnected(true)
      setDeviceName(printer.getDeviceName())
      toast.success('Bluetooth printer connected', {
        description: printer.getDeviceName() || 'Device connected successfully',
      })
    } catch (error) {
      console.error('Connection failed:', error)
      toast.error('Failed to connect', {
        description: error instanceof Error ? error.message : 'Could not connect to printer',
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await printer.disconnect()
      setIsConnected(false)
      setDeviceName(null)
      toast.info('Printer disconnected')
    } catch (error) {
      console.error('Disconnection failed:', error)
      toast.error('Failed to disconnect')
    }
  }

  const handleOpenDrawer = async () => {
    if (!isConnected) {
      toast.error('Printer not connected', {
        description: 'Please connect to a Bluetooth printer first',
      })
      return
    }

    setIsOpening(true)
    try {
      await printer.openCashDrawer()
      toast.success('Cash drawer opened')
    } catch (error) {
      console.error('Failed to open drawer:', error)
      toast.error('Failed to open drawer', {
        description: error instanceof Error ? error.message : 'Could not open cash drawer',
      })
    } finally {
      setIsOpening(false)
    }
  }

  if (!isSupported) {
    return null // Hide if Bluetooth not supported
  }

  return (
    <div className='flex items-center gap-2'>
      {/* Connection Status & Button */}
      {isConnected ? (
        <>
          <Button variant='outline' size='sm' onClick={handleDisconnect} className='gap-2 text-xs'>
            <BluetoothConnected className='w-4 h-4 text-blue-500' />
            <span className='hidden md:inline'>{deviceName || 'Connected'}</span>
          </Button>

          {/* Open Drawer Button */}
          <Button variant='outline' size='sm' onClick={handleOpenDrawer} disabled={isOpening} className='gap-2 text-xs' title='Open cash drawer'>
            <DollarSign className='w-4 h-4' />
            <span className='hidden md:inline'>{isOpening ? 'Opening...' : 'Open Drawer'}</span>
          </Button>
        </>
      ) : (
        <Button variant='outline' size='sm' onClick={handleConnect} disabled={isConnecting} className='gap-2 text-xs'>
          <Bluetooth className='w-4 h-4' />
          <span className='hidden md:inline'>{isConnecting ? 'Connecting...' : 'Connect Printer'}</span>
        </Button>
      )}
    </div>
  )
}
