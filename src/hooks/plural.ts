/**
 * Plural system hooks.
 *
 * `useFronters` and `useMentalState` are seeded from REST and then kept live
 * by the socket — those two events are broadcast to every client, so no
 * subscription frame is needed.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { useDoughminationClient, useDoughminationSocket } from "../provider/context";
import { queryKeys } from "./keys";
import type { QueryOptionsFor } from "./discord";
import type { DoughminationError } from "../client/errors";
import type {
  FrontersResponse,
  MentalState,
  PluralMember,
  PluralSystem,
  MemberStatusResponse,
  UserResponse,
} from "../types/plural";

/**
 * The current fronters, live.
 *
 * Seeded from `GET /plural/fronters` (members enriched with `tags` and
 * `status`), then updated by `fronters_update`. That event carries PluralKit's
 * raw object, which is missing both enrichments — so instead of replacing the
 * cache wholesale we merge per member, keeping the enriched fields from the
 * previous value. Without this, `tags` and `status` would silently vanish on
 * the first switch.
 */
export function useFronters(
  options?: QueryOptionsFor<FrontersResponse>,
): UseQueryResult<FrontersResponse, DoughminationError> {
  const client = useDoughminationClient();
  const socket = useDoughminationSocket();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.plural.fronters(),
    queryFn: ({ signal }) => client.getFronters(signal),
    ...options,
  });

  useEffect(() => {
    if (!socket) return;
    return socket.on("fronters_update", (event) => {
      queryClient.setQueryData<FrontersResponse>(
        queryKeys.plural.fronters(),
        (previous) => mergeFronters(previous, event.data, queryClient),
      );
    });
  }, [socket, queryClient]);

  return query;
}

/**
 * Re-attach the `tags` / `status` enrichment the socket payload drops, taking
 * it from the previous fronters value or, failing that, the members cache.
 */
function mergeFronters(
  previous: FrontersResponse | undefined,
  incoming: FrontersResponse,
  queryClient: ReturnType<typeof useQueryClient>,
): FrontersResponse {
  const incomingMembers = incoming.members;
  if (!incomingMembers) return incoming;

  const enrichedById = new Map<string, PluralMember>();
  for (const member of previous?.members ?? []) {
    if (member.id) enrichedById.set(member.id, member);
  }
  const cachedMembers = queryClient.getQueryData<PluralMember[]>(
    queryKeys.plural.members(),
  );
  for (const member of cachedMembers ?? []) {
    if (member.id && !enrichedById.has(member.id)) enrichedById.set(member.id, member);
  }

  return {
    ...incoming,
    members: incomingMembers.map((member) => {
      const known = member.id ? enrichedById.get(member.id) : undefined;
      if (!known) return member;
      return {
        ...member,
        tags: member.tags ?? known.tags,
        status: member.status !== undefined ? member.status : known.status,
      };
    }),
  };
}

/** Every member, enriched with `tags` and `status`. Public read. */
export function useMembers(
  options?: QueryOptionsFor<PluralMember[]>,
): UseQueryResult<PluralMember[], DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.plural.members(),
    queryFn: ({ signal }) => client.getMembers(signal),
    staleTime: 60 * 1000,
    ...options,
  });
}

/** One member, by member id or (case-insensitive) name. */
export function useMember(
  memberId: string | null | undefined,
  options?: QueryOptionsFor<PluralMember>,
): UseQueryResult<PluralMember, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.plural.member(memberId ?? ""),
    queryFn: ({ signal }) => client.getMember(memberId as string, signal),
    enabled: Boolean(memberId) && (options?.enabled ?? true),
    ...options,
  });
}

/**
 * The system's mental state, live.
 *
 * Seeded from `GET /plural/mental-state` and updated by the
 * `mental_state_update` broadcast.
 */
export function useMentalState(
  options?: QueryOptionsFor<MentalState>,
): UseQueryResult<MentalState, DoughminationError> {
  const client = useDoughminationClient();
  const socket = useDoughminationSocket();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.plural.mentalState(),
    queryFn: ({ signal }) => client.getMentalState(signal),
    ...options,
  });

  useEffect(() => {
    if (!socket) return;
    return socket.on("mental_state_update", (event) => {
      queryClient.setQueryData<MentalState>(
        queryKeys.plural.mentalState(),
        event.data,
      );
    });
  }, [socket, queryClient]);

  return query;
}

/** PluralKit system info, with `mental_state` merged in by the API. */
export function useSystem(
  options?: QueryOptionsFor<PluralSystem>,
): UseQueryResult<PluralSystem, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.plural.system(),
    queryFn: ({ signal }) => client.getSystem(signal),
    staleTime: 60 * 1000,
    ...options,
  });
}

/** A single member's status note. */
export function useMemberStatus(
  identifier: string | null | undefined,
  options?: QueryOptionsFor<MemberStatusResponse>,
): UseQueryResult<MemberStatusResponse, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.plural.memberStatus(identifier ?? ""),
    queryFn: ({ signal }) => client.getMemberStatus(identifier as string, signal),
    enabled: Boolean(identifier) && (options?.enabled ?? true),
    ...options,
  });
}

/**
 * The logged-in user. Requires a bearer token on the provider; stays disabled
 * until one is available if you pass `enabled`.
 */
export function useUserInfo(
  options?: QueryOptionsFor<UserResponse>,
): UseQueryResult<UserResponse, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: queryKeys.plural.userInfo(),
    queryFn: ({ signal }) => client.getUserInfo(signal),
    retry: false,
    ...options,
  });
}
