'use client';

import { ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.25;

/** 50%–200% in 25% steps; the value resets to 100% (07 §8.5). */
export function ZoomControls({ zoom, onZoom }: { zoom: number; onZoom: (z: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Zoom out" icon={ZoomOut} size="sm" onClick={() => onZoom(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} />
      <button
        type="button"
        onClick={() => onZoom(1)}
        aria-label="Reset zoom to 100%"
        className="h-8 min-w-12 rounded-md px-2 text-body-sm font-medium text-fg-primary transition-colors duration-100 ease-out hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton label="Zoom in" icon={ZoomIn} size="sm" onClick={() => onZoom(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} />
    </div>
  );
}
