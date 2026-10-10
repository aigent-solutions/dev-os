# 02 — Landing Page

**PRD / engineering-doc refs:** PRD Flow 1 step 1, roadmap v0.1 ("Landing page (static, no dynamic content)"), PRD §11 Transparency ("Powered by OpenAI GPT-4o" attribution). Engineering-doc §4.1 step 1, §5.2 (route `/`, SSG), §5.3 (`(marketing)/page.tsx`). Feature **F2**.
**Depends on:** `00-foundation.md` (layout, tokens, UI primitives, middleware redirect for signed-in users).

---

## 1. Overview

A static, statically generated (SSG) marketing page at `/`. It explains the value, shows a short demo GIF, and has two CTAs: **Sign In** (→ `/login`) and **Get Started Free** (→ `/signup`). Signed-in users never see it, because middleware redirects `/` to `/dashboard` (`00-foundation.md` §6.4). The page makes **no** data requests and has no client JavaScript beyond Next.js's default.

---

## 2. User flow

1. A visitor opens `/`. The static HTML is served from the CDN.
2. They read the hero, the 3-step "How it works", the feature grid and the trust section.
3. They click **Get Started Free** → `/signup` (`01-auth.md`), or **Sign In** → `/login`.
4. A signed-in user who opens `/` is redirected to `/dashboard` by middleware before the page renders.

---

## 3. Database

None. The page is static and reads no data.

---

## 4. Database tasks

None.

---

## 5. API routes

None.

---

## 6. Backend implementation

| File | Detail |
|---|---|
| `src/app/(marketing)/page.tsx` | Server Component. `export const dynamic = 'force-static'`. Exports `metadata` (§6.1). Renders the components in §8 |
| `src/app/(marketing)/layout.tsx` | `MarketingHeader` + `<main id="main">` + `Footer` |
| `public/demo.gif` | ≤ 3 MB, 1200×750, ≤ 20 s loop: upload → term preview → results panel → click a page → chat answer with a citation. Recorded by the team from a seeded demo contract. Also `public/demo-poster.png` (first frame, 1200×750) |
| `public/og-image.png` | 1200×630 social image |
| `src/app/(marketing)/terms/page.tsx`, `privacy/page.tsx` | Static pages linked from the footer and signup. Content comes from the legal review (a PRD dependency before v1.0). Until then they show "This page will be published before public launch." and are `noindex` |

### 6.1 Metadata

```ts
export const metadata: Metadata = {
  title: 'ContractIQ — Understand your NDAs and MSAs in minutes',
  description: 'Upload an NDA or MSA and get the key terms, page references and confidence scores in under 30 seconds. Ask follow-up questions in plain English.',
  openGraph: { title: 'ContractIQ', description: '…same…', images: ['/og-image.png'], type: 'website' },
  robots: { index: true, follow: true },
};
```

---

## 7. State management

None. There's no client state. The header's mobile menu is a `<details>`/`<summary>` disclosure, so no JavaScript is needed.

---

## 8. Components

`src/components/marketing/`. All are Server Components.

### 8.1 `MarketingHeader`

- Left: the "ContractIQ" wordmark (text, `text-h5`), linked to `/`.
- Right (≥ 768 px): `Button variant="ghost" asChild` → `<Link href="/login">Sign In</Link>`, and `Button variant="primary" asChild` → `<Link href="/signup">Get Started Free</Link>`.
- Under 768 px both buttons stay visible and compact (`size="sm"`).
- `<header>` with `<nav aria-label="Main">`.

### 8.2 `Hero`

| Element | Content |
|---|---|
| Eyebrow (`Badge tone="brand"`) | "For NDAs and MSAs" |
| H1 (`text-h2` under 768 px, `text-h1` from `md`) | "Understand any NDA or MSA in minutes — not hours" |
| Body (`text-body-lg text-fg-secondary`, max-w-prose) | "ContractIQ pulls out the terms that matter — payment, liability, IP, termination and more — tells you the exact page each one is on, and shows how confident it is. Then you can ask follow-up questions in plain English." |
| CTAs | Primary `Get Started Free` → `/signup`. Secondary `Sign In` → `/login` |
| Sub-CTA note (`text-body-sm text-fg-secondary`) | "14-day free trial · No credit card required · Text-based PDFs up to 20 pages" |
| Media | `<img src="/demo.gif" alt="Demo: uploading an NDA, reviewing extracted key terms with page numbers and confidence scores, and asking a question in chat" width="1200" height="750" loading="eager">` inside a `Card` with `rounded-lg border border-border` and the poster as background. Under `prefers-reduced-motion: reduce`, a `<picture>` with `<source media="(prefers-reduced-motion: reduce)" srcset="/demo-poster.png">` shows the still image |

### 8.3 `HowItWorks`

`SectionHeader` "How it works", then 3 cards in a row (stacked under 768 px), each with a step number `Badge`, an icon, a title (`text-body-lg`) and a body (`text-body-sm text-fg-secondary`):

1. `Upload` — "Upload your contract" — "Choose NDA or MSA and drop in a PDF. Add up to 5 custom terms you care about."
2. `Sparkles` — "Get the key terms" — "See each term's value, the page it's on, a confidence score, and the exact sentence it came from."
3. `MessageSquare` — "Ask anything" — "Chat with your contract. Every answer cites the page, and if it's not in the document, we'll say so."

