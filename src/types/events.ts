/**
 * Realtime event types for the single socket at /v2/ws.
 *
 * Transcribed from `src/system/do.ts` (the hub), `src/system/ws.ts` (the
 * broadcast helpers) and the route handlers that call them.
 *
 * Delivery rules:
 *   - `fronters_update`, `mental_state_update`, `device_update` and
 *     `force_refresh` go to EVERY connected client, no subscription needed.
 *   - `presence_update` is opt-in: send a `subscribe` frame first. The hub
 *     replies with an `init_state` snapshot, then sends only the users you
 *     subscribed to.
 *   - The literal string "ping" is answered with "pong" by a Cloudflare
 *     auto-response pair, which does NOT wake the Durable Object. Keepalives
 *     are therefore cheap — but they are plain strings, not JSON frames.
 */

import type { UnifiedPresence } from "./discord";
import type { FrontersResponse, MentalState } from "./plural";
import type { DeviceUpdatePayload } from "./devices";

/** Sent once, immediately on connect. Note: not a { type, data } envelope. */
export interface ConnectionEstablishedEvent {
  type: "connection_established";
  /** ISO 8601. */
  timestamp: string;
  message: string;
}

/** Presence snapshot sent in reply to a `subscribe` frame, keyed by user id. */
export interface InitStateEvent {
  type: "init_state";
  data: Record<string, UnifiedPresence>;
}

/** A single user's presence changed (subscribers only). */
export interface PresenceUpdateEvent {
  type: "presence_update";
  data: UnifiedPresence;
}

/**
 * The current front changed.
 *
 * Careful: the route broadcasts PluralKit's raw fronters object, skipping the
 * `tags`/`status` enrichment that GET /v2/plural/fronters applies. Members in
 * this payload will be missing those fields.
 */
export interface FrontersUpdateEvent {
  type: "fronters_update";
  data: FrontersResponse;
}

export interface MentalStateUpdateEvent {
  type: "mental_state_update";
  data: MentalState;
}

/** A device reported new state, or was deleted. */
export interface DeviceUpdateEvent {
  type: "device_update";
  data: DeviceUpdatePayload;
}

/** Admin-triggered refresh (POST /v2/plural/admin/refresh). */
export interface ForceRefreshEvent {
  type: "force_refresh";
  data: { message: string };
}

/** Any frame the server may send. */
export type DoughminationEvent =
  | ConnectionEstablishedEvent
  | InitStateEvent
  | PresenceUpdateEvent
  | FrontersUpdateEvent
  | MentalStateUpdateEvent
  | DeviceUpdateEvent
  | ForceRefreshEvent;

export type DoughminationEventType = DoughminationEvent["type"];

/** Narrow a `DoughminationEvent` union member by its `type`. */
export type EventOfType<T extends DoughminationEventType> = Extract<
  DoughminationEvent,
  { type: T }
>;

/**
 * The subscribe frame. `{ all: true }` follows every tracked user;
 * `{ ids: [...] }` follows specific ones. The hub also accepts the Lanyard-ish
 * aliases `subscribe_to_all` / `subscribe_to_id` / `subscribe_to_ids`; this
 * package always sends the canonical form.
 */
export interface SubscribeFrame {
  type: "subscribe";
  all?: boolean;
  ids?: string[];
}

/** Connection lifecycle, surfaced by `useConnectionStatus()`. */
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";
