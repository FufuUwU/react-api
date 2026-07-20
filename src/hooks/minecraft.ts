/**
 * Minecraft hooks. Both are public reads.
 *
 * UUIDs may be dashed, undashed, or in NBT int-array form — the API
 * normalises them.
 */

import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { useDoughminationClient } from "../provider/context";
import { queryKeys } from "./keys";
import type { QueryOptionsFor } from "./discord";
import type { DoughminationError } from "../client/errors";
import type {
  UnifiedMinecraftGeneral,
  UnifiedMinecraftHypixel,
  VanillaCapeList,
} from "../types/minecraft";

/**
 * Mojang identity, skin, capes and ready-to-embed render URLs.
 *
 * ```tsx
 * const { data } = useMinecraftProfile("79ef438d69ea473c99cd6a5ec34c6736");
 * <img src={data?.render.body} alt={data?.name ?? ""} />
 * ```
 */
export function useMinecraftProfile(
  uuid: string | null | undefined,
  options?: QueryOptionsFor<UnifiedMinecraftGeneral>,
): UseQueryResult<UnifiedMinecraftGeneral, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.minecraft.profile(uuid ?? ""),
    queryFn: ({ signal }) => client.getMinecraftProfile(uuid as string, signal),
    enabled: Boolean(uuid) && (options?.enabled ?? true),
    // Skins and capes change rarely; don't refetch on every mount.
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Hypixel + SkyBlock stats.
 *
 * Only the operator's own allowlisted UUIDs are served — anything else is a
 * 403 by design (Hypixel API policy forbids proxying arbitrary players). The
 * request still resolves with 200 for an allowlisted player who has never
 * joined Hypixel; check `data.source.player` to tell the cases apart.
 *
 * `player` and `skyblock` are raw upstream blobs; see `getPlayerSummary` and
 * `getSkyblockProfiles` for typed access to the common fields.
 */
export function useHypixelStats(
  uuid: string | null | undefined,
  options?: QueryOptionsFor<UnifiedMinecraftHypixel>,
): UseQueryResult<UnifiedMinecraftHypixel, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.minecraft.hypixel(uuid ?? ""),
    queryFn: ({ signal }) => client.getHypixelStats(uuid as string, signal),
    enabled: Boolean(uuid) && (options?.enabled ?? true),
    // The API caches Hypixel for 5 minutes and ignores force-refresh params,
    // so refetching faster than this just returns the same payload.
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/** The accumulated catalogue of vanilla Mojang capes the API has seen. */
export function useMinecraftCapes(
  options?: QueryOptionsFor<VanillaCapeList>,
): UseQueryResult<VanillaCapeList, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.minecraft.capes(),
    queryFn: ({ signal }) => client.getMinecraftCapes(signal),
    staleTime: 60 * 60 * 1000,
    ...options,
  });
}
