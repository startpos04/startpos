/**
 * account/preferences/index.tsx
 *
 * User preferences page â€” Theme, language, and notification settings.
 * This is a placeholder implementation that will be expanded later.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { createFileRoute } from '@tanstack/react-router'
import { Bell, Globe, Palette } from 'lucide-react'

export const Route = createFileRoute('/(private)/(dashboard)/account/preferences/')({
  component: PreferencesPage,
})

function PreferencesPage() {
  return (
    <div className='space-y-6 flex flex-col grow h-1'>
      {/* Header */}
      <div className='max-w-4xl w-full mx-auto px-4'>
        <h1 className='text-3xl font-bold tracking-tight'>Preferences</h1>
        <p className='text-muted-foreground'>Customize your experience with theme, language, and notification settings.</p>
      </div>

      {/* Content */}
      <div className='max-w-4xl w-full mx-auto px-4 space-y-6'>
        {/* Theme Settings (Placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Palette className='h-5 w-5' />
              Theme
            </CardTitle>
            <CardDescription>Choose your preferred color scheme</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-muted-foreground'>
              Theme settings will be available here soon. You can currently change the theme using the theme toggle in the top bar.
            </p>
          </CardContent>
        </Card>

        {/* Language Settings (Placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Globe className='h-5 w-5' />
              Language
            </CardTitle>
            <CardDescription>Select your preferred language</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-muted-foreground'>Language preferences will be available here soon.</p>
          </CardContent>
        </Card>

        {/* Notification Settings (Placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Bell className='h-5 w-5' />
              Notifications
            </CardTitle>
            <CardDescription>Manage how you receive notifications</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-muted-foreground'>Notification preferences will be available here soon.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
