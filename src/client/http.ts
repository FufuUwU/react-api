/**
 * A thin typed fetch wrapper over the Doughmination API.
 *
 * The API has two response conventions and this is the one place that knows
 * about both:
 *
 *   "worker"  /discord/*, /minecraft/*  ->  { success, data } | { success:false, error:{code,message} }
 *   "bare"    /plural/*, /devices, /guestbook  ->  the object itself; errors are { detail }
 *
 * Everything public is readable with no auth at all, so a client constructed
 * with zero options is fully functional for reads.
 */

import { DoughminationError } from "./errors";
import type {
  UnifiedRecord,
  UnifiedRecordMap,
  DiscordGatewayStatus,
} from "../types/discord";
import type {
  UnifiedMinecraftGeneral,
  UnifiedMinecraftHypixel,
  VanillaCapeList,
} from "../types/minecraft";
import type {
  FrontersResponse,
  PluralMember,
  PluralSystem,
  MentalState,
  MemberStatusResponse,
  LoginResponse,
  SignupResponse,
  UserResponse,
  UsernameCheckResponse,
  EmailCheckResponse,
  VerifyEmailResponse,
  ResendVerificationResponse,
  CorrectEmailResponse,
  AccountRecoveryResponse,
  ResetTokenCheckResponse,
  ResetPasswordResponse,
  SwitchResponse,
} from "../types/plural";
import type {
  DeviceRecord,
  DevicesMap,
  DeviceReportInput,
} from "../types/devices";
import type {
  GuestbookPage,
  GuestbookPostInput,
  GuestbookPostResult,
} from "../types/guestbook";

export const DEFAULT_BASE_URL = "https://doughmination.uk/v2";

/** A token value, or a (possibly async) function returning one. */
export type TokenSource =
  | string
  | null
  | undefined
  | (() => string | null | undefined | Promise<string | null | undefined>);

export interface DoughminationClientOptions {
  /** Defaults to https://doughmination.uk/v2. Trailing slashes are trimmed. */
  baseUrl?: string;
  /**
   * JWT bearer for authenticated plural writes (from `login()`). May be a
   * function so the app can read from its own store on every request.
   */
  token?: TokenSource;
  /** X-Battery-Key — device reports, guestbook deletes, guestbook import. */
  batteryKey?: TokenSource;
  /**
   * Static bot token for /plural/bot/*. Note these routes also require a
   * `User-Agent: CloveShortcuts/<version>` header, which browsers refuse to
   * set — bot methods only work from a server runtime.
   */
  botToken?: TokenSource;
  /** Version string used in the bot User-Agent. Defaults to "1.0". */
  botUserAgentVersion?: string;
  /** Custom fetch (SSR, testing, instrumentation). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
}

type Envelope = "worker" | "bare";

interface RequestOptions {
  method?: string;
  envelope: Envelope;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Which credential to attach, if any. */
  auth?: "bearer" | "battery" | "bot";
  signal?: AbortSignal;
}

