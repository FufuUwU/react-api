import { createContext, useContext } from "react";
import type { DoughminationClient } from "../client/http";
import type { DoughminationSocket } from "../realtime/socket";

/**
 * Supplies a Cloudflare Turnstile token. The package cannot generate one —
 * it comes from the widget rendered by the consuming app — so login, signup
 * and guestbook posts call this when no explicit token is passed.
 */
export type TurnstileTokenProvider = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;

export interface DoughminationContextValue {
  /** The typed REST client. */
  client: DoughminationClient;
  /**
   * The shared realtime connection. null when realtime is disabled, or on
   * the server before the first client-side effect runs.
   */
  socket: DoughminationSocket | null;
  /** Resolves a Turnstile token from the app-supplied provider, if any. */
  getTurnstileToken: TurnstileTokenProvider | null;
}

export const DoughminationContext =
  createContext<DoughminationContextValue | null>(null);

/** Access the client, socket and Turnstile provider from context. */
export function useDoughmination(): DoughminationContextValue {
  const value = useContext(DoughminationContext);
  if (!value) {
    throw new Error(
      "No Doughmination context found. Wrap your app in <DoughminationProvider>.",
    );
  }
  return value;
}

/** The REST client on its own. */
export function useDoughminationClient(): DoughminationClient {
  return useDoughmination().client;
}

/**
 * The shared socket, or null when realtime is disabled / not yet mounted.
 * Hooks that need it should tolerate null rather than assume a connection.
 */
export function useDoughminationSocket(): DoughminationSocket | null {
  return useDoughmination().socket;
}
