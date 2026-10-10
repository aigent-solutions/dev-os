'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'warning' | 'danger' | 'neutral';
export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
};
type ToastItem = ToastInput & { id: number; open: boolean };

// Module-level store so toast() can be called from anywhere (hooks, mutation callbacks).
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(input: ToastInput): number {
  const id = nextId++;
  items = [...items, { ...input, id, open: true }];
  emit();
  return id;
}

function setOpen(id: number, open: boolean) {
  items = items.map((t) => (t.id === id ? { ...t, open } : t));
  emit();
  if (!open) {
    // Remove after the exit animation (150 ms).
    setTimeout(() => {
      items = items.filter((t) => t.id !== id);
      emit();
    }, 200);
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => items;
const emptySnapshot: ToastItem[] = [];

export function useToast() {
  return { toast, dismiss: (id: number) => setOpen(id, false) };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider swipeDirection="right" label="Notification">
      {children}
    </ToastPrimitive.Provider>
  );
}

const toneStyles: Record<ToastTone, { classes: string; icon: typeof Info }> = {
  success: { classes: 'border-success-border', icon: CheckCircle2 },
  warning: { classes: 'border-warning-border', icon: AlertTriangle }, // rate limits (12 §9)
  danger: { classes: 'border-danger-border', icon: AlertCircle },
  neutral: { classes: 'border-border', icon: Info },
};
const iconColour: Record<ToastTone, string> = {
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
  neutral: 'text-fg-secondary',
};

/** Bottom-right (bottom-centre under 768 px). Auto-dismiss 5 s; danger and warning 8 s and announced assertively. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, getSnapshot, () => emptySnapshot);
  return (
    <>
      {list.map((t) => {
        const tone = t.tone ?? 'neutral';
        const { classes, icon: Icon } = toneStyles[tone];
        return (
          <ToastPrimitive.Root
            key={t.id}
            open={t.open}
            onOpenChange={(open) => setOpen(t.id, open)}
            duration={tone === 'danger' || tone === 'warning' ? 8000 : 5000}
            type={tone === 'danger' || tone === 'warning' ? 'foreground' : 'background'}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border bg-surface p-4',
              'data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in',
              classes,
            )}
          >
            <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', iconColour[tone])} />
            <div className="flex flex-1 flex-col gap-0.5">
              <ToastPrimitive.Title className="text-body-lg text-fg-primary">{t.title}</ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="text-body-sm text-fg-secondary">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
            {t.action && (
              <ToastPrimitive.Action
                altText={t.action.label}
                onClick={t.action.onClick}
                className="shrink-0 rounded-sm text-body-sm font-medium text-fg-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {t.action.label}
              </ToastPrimitive.Action>
            )}
            <ToastPrimitive.Close
              aria-label="Dismiss notification"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-fg-secondary hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X aria-hidden className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 p-4 outline-none md:left-auto md:right-0 md:translate-x-0" />
    </>
  );
}
