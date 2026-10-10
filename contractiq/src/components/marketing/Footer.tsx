import Link from 'next/link';

const linkClass = 'rounded-sm text-fg-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

/** Site footer with the required "Powered by OpenAI GPT-4o" attribution (02 §8.7, PRD §11). Landing page and every app page. */
export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-page">
      <div className="mx-auto flex w-full max-w-screen-xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-body-sm text-fg-secondary md:px-8 xl:px-28">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>© {new Date().getFullYear()} ContractIQ</span>
          <Link href="/terms" className={linkClass}>
            Terms
          </Link>
          <Link href="/privacy" className={linkClass}>
            Privacy
          </Link>
        </div>
        <p>Powered by OpenAI GPT-4o</p>
      </div>
    </footer>
  );
}
