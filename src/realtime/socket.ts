/**
 * The single realtime connection to /v2/ws.
 *
 * One socket per provider, shared by every hook. Responsibilities:
 *   - connect / reconnect with exponential backoff + jitter
 *   - keepalive: send the literal string "ping", expect "pong" (the hub
 *     answers via a Cloudflare auto-response pair, so this never wakes the
 *     Durable Object); a missed pong forces a reconnect
 *   - fan events out to typed listeners
 *   - ref-count presence subscriptions, so unmounting one component never
 *     cancels another component's feed, and re-send the union on reconnect
 *
 * Everything except presence is pushed to all clients with no subscription,
 * so a provider with no presence hooks mounted still receives fronters,
 * mental state, device and force-refresh events.
 */

import type {
  ConnectionStatus,
  DoughminationEvent,
  DoughminationEventType,
  EventOfType,
  SubscribeFrame,
} from "../types/events";
import type { UnifiedPresence } from "../types/discord";

export interface SocketOptions {
  /** wss://…/v2/ws */
  url: string;
  /** Connect as soon as the socket is created. Default true. */
  autoConnect?: boolean;
  /** Reconnect automatically after an unexpected close. Default true. */
  reconnect?: boolean;
  /** First retry delay in ms. Default 1000. */
  reconnectBaseDelayMs?: number;
  /** Retry delay ceiling in ms. Default 30000. */
  reconnectMaxDelayMs?: number;
  /** Keepalive interval in ms. Default 30000. Set 0 to disable. */
  pingIntervalMs?: number;
  /** How long to wait for "pong" before assuming the socket is dead. Default 10000. */
  pongTimeoutMs?: number;
  /** WebSocket implementation (e.g. `ws` on Node). Defaults to globalThis.WebSocket. */
  WebSocketImpl?: typeof WebSocket;
  /** Called for transport errors and malformed frames. */
  onError?: (error: unknown) => void;
}

type AnyHandler = (event: DoughminationEvent) => void;

/** A presence subscription request: specific ids, or every tracked user. */
export type PresenceTarget = string[] | "all";

export class DoughminationSocket {
  private readonly options: Required<
    Omit<SocketOptions, "WebSocketImpl" | "onError">
  > & {
    WebSocketImpl: typeof WebSocket | undefined;
    onError: ((error: unknown) => void) | undefined;
  };

  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "idle";

  /** Set when close() was called, to suppress reconnection. */
  private closedByUser = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly listeners = new Map<string, Set<AnyHandler>>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();

  /** Ref counts per user id, so overlapping subscriptions coexist. */
  private readonly presenceRefs = new Map<string, number>();
  /** Ref count for `subscribe({ all: true })`. */
  private allRefs = 0;
  /** The subscription frame we last sent, to avoid redundant re-sends. */
  private lastSentSubscription: string | null = null;

  /** Latest presence per user id, seeded by init_state and kept by updates. */
  private readonly presenceCache = new Map<string, UnifiedPresence>();

  constructor(options: SocketOptions) {
    this.options = {
      url: options.url,
      autoConnect: options.autoConnect ?? true,
      reconnect: options.reconnect ?? true,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 1000,
      reconnectMaxDelayMs: options.reconnectMaxDelayMs ?? 30000,
      pingIntervalMs: options.pingIntervalMs ?? 30000,
      pongTimeoutMs: options.pongTimeoutMs ?? 10000,
      WebSocketImpl: options.WebSocketImpl,
      onError: options.onError,
    };

    if (this.options.autoConnect) this.connect();
  }

  // ---- lifecycle ----------------------------------------------------------

  private get impl(): typeof WebSocket | undefined {
    return this.options.WebSocketImpl ?? globalThis.WebSocket;
  }

  connect(): void {
    // No WebSocket during SSR — stay idle and connect on the client instead.
    if (!this.impl) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;

    this.closedByUser = false;
    this.setStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    let socket: WebSocket;
    try {
      socket = new (this.impl)(this.options.url);
    } catch (error) {
      this.options.onError?.(error);
      this.scheduleReconnect();
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus("open");
      // A fresh socket starts with no subscription server-side, so the union
      // has to be re-sent even though it hasn't changed on our side.
      this.lastSentSubscription = null;
      this.flushSubscription();
      this.startKeepalive();
    };

    socket.onmessage = (event: MessageEvent) => this.handleMessage(event.data);

    socket.onerror = (event) => {
      this.options.onError?.(event);
    };

    socket.onclose = () => {
      this.stopKeepalive();
      this.ws = null;
      if (this.closedByUser) {
        this.setStatus("closed");
        return;
      }
      this.scheduleReconnect();
    };
  }

