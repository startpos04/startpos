/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */
import type { ComponentType } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface TabProps {
  defaultValue?: string
  className?: string
  tabClass?: string
  containerClass?: string
  tabs: {
    value?: string
    label: string
    Component: ComponentType<any>
    [key: string]: any
  }[]
}

function Tab({ defaultValue, tabs, className, tabClass, containerClass }: TabProps) {
  if (tabs.length === 0) return null
  if (tabs.length === 1) {
    const singleTab = tabs[0]
    if (singleTab) {
      const { Component, value, label, ...props } = singleTab
      return <Component {...props} />
    }
  }

  defaultValue = defaultValue || tabs[0]?.value || ''
  return (
    <Tabs defaultValue={defaultValue} className={cn('w-full selection:bg-transparent gap-0', className)}>
      <TabsList className={cn('p-0 bg-transparent rounded-none border-b h-auto space-x-1 items-end w-full justify-start', tabClass)}>
        {tabs.map(({ label, value = label }) => (
          <TabsTrigger
            key={value}
            value={value}
            className={cn(
              'cursor-pointer flex-initial tracking-tight font-medium bg-transparent rounded-t-md rounded-b-none border border-transparent -mb-px transition-none shadow-none outline-none',
              'data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-gray-600 dark:data-[state=inactive]:text-zinc-500 dark:data-[state=inactive]:hover:text-zinc-300',
              'data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:border-gray-200/80 data-[state=active]:border-b-white data-[state=active]:shadow-none data-[state=active]:font-semibold',
              'dark:data-[state=active]:bg-zinc-950 dark:data-[state=active]:text-zinc-50 dark:data-[state=active]:border-zinc-800 dark:data-[state=active]:border-b-zinc-950',
            )}
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map(({ Component, label, value = label, ...props }) => (
        <TabsContent
          key={value}
          value={value}
          className={cn('focus-visible:outline-none focus-visible:ring-0 py-2 overflow-y-auto grow flex flex-col gap-2', containerClass)}
        >
          <Component {...props} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

export default Tab
