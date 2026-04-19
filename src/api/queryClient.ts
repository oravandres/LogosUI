import {
  MutationCache,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { logApiError } from "@/api/logger";

/**
 * Builds the application's TanStack Query client with global cache hooks
 * that funnel every query / mutation failure through the structured
 * `logApiError` sink. Per-call `onError` callbacks still run for UI
 * behavior (toast, inline banner); this layer is purely for observability.
 *
 * Exposed as a factory so tests can build an isolated client without
 * importing the production singleton, and so the wiring itself is
 * unit-testable.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: import.meta.env.PROD,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        logApiError(error, { source: "query", key: query.queryKey });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        logApiError(error, {
          source: "mutation",
          key: mutation.options.mutationKey,
        });
      },
    }),
  });
}
