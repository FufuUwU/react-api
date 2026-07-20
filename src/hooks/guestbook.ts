/**
 * Guestbook hooks. Reading is public; posting needs a Turnstile token from
 * the consuming app (see `useGuestbookPost` in `mutations.ts`).
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { useDoughminationClient } from "../provider/context";
import { queryKeys } from "./keys";
import type { QueryOptionsFor } from "./discord";
import type { DoughminationError } from "../client/errors";
import type { GuestbookPage } from "../types/guestbook";

export interface UseGuestbookParams {
  /** Clamped server-side to 1–200. Defaults to 50. */
  limit?: number;
  offset?: number;
}

/**
 * A page of guestbook entries, newest first.
 *
 * Previous data is kept while a new page loads, so paginating doesn't flash
 * an empty list.
 *
 * ```tsx
 * const { data } = useGuestbook({ limit: 20, offset: page * 20 });
 * ```
 */
export function useGuestbook(
  params: UseGuestbookParams = {},
  options?: QueryOptionsFor<GuestbookPage>,
): UseQueryResult<GuestbookPage, DoughminationError> {
  const client = useDoughminationClient();
  const { limit, offset } = params;

  return useQuery({
    queryKey: queryKeys.guestbook.page(limit, offset),
    queryFn: ({ signal }) => client.getGuestbook({ limit, offset }, signal),
    placeholderData: keepPreviousData,
    ...options,
  });
}
