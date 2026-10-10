# ContractIQ

AI-assisted NDA and MSA review. Next.js 14 (App Router, TypeScript strict), Supabase, OpenAI, Netlify.

The specs are the source of truth:
- Architecture: `../docs/engineering/engineering-doc.md`
- Implementation specs and shared contract: `../docs/specs/` (start with `README.md`)
- Design system: `../docs/design.md` (tokens in `src/styles/tokens.css`, mapped in `tailwind.config.ts`)

## Local setup

1. `npm install` (also copies the PDF.js worker into `public/`).
2. `cp .env.example .env.local` and fill in values. `.env.local` is git-ignored; never commit real keys.
3. `npm run db:start` starts local Supabase and applies `supabase/migrations/`. Copy the API URL, anon key and service-role key from `supabase status` into `.env.local`.
4. `npm run dev` runs `netlify dev` on http://localhost:8888 (Next.js plus Netlify functions). `npm run dev:next` runs Next.js alone on :3000.

## Checks

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, plus `check-no-hex` (design tokens only) and `check-admin-imports` (service-role allowlist) |
| `npm run build` | Production build |
| `npm run db:verify-rls` | Every table has RLS and ≥ 1 policy; server-only tables have no API-role grants |

Test, eval and type-generation scripts become runnable as the Stage 4 and Stage 5 work adds their files.
