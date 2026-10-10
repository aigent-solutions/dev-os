// Runtime guard: throws if a server module is evaluated in a browser bundle.
// Used instead of the `server-only` package by modules that Netlify functions and evals load
// (00-foundation.md §6.12). The ESLint rule `local/no-server-in-client` is the build-time check.
if (typeof window !== 'undefined') {
  throw new Error('This module is server-only and was imported into client code.');
}
export {};
