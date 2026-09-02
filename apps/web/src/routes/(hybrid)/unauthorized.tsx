import { FeatureDisabledPage } from '@platform/components/custom/guards/feature-disabled-page'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(hybrid)/unauthorized')({
  component: FeatureDisabledPage,
})
