/**
 * Write hooks.
 *
 * Turnstile: login, signup and guestbook posts are captcha-gated. This
 * package cannot generate a token — it belongs to the widget rendered by the
 * consuming app. Supply it either per-call (`turnstileToken` in the mutation
 * variables) or once via the provider's `turnstile` prop, which is used as
 * the fallback.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationOptions, UseMutationResult } from "@tanstack/react-query";

import { useDoughmination, useDoughminationClient } from "../provider/context";
import { DoughminationError } from "../client/errors";
import { queryKeys } from "./keys";
import type {
  LoginResponse,
  SignupResponse,
  SwitchResponse,
} from "../types/plural";
import type {
  GuestbookPostInput,
  GuestbookPostResult,
} from "../types/guestbook";
import type { DeviceRecord, DeviceReportInput } from "../types/devices";

export type MutationOptionsFor<TData, TVariables> = Omit<
  UseMutationOptions<TData, DoughminationError, TVariables>,
  "mutationFn"
>;

/**
 * Resolve a Turnstile token: the explicit one wins, otherwise fall back to
 * the provider's callback. Throws a clear error when neither yields a token,
 * rather than letting the API return a vague 400.
 */
function useTurnstileResolver(): (explicit?: string) => Promise<string> {
  const { getTurnstileToken } = useDoughmination();

  return async (explicit?: string) => {
    if (explicit) return explicit;

    const token = await getTurnstileToken?.();
    if (token) return token;

    throw new DoughminationError(
      "A Turnstile token is required. Pass `turnstileToken` to the mutation, or set the `turnstile` prop on <DoughminationProvider>.",
      { status: 400, code: "missing_turnstile_token", url: "" },
    );
  };
}

export interface LoginVariables {
  username: string;
  password: string;
  /** Overrides the provider's `turnstile` callback for this call. */
  turnstileToken?: string;
}

/**
 * Log in and receive a JWT.
 *
 * The package does not store the token for you — put it wherever your app
 * keeps auth state and feed it back through the provider's `token` prop.
 *
 * ```tsx
 * const login = useLogin();
 * await login.mutateAsync({ username, password, turnstileToken });
 * ```
 */
export function useLogin(
  options?: MutationOptionsFor<LoginResponse, LoginVariables>,
): UseMutationResult<LoginResponse, DoughminationError, LoginVariables> {
  const client = useDoughminationClient();
  const queryClient = useQueryClient();
  const resolveTurnstile = useTurnstileResolver();

  return useMutation({
    mutationFn: async (variables) =>
      client.login({
        username: variables.username,
        password: variables.password,
        turnstileToken: await resolveTurnstile(variables.turnstileToken),
      }),
    ...options,
    onSuccess: (data, variables, context) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.plural.userInfo() });
      options?.onSuccess?.(data, variables, context);
    },
  });
}

export interface SignupVariables {
  username: string;
  /** At least 10 characters, enforced server-side. */
  password: string;
  displayName?: string | null;
  turnstileToken?: string;
}

/** Create an account. Turnstile is always required by the API. */
export function useSignup(
  options?: MutationOptionsFor<SignupResponse, SignupVariables>,
): UseMutationResult<SignupResponse, DoughminationError, SignupVariables> {
  const client = useDoughminationClient();
  const resolveTurnstile = useTurnstileResolver();

  return useMutation({
    mutationFn: async (variables) =>
      client.signup({
        username: variables.username,
        password: variables.password,
        displayName: variables.displayName ?? null,
        turnstileToken: await resolveTurnstile(variables.turnstileToken),
      }),
    ...options,
  });
}

/**
 * Post a guestbook entry.
 *
 * Turnstile is enforced whenever the deployment configures a secret. Posts
 * are rate limited to one per 60s per IP — that surfaces as a
 * `DoughminationError` with `isRateLimited === true`.
 *
 * A `skipped: true` result means the honeypot field was tripped; the API
 * fakes success and drops the entry.
 */
export function useGuestbookPost(
  options?: MutationOptionsFor<GuestbookPostResult, GuestbookPostInput>,
): UseMutationResult<
  GuestbookPostResult,
  DoughminationError,
  GuestbookPostInput
> {
  const client = useDoughminationClient();
  const queryClient = useQueryClient();
  const { getTurnstileToken } = useDoughmination();

  return useMutation({
    mutationFn: async (input) => {
      // Unlike login, the guestbook only needs a token when the deployment
      // has one configured — so a missing token isn't an error here, we just
      // send what we have and let the API decide.
      const turnstileToken =
        input.turnstileToken ?? (await getTurnstileToken?.()) ?? undefined;
      return client.postGuestbookEntry({ ...input, turnstileToken });
    },
    ...options,
    onSuccess: (data, variables, context) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guestbook.all });
      options?.onSuccess?.(data, variables, context);
    },
  });
}

/** Delete a guestbook entry by id. Requires the X-Battery-Key. */
export function useDeleteGuestbookEntry(
  options?: MutationOptionsFor<
    { success: boolean; id: string; deleted: boolean },
    string
  >,
): UseMutationResult<
  { success: boolean; id: string; deleted: boolean },
  DoughminationError,
  string
> {
  const client = useDoughminationClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.deleteGuestbookEntry(id),
    ...options,
    onSuccess: (data, variables, context) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guestbook.all });
      options?.onSuccess?.(data, variables, context);
    },
  });
}

/**
 * Set the current front (requires a bearer token).
 *
 * No manual invalidation needed: the API broadcasts `fronters_update`, so
 * `useFronters()` updates itself — including on other people's browsers.
 */
export function useSetFronters(
  options?: MutationOptionsFor<SwitchResponse, string[]>,
): UseMutationResult<SwitchResponse, DoughminationError, string[]> {
  const client = useDoughminationClient();

  return useMutation({
    mutationFn: (memberIds: string[]) => client.setFronters(memberIds),
    ...options,
  });
}

/** Switch the front to a single member (requires a bearer token). */
export function useSwitchFront(
  options?: MutationOptionsFor<SwitchResponse, string>,
): UseMutationResult<SwitchResponse, DoughminationError, string> {
  const client = useDoughminationClient();

  return useMutation({
    mutationFn: (memberId: string) => client.switchFront(memberId),
    ...options,
  });
}

export interface SetMentalStateVariables {
  level: string;
  notes?: string | null;
}

/** Update the mental state (admin only). Broadcasts `mental_state_update`. */
export function useSetMentalState(
  options?: MutationOptionsFor<
    { success: boolean; message: string },
    SetMentalStateVariables
  >,
): UseMutationResult<
  { success: boolean; message: string },
  DoughminationError,
  SetMentalStateVariables
> {
  const client = useDoughminationClient();

  return useMutation({
    mutationFn: (variables) => client.setMentalState(variables),
    ...options,
  });
}

/**
 * Report device state (requires the X-Battery-Key).
 *
 * Only the fields you pass are updated — the API merges them into the stored
 * record, leaving everything else untouched.
 */
export function useReportDevice(
  options?: MutationOptionsFor<
    { success: boolean } & DeviceRecord,
    DeviceReportInput
  >,
): UseMutationResult<
  { success: boolean } & DeviceRecord,
  DoughminationError,
  DeviceReportInput
> {
  const client = useDoughminationClient();

  return useMutation({
    mutationFn: (input) => client.reportDevice(input),
    ...options,
  });
}
