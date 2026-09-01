import { createFileRoute } from '@tanstack/react-router'
import { FeatureDisabledPage } from '@startpos-core/components/custom/guards/feature-disabled-page'

export const Route = createFileRoute('/(hybrid)/unauthorized')({
  component: FeatureDisabledPage,
})
