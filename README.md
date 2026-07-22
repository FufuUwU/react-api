# @doughmination/react-api

[![Socket Badge](https://badge.socket.dev/npm/package/@doughmination/react-api)](https://badge.socket.dev/npm/package/@doughmination/react-api)
[![npm version](https://img.shields.io/npm/v/@doughmination/react-api.svg)](https://www.npmjs.com/package/@doughmination/react-api)
[![Publish](https://github.com/doughmination/react-api/actions/workflows/publish.yml/badge.svg)](https://github.com/doughmination/react-api/actions/workflows/publish.yml)
[![types included](https://img.shields.io/npm/types/@doughmination/react-api.svg)](https://www.npmjs.com/package/@doughmination/react-api)
[![React 18 | 19](https://img.shields.io/badge/React-18%20%7C%2019-61dafb.svg?logo=react)](https://react.dev)
[![TanStack Query v5](https://img.shields.io/badge/TanStack%20Query-v5-ef4444.svg)](https://tanstack.com/query)
[![license](https://img.shields.io/badge/license-custom-blue.svg)](./licence.md)

Typed client and React hooks for the [Doughmination API](https://doughmination.uk/docs) — Discord presence, Minecraft & Hypixel stats, the plural system (fronters, members, mental state), devices and the guestbook — all backed by a **single shared WebSocket** for live updates.

- **Zero-config reads.** Every public read works with no auth. Construct the provider with nothing but a `QueryClient` and you're live.
- **One connection.** `<DoughminationProvider>` owns exactly one socket for the whole tree. Presence subscriptions are ref-counted, so unmounting one component never kills another's feed.
- **Fully typed from the source.** Response types are hand-written from the API handlers, not a spec.
- **ESM + CJS + types**, React 18/19, TanStack Query v5.

## Install

```bash
npm i @doughmination/react-api @tanstack/react-query react
# or: bun add @doughmination/react-api @tanstack/react-query react
```

`react` and `@tanstack/react-query` are peer dependencies — the package uses your app's copies.

## Quick start

Wrap your app in a TanStack `QueryClientProvider`, then `DoughminationProvider`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DoughminationProvider } from "@doughmination/react-api";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DoughminationProvider>
        <Dashboard />
      </DoughminationProvider>
    </QueryClientProvider>
  );
}
```

That's the whole setup for public reads and live updates. Auth and captcha are only needed for writes (see [Authentication](#authentication) and [Turnstile](#turnstile)).

## Provider options

```tsx
<DoughminationProvider
  baseUrl="https://doughmination.uk/v2"   // default
  token={() => localStorage.getItem("token")}  // JWT for writes; function or string
  batteryKey={process.env.BATTERY_KEY}    // X-Battery-Key for device/guestbook admin
  turnstile={() => turnstileTokenRef.current}   // supplies captcha tokens (see below)
  realtime                                 // default true; set false to disable the socket
  onError={(e) => console.error(e)}
>
  {children}
</DoughminationProvider>
```

`token`, `batteryKey` and `botToken` each accept a string or a (sync/async) function, so you can read from your own auth store on every request without rebuilding the client.

## Query hooks

Every read hook is a thin TanStack Query wrapper — you get `data`, `isLoading`, `error`, `refetch` and can pass through any query option.

```tsx
import {
  useDiscordUser,
  useDiscordUsers,
  useMinecraftProfile,
  useHypixelStats,
  useFronters,
  useMembers,
  useMentalState,
  useDevices,
  useGuestbook,
} from "@doughmination/react-api";

useDiscordUser("209830981060788225");        // merged profile + badges + presence
useDiscordUsers(["id1", "id2"]);             // batch, up to 100 ids
useMinecraftProfile("79ef438d69ea473c99cd6a5ec34c6736"); // skin, capes, render URLs
useHypixelStats(uuid);                        // Hypixel + SkyBlock (allowlisted UUIDs only)
useFronters();                                // current front — live (see below)
useMembers();                                 // all members, with tags + status
useMentalState();                             // current mental state — live
useDevices();                                 // all device battery/state — live
useGuestbook({ limit: 20, offset: 0 });       // newest first, keeps previous page while loading
```

Example:

```tsx
function ProfileCard({ id }: { id: string }) {
  const { data, isLoading, error } = useDiscordUser(id);
  if (isLoading) return <Spinner />;
  if (error) return <p>{error.message}</p>;
  return (
    <div>
      <img src={data.user.avatar_url} alt="" />
      <strong>{data.user.display_name ?? data.user.username}</strong>
      <span>{data.presence?.status ?? "offline"}</span>
    </div>
  );
}
```

### Hypixel helpers

`player` and `skyblock` come back as raw upstream blobs (the API defines no schema for them). Typed accessors read the common fields defensively:

```tsx
import { useHypixelStats, getPlayerSummary, getSkyblockProfiles } from "@doughmination/react-api";

function Stats({ uuid }: { uuid: string }) {
  const { data } = useHypixelStats(uuid);
  const player = getPlayerSummary(data);   // { rank, networkLevel, karma, firstLogin, ... }
  const profiles = getSkyblockProfiles(data);
  return <p>{player.rank ?? "Unranked"} · level {Math.floor(player.networkLevel ?? 0)}</p>;
}
```

`useHypixelStats` returns `403` for any UUID that isn't one of the operator's own accounts — that's by design (Hypixel's API policy forbids proxying arbitrary players). An allowlisted player who's never joined Hypixel still resolves `200`; check `data.source.player` to tell the cases apart.

## Realtime

The API exposes **one** socket at `/v2/ws`. The provider opens it once and fans events out to every hook. It handles reconnect (exponential backoff + jitter), keepalive (`ping`→`pong`), and re-sends subscriptions after a reconnect.

Three event types are pushed to **every** client automatically — no subscription needed:

- `fronters_update` → `useFronters()` stays live
- `mental_state_update` → `useMentalState()` stays live
- `device_update` → `useDevices()` / `useDeviceState()` stay live

So `useFronters()` seeds from REST and then updates itself on every switch, including switches made in other browsers:

```tsx
function FrontList() {
  const { data } = useFronters();     // updates live, no extra wiring
  return (
    <ul>
      {data?.members?.map((m) => (
        <li key={m.id}>
          {m.display_name ?? m.name}
          {m.tags?.includes("Host") && " · Host"}
          {m.status && ` — ${m.status.text}`}
        </li>
      ))}
    </ul>
  );
}
```

> Note: the `fronters_update` event carries PluralKit's raw object, which is missing the `tags`/`status` enrichment the REST route adds. This package merges live payloads over the cached data per member, so those fields survive a switch. You don't need to do anything.

### Live presence

Presence is the one **opt-in** feed. `usePresence` sends the subscribe frame, receives the `init_state` snapshot, then live `presence_update` events — for the users you asked for only. Subscriptions are ref-counted, so several components can watch overlapping ids safely.

```tsx
import { usePresence } from "@doughmination/react-api";

function LivePresence({ ids }: { ids: string[] }) {
  const { presences, isLive, isReady } = usePresence(ids);
  // ids can be a fresh array each render — subscriptions are keyed by sorted ids.

  if (!isReady) return <p>{isLive ? "Loading…" : "Connecting…"}</p>;

  return (
    <ul>
      {ids.map((id) => {
        const p = presences[id];
        return (
          <li key={id}>
            {id}: {p?.status ?? "offline"}
            {p?.listening_to_spotify && ` · ♫ ${p.spotify?.song}`}
          </li>
        );
      })}
    </ul>
  );
}
```

Pass `"all"` to follow every tracked user: `usePresence("all")`. For a single user, `useUserPresence(id)` returns just that `UnifiedPresence | undefined`. `useConnectionStatus()` gives the socket lifecycle (`idle | connecting | open | reconnecting | closed`).

### Live device state

```tsx
import { useDeviceState } from "@doughmination/react-api";

function Battery() {
  const { device, isLive } = useDeviceState("iphone");
  if (!device) return <span>—</span>;
  return (
    <span>
      {device.level}%{device.charging ? " ⚡" : ""}
      {device.wifi && ` · ${device.wifi}`}
      {!isLive && " (stale)"}
    </span>
  );
}
```

### Any raw event

```tsx
import { useDoughminationEvent } from "@doughmination/react-api";

useDoughminationEvent("force_refresh", () => toast("Data refreshed"));
```

By default the provider also invalidates all package queries when it receives `force_refresh` (toggle with `invalidateOnForceRefresh`).

## Authentication

Reads need nothing. Writes (switching fronters, setting mental state, device reports, guestbook moderation) need a credential on the provider.

```tsx
import { useLogin, useSetFronters } from "@doughmination/react-api";

function LoginForm() {
  const login = useLogin();
  async function onSubmit(username: string, password: string, turnstileToken: string) {
    const { access_token } = await login.mutateAsync({ username, password, turnstileToken });
    localStorage.setItem("token", access_token);   // you store it; feed it back via provider `token`
  }
}

// Once the provider has the token, writes just work:
function SwitchButton({ ids }: { ids: string[] }) {
  const setFronters = useSetFronters();
  return <button onClick={() => setFronters.mutate(ids)}>Switch</button>;
  // No manual refetch — the API broadcasts fronters_update and useFronters() updates itself.
}
```

The package never stores your token — put it wherever your app keeps auth state and pass it back through the provider's `token` prop.

**Unverified accounts.** New signups must confirm their email before login. A blocked login rejects with a `DoughminationError` where `status === 403` and `code === "email_unverified"` — use that to offer a "resend confirmation" action rather than "wrong password".

### Account recovery

Signup now requires an email and returns a one-time `correction_token` (for fixing a typo'd address without a password). The full flow is covered:

```tsx
import {
  useSignup, useVerifyEmail, useResendVerification, useCorrectEmail,
  useForgotPassword, useForgotUsername, useResetPassword, useResetTokenValid,
  useUsernameAvailable, useEmailAvailable,
} from "@doughmination/react-api";

const signup = useSignup();
const { correction_token } = await signup.mutateAsync({ username, password, email });

useVerifyEmail().mutate(tokenFromUrl);              // confirm the address (no captcha)
useResetTokenValid(tokenFromUrl);                   // check a reset link before showing the form
useForgotPassword().mutate({ username });           // email a reset link
useResetPassword().mutate({ token, newPassword });  // set the new password
```

## Turnstile

Login, signup, guestbook posts and the recovery endpoints are Cloudflare Turnstile–gated. **This package cannot generate a captcha token** — it comes from the widget you render. Supply it one of two ways:

**Per call** — pass `turnstileToken` in the mutation variables:

```tsx
login.mutate({ username, password, turnstileToken });
```

**Provider-wide** — give the provider a `turnstile` callback that returns the current token; every gated mutation uses it as the fallback:

```tsx
const tokenRef = useRef<string>("");

<DoughminationProvider turnstile={() => tokenRef.current}>
  {/* render Turnstile's widget somewhere and set tokenRef.current in its callback */}
</DoughminationProvider>
```

### Guestbook post

```tsx
import { useGuestbook, useGuestbookPost } from "@doughmination/react-api";

function Guestbook() {
  const { data } = useGuestbook({ limit: 20 });
  const post = useGuestbookPost();   // turnstile from provider, or pass turnstileToken here

  async function sign(name: string, message: string) {
    const res = await post.mutateAsync({ name, message });
    if (res.skipped) return;         // honeypot tripped — API fakes success and drops it
  }

  return <>{data?.entries.map((e) => <p key={e.id}><b>{e.name}</b>: {e.message}</p>)}</>;
}
```

Guestbook posts are rate limited to one per 60s per IP — that surfaces as a `DoughminationError` with `isRateLimited === true`.

## Error handling

Both of the API's error conventions (`{success:false, error:{code,message}}` from the Worker routes and `{detail}` from the system routes) are normalised into one `DoughminationError`:

```tsx
import { isDoughminationError } from "@doughmination/react-api";

try {
  await post.mutateAsync({ name, message });
} catch (err) {
  if (isDoughminationError(err)) {
    if (err.isRateLimited) show("Slow down a moment.");
    else if (err.isAuthError) show("Please log in again.");
    else show(err.message);         // err.status, err.code, err.body also available
  }
}
```

## Using the client without React

The typed client is exported on its own — handy for scripts, SSR loaders, or route handlers:

```ts
import { DoughminationClient } from "@doughmination/react-api";

const client = new DoughminationClient();               // reads need no config
const fronters = await client.getFronters();
const record = await client.getDiscordUser("209830981060788225");
```

## CORS

The public read routes (`/discord/*`, `/minecraft/*`) allow any origin. The system routes (`/plural/*`, `/devices`, `/guestbook`) use an **allowlist** with credentials — by default `doughmination.uk`, `doughmination.co.uk`, `c.stupid.cat`, and any `localhost` port. If you host your frontend elsewhere, add its origin to the API's `CORS_ORIGINS`, or those calls will fail in the browser.

## API surface

| Area | Hooks |
|------|-------|
| Discord | `useDiscordUser`, `useDiscordUsers`, `useDiscordStatus` |
| Minecraft | `useMinecraftProfile`, `useHypixelStats`, `useMinecraftCapes` |
| Plural | `useFronters`, `useMembers`, `useMember`, `useMentalState`, `useSystem`, `useMemberStatus`, `useUserInfo` |
| Devices | `useDevices`, `useDeviceState` |
| Guestbook | `useGuestbook`, `useGuestbookPost`, `useDeleteGuestbookEntry` |
| Presence / realtime | `usePresence`, `useUserPresence`, `useConnectionStatus`, `useDoughminationEvent` |
| Auth & writes | `useLogin`, `useSignup`, `useSetFronters`, `useSwitchFront`, `useSetMentalState`, `useReportDevice` |
| Account recovery | `useVerifyEmail`, `useResendVerification`, `useCorrectEmail`, `useForgotPassword`, `useForgotUsername`, `useResetPassword`, `useResetTokenValid`, `useUsernameAvailable`, `useEmailAvailable` |

Escape hatches: `useDoughminationClient()` (the client), `useDoughminationSocket()` (the raw socket), `queryKeys` (for manual cache work).

## Development

```bash
npm install
npm run typecheck
npm run build    # tsup → dist/ (ESM + CJS + .d.ts)
```

## Licence

ESAL-2.3
