/**
 * The provider owns exactly one REST client and one WebSocket for the whole
 * tree. Every hook reads them from context, so N components watching live
 * data still cost one connection.
 *
 * Must be rendered inside a TanStack `<QueryClientProvider>` — the query
 * hooks and the force-refresh invalidation both need a QueryClient.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DoughminationClient } from "../client/http";
import type { DoughminationClientOptions, TokenSource } from "../client/http";
import { DoughminationSocket } from "../realtime/socket";
import type { SocketOptions } from "../realtime/socket";
import { DoughminationContext } from "./context";
import type { TurnstileTokenProvider } from "./context";
import { queryKeys } from "../hooks/keys";

export interface DoughminationProviderProps {
  children: ReactNode;

  /** API base URL. Defaults to https://doughmination.uk/v2. */
  baseUrl?: string;

  /**
   * JWT bearer for authenticated writes. Pass a function to read from your
   * own auth store on every request (e.g. `() => localStorage.getItem("token")`).
   * Reads need no token at all.
   */
  token?: TokenSource;
  /** X-Battery-Key, for device reports and guestbook moderation. */
  batteryKey?: TokenSource;
  /** Bot token for /plural/bot/* — server runtimes only (needs a User-Agent). */
  botToken?: TokenSource;

  /**
   * Supplies a Turnstile token for login / signup / guestbook posts. The
   * package never solves the captcha itself; render the widget in your app
   * and return its token here. Individual mutations can override it.
   */
  turnstile?: TurnstileTokenProvider;

  /** Disable the WebSocket entirely (REST hooks keep working). Default true. */
  realtime?: boolean;
  /** Override the socket URL. Defaults to `${baseUrl}/ws` with ws(s) scheme. */
  socketUrl?: string;
  /** Tuning for reconnect/keepalive behaviour. */
  socketOptions?: Omit<SocketOptions, "url" | "onError">;

  /** Custom fetch (SSR, testing, instrumentation). */
  fetch?: typeof fetch;
  /** Extra headers on every REST request. */
  headers?: Record<string, string>;

  /** Bring your own client instead of having the provider construct one. */
  client?: DoughminationClient;

  /** Transport errors, malformed frames, and listener exceptions. */
  onError?: (error: unknown) => void;

  /**
   * Invalidate cached queries when the API broadcasts `force_refresh`.
   * Default true.
   */
  invalidateOnForceRefresh?: boolean;
}

export function DoughminationProvider(props: DoughminationProviderProps) {
  const {
    children,
    baseUrl,
    token,
    batteryKey,
    botToken,
    turnstile,
    realtime = true,
    socketUrl,
    socketOptions,
    fetch: fetchImpl,
    headers,
    client: providedClient,
    onError,
    invalidateOnForceRefresh = true,
  } = props;

  const queryClient = useQueryClient();

  // Keep the latest callbacks in refs so changing them doesn't tear down the
  // client or reconnect the socket.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const turnstileRef = useRef(turnstile);
  turnstileRef.current = turnstile;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const batteryKeyRef = useRef(batteryKey);
  batteryKeyRef.current = batteryKey;
  const botTokenRef = useRef(botToken);
  botTokenRef.current = botToken;

  const headerKey = headers ? JSON.stringify(headers) : "";

  const client = useMemo(() => {
    if (providedClient) return providedClient;
    const options: DoughminationClientOptions = {
      baseUrl,
      // Read through the refs so a token that arrives after login is picked
      // up without rebuilding the client.
      token: () => resolve(tokenRef.current),
      batteryKey: () => resolve(batteryKeyRef.current),
      botToken: () => resolve(botTokenRef.current),
      fetch: fetchImpl,
      headers,
    };
    return new DoughminationClient(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providedClient, baseUrl, fetchImpl, headerKey]);

  const resolvedSocketUrl = socketUrl ?? client.socketUrl;
  const socketOptionsKey = socketOptions ? JSON.stringify(socketOptions) : "";

  const [socket, setSocket] = useState<DoughminationSocket | null>(null);

  // Created in an effect so SSR renders without touching WebSocket.
  useEffect(() => {
    if (!realtime) {
      setSocket(null);
      return;
    }

    const instance = new DoughminationSocket({
      ...socketOptions,
      url: resolvedSocketUrl,
      onError: (error) => onErrorRef.current?.(error),
    });
    setSocket(instance);

    return () => {
      instance.close();
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime, resolvedSocketUrl, socketOptionsKey]);

  // force_refresh is the API's "drop what you have and refetch" broadcast.
  useEffect(() => {
    if (!socket || !invalidateOnForceRefresh) return;
    return socket.on("force_refresh", () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.all });
    });
  }, [socket, invalidateOnForceRefresh, queryClient]);

  const value = useMemo(
    () => ({
      client,
      socket,
      getTurnstileToken: turnstileRef.current
        ? (() => turnstileRef.current?.()) as TurnstileTokenProvider
        : null,
    }),
    [client, socket],
  );

  return (
    <DoughminationContext.Provider value={value}>
      {children}
    </DoughminationContext.Provider>
  );
}

function resolve(source: TokenSource) {
  return typeof source === "function" ? source() : source;
}