### 8.4 `FeatureGrid`

`SectionHeader` "Built for people without a legal team". 4 cards (2×2 from `md`, 1 column below):

| Icon | Title | Body |
|---|---|---|
| `FileSearch` | Page-level references | "Click any term to jump to the exact page in your PDF." |
| `Gauge` | Confidence you can see | "Green, amber and red scores show what to double-check. Low-confidence terms are always flagged." |
| `Quote` | Source sentences | "Every value shows the sentence from your contract it was taken from." |
| `PencilLine` | Fix anything | "Edit any term inline. Your edits are saved and marked." |

### 8.5 `TrustSection`

`SectionHeader` "Your contracts stay yours":

- "Your files are private to your account and encrypted at rest and in transit."
- "We never use your contracts to train AI models."
- "Uploaded PDFs are deleted automatically 90 days after you last open them, and you can delete everything at any time."

Then a `Banner tone="info"` (no dismiss button): "ContractIQ is an AI-assisted review tool, not legal advice. Always verify critical terms with a qualified lawyer."

### 8.6 `CtaBand`

Card on `bg-brand-subtle`: H5 "Review your next contract in under 15 minutes", and the primary CTA `Get Started Free` → `/signup`.

### 8.7 `Footer`

- `<footer>`: "© {current year} ContractIQ" · links "Terms" (`/terms`), "Privacy" (`/privacy`) · the text **"Powered by OpenAI GPT-4o"** (required attribution, PRD §11).
- Also rendered in `(app)/layout.tsx`, so the attribution appears on every app page (results pages included).
- `text-body-sm text-fg-secondary`, top border `border-border`, `py-6`.

---

## 9. Design

- `PageContainer` layout (`00-foundation.md` §9.6). Section gap `gap-16` (64 px, the design.md inter-section spacing) on the landing page only. Header and sections on `bg-surface-page`. Cards on `bg-surface`.
- Typography: H1 only in the hero. Section titles `text-h5`. Card titles `text-body-lg`. Card bodies `text-body-sm text-fg-secondary`.
- Colour: grey by default. Brand blue only on CTAs, the eyebrow badge and the CTA band. Icons `text-fg-secondary` (24 px, `aria-hidden`).
- No shadows or gradients (flat depth). Cards use `border-border rounded-lg`.
- Responsive: hero text and media stack under 1024 px (media below the text). Grids collapse to 1 column under 768 px.

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| Signed-in user opens `/` | Middleware 307 → `/dashboard`. The landing page isn't rendered |
| Signed-in user with an expired session opens `/` | `updateSession` refreshes it. If that fails, they're treated as a visitor and see the landing page |
| `demo.gif` fails to load | The poster background and `alt` text show. The layout keeps its size (explicit width and height, so no layout shift) |
| Reduced motion preferred | The static poster is shown instead of the GIF |
| JavaScript disabled | The page renders fully (static HTML). Links work. The mobile menu works through `<details>` |
| Very narrow screens (320 px) | No horizontal scroll. CTAs wrap to full width |

---

## 11. Acceptance criteria

- [ ] `/` is statically generated (`○` in the `next build` output) and makes no network requests to Supabase or `/api`.
- [ ] The hero shows the value proposition, the demo GIF and both CTAs ("Sign In" → `/login`, "Get Started Free" → `/signup`).
- [ ] The footer shows "Powered by OpenAI GPT-4o" on the landing page and on every `(app)` page.
- [ ] The landing page shows the "not legal advice" notice.
- [ ] A signed-in user requesting `/` is redirected to `/dashboard`.
- [ ] Lighthouse (mobile): Accessibility ≥ 95, Performance ≥ 85, CLS < 0.1.
- [ ] axe: no serious or critical violations. Exactly one `h1`. Headings in order.
- [ ] No horizontal scroll at 320 px. Layout correct at 768 px and 1280 px.

---

## 12. Tests

### Unit

| File | Cases |
|---|---|
| `tests/unit/components/marketing/Hero.test.tsx` | Renders the H1 text. CTA links have hrefs `/signup` and `/login`. The GIF has non-empty `alt`, `width` and `height` |
| `tests/unit/components/marketing/Footer.test.tsx` | Contains "Powered by OpenAI GPT-4o" and the Terms and Privacy links |

### Integration

None. There's no server logic. The middleware redirect is covered by `tests/integration/middleware.test.ts` (`00-foundation.md`).

### E2E (`tests/e2e/landing.spec.ts`)

1. Signed out: `/` → the H1 is visible. Click "Get Started Free" → URL `/signup`. Back. Click "Sign In" → URL `/login`.
2. Signed in (Alice storage state): `page.goto('/')` → final URL `/dashboard`.
3. Footer attribution is visible on `/` and on `/dashboard`.
4. `@axe-core/playwright` scan of `/` → 0 serious or critical violations.
5. Viewport 320×640: `document.documentElement.scrollWidth <= 320`.
6. `page.emulateMedia({ reducedMotion: 'reduce' })` → the visible hero image is `demo-poster.png`.
