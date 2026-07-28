import { Camera, Image as ImageIcon, Upload, X } from 'lucide-react'
import { type MouseEvent, useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import MountManager from '@/lib/mount-manager'
import { cn } from '@/lib/utils'
import { CameraCapture } from './camera-capture'
import { CropImage } from './crop-image'

interface ImageUploaderProps {
  label: string
  value?: string
  onChange: (val: string) => void
}

export function ImageUploader({ label, value, onChange }: ImageUploaderProps) {
  const [isCameraOpen, setIsCameraOpen] = useState(false)

  const handleCameraCapture = useCallback(
    (tempImage: string) => {
      MountManager.show(CropImage, { tempImage, onCrop: onChange })
      setIsCameraOpen(false)
    },
    [onChange],
  )

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        handleCameraCapture(reader.result as string)
      }
      reader.readAsDataURL(file)
    },
    [handleCameraCapture],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  })

  const handleCameraOpen = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setIsCameraOpen(true)
  }

  if (isCameraOpen) {
    return <CameraCapture onCapture={handleCameraCapture} onCancel={() => setIsCameraOpen(false)} />
  }

  return (
    <div className='w-full'>
      {!value ? (
        <div
          {...getRootProps()}
          className={cn(
            'relative group border-2 border-dashed rounded-md p-8 flex flex-col items-center justify-center transition-all',
            isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/40',
          )}
        >
          <input {...getInputProps()} capture='environment' />
          <div className='bg-primary/10 p-4 rounded-full mb-3 group-hover:scale-110 transition-transform'>
            <Upload className='w-6 h-6 text-primary' />
          </div>
          <p className='text-sm font-medium'>{label}</p>
          <div className='flex gap-2 mt-4'>
            <Button type='button' variant='outline' size='sm' onClick={open} className='rounded-full'>
              <ImageIcon className='size-4 mr-2' /> Browse
            </Button>
            <Button type='button' variant='secondary' size='sm' onClick={handleCameraOpen} className='rounded-full'>
              <Camera className='size-4 mr-2' /> Camera
            </Button>
          </div>
        </div>
      ) : (
        <div className='relative aspect-video rounded-[2rem] overflow-hidden border shadow-inner group'>
          <img src={value} alt='Product' className='w-full h-full object-cover' />
          <div className='absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center'>
            <Button variant='destructive' size='icon' className='rounded-full' onClick={() => onChange('')}>
              <X className='size-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
