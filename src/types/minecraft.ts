/**
 * Minecraft types — transcribed from the API's `src/types.ts` and
 * `src/minecraft.ts`.
 *
 *   GET /v2/minecraft/general/:uuid  -> { success, data: UnifiedMinecraftGeneral }
 *   GET /v2/minecraft/hypixel/:uuid  -> { success, data: UnifiedMinecraftHypixel }
 *   GET /v2/minecraft/capes          -> { success, data: VanillaCapeList }
 *
 * The UUID param accepts dashed, undashed, or NBT int-array spellings.
 */

/** One cape a player has, resolved via capes.dev across every provider. */
export interface UnifiedCape {
  /** Provider: "minecraft", "optifine", "labymod", "minecraftcapes", … */
  source: string;
  cape_url: string | null;
}

/** One vanilla (Mojang) cape in the accumulated catalogue. */
export interface VanillaCapeEntry {
  /** Always "minecraft" — these are vanilla Mojang capes. */
  source: string;
  cape_url: string;
}

/** GET /v2/minecraft/capes */
export interface VanillaCapeList {
  count: number;
  capes: VanillaCapeEntry[];
}

/** Ready-to-embed render URLs (mc-heads.net). `_flat` = overlay layer off. */
export interface MinecraftRenderUrls {
  /** 2D head, overlay on. */
  face: string;
  /** 2D head, overlay off. */
  face_flat: string;
  /** Isometric 3D head, overlay on. */
  head: string;
  /** Isometric 3D head, overlay off. */
  head_flat: string;
  /** Isometric 3D full body, overlay on. */
  body: string;
  /** Isometric 3D full body, overlay off. */
  body_flat: string;
  /** Flat front-facing full body, overlay on. */
  player: string;
  /** Flat front-facing full body, overlay off. */
  player_flat: string;
  /** Face + body composite. */
  combo: string;
  /** Raw skin texture PNG. */
  skin: string;
}

/** Mojang identity + skin/cape (GET /v2/minecraft/general/:uuid). */
export interface UnifiedMinecraftGeneral {
  /** Dashed UUID (canonical form). */
  uuid: string;
  /** Undashed UUID (as Mojang/Hypixel return it). */
  uuid_short: string;
  name: string | null;
  /** Raw skin texture URL (textures.minecraft.net); null if none. */
  skin_url: string | null;
  /** "classic" (Steve) or "slim" (Alex) arms; null if unknown. */
  skin_model: "classic" | "slim" | null;
  /** Texture URL of the *currently equipped* cape; see `capes` for all. */
  cape_url: string | null;
  /** Every cape the player has, one entry per provider that has one. */
  capes: UnifiedCape[];
  render: MinecraftRenderUrls;
  updated_at: number;
}

/**
 * Why a Hypixel section is (or isn't) present.
 *   ok          — loaded
 *   unavailable — Hypixel not configured on this deployment
 *   not_found   — the player has never joined Hypixel
 *   error       — upstream failure
 */
export type MinecraftSourceState = "ok" | "unavailable" | "not_found" | "error";

/**
 * Hypixel stats (GET /v2/minecraft/hypixel/:uuid).
 *
 * `player` and `skyblock` are raw upstream Hypixel objects — the API defines
 * no schema for them, so they stay untyped here rather than being invented.
 * Use the accessors in `hypixel.ts` for the commonly-used fields.
 *
 * Note: this endpoint only serves the operator's own allowlisted UUIDs (403
 * otherwise), and force-refresh query params are deliberately ignored.
 */
export interface UnifiedMinecraftHypixel {
  uuid: string;
  /** Hypixel display name, when the player object provides one. */
  name: string | null;
  /** Raw Hypixel `player` object; null when unavailable (see source.player). */
  player: Record<string, unknown> | null;
  /** Raw Hypixel SkyBlock `profiles` array; null when unavailable. */
  skyblock: unknown[] | null;
  updated_at: number;
  source: {
    player: MinecraftSourceState;
    skyblock: MinecraftSourceState;
  };
}
