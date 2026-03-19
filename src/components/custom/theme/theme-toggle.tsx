import { Switch } from '@/components/ui/switch'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <div className='h-7 w-12' />

  const isDark = resolvedTheme === 'dark'

  const toggleTheme = (checked: boolean) => {
    if (!document.startViewTransition) {
      setTheme(checked ? 'dark' : 'light')
      return
    }
    document.startViewTransition(() => setTheme(checked ? 'dark' : 'light'))
  }

  return (
    <div className='relative inline-flex items-center scale-150'>
      {/* scale-125 makes the Switch ~55px wide and 30px tall */}
      <Switch
        id='theme-mode'
        checked={isDark}
        onCheckedChange={toggleTheme}
        className='data-[state=checked]:bg-slate-900 data-[state=unchecked]:bg-slate-200'
      />

      {/* Icon Container positioned precisely over the thumb */}
      <div
        className={`pointer-events-none absolute left-0.75 flex h-5 w-5 items-center justify-center transition-transform duration-200 ease-in-out ${
          isDark ? 'translate-x-2' : '-translate-x-1.25'
        }`}
      >
        {isDark ? <Moon className='h-3 w-3 text-blue-400 fill-blue-400' /> : <Sun className='h-3 w-3 text-amber-500 fill-amber-500' />}
      </div>
    </div>
  )
}
