import { useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider' // Shadcn Slider
import type { OverlayProps } from '@/lib/overlay'
import { getCroppedImg } from '@/lib/utils/crop-image'

interface CropImageProps extends OverlayProps {
  tempImage: string
  onCrop: (croppedBase64: string) => void
}

export function CropImage({ open, onClose, tempImage, onCrop }: CropImageProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const handleSaveCrop = async () => {
    if (tempImage && croppedAreaPixels) {
      try {
        // Enforce consistent 600x600 square export structure
        const croppedBase64 = await getCroppedImg(tempImage, croppedAreaPixels, {
          targetWidth: 600,
          targetHeight: 600,
          format: 'image/webp',
          quality: 0.9,
        })

        onCrop(croppedBase64)
        onClose()
      } catch (error) {
        console.error('Failed to generate cropped profile image:', error)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-125 p-0 overflow-hidden border-none rounded-[2rem]'>
        <DialogHeader className='p-6 pb-0'>
          <DialogTitle>Adjust Image</DialogTitle>
        </DialogHeader>

        <div className='relative h-75 w-full bg-slate-900 mt-4'>
          {tempImage && (
            <Cropper
              image={tempImage}
              crop={crop}
              zoom={zoom}
              aspect={1} // 1 for square, 16/9 for wide
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
            />
          )}
        </div>

        <div className='p-6 space-y-4'>
          <div className='space-y-2'>
            <label htmlFor='zoom-slider' className='text-xs text-muted-foreground uppercase font-bold'>
              Zoom
            </label>
            <Slider id='zoom-slider' value={[zoom]} min={1} max={3} step={0.1} onValueChange={([val]) => setZoom(Number(val))} />
          </div>
          <DialogFooter className='gap-2'>
            <Button variant='ghost' onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSaveCrop} className='rounded-xl px-8'>
              Apply Crop
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
