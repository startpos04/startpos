import { Camera, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function CameraCapture({ onCapture, onCancel }: { onCapture: (img: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: Preventing camera hardware flicker on parent re-renders
  useEffect(() => {
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        setStream(s)
        if (videoRef.current) videoRef.current.srcObject = s
      } catch (err) {
        console.error('Camera access denied', err)
        onCancel()
      }
    }
    startCamera()
    return () =>
      stream?.getTracks().forEach(t => {
        t.stop()
      })
  }, [])

  const takePhoto = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    onCapture(canvas.toDataURL('image/jpeg'))
    stream?.getTracks().forEach(t => {
      t.stop()
    })
  }

  return (
    <div className='relative bg-black rounded-2xl overflow-hidden aspect-video'>
      <video ref={videoRef} autoPlay playsInline muted className='w-full h-full object-cover' />
      <div className='absolute bottom-4 left-0 right-0 flex justify-center gap-4'>
        <Button variant='outline' size='icon' onClick={onCancel} className='rounded-full bg-white/20 border-white/40 text-white hover:bg-white/40'>
          <X className='w-4 h-4' />
        </Button>
        <Button onClick={takePhoto} size='lg' className='rounded-full px-6 shadow-xl'>
          <Camera className='w-4 h-4 mr-2' /> Capture
        </Button>
      </div>
    </div>
  )
}
