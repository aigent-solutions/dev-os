import { Banner } from '@/components/ui/Banner';
import { publicEnv } from '@/lib/env.public';

/** Feature-flagged after a monthly calibration eval shows ≥ 15% miscalibration (06 §8.7). Not dismissible. */
export function CalibrationWarningBanner() {
  if (!publicEnv.NEXT_PUBLIC_SHOW_CALIBRATION_WARNING) return null;
  return (
    <Banner tone="warning">
      Confidence scores are currently less reliable than usual. Please verify important terms against the document.
    </Banner>
  );
}
