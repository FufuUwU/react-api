/**
 * Account-recovery hooks: email verification, resend/correct, and the
 * forgot-password / forgot-username / reset-password flow.
 *
 * All the write endpoints here are Turnstile-gated (the API requires a token);
 * `verifyEmail` and `useResetTokenValid` are the only ones that aren't.
 * Supply the token per-call or via the provider's `turnstile` prop.
 */

import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import { useDoughminationClient } from "../provider/context";
import { queryKeys } from "./keys";
import type { QueryOptionsFor } from "./discord";
import type { MutationOptionsFor } from "./mutations";
import { useTurnstileResolver } from "./mutations";
import type { DoughminationError } from "../client/errors";
import type {
  VerifyEmailResponse,
  ResendVerificationResponse,
  CorrectEmailResponse,
  AccountRecoveryResponse,
  ResetTokenCheckResponse,
  ResetPasswordResponse,
  UsernameCheckResponse,
  EmailCheckResponse,
} from "../types/plural";

/**
 * Live username-availability check for a signup form. Debounce the input
 * yourself; pass the debounced value here.
 */
export function useUsernameAvailable(
  username: string | null | undefined,
  options?: QueryOptionsFor<UsernameCheckResponse>,
): UseQueryResult<UsernameCheckResponse, DoughminationError> {
  const client = useDoughminationClient();
  return useQuery({
    queryKey: queryKeys.plural.usernameCheck(username ?? ""),
    queryFn: ({ signal }) => client.checkUsername(username as string, signal),
    enabled: Boolean(username) && (options?.enabled ?? true),
    ...options,
  });
}

/** Live email-availability check. Rate limited server-side (20/min/IP). */
export function useEmailAvailable(
  email: string | null | undefined,
  options?: QueryOptionsFor<EmailCheckResponse>,
): UseQueryResult<EmailCheckResponse, DoughminationError> {
  const client = useDoughminationClient();
  return useQuery({
    queryKey: [...queryKeys.plural.all, "email-check", email ?? ""] as const,
    queryFn: ({ signal }) => client.checkEmail(email as string, signal),
    enabled: Boolean(email) && (options?.enabled ?? true),
    ...options,
  });
}

/**
 * Confirm an email address with the token from the confirmation link.
 * No Turnstile — the token is the proof.
 *
 * ```tsx
 * const verify = useVerifyEmail();
 * await verify.mutateAsync(tokenFromUrl);
 * ```
 */
export function useVerifyEmail(
  options?: MutationOptionsFor<VerifyEmailResponse, string>,
): UseMutationResult<VerifyEmailResponse, DoughminationError, string> {
  const client = useDoughminationClient();
  return useMutation({
    mutationFn: (token: string) => client.verifyEmail(token),
    ...options,
  });
}

export interface ResendVerificationVariables {
  /** From the signup response — identifies the account without a password. */
  correctionToken?: string;
  /** Alternative to the correction token: the account's credentials. */
  username?: string;
  password?: string;
  turnstileToken?: string;
}

/** Resend the confirmation email, by correction token or username+password. */
export function useResendVerification(
  options?: MutationOptionsFor<
    ResendVerificationResponse,
    ResendVerificationVariables
  >,
): UseMutationResult<
  ResendVerificationResponse,
  DoughminationError,
  ResendVerificationVariables
> {
  const client = useDoughminationClient();
  const resolveTurnstile = useTurnstileResolver();

  return useMutation({
    mutationFn: async (variables) =>
      client.resendVerification({
        correctionToken: variables.correctionToken,
        username: variables.username,
        password: variables.password,
        turnstileToken: await resolveTurnstile(variables.turnstileToken),
      }),
    ...options,
  });
}

export interface CorrectEmailVariables {
  /** The single-use token from the signup response. */
  correctionToken: string;
  email: string;
  turnstileToken?: string;
}

/** Fix a mistyped signup address without a password, using the correction token. */
export function useCorrectEmail(
  options?: MutationOptionsFor<CorrectEmailResponse, CorrectEmailVariables>,
): UseMutationResult<
  CorrectEmailResponse,
  DoughminationError,
  CorrectEmailVariables
> {
  const client = useDoughminationClient();
  const resolveTurnstile = useTurnstileResolver();

  return useMutation({
    mutationFn: async (variables) =>
      client.correctEmail({
        correctionToken: variables.correctionToken,
        email: variables.email,
        turnstileToken: await resolveTurnstile(variables.turnstileToken),
      }),
    ...options,
  });
}

export interface ForgotPasswordVariables {
  username: string;
  turnstileToken?: string;
}

/** Email a password-reset link to the address on file for a username. */
export function useForgotPassword(
  options?: MutationOptionsFor<AccountRecoveryResponse, ForgotPasswordVariables>,
): UseMutationResult<
  AccountRecoveryResponse,
  DoughminationError,
  ForgotPasswordVariables
> {
  const client = useDoughminationClient();
  const resolveTurnstile = useTurnstileResolver();

  return useMutation({
    mutationFn: async (variables) =>
      client.forgotPassword({
        username: variables.username,
        turnstileToken: await resolveTurnstile(variables.turnstileToken),
      }),
    ...options,
  });
}

export interface ForgotUsernameVariables {
  email: string;
  turnstileToken?: string;
}

/** Email the username registered to a given address. */
export function useForgotUsername(
  options?: MutationOptionsFor<AccountRecoveryResponse, ForgotUsernameVariables>,
): UseMutationResult<
  AccountRecoveryResponse,
  DoughminationError,
  ForgotUsernameVariables
> {
  const client = useDoughminationClient();
  const resolveTurnstile = useTurnstileResolver();

  return useMutation({
    mutationFn: async (variables) =>
      client.forgotUsername({
        email: variables.email,
        turnstileToken: await resolveTurnstile(variables.turnstileToken),
      }),
    ...options,
  });
}

export interface ResetPasswordVariables {
  token: string;
  /** At least 10 characters. */
  newPassword: string;
  turnstileToken?: string;
}

/** Set a new password using a reset token. */
export function useResetPassword(
  options?: MutationOptionsFor<ResetPasswordResponse, ResetPasswordVariables>,
): UseMutationResult<
  ResetPasswordResponse,
  DoughminationError,
  ResetPasswordVariables
> {
  const client = useDoughminationClient();
  const resolveTurnstile = useTurnstileResolver();

  return useMutation({
    mutationFn: async (variables) =>
      client.resetPassword({
        token: variables.token,
        newPassword: variables.newPassword,
        turnstileToken: await resolveTurnstile(variables.turnstileToken),
      }),
    ...options,
  });
}

/**
 * Check whether a password-reset token is still valid, so the reset form can
 * show "this link expired" before rendering. No Turnstile.
 */
export function useResetTokenValid(
  token: string | null | undefined,
  options?: QueryOptionsFor<ResetTokenCheckResponse>,
): UseQueryResult<ResetTokenCheckResponse, DoughminationError> {
  const client = useDoughminationClient();

  return useQuery({
    queryKey: [...queryKeys.plural.all, "reset-token", token ?? ""] as const,
    queryFn: ({ signal }) => client.checkResetToken(token as string, signal),
    enabled: Boolean(token) && (options?.enabled ?? true),
    retry: false,
    ...options,
  });
}
