/**
 * Device state types (/v2/devices).
 *
 *   GET /v2/devices          -> Record<deviceName, DeviceRecord>  (public)
 *   GET /v2/devices/:device  -> DeviceRecord                      (public)
 *   POST/DELETE              -> require the X-Battery-Key header
 *
 * POST is a partial merge: only the query params supplied are updated, so a
 * stored record may be missing any field except `updated_at`. That's why
 * everything below is optional — a device that has only ever reported battery
 * has no `wifi` key at all.
 */

export interface DeviceRecord {
  /** The device name (the map key, echoed into the record by the API). */
  device: string;
  /** Battery percentage, 0–100. */
  level?: number;
  charging?: boolean;
  /** Low Power Mode (reported as the `lpm` query param). */
  lowPowerMode?: boolean;
  /** Network name; null when explicitly cleared (`wifi=0`). */
  wifi?: string | null;
  /** Watch connected. */
  watch?: boolean;
  /** AirPods connected. */
  airpods?: boolean;
  /** Place name; null when explicitly cleared (`location=0`). */
  location?: string | null;
  /** ISO 8601 timestamp of the last report. Always present. */
  updated_at: string;
}

/** GET /v2/devices — keyed by device name. */
export type DevicesMap = Record<string, DeviceRecord>;

/** The `device_update` socket event payload when a device is removed. */
export interface DeviceDeletedEvent {
  device: string;
  deleted: true;
}

/**
 * The `device_update` socket payload — either a full record (on report) or a
 * deletion marker (on DELETE). Narrow with `isDeviceDeleted`.
 */
export type DeviceUpdatePayload = DeviceRecord | DeviceDeletedEvent;

export function isDeviceDeleted(
  payload: DeviceUpdatePayload,
): payload is DeviceDeletedEvent {
  return (payload as DeviceDeletedEvent).deleted === true;
}

/** Fields accepted by a device report (POST /v2/devices, battery key required). */
export interface DeviceReportInput {
  /** Required. 1–64 chars. */
  device: string;
  /** Integer 0–100. */
  level?: number;
  charging?: boolean;
  /** Sent as `lpm`. */
  lowPowerMode?: boolean;
  /** Network name (≤128 chars), or null to clear. */
  wifi?: string | null;
  watch?: boolean;
  airpods?: boolean;
  /** Place name (≤128 chars), or null to clear. */
  location?: string | null;
}
