import { createFileRoute } from '@tanstack/react-router'
import { FeatureDisabledPage } from '@/components/pages/feature-disabled-page'

export const Route = createFileRoute('/unauthorized')({
  component: FeatureDisabledPage,
})
