import React from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';
import { ErrorBoundary } from './components/layout/ErrorBoundary';

/**
 * Fournisseurs communs au navigateur (main.tsx) et au pré-rendu des pages
 * publiques (entry-server.tsx). Le routeur est passé en enfant : BrowserRouter
 * côté client, StaticRouter côté build.
 */
export function Root({ children, helmetContext }: { children: ReactNode; helmetContext?: object }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <React.StrictMode>
      <ErrorBoundary>
        <HelmetProvider context={helmetContext}>
          <QueryClientProvider client={queryClient}>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                success: { duration: 3000, style: { background: '#1A6B3A', color: '#fff' } },
                error: { duration: 8000, style: { background: '#B71C1C', color: '#fff' } },
              }}
            />
          </QueryClientProvider>
        </HelmetProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
