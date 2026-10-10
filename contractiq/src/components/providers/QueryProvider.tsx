'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiClientError } from '@/lib/api-client';

/** A 401 from any apiFetch call sends the user to sign in, then back to where they were. */
function handleAuthError(err: unknown) {
  if (err instanceof ApiClientError && err.status === 401 && typeof window !== 'undefined') {
    window.location.assign('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search));
  }
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleAuthError }),
        mutationCache: new MutationCache({ onError: handleAuthError }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Retry network and 5xx errors twice; never retry 4xx.
            retry: (count, err) => count < 2 && !(err instanceof ApiClientError && err.status > 0 && err.status < 500),
          },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
