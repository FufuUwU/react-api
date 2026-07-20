/**
 * Optional accessors for the raw Hypixel blobs.
 *
 * The API returns Hypixel's `player` object and SkyBlock `profiles` array
 * untouched and untyped — it defines no schema for them, so this package
 * doesn't invent one. These helpers read the handful of fields people
 * actually use, defensively: every one returns null/[] rather than throwing
 * when a field is missing or the wrong type.
 */

import type { UnifiedMinecraftHypixel } from "../types/minecraft";

type Blob = Record<string, unknown>;

function str(blob: Blob | null | undefined, key: string): string | null {
  const value = blob?.[key];
  return typeof value === "string" ? value : null;
}

function num(blob: Blob | null | undefined, key: string): number | null {
  const value = blob?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Hypixel timestamps are unix milliseconds. */
function date(blob: Blob | null | undefined, key: string): Date | null {
  const value = num(blob, key);
  return value === null ? null : new Date(value);
}

/**
 * The player's rank, resolved through Hypixel's several overlapping rank
 * fields in the usual precedence order: staff rank, then MVP++ (a monthly
 * package), then the purchased package rank.
 *
 * Returns e.g. "ADMIN", "YOUTUBER", "MVP++", "MVP+", "VIP", or null for a
 * default (unranked) player.
 */
export function getHypixelRank(player: Blob | null | undefined): string | null {
  if (!player) return null;

  const staffRank = str(player, "rank");
  if (staffRank && staffRank !== "NORMAL") return staffRank;

  if (str(player, "monthlyPackageRank") === "SUPERSTAR") return "MVP++";

  const packageRank = str(player, "newPackageRank") ?? str(player, "packageRank");
  switch (packageRank) {
    case "MVP_PLUS":
      return "MVP+";
    case "MVP":
      return "MVP";
    case "VIP_PLUS":
      return "VIP+";
    case "VIP":
      return "VIP";
    default:
      return null;
  }
}

/**
 * Network level derived from `networkExp`, using Hypixel's published curve:
 *   level = sqrt(2 * exp + 30625) / 50 - 2.5
 * Returns the exact fractional level; floor it for the displayed level.
 */
export function getNetworkLevel(player: Blob | null | undefined): number | null {
  const exp = num(player, "networkExp");
  if (exp === null || exp < 0) return null;
  return Math.sqrt(2 * exp + 30625) / 50 - 2.5;
}

/** The commonly-used player fields, extracted in one go. */
export interface HypixelPlayerSummary {
  name: string | null;
  /** Resolved rank, e.g. "MVP++"; null when unranked. */
  rank: string | null;
  /** Fractional network level; floor for display. */
  networkLevel: number | null;
  networkExp: number | null;
  karma: number | null;
  achievementPoints: number | null;
  firstLogin: Date | null;
  lastLogin: Date | null;
  lastLogout: Date | null;
  /** True when the player object was present at all. */
  hasPlayer: boolean;
}

/** Pull the common fields out of a `useHypixelStats` result. */
export function getPlayerSummary(
  data: UnifiedMinecraftHypixel | null | undefined,
): HypixelPlayerSummary {
  const player = (data?.player ?? null) as Blob | null;
  return {
    name: data?.name ?? str(player, "displayname"),
    rank: getHypixelRank(player),
    networkLevel: getNetworkLevel(player),
    networkExp: num(player, "networkExp"),
    karma: num(player, "karma"),
    achievementPoints: num(player, "achievementPoints"),
    firstLogin: date(player, "firstLogin"),
    lastLogin: date(player, "lastLogin"),
    lastLogout: date(player, "lastLogout"),
    hasPlayer: player !== null,
  };
}

/** A SkyBlock profile, reduced to the fields needed to list/pick one. */
export interface SkyblockProfileSummary {
  /** `profile_id` — the UUID you'd use for a deeper lookup. */
  id: string | null;
  /** `cute_name`, e.g. "Mango". */
  name: string | null;
  /** `game_mode`, e.g. "ironman", "island"; null for a normal profile. */
  gameMode: string | null;
  /** True when this is the player's currently selected profile. */
  selected: boolean;
  /** The raw profile object, for anything else you need. */
  raw: Blob;
}

/** List the SkyBlock profiles from a `useHypixelStats` result. */
export function getSkyblockProfiles(
  data: UnifiedMinecraftHypixel | null | undefined,
): SkyblockProfileSummary[] {
  const profiles = data?.skyblock;
  if (!Array.isArray(profiles)) return [];

  return profiles
    .filter((entry): entry is Blob => typeof entry === "object" && entry !== null)
    .map((profile) => ({
      id: str(profile, "profile_id"),
      name: str(profile, "cute_name"),
      gameMode: str(profile, "game_mode"),
      selected: profile["selected"] === true,
      raw: profile,
    }));
}

/** The currently selected SkyBlock profile, if the API reported one. */
export function getSelectedSkyblockProfile(
  data: UnifiedMinecraftHypixel | null | undefined,
): SkyblockProfileSummary | null {
  return getSkyblockProfiles(data).find((profile) => profile.selected) ?? null;
}
