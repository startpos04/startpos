import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { authClient } from '@/lib/better-auth/auth-client'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Minus, Plus, Search } from 'lucide-react'

export const Route = createFileRoute('/(private)/pos/')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()

  return (
    <div className='flex h-screen w-full bg-slate-50 p-4 gap-4 font-sans text-slate-900'>
      {/* 1. Category Sidebar (The Quick-Nav) */}
      <nav className='w-20 flex flex-col items-center py-4 gap-6 bg-white rounded-3xl shadow-sm border'>
        <div className='w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white font-bold'>P.</div>
        <div className='flex flex-col gap-4'>
          <Button variant='ghost' className='rounded-2xl p-4 h-14 w-14 bg-slate-100'>
            ☕
          </Button>
          <Button variant='ghost' className='rounded-2xl p-4 h-14 w-14'>
            🍰
          </Button>
          <Button variant='ghost' className='rounded-2xl p-4 h-14 w-14'>
            🥗
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              authClient.signOut(
                {},
                {
                  onSuccess: () => {
                    navigate({ to: '/', reloadDocument: true })
                  },
                },
              )
            }}
          >
            Logout
          </Button>
        </div>
      </nav>

      {/* 2. Main Product Grid */}
      <main className='flex-1 flex flex-col gap-4'>
        <header className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Morning Brew</h1>
            <p className='text-slate-500 text-sm'>Wednesday, Feb 18, 2026</p>
          </div>
          <div className='relative w-72'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400' />
            <Input className='pl-10 rounded-xl border-none shadow-sm bg-white' placeholder='Search menu...' />
          </div>
        </header>

        <div className='grid grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto pr-2'>
          {/* Example Product Card */}
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className='border-none shadow-sm hover:shadow-md transition-all cursor-pointer group rounded-3xl overflow-hidden'>
              <div className='h-32 bg-slate-200 group-hover:scale-105 transition-transform' />
              <CardContent className='p-4'>
                <p className='font-semibold'>Oatmilk Latte</p>
                <div className='flex justify-between items-center mt-2'>
                  <span className='text-primary font-bold'>$4.50</span>
                  <Badge variant='secondary' className='bg-slate-100 uppercase text-[10px]'>
                    Coffee
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      {/* 3. The "Action" Cart */}
      <aside className='w-96 bg-white rounded-[2rem] shadow-xl border flex flex-col overflow-hidden'>
        <div className='p-6'>
          <h2 className='text-xl font-bold flex items-center gap-2'>
            Current Order <Badge className='rounded-full'>3</Badge>
          </h2>
        </div>

        <ScrollArea className='flex-1 px-6'>
          <div className='space-y-4'>
            {/* Cart Item */}
            <div className='flex items-center gap-4'>
              <div className='w-16 h-16 bg-slate-100 rounded-2xl' />
              <div className='flex-1'>
                <p className='font-medium text-sm'>Caramel Macchiato</p>
                <p className='text-xs text-slate-400'>$5.00 x 1</p>
              </div>
              <div className='flex items-center gap-2 bg-slate-50 rounded-lg p-1'>
                <Button size='icon' variant='ghost' className='h-6 w-6'>
                  <Minus className='w-3' />
                </Button>
                <span className='text-xs font-bold'>1</span>
                <Button size='icon' variant='ghost' className='h-6 w-6'>
                  <Plus className='w-3' />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className='p-6 bg-slate-50 mt-auto border-t space-y-4'>
          <div className='space-y-2'>
            <div className='flex justify-between text-sm'>
              <span className='text-slate-500'>Subtotal</span>
              <span>$14.50</span>
            </div>
            <div className='flex justify-between text-sm'>
              <span className='text-slate-500'>Tax (10%)</span>
              <span>$1.45</span>
            </div>
            <div className='flex justify-between text-xl font-bold pt-2 border-t'>
              <span>Total</span>
              <span>$15.95</span>
            </div>
          </div>
          <Button className='w-full py-7 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20'>Complete Payment</Button>
        </div>
      </aside>
    </div>
  )
}
