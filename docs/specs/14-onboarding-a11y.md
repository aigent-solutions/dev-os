# 14 — Onboarding & Accessibility

**PRD / engineering-doc refs:** Roadmap v1.0 ("Onboarding tooltips for first-time users", "WCAG 2.1 AA review"). PRD §5 usability ("usable by a non-lawyer with no onboarding training; all legal jargon tooltipped or explained in plain English. WCAG 2.1 AA compliance"). Engineering-doc §5.4 (UX states, accessibility), §7.3 (`profiles.onboarding_completed_at`), §13.4 (`a11y.spec.ts`). Feature **F16**.
**Depends on:** `00-foundation.md` (UI primitives, tokens, reduced-motion CSS), `01-auth.md` (`(app)/layout.tsx` profile load), `04-term-preview-custom-terms.md` (`TERM_LIBRARY` descriptions), `13-data-lifecycle-gdpr.md` (owns `PATCH /api/account`). It applies to every UI spec (03, 06–11, 13, 16).

---

## 1. Overview

This spec covers four things:

1. **First-run onboarding tips.** These are short popovers anchored to key UI elements on three pages: dashboard, upload and results. They're shown until the user finishes or skips them. Completion is stored in `profiles.onboarding_completed_at` through `PATCH /api/account { onboarding_completed: true }`.
2. **Jargon tooltips.** Every standard key term name, and each piece of product vocabulary (confidence, source sentence, custom term, type mismatch), has a plain-English explanation reachable by mouse, keyboard and screen reader.
3. **WCAG 2.1 AA requirements** (§3 below). This is the binding checklist for every component in the app.
4. **Mobile large-PDF banner** and **reduced-motion** behaviour.

---

## 2. User flow

### 2.1 Onboarding tips

1. A user with `onboarding_completed_at IS NULL` opens `/dashboard`. Tip **D1** opens, anchored to "Review a Contract".
2. Each tip has **Next** (or **Done** on the last tip of that page), **Skip tips**, and a step counter ("1 of 5").
3. The user starts a review → `/contracts/new`. Tip **U1** opens on the term preview card, once the contract type is selected and the card is visible.
4. After processing → results page. Tips **R1**, **R2** and **R3** open one after another (confidence badge → "Why?" → Chat tab).
5. **Done** on R3, or **Skip tips** at any point → `PATCH /api/account { "onboarding_completed": true }`. All tips stop showing, on every device.
6. Progress within the tour (which page groups have been seen) is kept in `localStorage['ciq:onboarding:seen']`, so a reload doesn't repeat a page's tips. If `localStorage` is unavailable, the tips for that page show again on the next visit until completion is saved.

| Id | Page | Anchor (`data-onboarding`) | Title | Body |
|---|---|---|---|---|
| D1 | `/dashboard` | `review-cta` | Start here | "Upload an NDA or MSA as a PDF (up to 20 pages). We'll pull out the key terms in about 30 seconds." |
| U1 | `/contracts/new` | `term-preview` | What we'll look for | "These are the terms we extract for this contract type. Add up to 5 of your own with “+ Add Key Term”." |
| R1 | `/contracts/[id]` | `confidence-badge` (first term row) | How sure is the AI? | "Green means high confidence, amber means check it, and red ⚠️ means verify it in the document yourself." |
| R2 | `/contracts/[id]` | `why-toggle` (first term row) | See the source | "Open “Why?” to see the exact sentence from your contract that each value came from. Click the page number to jump there." |
| R3 | `/contracts/[id]` | `chat-tab` | Ask questions | "Ask anything in plain English. Answers come only from your contract and cite the page." |

The step counter counts across the whole tour (D1 = "1 of 5" … R3 = "5 of 5"). If a user lands on the results page first (for example from a direct link), R1–R3 still show as "3 of 5" … "5 of 5".

### 2.2 Jargon tooltips

1. The user sees an ⓘ `IconButton` (`Info` icon, 16 px) next to a standard term name in the key terms panel, in the term preview card and in the CSV/PDF export headers *(help text in the export is out of scope)*.
2. Hover or keyboard focus opens a `Tooltip` with that term's `description` from `TERM_LIBRARY` (the text is owned by `04-term-preview-custom-terms.md`).
3. Custom terms have no ⓘ (they have no library description). They show the "Custom" badge with its own tooltip from `GLOSSARY.custom_term`.

### 2.3 Mobile banner