  /** Close the socket and stop reconnecting. */
  close(): void {
    this.closedByUser = true;
    this.clearReconnect();
    this.stopKeepalive();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // already closing
      }
      this.ws = null;
    }
    this.setStatus("closed");
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === 1;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (error) {
        this.options.onError?.(error);
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.options.reconnect || this.closedByUser) {
      this.setStatus("closed");
      return;
    }
    this.setStatus("reconnecting");
    this.clearReconnect();

    // Exponential backoff with full jitter, so a hub restart doesn't get a
    // thundering herd of clients reconnecting on the same tick.
    const exponential = Math.min(
      this.options.reconnectBaseDelayMs * 2 ** this.reconnectAttempts,
      this.options.reconnectMaxDelayMs,
    );
    const delay = Math.random() * exponential;
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ---- keepalive ----------------------------------------------------------

  private startKeepalive(): void {
    this.stopKeepalive();
    if (this.options.pingIntervalMs <= 0) return;

    this.pingTimer = setInterval(() => {
      if (!this.isOpen) return;
      try {
        // Plain string, not JSON: this matches the hub's auto-response pair.
        this.ws?.send("ping");
      } catch (error) {
        this.options.onError?.(error);
        return;
      }
      // No pong in time means the connection is a zombie — drop it and let
      // onclose trigger the reconnect path.
      if (this.pongTimer === null && this.options.pongTimeoutMs > 0) {
        this.pongTimer = setTimeout(() => {
          this.pongTimer = null;
          try {
            this.ws?.close();
          } catch {
            // ignore
          }
        }, this.options.pongTimeoutMs);
      }
    }, this.options.pingIntervalMs);
  }

  private stopKeepalive(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer !== null) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private clearPongTimer(): void {
    if (this.pongTimer !== null) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  // ---- messages -----------------------------------------------------------

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;

    if (raw === "pong") {
      this.clearPongTimer();
      return;
    }

    let event: DoughminationEvent;
    try {
      event = JSON.parse(raw) as DoughminationEvent;
    } catch (error) {
      this.options.onError?.(error);
      return;
    }
    if (!event || typeof event.type !== "string") return;

    // Keep the presence cache current so a hook mounting mid-session can seed
    // itself immediately instead of waiting for the next update.
    if (event.type === "init_state") {
      for (const [id, presence] of Object.entries(event.data ?? {})) {
        this.presenceCache.set(id, presence);
      }
    } else if (event.type === "presence_update" && event.data?.user_id) {
      this.presenceCache.set(event.data.user_id, event.data);
    }

    this.emit(event);
  }

  private emit(event: DoughminationEvent): void {
    for (const key of [event.type, "*"]) {
      const handlers = this.listeners.get(key);
      if (!handlers) continue;
      // Copy: a handler may unsubscribe itself during dispatch.
      for (const handler of [...handlers]) {
        try {
          handler(event);
        } catch (error) {
          this.options.onError?.(error);
        }
      }
    }
  }

  /** Listen for one event type. Returns an unsubscribe function. */
  on<T extends DoughminationEventType>(
    type: T,
    handler: (event: EventOfType<T>) => void,
  ): () => void {
    return this.addListener(type, handler as AnyHandler);
  }

  /** Listen for every event. Returns an unsubscribe function. */
  onAny(handler: AnyHandler): () => void {
    return this.addListener("*", handler);
  }

  private addListener(key: string, handler: AnyHandler): () => void {
    let handlers = this.listeners.get(key);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(key, handlers);
    }
    handlers.add(handler);

    return () => {
      const set = this.listeners.get(key);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) this.listeners.delete(key);
    };
  }

  /** Observe connection status. Returns an unsubscribe function. */
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(handler);
    return () => {
      this.statusListeners.delete(handler);
    };
  }

  // ---- presence subscriptions --------------------------------------------

  /**
   * Subscribe to presence for `target`, ref-counted.
   *
   * Two components asking for the same user hold two references; the id is
   * only dropped from the wire subscription when both have released it. The
   * returned function releases exactly this subscription and is safe to call
   * more than once.
   */
  subscribePresence(target: PresenceTarget): () => void {
    if (target === "all") {
      this.allRefs += 1;
    } else {
      for (const id of target) {
        this.presenceRefs.set(id, (this.presenceRefs.get(id) ?? 0) + 1);
      }
    }
    this.flushSubscription();

    let released = false;
    return () => {
      if (released) return;
      released = true;

      if (target === "all") {
        this.allRefs = Math.max(0, this.allRefs - 1);
      } else {
        for (const id of target) {
          const next = (this.presenceRefs.get(id) ?? 0) - 1;
          if (next <= 0) {
            this.presenceRefs.delete(id);
            // Stop reporting a user nobody is watching any more.
            this.presenceCache.delete(id);
          } else {
            this.presenceRefs.set(id, next);
          }
        }
      }
      this.flushSubscription();
    };
  }

  /** The subscription frame implied by the current ref counts, or null. */
  private buildSubscription(): SubscribeFrame | null {
    if (this.allRefs > 0) return { type: "subscribe", all: true };
    const ids = [...this.presenceRefs.keys()].sort();
    if (ids.length === 0) return null;
    return { type: "subscribe", ids };
  }

  /**
   * Send the current union if it changed. The hub replaces a socket's whole
   * subscription on each frame, so sending the union (not a delta) is correct.
   */
  private flushSubscription(): void {
    const subscription = this.buildSubscription();
    const serialized = subscription ? JSON.stringify(subscription) : null;

    if (serialized === this.lastSentSubscription) return;
    this.lastSentSubscription = serialized;

    // Nothing to unsubscribe to server-side: the hub has no "unsubscribe"
    // frame, so an emptied subscription just stops being renewed. Presence
    // events for stale ids are filtered out by the hooks.
    if (!serialized || !this.isOpen) return;

    try {
      this.ws?.send(serialized);
    } catch (error) {
      this.options.onError?.(error);
      this.lastSentSubscription = null;
    }
  }

  /** Cached presence for a user, if we've seen one this session. */
  getPresence(userId: string): UnifiedPresence | undefined {
    return this.presenceCache.get(userId);
  }

  /** A snapshot copy of every cached presence. */
  getPresenceSnapshot(): Record<string, UnifiedPresence> {
    return Object.fromEntries(this.presenceCache);
  }

  /** True when at least one live reference wants this user's presence. */
  isSubscribedTo(userId: string): boolean {
    return this.allRefs > 0 || this.presenceRefs.has(userId);
  }

  /** Send a raw frame. Returns false when the socket isn't open. */
  send(frame: unknown): boolean {
    if (!this.isOpen) return false;
    try {
      this.ws?.send(typeof frame === "string" ? frame : JSON.stringify(frame));
      return true;
    } catch (error) {
      this.options.onError?.(error);
      return false;
    }
  }
}