/** The Worker-style success/error envelope. */
interface WorkerEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function resolveToken(source: TokenSource): Promise<string | undefined> {
  const value = typeof source === "function" ? await source() : source;
  return value ?? undefined;
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export class DoughminationClient {
  readonly baseUrl: string;
  private readonly opts: DoughminationClientOptions;
  private readonly doFetch: typeof fetch;

  constructor(options: DoughminationClientOptions = {}) {
    this.opts = options;
    this.baseUrl = trimBase(options.baseUrl ?? DEFAULT_BASE_URL);

    const f = options.fetch ?? globalThis.fetch;
    if (!f) {
      throw new Error(
        "No fetch implementation found. Pass one via the `fetch` option.",
      );
    }
    this.doFetch = f.bind(globalThis);
  }

  /**
   * The URL of the realtime socket, derived from `baseUrl`.
   * https://doughmination.uk/v2 -> wss://doughmination.uk/v2/ws
   */
  get socketUrl(): string {
    return `${this.baseUrl.replace(/^http/, "ws")}/ws`;
  }

  // ---- core ---------------------------------------------------------------

  private async request<T>(path: string, options: RequestOptions): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = { ...this.opts.headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (options.auth === "bearer") {
      const token = await resolveToken(this.opts.token);
      if (!token) {
        throw new DoughminationError(
          "This request requires a logged-in user. Call login() and pass the token to the client (or the `token` provider prop).",
          { status: 401, code: "missing_token", url: url.toString() },
        );
      }
      headers["Authorization"] = `Bearer ${token}`;
    } else if (options.auth === "battery") {
      const key = await resolveToken(this.opts.batteryKey);
      if (!key) {
        throw new DoughminationError(
          "This request requires the X-Battery-Key header. Set `batteryKey` on the client.",
          { status: 401, code: "missing_battery_key", url: url.toString() },
        );
      }
      headers["X-Battery-Key"] = key;
    } else if (options.auth === "bot") {
      const token = await resolveToken(this.opts.botToken);
      if (!token) {
        throw new DoughminationError(
          "This request requires the bot token. Set `botToken` on the client.",
          { status: 401, code: "missing_bot_token", url: url.toString() },
        );
      }
      headers["Authorization"] = `Bearer ${token}`;
      // Browsers silently drop this — bot routes are server-runtime only.
      headers["User-Agent"] = `CloveShortcuts/${this.opts.botUserAgentVersion ?? "1.0"}`;
    }

    let response: Response;
    try {
      response = await this.doFetch(url.toString(), {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (cause) {
      throw new DoughminationError(
        cause instanceof Error ? cause.message : "Network request failed",
        { status: 0, code: "network_error", url: url.toString(), cause },
      );
    }

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      throw toError(response, parsed, url.toString());
    }

    if (options.envelope === "bare") {
      return parsed as T;
    }

    const envelope = parsed as WorkerEnvelope<T> | undefined;
    // A 200 with success:false shouldn't happen, but don't silently return it.
    if (envelope && envelope.success === false) {
      throw new DoughminationError(
        envelope.error?.message ?? "Request failed",
        {
          status: response.status,
          code: envelope.error?.code ?? null,
          body: parsed,
          url: url.toString(),
        },
      );
    }
    return envelope?.data as T;
  }

  // ---- Discord ------------------------------------------------------------

  /** GET /discord/users/:id — merged profile + badges + live presence. */
  getDiscordUser(id: string, signal?: AbortSignal): Promise<UnifiedRecord> {
    return this.request<UnifiedRecord>(`/discord/users/${encodeURIComponent(id)}`, {
      envelope: "worker",
      signal,
    });
  }

  /**
   * GET /discord/users?ids=… — up to 100 ids in one round-trip. Ids that
   * don't resolve come back as null rather than erroring the whole batch.
   */
  getDiscordUsers(ids: string[], signal?: AbortSignal): Promise<UnifiedRecordMap> {
    if (ids.length > 100) {
      throw new DoughminationError("Maximum 100 ids per request.", {
        status: 400,
        code: "too_many_ids",
        url: `${this.baseUrl}/discord/users`,
      });
    }
    return this.request<UnifiedRecordMap>("/discord/users", {
      envelope: "worker",
      query: { ids: ids.join(",") },
      signal,
    });
  }

  /** GET /discord/status — gateway connection debug info. */
  getDiscordStatus(signal?: AbortSignal): Promise<DiscordGatewayStatus> {
    return this.request<DiscordGatewayStatus>("/discord/status", {
      envelope: "worker",
      signal,
    });
  }

  // ---- Minecraft ----------------------------------------------------------

  /** GET /minecraft/general/:uuid — Mojang identity, skin, capes, renders. */
  getMinecraftProfile(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<UnifiedMinecraftGeneral> {
    return this.request<UnifiedMinecraftGeneral>(
      `/minecraft/general/${encodeURIComponent(uuid)}`,
      { envelope: "worker", signal },
    );
  }

  /**
   * GET /minecraft/hypixel/:uuid — Hypixel + SkyBlock.
   * Only the operator's allowlisted UUIDs are served; anything else is a 403.
   */
  getHypixelStats(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<UnifiedMinecraftHypixel> {
    return this.request<UnifiedMinecraftHypixel>(
      `/minecraft/hypixel/${encodeURIComponent(uuid)}`,
      { envelope: "worker", signal },
    );
  }

  /** GET /minecraft/capes — accumulated vanilla cape catalogue. */
  getMinecraftCapes(signal?: AbortSignal): Promise<VanillaCapeList> {
    return this.request<VanillaCapeList>("/minecraft/capes", {
      envelope: "worker",
      signal,
    });
  }

  // ---- Plural: reads ------------------------------------------------------

  /** GET /plural/fronters — current front, members enriched with tags+status. */
  getFronters(signal?: AbortSignal): Promise<FrontersResponse> {
    return this.request<FrontersResponse>("/plural/fronters", {
      envelope: "bare",
      signal,
    });
  }

  /** GET /plural/members — all members, enriched with tags+status. */
  getMembers(signal?: AbortSignal): Promise<PluralMember[]> {
    return this.request<PluralMember[]>("/plural/members", {
      envelope: "bare",
      signal,
    });
  }

  /** GET /plural/member/:id — by member id or (case-insensitive) name. */
  getMember(memberId: string, signal?: AbortSignal): Promise<PluralMember> {
    return this.request<PluralMember>(
      `/plural/member/${encodeURIComponent(memberId)}`,
      { envelope: "bare", signal },
    );
  }

  /** GET /plural/system — PluralKit system info with mental_state merged in. */
  getSystem(signal?: AbortSignal): Promise<PluralSystem> {
    return this.request<PluralSystem>("/plural/system", {
      envelope: "bare",
      signal,
    });
  }

  /** GET /plural/mental-state */
  getMentalState(signal?: AbortSignal): Promise<MentalState> {
    return this.request<MentalState>("/plural/mental-state", {
      envelope: "bare",
      signal,
    });
  }

  /** GET /plural/members/:identifier/status */
  getMemberStatus(
    identifier: string,
    signal?: AbortSignal,
  ): Promise<MemberStatusResponse> {
    return this.request<MemberStatusResponse>(
      `/plural/members/${encodeURIComponent(identifier)}/status`,
      { envelope: "bare", signal },
    );
  }

  // ---- Plural: auth -------------------------------------------------------

  /**
   * POST /plural/login — JSON login. The Turnstile token is mandatory and
   * must come from the consuming app's widget.
   */
  login(input: {
    username: string;
    password: string;
    turnstileToken: string;
    signal?: AbortSignal;
  }): Promise<LoginResponse> {
    return this.request<LoginResponse>("/plural/login", {
      method: "POST",
      envelope: "bare",
      body: {
        username: input.username,
        password: input.password,
        turnstile_token: input.turnstileToken,
      },
      signal: input.signal,
    });
  }

  /**
   * POST /plural/signup — password ≥10 chars, email now required.
   *
   * The new account can't log in until the emailed link is confirmed. Keep
   * the returned `correction_token` if you want to let the user fix a typo'd
   * address without a password.
   */
  signup(input: {
    username: string;
    password: string;
    email: string;
    displayName?: string | null;
    turnstileToken: string;
    signal?: AbortSignal;
  }): Promise<SignupResponse> {
    return this.request<SignupResponse>("/plural/signup", {
      method: "POST",
      envelope: "bare",
      body: {
        username: input.username,
        password: input.password,
        email: input.email,
        display_name: input.displayName ?? null,
        turnstile_token: input.turnstileToken,
      },
      signal: input.signal,
    });
  }

  /** GET /plural/users/check-username — public availability check. */
  checkUsername(
    username: string,
    signal?: AbortSignal,
  ): Promise<UsernameCheckResponse> {
    return this.request<UsernameCheckResponse>("/plural/users/check-username", {
      envelope: "bare",
      query: { username },
      signal,
    });
  }

  /** GET /plural/users/check-email — availability check, rate limited 20/min/IP. */
  checkEmail(email: string, signal?: AbortSignal): Promise<EmailCheckResponse> {
    return this.request<EmailCheckResponse>("/plural/users/check-email", {
      envelope: "bare",
      query: { email },
      signal,
    });
  }

  // ---- Email verification -------------------------------------------------

  /** POST /plural/verify-email — confirm an address with the emailed token. */
  verifyEmail(token: string, signal?: AbortSignal): Promise<VerifyEmailResponse> {
    return this.request<VerifyEmailResponse>("/plural/verify-email", {
      method: "POST",
      envelope: "bare",
      body: { token },
      signal,
    });
  }

  /**
   * POST /plural/resend-verification — resend the confirmation email.
   *
   * Identify the account either by `correctionToken` (held by the tab that
   * signed up) or by username + password. Turnstile required.
   */
  resendVerification(input: {
    turnstileToken: string;
    correctionToken?: string;
    username?: string;
    password?: string;
    signal?: AbortSignal;
  }): Promise<ResendVerificationResponse> {
    return this.request<ResendVerificationResponse>("/plural/resend-verification", {
      method: "POST",
      envelope: "bare",
      body: {
        turnstile_token: input.turnstileToken,
        ...(input.correctionToken ? { correction_token: input.correctionToken } : {}),
        ...(input.username ? { username: input.username } : {}),
        ...(input.password ? { password: input.password } : {}),
      },
      signal: input.signal,
    });
  }

  /**
   * POST /plural/correct-email — fix a mistyped address before verification,
   * using the single-use correction token from signup (no password needed).
   */
  correctEmail(input: {
    correctionToken: string;
    email: string;
    turnstileToken: string;
    signal?: AbortSignal;
  }): Promise<CorrectEmailResponse> {
    return this.request<CorrectEmailResponse>("/plural/correct-email", {
      method: "POST",
      envelope: "bare",
      body: {
        correction_token: input.correctionToken,
        email: input.email,
        turnstile_token: input.turnstileToken,
      },
      signal: input.signal,
    });
  }

  // ---- Password / username recovery ---------------------------------------

  /** POST /plural/forgot-password — email a reset link to the account on file. */
  forgotPassword(input: {
    username: string;
    turnstileToken: string;
    signal?: AbortSignal;
  }): Promise<AccountRecoveryResponse> {
    return this.request<AccountRecoveryResponse>("/plural/forgot-password", {
      method: "POST",
      envelope: "bare",
      body: { username: input.username, turnstile_token: input.turnstileToken },
      signal: input.signal,
    });
  }

  /** POST /plural/forgot-username — email the username to the given address. */
  forgotUsername(input: {
    email: string;
    turnstileToken: string;
    signal?: AbortSignal;
  }): Promise<AccountRecoveryResponse> {
    return this.request<AccountRecoveryResponse>("/plural/forgot-username", {
      method: "POST",
      envelope: "bare",
      body: { email: input.email, turnstile_token: input.turnstileToken },
      signal: input.signal,
    });
  }

  /** GET /plural/reset-password/check — is a reset token still valid? */
  checkResetToken(
    token: string,
    signal?: AbortSignal,
  ): Promise<ResetTokenCheckResponse> {
    return this.request<ResetTokenCheckResponse>("/plural/reset-password/check", {
      envelope: "bare",
      query: { token },
      signal,
    });
  }

  /** POST /plural/reset-password — set a new password (≥10 chars) with a token. */
  resetPassword(input: {
    token: string;
    newPassword: string;
    turnstileToken: string;
    signal?: AbortSignal;
  }): Promise<ResetPasswordResponse> {
    return this.request<ResetPasswordResponse>("/plural/reset-password", {
      method: "POST",
      envelope: "bare",
      body: {
        token: input.token,
        new_password: input.newPassword,
        turnstile_token: input.turnstileToken,
      },
      signal: input.signal,
    });
  }

  /** GET /plural/user_info — the logged-in user (requires bearer token). */
  getUserInfo(signal?: AbortSignal): Promise<UserResponse> {
    return this.request<UserResponse>("/plural/user_info", {
      envelope: "bare",
      auth: "bearer",
      signal,
    });
  }

  // ---- Plural: writes -----------------------------------------------------

  /** POST /plural/switch — set the current front (requires bearer token). */
  setFronters(
    memberIds: string[],
    signal?: AbortSignal,
  ): Promise<SwitchResponse> {
    return this.request<SwitchResponse>("/plural/switch", {
      method: "POST",
      envelope: "bare",
      auth: "bearer",
      body: { members: memberIds },
      signal,
    });
  }

  /** POST /plural/switch_front — switch to a single member. */
  switchFront(memberId: string, signal?: AbortSignal): Promise<SwitchResponse> {
    return this.request<SwitchResponse>("/plural/switch_front", {
      method: "POST",
      envelope: "bare",
      auth: "bearer",
      body: { member_id: memberId },
      signal,
    });
  }

  /** POST /plural/multi_switch — switch to several members, echoing names back. */
  multiSwitch(
    memberIds: string[],
    signal?: AbortSignal,
  ): Promise<SwitchResponse> {
    return this.request<SwitchResponse>("/plural/multi_switch", {
      method: "POST",
      envelope: "bare",
      auth: "bearer",
      body: { member_ids: memberIds },
      signal,
    });
  }

  /** POST /plural/mental-state — admin only. */
  setMentalState(
    input: { level: string; notes?: string | null; updatedAt?: Date },
    signal?: AbortSignal,
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      "/plural/mental-state",
      {
        method: "POST",
        envelope: "bare",
        auth: "bearer",
        body: {
          level: input.level,
          notes: input.notes ?? null,
          ...(input.updatedAt ? { updated_at: input.updatedAt.toISOString() } : {}),
        },
        signal,
      },
    );
  }

  /** POST /plural/members/:identifier/status — admin only, text ≤100 chars. */
  setMemberStatus(
    identifier: string,
    input: { text: string; emoji?: string | null },
    signal?: AbortSignal,
  ): Promise<{ success: boolean; message: string; status: unknown }> {
    return this.request(
      `/plural/members/${encodeURIComponent(identifier)}/status`,
      {
        method: "POST",
        envelope: "bare",
        auth: "bearer",
        body: { text: input.text, emoji: input.emoji ?? null },
        signal,
      },
    );
  }

  /** POST /plural/admin/refresh — broadcasts force_refresh to every client. */
  forceRefresh(signal?: AbortSignal): Promise<unknown> {
    return this.request("/plural/admin/refresh", {
      method: "POST",
      envelope: "bare",
      auth: "bearer",
      signal,
    });
  }

  // ---- Devices ------------------------------------------------------------

  /** GET /devices — every device's latest state, keyed by name. */
  getDevices(signal?: AbortSignal): Promise<DevicesMap> {
    return this.request<DevicesMap>("/devices", { envelope: "bare", signal });
  }

  /** GET /devices/:device */
  getDevice(device: string, signal?: AbortSignal): Promise<DeviceRecord> {
    return this.request<DeviceRecord>(`/devices/${encodeURIComponent(device)}`, {
      envelope: "bare",
      signal,
    });
  }

  /**
   * POST /devices — report state (requires X-Battery-Key).
   * A partial merge: only the fields you pass are updated.
   */
  reportDevice(
    input: DeviceReportInput,
    signal?: AbortSignal,
  ): Promise<{ success: boolean } & DeviceRecord> {
    const query: Record<string, string | number | undefined> = {
      device: input.device,
    };
    if (input.level !== undefined) query["level"] = input.level;
    if (input.charging !== undefined) query["charging"] = input.charging ? "1" : "0";
    if (input.lowPowerMode !== undefined) query["lpm"] = input.lowPowerMode ? "1" : "0";
    if (input.watch !== undefined) query["watch"] = input.watch ? "1" : "0";
    if (input.airpods !== undefined) query["airpods"] = input.airpods ? "1" : "0";
    // The API uses the literal "0" to mean "clear this field".
    if (input.wifi !== undefined) query["wifi"] = input.wifi === null ? "0" : input.wifi;
    if (input.location !== undefined) {
      query["location"] = input.location === null ? "0" : input.location;
    }

    return this.request(`/devices`, {
      method: "POST",
      envelope: "bare",
      auth: "battery",
      query,
      signal,
    });
  }

  /** DELETE /devices?device=… (requires X-Battery-Key). */
  deleteDevice(
    device: string,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; device: string; deleted: boolean }> {
    return this.request("/devices", {
      method: "DELETE",
      envelope: "bare",
      auth: "battery",
      query: { device },
      signal,
    });
  }

  // ---- Guestbook ----------------------------------------------------------

  /** GET /guestbook — newest first. `limit` is clamped to 1–200 server-side. */
  getGuestbook(
    params: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ): Promise<GuestbookPage> {
    return this.request<GuestbookPage>("/guestbook", {
      envelope: "bare",
      query: { limit: params.limit, offset: params.offset },
      signal,
    });
  }

  /**
   * POST /guestbook — public, but Turnstile-gated when the deployment has a
   * secret configured, and rate limited to one post per 60s per IP.
   */
  postGuestbookEntry(
    input: GuestbookPostInput,
    signal?: AbortSignal,
  ): Promise<GuestbookPostResult> {
    return this.request<GuestbookPostResult>("/guestbook", {
      method: "POST",
      envelope: "bare",
      body: {
        name: input.name,
        message: input.message,
        website: input.website ?? "",
        ...(input.turnstileToken ? { turnstileToken: input.turnstileToken } : {}),
      },
      signal,
    });
  }

  /** DELETE /guestbook/:id (requires X-Battery-Key). */
  deleteGuestbookEntry(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; id: string; deleted: boolean }> {
    return this.request(`/guestbook/${encodeURIComponent(id)}`, {
      method: "DELETE",
      envelope: "bare",
      auth: "battery",
      signal,
    });
  }
}

/** Build a `DoughminationError` from a non-2xx response of either convention. */
function toError(response: Response, parsed: unknown, url: string): DoughminationError {
  let message = response.statusText || `Request failed with ${response.status}`;
  let code: string | null = null;

  if (parsed && typeof parsed === "object") {
    const body = parsed as {
      error?: { code?: string; message?: string } | string;
      detail?: unknown;
    };

    if (typeof body.error === "object" && body.error) {
      // Worker convention: { success:false, error:{ code, message } }
      message = body.error.message ?? message;
      code = body.error.code ?? null;
    } else if (typeof body.error === "string") {
      // Guestbook convention: { error: "…" }
      message = body.error;
    } else if (typeof body.detail === "string") {
      // Durable Object convention: { detail: "…" }
      message = body.detail;
    } else if (Array.isArray(body.detail)) {
      // Zod validation issues (422).
      message = body.detail
        .map((issue) =>
          issue && typeof issue === "object" && "message" in issue
            ? String((issue as { message: unknown }).message)
            : String(issue),
        )
        .join("; ");
      code = "validation_error";
    }
  } else if (typeof parsed === "string" && parsed) {
    message = parsed;
  }

  // The login route signals an unconfirmed account with this header rather
  // than a body code, so lift it into `code` — that's how a UI knows to offer
  // "resend confirmation" instead of "wrong password".
  if (!code) {
    const reason = response.headers.get("X-Auth-Reason");
    if (reason) code = reason;
  }

  return new DoughminationError(message, {
    status: response.status,
    code,
    body: parsed,
    url,
  });
}
