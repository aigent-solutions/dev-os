'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/Popover';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useOnboarding } from './OnboardingProvider';
import { ONBOARDING_STEPS, ONBOARDING_TOTAL, stepsForPage, type OnboardingPage } from './steps';

const ANCHOR_TIMEOUT_MS = 10_000;
/** Open selects and menus (Radix listbox / menu content). */
const OTHER_LAYER = '[role="listbox"], [role="menu"]';
/** Lets a just-closed layer finish returning focus before the tip takes it. */
const LAYER_SETTLE_MS = 50;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(el: Element): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** First visible match: some anchors exist twice (e.g. the compact and desktop chat tabs). */
function findAnchor(anchor: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-onboarding="${anchor}"]`);
  return Array.from(all).find(isVisible) ?? null;
}

/**
 * Needs scrolling before the tip opens. A large anchor (the term preview card) counts as on screen
 * while its top is visible: centring it would leave no room above or below for the tip.
 */
function isOffScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top < 0 || r.top > vh || r.left < 0 || r.right > window.innerWidth) return true;
  return r.bottom > vh && r.height <= vh / 2;
}

/** Focus the anchor if it is focusable, otherwise the first focusable element inside it. */
function focusAnchor(el: HTMLElement | null) {
  if (!el || !el.isConnected) return;
  const target = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus();
}

/**
 * The first-run tips for one page (14 §7.1). Waits up to 10 s for each step's anchor (skipping the
 * step if it never appears or becomes hidden), then shows a non-modal popover next to it.
 */
export function OnboardingTooltips({ page }: { page: OnboardingPage }) {
  const { active, currentStepId, pageSeen, begin, end, next, dismissPage, skip } = useOnboarding();
  const reduced = usePrefersReducedMotion();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [suspended, setSuspended] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const focusedStep = useRef<string | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const running = active && !pageSeen(page);
  const step = ONBOARDING_STEPS.find((s) => s.id === currentStepId && s.page === page) ?? null;
  const isLastOnPage = step ? stepsForPage(page).at(-1)?.id === step.id : false;

  // Start this page's tips; on unmount (navigation) the page stays "not seen" (14 §11).
  useEffect(() => {
    if (running && !step) begin(page);
  }, [running, step, begin, page]);
  useEffect(() => end, [end]);

  // Wait for the current step's anchor. The 10 s skip timer only counts while the anchor is missing.
  useEffect(() => {
    setAnchorEl(null);
    if (!running || !step) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const tryShow = () => {
      const el = findAnchor(step.anchor);
      if (!el) return;
      clearTimeout(timer);
      // A closing select or menu returns focus to its trigger; open after that so the tip keeps focus.
      if (document.querySelector(OTHER_LAYER)) return;
      observer.disconnect();
      settle = setTimeout(() => {
        if (isOffScreen(el)) el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        setAnchorEl(el);
      }, LAYER_SETTLE_MS);
    };
    const observer = new MutationObserver(tryShow);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-state'] });
    const timer = setTimeout(() => {
      observer.disconnect();
      next(); // anchor never appeared: skip this step
    }, ANCHOR_TIMEOUT_MS);
    tryShow();
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(settle);
    };
    // `reduced` only affects the scroll style; it must not restart the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, step?.id, next]);

  // Highlight the anchor while its tip is open.
  useEffect(() => {
    if (!anchorEl) return;
    anchorEl.setAttribute('data-onboarding-active', 'true');
    return () => anchorEl.removeAttribute('data-onboarding-active');
  }, [anchorEl]);

  // Anchor hidden later (e.g. resized below 768 px) → skip the step.
  useEffect(() => {
    if (!anchorEl) return;
    const check = () => {
      if (!anchorEl.isConnected || !isVisible(anchorEl)) next();
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [anchorEl, next]);

  // Another dialog opening hides the tip until focus leaves it (14 §11).
  useEffect(() => {
    if (!anchorEl) return;
    const onFocusIn = (e: FocusEvent) => {
      const dialog = (e.target as Element | null)?.closest?.('[role="dialog"], [role="alertdialog"]');
      const otherDialog = !!dialog && dialog.getAttribute('data-state') === 'open' && !contentRef.current?.contains(dialog);
      setSuspended(otherDialog);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [anchorEl]);

  if (!running || !step || !anchorEl) return null;

  const anchorRef = { current: anchorEl };
  const onPrimary = () => {
    const el = anchorEl;
    next();
    if (isLastOnPage) requestAnimationFrame(() => focusAnchor(el));
  };

  return (
    <Popover key={step.id} open={!suspended} modal={false}>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        ref={contentRef}
        data-onboarding-popover=""
        side="bottom"
        align="start"
        collisionPadding={16}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="gap-4 border-border-strong border-l-2 border-l-brand"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // Focus the primary button once per step; not again when re-shown after a dialog closes.
          if (focusedStep.current === step.id) return;
          focusedStep.current = step.id;
          primaryRef.current?.focus();
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          const el = anchorEl;
          dismissPage(page);
          requestAnimationFrame(() => focusAnchor(el));
        }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-col gap-1">
          <p id={titleId} className="text-body-lg text-fg-primary">
            {step.title}
          </p>
          <p id={bodyId} className="text-body-sm text-fg-secondary">
            {step.body}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-body-sm text-fg-secondary">
            {step.index} of {ONBOARDING_TOTAL}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const el = anchorEl;
                void skip();
                requestAnimationFrame(() => focusAnchor(el));
              }}
            >
              Skip tips
            </Button>
            <Button ref={primaryRef} size="sm" onClick={onPrimary}>
              {isLastOnPage ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
        <PopoverPrimitive.Arrow className="fill-surface" width={12} height={8} />
      </PopoverContent>
    </Popover>
  );
}
