/**
 * Live Discord presence over the shared socket.
 *
 * Presence is the one opt-in feed: the client sends a `subscribe` frame, the
 * hub replies with an `init_state` snapshot, then pushes `presence_update`
 * for the subscribed users only.
 *
 * Subscriptions are ref-counted in the socket layer, so several components
 * can watch overlapping id sets and unmounting one never cancels another's
 * feed. The socket sends the union of all live references, and re-sends it
 * after a reconnect (a fresh socket starts with no subscription server-side).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDoughminationSocket } from "../provider/context";
import type { UnifiedPresence } from "../types/discord";
import type { ConnectionStatus, DoughminationEventType, EventOfType } from "../types/events";

export interface UsePresenceResult {
  /** Latest presence per subscribed user id. */
  presences: Record<string, UnifiedPresence>;
  /** Convenience accessor for a single user. */
  getPresence: (userId: string) => UnifiedPresence | undefined;
  /** Connection lifecycle of the shared socket. */
  status: ConnectionStatus;
  /** True once the `init_state` snapshot has arrived. */
  isReady: boolean;
  /** True while the socket is open. */
  isLive: boolean;
}

/**
 * Subscribe to live presence for specific users, or `"all"` for every user
 * the API tracks.
 *
 * ```tsx
 * const { presences, isLive } = usePresence(["209830981060788225"]);
 * const me = presences["209830981060788225"];
 * ```
 *
 * The `userIds` array does not need to be memoised — subscriptions are keyed
 * by the sorted id list, so a new array with the same ids won't resubscribe.
 */
export function usePresence(userIds: string[] | "all"): UsePresenceResult {
  const socket = useDoughminationSocket();

  const isAll = userIds === "all";
  // Sorted, joined ids form a stable dependency across re-renders.
  const idsKey = isAll ? "all" : [...userIds].sort().join(",");
  const ids = useMemo(
    () => (isAll ? [] : idsKey ? idsKey.split(",") : []),
    [isAll, idsKey],
  );

  const [presences, setPresences] = useState<Record<string, UnifiedPresence>>({});
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>(
    socket?.connectionStatus ?? "idle",
  );

  // Read inside listeners without making them a dependency.
  const wantedRef = useRef<{ all: boolean; ids: Set<string> }>({
    all: isAll,
    ids: new Set(ids),
  });
  wantedRef.current = { all: isAll, ids: new Set(ids) };

  useEffect(() => {
    if (!socket) return;
    setStatus(socket.connectionStatus);
    return socket.onStatusChange(setStatus);
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    if (!isAll && ids.length === 0) {
      setPresences({});
      setIsReady(false);
      return;
    }

    // Another component may already be subscribed — seed from the socket's
    // cache so this mount renders with data immediately.
    const snapshot = socket.getPresenceSnapshot();
    const seeded = filterPresences(snapshot, wantedRef.current);
    if (Object.keys(seeded).length > 0) setPresences(seeded);

    const release = socket.subscribePresence(isAll ? "all" : ids);

    const offInit = socket.on("init_state", (event) => {
      setPresences(filterPresences(event.data ?? {}, wantedRef.current));
      setIsReady(true);
    });

    const offUpdate = socket.on("presence_update", (event) => {
      const presence = event.data;
      if (!presence?.user_id) return;
      // The hub fans out the union of every socket subscription, so filter
      // down to what this hook actually asked for.
      if (!wantedRef.current.all && !wantedRef.current.ids.has(presence.user_id)) {
        return;
      }
      setPresences((previous) => ({ ...previous, [presence.user_id]: presence }));
    });

    return () => {
      offInit();
      offUpdate();
      release();
      setIsReady(false);
    };
  }, [socket, isAll, idsKey, ids]);

  const getPresence = useCallback(
    (userId: string) => presences[userId],
    [presences],
  );

  return {
    presences,
    getPresence,
    status,
    isReady,
    isLive: status === "open",
  };
}

/** Live presence for a single user. */
export function useUserPresence(
  userId: string | null | undefined,
): UnifiedPresence | undefined {
  const ids = useMemo(() => (userId ? [userId] : []), [userId]);
  const { presences } = usePresence(ids);
  return userId ? presences[userId] : undefined;
}

/** The shared socket's connection status. */
export function useConnectionStatus(): ConnectionStatus {
  const socket = useDoughminationSocket();
  const [status, setStatus] = useState<ConnectionStatus>(
    socket?.connectionStatus ?? "idle",
  );

  useEffect(() => {
    if (!socket) {
      setStatus("idle");
      return;
    }
    setStatus(socket.connectionStatus);
    return socket.onStatusChange(setStatus);
  }, [socket]);

  return status;
}

/**
 * Escape hatch: run a handler for any raw socket event.
 *
 * ```tsx
 * useDoughminationEvent("force_refresh", () => toast("Refreshed"));
 * ```
 */
export function useDoughminationEvent<T extends DoughminationEventType>(
  type: T,
  handler: (event: EventOfType<T>) => void,
): void {
  const socket = useDoughminationSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    return socket.on(type, (event) => handlerRef.current(event));
  }, [socket, type]);
}

function filterPresences(
  source: Record<string, UnifiedPresence>,
  wanted: { all: boolean; ids: Set<string> },
): Record<string, UnifiedPresence> {
  if (wanted.all) return { ...source };
  const result: Record<string, UnifiedPresence> = {};
  for (const id of wanted.ids) {
    const presence = source[id];
    if (presence) result[id] = presence;
  }
  return result;
}
