'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { Profile } from '@/types/api';
import { ONBOARDING_STEPS, stepsForPage, type OnboardingPage, type OnboardingStepId } from './steps';

const SEEN_KEY = 'ciq:onboarding:seen';
const SKIPPED_KEY = 'ciq:onboarding:skipped';

type OnboardingContextValue = {
  /** !completed && !skippedThisSession, and storage has been read. */
  active: boolean;
  currentStepId: OnboardingStepId | null;
  pageSeen(page: OnboardingPage): boolean;
  /** Starts this page's first step. */
  begin(page: OnboardingPage): void;
  /** Clears the current step when a page's tips unmount (navigation mid-tour). */
  end(): void;
  /** Next step on the current page; past the last one it finishes the page. */
  next(): void;
  /** Esc: marks the page seen without completing the tour on the server. */
  dismissPage(page: OnboardingPage): void;
  skip(): Promise<void>;
  /** Marks the page seen; finishing the results page completes the tour. */
  finishPage(page: OnboardingPage): void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const noop = () => undefined;
/** Outside the (app) layout (e.g. the UI gallery) there is no tour. */
const INACTIVE: OnboardingContextValue = {
  active: false,
  currentStepId: null,
  pageSeen: () => true,
  begin: noop,
  end: noop,
  next: noop,
  dismissPage: noop,
  skip: async () => undefined,
  finishPage: noop,
};

function readSeen(): OnboardingPage[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed.filter((p) => typeof p === 'string') as OnboardingPage[]) : [];
  } catch {
    return [];
  }
}

function writeSeen(pages: OnboardingPage[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(pages));
  } catch {
    // storage blocked: the page's tips show again next visit until completion is saved (14 §11)
  }
}

function setSkippedFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(SKIPPED_KEY, '1');
    else sessionStorage.removeItem(SKIPPED_KEY);
  } catch {
    // storage blocked: tips may show again after a reload
  }
}

/**
 * First-run tour state (14 §7.1). `completed` comes from profiles.onboarding_completed_at.
 * Completion is saved with PATCH /api/account; if that fails, tips stay hidden for the session and
 * the PATCH is retried once on the next page load.
 */
export function OnboardingProvider({ completed, children }: { completed: boolean; children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState<OnboardingPage[]>([]);
  const [done, setDone] = useState(completed);
  const [currentStepId, setCurrentStepId] = useState<OnboardingStepId | null>(null);
  const saving = useRef(false);

  const complete = useCallback(async () => {
    setDone(true); // optimistic: tips disappear immediately
    setCurrentStepId(null);
    if (saving.current) return;
    saving.current = true;
    try {
      const profile = await apiFetch<Profile>('/api/account', { method: 'PATCH', json: { onboarding_completed: true } });
      qc.setQueryData(qk.profile(), profile);
      setSkippedFlag(false);
    } catch {
      setSkippedFlag(true);
    } finally {
      saving.current = false;
    }
  }, [qc]);

  useEffect(() => {
    setSeen(readSeen());
    let skipped = false;
    try {
      skipped = sessionStorage.getItem(SKIPPED_KEY) === '1';
    } catch {
      // ignore
    }
    if (skipped && !completed) void complete(); // retry the failed PATCH once on load
    setReady(true);
    // Mount only: `completed` is fixed for the life of the (app) layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markSeen = useCallback((page: OnboardingPage) => {
    setCurrentStepId(null);
    setSeen((prev) => {
      if (prev.includes(page)) return prev;
      const nextSeen = [...prev, page];
      writeSeen(nextSeen);
      return nextSeen;
    });
  }, []);

  const finishPage = useCallback(
    (page: OnboardingPage) => {
      markSeen(page);
      if (page === 'results') void complete();
    },
    [markSeen, complete],
  );

  const next = useCallback(() => {
    const step = ONBOARDING_STEPS.find((s) => s.id === currentStepId);
    if (!step) return;
    const pageSteps = stepsForPage(step.page);
    const following = pageSteps[pageSteps.findIndex((s) => s.id === step.id) + 1];
    if (following) setCurrentStepId(following.id);
    else finishPage(step.page);
  }, [currentStepId, finishPage]);

  const begin = useCallback((page: OnboardingPage) => setCurrentStepId(stepsForPage(page)[0]?.id ?? null), []);
  const end = useCallback(() => setCurrentStepId(null), []);
  const pageSeen = useCallback((page: OnboardingPage) => seen.includes(page), [seen]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      active: ready && !done,
      currentStepId,
      pageSeen,
      begin,
      end,
      next,
      dismissPage: markSeen,
      skip: complete,
      finishPage,
    }),
    [ready, done, currentStepId, pageSeen, begin, end, next, markSeen, complete, finishPage],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  return useContext(OnboardingContext) ?? INACTIVE;
}
