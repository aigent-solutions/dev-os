import { Banner } from '@/components/ui/Banner';

/** Text-mode notice: PDF failed, or the PDF is no longer stored (07 §8.8). */
export function ViewerNotice({ reason }: { reason: 'failed' | 'missing' }) {
  return (
    <Banner tone="info" className="rounded-none border-x-0 border-t-0">
      {reason === 'failed'
        ? "We couldn't display the PDF here, so you're seeing the extracted text. You can still download the original."
        : "The original PDF is no longer stored. You're viewing the extracted text."}
    </Banner>
  );
}
