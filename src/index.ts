/**
 * @doughmination/react-api
 *
 * Typed client + React hooks for the Doughmination API, including a single
 * shared WebSocket for live fronters, presence, mental state and devices.
 */

// ---- Provider + context ----------------------------------------------------
export { DoughminationProvider } from "./provider/DoughminationProvider";
export type { DoughminationProviderProps } from "./provider/DoughminationProvider";
export {
  useDoughmination,
  useDoughminationClient,
  useDoughminationSocket,
  DoughminationContext,
} from "./provider/context";
export type {
  DoughminationContextValue,
  TurnstileTokenProvider,
} from "./provider/context";

// ---- Client ----------------------------------------------------------------
export { DoughminationClient, DEFAULT_BASE_URL } from "./client/http";
export type {
  DoughminationClientOptions,
  TokenSource,
} from "./client/http";
export { DoughminationError, isDoughminationError } from "./client/errors";

// ---- Hypixel helpers -------------------------------------------------------
export {
  getHypixelRank,
  getNetworkLevel,
  getPlayerSummary,
  getSkyblockProfiles,
  getSelectedSkyblockProfile,
} from "./client/hypixel";
export type {
  HypixelPlayerSummary,
  SkyblockProfileSummary,
} from "./client/hypixel";

// ---- Realtime --------------------------------------------------------------
export { DoughminationSocket } from "./realtime/socket";
export type { SocketOptions, PresenceTarget } from "./realtime/socket";

// ---- Query hooks -----------------------------------------------------------
export {
  useDiscordUser,
  useDiscordUsers,
  useDiscordStatus,
} from "./hooks/discord";
export type { QueryOptionsFor } from "./hooks/discord";

export {
  useMinecraftProfile,
  useHypixelStats,
  useMinecraftCapes,
} from "./hooks/minecraft";

export {
  useFronters,
  useMembers,
  useMember,
  useMentalState,
  useSystem,
  useMemberStatus,
  useUserInfo,
} from "./hooks/plural";

export { useDevices, useDeviceState } from "./hooks/devices";
export type { DeviceStateResult } from "./hooks/devices";

export { useGuestbook } from "./hooks/guestbook";
export type { UseGuestbookParams } from "./hooks/guestbook";

// ---- Live hooks ------------------------------------------------------------
export {
  usePresence,
  useUserPresence,
  useConnectionStatus,
  useDoughminationEvent,
} from "./hooks/presence";
export type { UsePresenceResult } from "./hooks/presence";

// ---- Mutations -------------------------------------------------------------
export {
  useLogin,
  useSignup,
  useGuestbookPost,
  useDeleteGuestbookEntry,
  useSetFronters,
  useSwitchFront,
  useSetMentalState,
  useReportDevice,
} from "./hooks/mutations";
export type {
  LoginVariables,
  SignupVariables,
  SetMentalStateVariables,
  MutationOptionsFor,
} from "./hooks/mutations";

// ---- Account recovery ------------------------------------------------------
export {
  useVerifyEmail,
  useResendVerification,
  useCorrectEmail,
  useForgotPassword,
  useForgotUsername,
  useResetPassword,
  useResetTokenValid,
  useUsernameAvailable,
  useEmailAvailable,
} from "./hooks/account";
export type {
  ResendVerificationVariables,
  CorrectEmailVariables,
  ForgotPasswordVariables,
  ForgotUsernameVariables,
  ResetPasswordVariables,
} from "./hooks/account";

// ---- Query keys ------------------------------------------------------------
export { queryKeys } from "./hooks/keys";

// ---- Types -----------------------------------------------------------------
export * from "./types";
export { isDeviceDeleted } from "./types/devices";
export {
  GUESTBOOK_LIMITS,
  GUESTBOOK_RATE_LIMIT_SECONDS,
} from "./types/guestbook";
