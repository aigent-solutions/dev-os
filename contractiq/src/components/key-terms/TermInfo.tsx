'use client';

import { Info } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { GLOSSARY, type GlossaryKey } from '@/lib/glossary';

/** ⓘ jargon tooltip: hover, keyboard focus and screen reader (14 §2.2, §7.2). 32 px hit area. */
export function TermInfo({ label, description }: { label: string; description: string }) {
  return (
    <Tooltip content={description} className="max-w-[280px]">
      <IconButton
        icon={Info}
        label={`What is ${label}?`}
        size="sm"
        className="shrink-0 text-fg-secondary hover:text-fg-primary"
      />
    </Tooltip>
  );
}

/** Same as TermInfo, with product vocabulary from GLOSSARY. */
export function GlossaryInfo({ term, label }: { term: GlossaryKey; label: string }) {
  return <TermInfo label={label} description={GLOSSARY[term]} />;
}
