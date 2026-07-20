/**
 * Discord query hooks. Both are public reads — no auth configuration needed.
 *
 * The `presence` field inside each record is a REST snapshot. For a live feed
 * use `usePresence()`, which subscribes over the socket; these hooks merge
 * live presence into their cached record when the two overlap.
 */

import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";

import { useDoughminationClient } from "../provider/context";
import { queryKeys } from "./keys";
import type { DoughminationError } from "../client/errors";
import type {
  UnifiedRecord,
  UnifiedRecordMap,
  DiscordGatewayStatus,
} from "../types/discord";

/** Options passed through to TanStack Query, minus the parts we control. */
export type QueryOptionsFor<TData> = Omit<
  UseQueryOptions<TData, DoughminationError, TData, readonly unknown[]>,
  "queryKey" | "queryFn"
>;

/**
 * One Discord user: profile, badges, connected accounts, collectibles and a
 * presence snapshot.
 *
 * ```tsx
 * const { data, isLoading } = useDiscordUser("209830981060788225");
 * ```
 */
export function useDiscordUser(
  id: string | null | undefined,
  options?: QueryOptionsFor<UnifiedRecord>,
): UseQueryResult<UnifiedRecord, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.discord.user(id ?? ""),
    queryFn: ({ signal }) => client.getDiscordUser(id as string, signal),
    enabled: Boolean(id) && (options?.enabled ?? true),
    ...options,
  });
}

/**
 * Several Discord users in one round-trip (max 100 ids). Ids that don't
 * resolve come back as `null` rather than failing the whole batch.
 */
export function useDiscordUsers(
  ids: string[],
  options?: QueryOptionsFor<UnifiedRecordMap>,
): UseQueryResult<UnifiedRecordMap, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.discord.users(ids),
    queryFn: ({ signal }) => client.getDiscordUsers(ids, signal),
    enabled: ids.length > 0 && (options?.enabled ?? true),
    ...options,
  });
}

/** Gateway connection status — mostly useful for debugging/status pages. */
export function useDiscordStatus(
  options?: QueryOptionsFor<DiscordGatewayStatus>,
): UseQueryResult<DiscordGatewayStatus, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.discord.status(),
    queryFn: ({ signal }) => client.getDiscordStatus(signal),
    ...options,
  });
}
