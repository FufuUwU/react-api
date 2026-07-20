/**
 * Query keys, in one place so live updates can patch the exact cache entry a
 * REST hook wrote, and `force_refresh` can invalidate everything at once.
 */

export const queryKeys = {
  /** Root — invalidating this refetches every hook in the package. */
  all: ["doughmination"] as const,

  discord: {
    all: ["doughmination", "discord"] as const,
    user: (id: string) => ["doughmination", "discord", "user", id] as const,
    users: (ids: string[]) =>
      ["doughmination", "discord", "users", [...ids].sort().join(",")] as const,
    status: () => ["doughmination", "discord", "status"] as const,
  },

  minecraft: {
    all: ["doughmination", "minecraft"] as const,
    profile: (uuid: string) =>
      ["doughmination", "minecraft", "profile", uuid] as const,
    hypixel: (uuid: string) =>
      ["doughmination", "minecraft", "hypixel", uuid] as const,
    capes: () => ["doughmination", "minecraft", "capes"] as const,
  },

  plural: {
    all: ["doughmination", "plural"] as const,
    fronters: () => ["doughmination", "plural", "fronters"] as const,
    members: () => ["doughmination", "plural", "members"] as const,
    member: (id: string) => ["doughmination", "plural", "member", id] as const,
    system: () => ["doughmination", "plural", "system"] as const,
    mentalState: () => ["doughmination", "plural", "mental-state"] as const,
    memberStatus: (id: string) =>
      ["doughmination", "plural", "member-status", id] as const,
    userInfo: () => ["doughmination", "plural", "user-info"] as const,
    usernameCheck: (username: string) =>
      ["doughmination", "plural", "username-check", username] as const,
  },

  devices: {
    all: ["doughmination", "devices"] as const,
    list: () => ["doughmination", "devices", "list"] as const,
    one: (device: string) => ["doughmination", "devices", "one", device] as const,
  },

  guestbook: {
    all: ["doughmination", "guestbook"] as const,
    page: (limit?: number, offset?: number) =>
      ["doughmination", "guestbook", "page", limit ?? 50, offset ?? 0] as const,
  },
} as const;
