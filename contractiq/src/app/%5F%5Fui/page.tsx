import { notFound } from 'next/navigation';
import { UiGallery } from './UiGallery';

export const metadata = { title: 'UI primitives' };

// Dev-only gallery of src/components/ui primitives for axe checks (00-foundation.md §11).
// The folder name %5F%5Fui produces the URL /__ui (a plain "__ui" folder would be private).
export default function UiPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <UiGallery />;
}