Under 768 px viewport width, on `/contracts/new` and `/contracts/[id]`, a dismissible info `Banner` shows: "For the best experience with large PDFs, use a desktop browser (Chrome or Firefox)." Dismissing it stores `localStorage['ciq:mobile-banner-dismissed'] = '1'` (try/catch).

---

## 3. WCAG 2.1 AA requirements (binding for every component)

Every UI spec references this section. **"Must"** items are release blockers for v1.0.

### 3.1 Perceivable

| # | WCAG | Requirement | How it's met / verified |
|---|---|---|---|
| P1 | 1.1.1 | Every meaningful image has `alt`. Decorative icons are `aria-hidden="true"`. Icon-only buttons have an `aria-label` | `IconButton` requires `label`. Lint rule `jsx-a11y/alt-text`. axe |
| P2 | 1.3.1 | Semantic structure: one `h1` per page, ordered headings, `<main id="main">`, `<nav>`, `<header>`, `<footer>`. Lists use `ul`/`ol`. Tables use `table`/`th scope` (dashboard `ContractsTable`) | axe `heading-order`, `landmark-*` |
| P3 | 1.3.1 | Form inputs have a programmatic label (`Label htmlFor`). Errors are linked with `aria-describedby`. Required fields are marked with `aria-required` | `FormField` primitive |
| P4 | 1.3.2 | DOM order matches visual order. On the results page: header → disclaimer → banners → viewer → side panel | Manual review + keyboard E2E |
| P5 | 1.3.4 | Works in portrait and landscape. No orientation lock | Playwright mobile project |
| P6 | 1.3.5 | `autoComplete` on email (`email`) and passwords (`current-password` / `new-password`) | `01-auth.md` |
| P7 | 1.4.1 | **Colour is never the only signal.** Confidence = colour + `{n}%` text + icon (`CheckCircle2` / `AlertCircle` / `AlertTriangle`). Edited = "Edited" text badge. Status pills use text. Viewer highlights also have an outline | `ConfidenceBadge`, `EditedBadge` tests |
| P8 | 1.4.3 | Text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 24 px, or ≥ 18.66 px bold). Approved pairs below. Any new pair is checked before use | Table §3.5 + axe `color-contrast` |
| P9 | 1.4.4 | Text scales to 200% (browser zoom) without loss of content or function | Manual at 200% on dashboard and results |
| P10 | 1.4.10 | Reflow at 320 CSS px with no 2-D scrolling, except the PDF canvas (allowed: it's 2-D content) | E2E width checks |
| P11 | 1.4.11 | Non-text contrast ≥ 3:1: form control borders (`border-control` = Grey 300), focus ring (Blue 500), meaningful icons (low = Red 600/700, medium = Yellow 800, high = Green 700), checkbox and toggle states | Table §3.5 |
| P12 | 1.4.12 | No clipping when the user overrides line-height ×1.5 and letter-spacing 0.12 em. Containers use `min-h`, not a fixed `h`, for text | Manual bookmarklet test |
| P13 | 1.4.13 | Tooltips and popovers: dismissible with Esc without moving focus, hoverable (the pointer can move onto the content), persistent until dismissed or blur | Radix Tooltip/Popover defaults. Unit test for Esc |

### 3.2 Operable

| # | WCAG | Requirement | How it's met / verified |
|---|---|---|---|
| O1 | 2.1.1 | **Everything works by keyboard:** dropzone (Enter/Space opens the file picker), contract type select, add or remove custom term, process, term row actions (page link, "Why?", edit), viewer zoom and page navigation, tabs, chat send / stop, citation links, feedback thumbs, dialogs, row menus | Keyboard E2E (§12) |
| O2 | 2.1.2 | No keyboard trap. Dialogs trap focus *intentionally*, release on close and return focus to the trigger. The PDF canvas isn't focusable. Its page container is `tabIndex={-1}` (only a programmatic focus target) | Radix Dialog. E2E |
| O3 | 2.1.4 | No single-character shortcuts. (Enter to send in chat is not a character shortcut. Shift+Enter makes a newline) | — |
| O4 | 2.2.1 | No time limits on user actions. The 10 s auth message is informational, and the form stays usable. Toasts that contain an action stay visible until dismissed | `Toast` with `action` → `duration: Infinity` |
| O5 | 2.2.2 | Moving content: the demo GIF is ≤ 20 s and is replaced by a still under reduced motion. Status polling text updates are not animations. Skeleton pulse stops under reduced motion | §6.4 |
| O6 | 2.3.1 | Nothing flashes more than 3 times a second | — |
| O7 | 2.4.1 | "Skip to main content" link as the first focusable element | Root layout |
| O8 | 2.4.2 | Unique `<title>` per page via `metadata.title` ("Dashboard · ContractIQ", "{file name} · ContractIQ") | Unit / E2E |
| O9 | 2.4.3 | Logical focus order. After route changes, focus moves to the page `h1` (`useRouteFocus` hook, §6.3) | E2E |
| O10 | 2.4.4 | Link and button text describes the destination: "Page 4" citation links have `aria-label="Go to page 4 in the document"`. Row links use the contract name | Unit tests |
| O11 | 2.4.6 | Headings and labels are descriptive | Review |
| O12 | 2.4.7 | **Visible focus** on every interactive element: `focus-visible:ring-2 ring-focus ring-offset-2 ring-offset-surface` | Primitive tests + axe |
| O13 | 2.5.3 | The visible label is included in the accessible name (no `aria-label` that contradicts visible text) | axe `label-content-name-mismatch` |
| O14 | 2.5.x | Minimum target size of 24×24 CSS px (all `IconButton`s are ≥ 32 px). Spacing between adjacent targets ≥ 8 px in term rows | Design review |

### 3.3 Understandable

| # | WCAG | Requirement | How it's met / verified |
|---|---|---|---|
| U1 | 3.1.1 | `<html lang="en">` | Root layout |
| U2 | 3.2.1 / 3.2.2 | Focus or input never triggers navigation or submission by itself. Selecting a contract type only reveals the preview. Process needs an explicit button press | Review |
| U3 | 3.2.3 / 3.2.4 | Navigation and the user menu are consistent across `(app)` pages | AppShell |
| U4 | 3.3.1 | Errors are identified in text, next to the field, and summarised in a `role="alert"` banner. Focus moves to the banner on submit failure | `FormField`, `Banner` |
| U5 | 3.3.2 | Inputs have labels and instructions: password rules, file limits ("PDF, up to 10 MB and 20 pages"), custom-term limits ("2–60 characters, up to 5"), chat limit ("{n}/2000") | Feature specs |
| U6 | 3.3.3 | Error messages suggest the fix (the README §4 catalog is written that way) | Catalog review |
| U7 | 3.3.4 | Destructive actions (delete contract, delete account) need confirmation through `ConfirmDialog`. Account deletion needs `DELETE` typed in | `13-data-lifecycle-gdpr.md` |
| U8 | PRD | Plain English: every legal term has a jargon tooltip (§2.2). Product vocabulary comes from `GLOSSARY` (§6.2) | Unit test: every `TERM_LIBRARY` entry has a non-empty description ≤ 160 chars |

### 3.4 Robust

| # | WCAG | Requirement | How it's met / verified |
|---|---|---|---|
| R1 | 4.1.2 | Custom widgets expose name, role and value: Radix primitives for tabs, dialog, select, tooltip, collapsible, dropdown. The inline editor is a real `<input>`/`<textarea>`. The dropzone root is `role="button"` with `aria-describedby` for the limits | axe |
| R2 | 4.1.3 | Status messages are announced without moving focus: processing steps (`aria-live="polite"`), upload progress (`Progress` `aria-valuenow` + polite text every 25%), streamed chat (polite region that announces the **complete** answer on `done`, not every token), toasts, "Saved" after inline edit, rate-limit messages | Unit tests for live regions |

### 3.5 Approved colour pairs (from `00-foundation.md` §9.1)

| Foreground | Background | Ratio (≈) | Use |
|---|---|---|---|
| `fg-primary` #070A0E | `surface` #FFFFFF / `surface-page` #FAFAFA | 19.6 / 18.8 | Body text, headings |
| `fg-secondary` #4A4C4F | `surface` / `surface-page` | 8.7 / 8.4 | Secondary text |
| `fg-disabled` / `fg-placeholder` #5E6062 | `surface` | 6.4 | Disabled, placeholder |
| `fg-link` / `brand` #115ACB | `surface` | 6.3 | Links, focus ring |
| `fg-inverse` #FFFFFF | `brand` #115ACB | 6.3 | Primary button |
| `fg-inverse` #FFFFFF | `danger-solid` #BE2F33 | 5.9 | Destructive button |
| `success-fg` #0D720A | `success-bg` #E7F6E7 | 5.5 | High-confidence badge |
| `warning-fg` #854D00 | `warning-bg` #FFF9F0 | 6.5 | Medium-confidence badge, warning banners |
| `danger-fg` #942528 | `danger-bg` #FAEBEB | 7.2 | Low-confidence badge, errors |
| `info-fg` #0D469E | `info-bg` #E7EFFC | 7.9 | Info banners |
| `border-control` #8F9193 | `surface` | 3.2 | Input borders (non-text) |

**Forbidden pairs** (they fail AA): Green 500 / Yellow 500 / Yellow 700 / Yellow 800 as *text* on white or their 50 tints. Grey 300 as text. White text on Green 500 or Yellow 500.

### 3.6 Reduced motion

- Global CSS (`00-foundation.md` §9.1) cuts animations and transitions to 0.01 ms and sets `scroll-behavior: auto`.
- JavaScript scrolling (viewer `goToPage`, chat auto-scroll) uses `usePrefersReducedMotion()`: `behavior: reduced ? 'auto' : 'smooth'`.
- The landing demo GIF is replaced by a still poster (`02-landing.md`).
- Skeleton `animate-pulse` is disabled by the global rule.

---

## 4. Database

| Table | Column | Access | Client |
|---|---|---|---|
| `profiles` | `onboarding_completed_at` | Read in `(app)/layout.tsx` (`01-auth.md` §6.4) | `createServerSupabase()` (RLS `profiles_select_own`) |
| `profiles` | `onboarding_completed_at` | Write `now()` through `PATCH /api/account` | User-scoped client. The column is in the `authenticated` UPDATE grant. Policy `profiles_update_own` |

---

## 5. Database tasks

None. `profiles.onboarding_completed_at`, the UPDATE column grant and the policies are already in `supabase-schema.sql` (§4.1, §6.1).

---

## 6. API routes

### `PATCH /api/account` — used with `{ "onboarding_completed": true }`

**The contract is owned by `13-data-lifecycle-gdpr.md`.** This feature relies on:

- Request `{ "onboarding_completed": true }` (only the literal `true` is accepted; tips can't be reset through the API).
- Effect: `update profiles set onboarding_completed_at = now() where id = auth.uid() and onboarding_completed_at is null`. Idempotent: a second call keeps the first timestamp.
- Response `200` with the profile object (including `onboarding_completed_at`).
- Errors: `401`, `400 VALIDATION_ERROR`.

No other routes.

---

## 7. Backend implementation

No server logic beyond `13`'s `updateProfile`. The client pieces are below.

### 7.1 Onboarding — `src/components/onboarding/`

```ts
// OnboardingProvider.tsx ('use client')
type OnboardingPage = 'dashboard' | 'upload' | 'results';
type OnboardingContextValue = {
  active: boolean;                                   // !completed && !skippedThisSession
  currentStepId: OnboardingStepId | null;
  pageSeen(page: OnboardingPage): boolean;
  next(): void; skip(): Promise<void>; finishPage(page: OnboardingPage): void;
};
export function OnboardingProvider(props: { completed: boolean; children: ReactNode }): JSX.Element;
export function useOnboarding(): OnboardingContextValue;

// steps.ts
export type OnboardingStepId = 'D1' | 'U1' | 'R1' | 'R2' | 'R3';
export const ONBOARDING_STEPS: { id: OnboardingStepId; page: OnboardingPage; anchor: string; title: string; body: string; index: number }[];
// index 1..5 for the "n of 5" counter. Content exactly as the §2.1 table.

// OnboardingTooltips.tsx ('use client')
export function OnboardingTooltips(props: { page: OnboardingPage }): JSX.Element | null;
```

**`OnboardingTooltips` logic:**

1. If `!active` or `pageSeen(page)`, render nothing.
2. Find this page's steps in order. For the current step, wait until `document.querySelector('[data-onboarding="<anchor>"]')` exists and is visible. A `MutationObserver` watches for it, giving up after 10 s: if the anchor never appears (for example the results page has 0 terms), that step is skipped.
3. Render a Radix `Popover` (`open`, `modal={false}`) with `PopoverAnchor` virtualised to the anchor's bounding rect (`virtualRef`), `side="bottom"`, `align="start"`, `collisionPadding={16}`.
4. Popover content: `role="dialog"`, `aria-labelledby` = title id, `aria-describedby` = body id. Contents: title (`text-body-lg`), body (`text-body-sm`), counter ("{index} of 5", `text-body-sm text-fg-secondary`), `Button size="sm"` **Next** / **Done**, and `Button variant="ghost" size="sm"` **Skip tips**.
5. Focus moves to the popover's primary button on open. Esc = **Skip** for this page only: it marks the page seen and doesn't call the API. Closing the last step returns focus to the anchor.
6. **Done** on the page's last step → `finishPage(page)` → add the page to `localStorage['ciq:onboarding:seen']` (JSON array, try/catch). If `page === 'results'` → call `PATCH /api/account { onboarding_completed: true }`.
7. **Skip tips** → `PATCH /api/account { onboarding_completed: true }` → `active = false` immediately (optimistic). If the call fails, tips stay hidden for this session (sessionStorage flag `ciq:onboarding:skipped`) and the call is retried on the next page load.

**Anchors** (added by the owning specs):

| Anchor | Element | Owner spec |
|---|---|---|
| `review-cta` | Dashboard header "Review a Contract" button | `10-dashboard.md` |
| `term-preview` | `TermPreviewCard` root | `04-term-preview-custom-terms.md` |
| `confidence-badge` | `ConfidenceBadge` in the first `KeyTermRow` | `06-results-key-terms-panel.md` |
| `why-toggle` | `SourceSentenceDisclosure` trigger in the first row | `06-results-key-terms-panel.md` |
| `chat-tab` | `TabsTrigger value="chat"` | `06-results-key-terms-panel.md` |

`OnboardingProvider` wraps `AppShell` children in `(app)/layout.tsx`, with `completed` taken from the profile (`01-auth.md` §6.4). `<OnboardingTooltips page="…" />` is rendered once by each of the three pages.

### 7.2 Jargon tooltips — `src/components/key-terms/TermInfo.tsx`, `src/lib/glossary.ts`

```ts
// glossary.ts — product vocabulary (plain English, ≤ 160 chars each)
export const GLOSSARY = {
  confidence: 'How sure the AI is that it found the right value. 80%+ is high, 50–79% means check it, under 50% means verify it yourself.',
  source_sentence: 'The exact sentence from your contract that the value was taken from.',
  custom_term: 'A term you asked us to look for. It is extracted the same way as standard terms.',
  type_mismatch: 'The document looks like a different contract type than the one you chose, so some terms may be missing.',
  edited: 'You changed this value. The original AI value is kept for reference.',
  not_found: 'We could not find this term in the document. That can be correct — not every contract has every clause.',
} as const;
export type GlossaryKey = keyof typeof GLOSSARY;

// TermInfo.tsx
export function TermInfo(props: { label: string; description: string }): JSX.Element;
// IconButton (Info, size sm) with label `What is ${label}?` wrapped in Tooltip(content = description)
export function GlossaryInfo(props: { term: GlossaryKey; label: string }): JSX.Element; // same, using GLOSSARY
```

Usage rules:

- `KeyTermRow` and `TermPreviewItem` render `<TermInfo label={term_name} description={TERM_LIBRARY[type].find(...).description} />` for standard terms.
- `ConfidenceBadge` has a `GlossaryInfo term="confidence"` in the panel header (once, not per row).
- The "Custom" badge, "Edited" badge, "Not found in document" and `TypeMismatchBanner` each have a `GlossaryInfo`.

### 7.3 Shared a11y hooks — `src/hooks/`

```ts
// usePrefersReducedMotion.ts
export function usePrefersReducedMotion(): boolean; // matchMedia('(prefers-reduced-motion: reduce)'), SSR-safe (false on server), updates on change

// useRouteFocus.ts
export function useRouteFocus(ref: RefObject<HTMLElement>): void;
// On mount (route change), focus the page h1 (tabIndex={-1}) unless focus is already inside main or an onboarding popover is opening

// useAnnouncer.ts
export function useAnnouncer(): (message: string, politeness?: 'polite' | 'assertive') => void;
// Writes into a single visually-hidden live region rendered by <Announcer /> in the root layout; clears after 1 s so repeats are re-announced
```

### 7.4 Mobile banner — `src/components/layout/MobileDeviceBanner.tsx`

- `'use client'`. Renders when `window.matchMedia('(max-width: 767px)').matches` and the banner isn't dismissed.
- `Banner tone="info" onDismiss={…}` with the §2.3 copy.
- Rendered by `contracts/new/page.tsx` and `ContractView`.
- Not rendered during SSR (it mounts on the client), so there's no hydration mismatch.

---

## 8. State management

| State | Location |
|---|---|
| `onboarding_completed_at` (truth) | `profiles` → passed into `OnboardingProvider` as `completed` |
| Current step, active flag | `OnboardingProvider` React state |
| Pages already seen | `localStorage['ciq:onboarding:seen']` (try/catch) |
| Skipped this session (API failure fallback) | `sessionStorage['ciq:onboarding:skipped']` |
| Completion mutation | `useUpdateProfile()` (owned by `13`) → `apiFetch('/api/account', { method: 'PATCH', json: { onboarding_completed: true } })`. Invalidates `qk.profile()` |
| Mobile banner dismissed | `localStorage['ciq:mobile-banner-dismissed']` |

---

## 9. Components

| Component | File | Props | States |
|---|---|---|---|
| `OnboardingProvider` | `src/components/onboarding/OnboardingProvider.tsx` | `completed: boolean`, `children` | active / inactive |
| `OnboardingTooltips` | `src/components/onboarding/OnboardingTooltips.tsx` | `page: 'dashboard' \| 'upload' \| 'results'` | waiting-for-anchor, open, closed. Anchor missing → step skipped |
| `TermInfo` | `src/components/key-terms/TermInfo.tsx` | `label`, `description` | tooltip closed / open |
| `GlossaryInfo` | same file | `term: GlossaryKey`, `label` | — |
| `MobileDeviceBanner` | `src/components/layout/MobileDeviceBanner.tsx` | none | hidden / shown / dismissed |
| `Announcer` | `src/components/layout/Announcer.tsx` | none | Visually hidden `aria-live` region (rendered once in the root layout) |

---

## 10. Design

- Onboarding popover: `bg-surface border border-border-strong rounded-lg p-4 max-w-xs`, plus a 2 px `border-brand` left accent (`border-l-2`). No shadow (flat depth). Arrow uses `fill-surface`. Title `text-body-lg text-fg-primary`. Body `text-body-sm text-fg-secondary`. Buttons `gap-2`. Enter animation 150 ms ease-out.
- The anchor is highlighted while its tip is open: `ring-2 ring-focus ring-offset-2` through `data-onboarding-active="true"` (a CSS attribute selector in `globals.css`).
- `TermInfo` icon: 16 px `Info` in `text-fg-secondary`, hover `text-fg-primary`. Hit area 32×32 (`IconButton size="sm"` padding).
- Tooltip: the `Tooltip` primitive (`00-foundation.md` §8.1). Max width 280 px. `text-body-sm`.
- Mobile banner: `Banner tone="info"`, placed above the page content.

---

## 11. Edge cases

| Condition | Expected behaviour |
|---|---|
| User completed the tips on another device | `completed = true` from the profile, so no tips |
| Results page has no key terms (shouldn't happen, but defensively) | R1 and R2 anchors never appear → skipped after 10 s. R3 still shows |
| An anchor is off-screen | `scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })` before opening |
| Window resized while a tip is open | Radix repositions it. If the anchor becomes hidden (`display:none` under 768 px), that step is skipped |
| User navigates mid-tour | The popover unmounts with the page. The unfinished page stays "not seen" and shows again on the next visit |
| `PATCH /api/account` fails | Tips are hidden for the session. The next page load retries the PATCH once |
| `localStorage` blocked | Tips show per page on each visit until completion is saved server-side |
| Onboarding popover and a `Dialog` (e.g. delete) open together | Opening a dialog closes the onboarding popover (`onOpenChange` listener on `document` `focusin` inside `[role=dialog][data-state=open]`). The step is shown again afterwards |
| A screen reader user | The popover is `role="dialog"` (non-modal) with title and description. Focus goes to the primary button. Esc closes it |
| Reduced motion | No popover animation, no smooth scroll |
| A term has no description in `TERM_LIBRARY` | Build-time unit test fails (every standard entry needs one), so no ⓘ ever renders empty |

---

## 12. Acceptance criteria

- [ ] A new user sees D1 on the dashboard, U1 on the upload page and R1→R3 on their first results page, each with the correct "n of 5" counter.
- [ ] **Done** on R3, or **Skip tips** anywhere, sets `profiles.onboarding_completed_at`. No tips appear afterwards, including in another browser.
- [ ] Tips can be fully operated by keyboard (Tab, Enter, Esc). Focus returns to the anchor or the page afterwards.
- [ ] Every standard key term shows an ⓘ with a plain-English description, reachable by hover, focus and screen reader.
- [ ] The mobile banner appears under 768 px on the upload and results pages and stays dismissed after a reload.
- [ ] All WCAG items in §3 marked as release blockers pass. axe reports **0 serious or critical** violations on `/`, `/login`, `/signup`, `/verify-email`, `/dashboard` (empty and populated), `/contracts/new` (each wizard step), `/contracts/[id]` (processing, error, results with the Key Terms tab, results with the Chat tab), `/settings`, and every open dialog.
- [ ] The complete review flow (upload → process → edit a term → open "Why?" → jump to a page → ask a chat question → submit feedback) is completed by keyboard only in E2E.
- [ ] With `prefers-reduced-motion: reduce`, no CSS animation lasts more than 0.01 ms and viewer and chat scrolling are instant.

---

## 13. Tests

### Unit

| File | Cases |
|---|---|
| `tests/unit/components/onboarding/OnboardingTooltips.test.tsx` | `completed=true` → renders nothing. Shows D1 once the anchor exists. Next / Done advance and record the page as seen. Skip calls the PATCH (mock `apiFetch`) and hides all tips. Esc closes for the page without calling the API. Missing anchor → skipped after 10 s (fake timers). Counter text "3 of 5" for R1 |
| `tests/unit/lib/glossary.test.ts` | Every `GLOSSARY` value is non-empty and ≤ 160 chars |
| `tests/unit/lib/ai/term-library-descriptions.test.ts` | Every standard `TERM_LIBRARY` entry (NDA 10, MSA 12) has a `description` of 1–160 chars with no unexplained legal Latin (rejects `/\b(inter alia|mutatis mutandis|pari passu)\b/i`) |
| `tests/unit/components/key-terms/TermInfo.test.tsx` | Accessible name `What is Governing Law?`. Tooltip opens on focus. Esc closes |
| `tests/unit/hooks/usePrefersReducedMotion.test.ts` | Reflects `matchMedia`. Updates on the change event. `false` during SSR |
| `tests/unit/hooks/useAnnouncer.test.tsx` | Writes the message to the live region and clears it after 1 s |
| `tests/unit/components/layout/MobileDeviceBanner.test.tsx` | Shown at 375 px, hidden at 1024 px. Dismiss persists. Throwing `localStorage` doesn't crash |

### Integration

| File | Cases |
|---|---|
| `tests/integration/api/account-onboarding.test.ts` | `PATCH /api/account {onboarding_completed:true}` as Alice sets the timestamp. A second call keeps the first timestamp. `{onboarding_completed:false}` → 400. No session → 401. Bob's profile is unaffected |

### E2E (`tests/e2e/`)

| Spec | Cases |
|---|---|
| `onboarding.spec.ts` | New user (fresh signup via admin API): D1 visible → Next → navigate to upload → U1 → complete a review → R1, R2, R3 → Done → reload results → no tips. DB check: `onboarding_completed_at` not null. Second user: Skip tips at D1 → no U1 on the upload page |
| `a11y.spec.ts` | `AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])` on every page and state listed in §12. Asserts 0 violations with impact `serious` or `critical`. Dialog states are scanned while open |
| `keyboard-review.spec.ts` | Keyboard only (`page.keyboard`), no mouse: log in → Tab to "Review a Contract" → Enter → choose NDA through the select (arrow keys) → focus the dropzone, Enter → `setInputFiles` on the file chooser → add a custom term → Process → on results: Tab to the first page link → Enter → the viewer page indicator shows that page → toggle "Why?" → edit a value (Enter saves) → "Edited" badge → switch to the Chat tab (arrow keys) → type a question + Enter → the answer contains a `Page` link → Enter → the viewer moves. Focus is visible at every step (screenshot diff of the focus ring on 3 key controls) |
| `reduced-motion.spec.ts` | `emulateMedia({ reducedMotion: 'reduce' })`: computed `transition-duration` of a `Button` is `1e-05s`. Calling `goToPage` scrolls instantly (`scrollTop` is final within one frame) |
| `mobile.spec.ts` | `mobile-chrome` project: banner on `/contracts/new`, dismiss, reload → hidden. No horizontal scroll on the dashboard at 375 px |
