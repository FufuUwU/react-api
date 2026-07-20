/**
 * Device hooks — battery, charging, wifi, watch/AirPods, location.
 *
 * `device_update` is broadcast to every client with no subscription, so both
 * hooks below stay live as soon as the provider's socket is up.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { useDoughminationClient, useDoughminationSocket } from "../provider/context";
import { queryKeys } from "./keys";
import type { QueryOptionsFor } from "./discord";
import type { DoughminationError } from "../client/errors";
import { isDeviceDeleted } from "../types/devices";
import type { DeviceRecord, DevicesMap } from "../types/devices";

/**
 * Every device's latest state, keyed by device name, live.
 *
 * Seeded from `GET /devices` and patched by `device_update` — a report merges
 * into the map, a delete removes the key.
 */
export function useDevices(
  options?: QueryOptionsFor<DevicesMap>,
): UseQueryResult<DevicesMap, DoughminationError> {
  const client = useDoughminationClient();
  const socket = useDoughminationSocket();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.devices.list(),
    queryFn: ({ signal }) => client.getDevices(signal),
    ...options,
  });

  useEffect(() => {
    if (!socket) return;
    return socket.on("device_update", (event) => {
      queryClient.setQueryData<DevicesMap>(queryKeys.devices.list(), (previous) => {
        const next: DevicesMap = { ...(previous ?? {}) };
        const payload = event.data;

        if (isDeviceDeleted(payload)) {
          delete next[payload.device];
        } else if (payload.device) {
          // Reports are partial merges server-side; mirror that locally so a
          // battery-only report doesn't wipe a previously reported wifi name.
          const existing = next[payload.device];
          next[payload.device] = { ...existing, ...payload };
        }
        return next;
      });
    });
  }, [socket, queryClient]);

  return query;
}

export interface DeviceStateResult {
  /** The device's current state, or undefined if it hasn't reported. */
  device: DeviceRecord | undefined;
  /** Every device, for convenience. */
  devices: DevicesMap | undefined;
  isLoading: boolean;
  isError: boolean;
  error: DoughminationError | null;
  /** True when the socket is connected, so updates are arriving live. */
  isLive: boolean;
  refetch: () => void;
}

/**
 * Live state for one device (or the whole map when no name is given).
 *
 * ```tsx
 * const { device, isLive } = useDeviceState("iphone");
 * <span>{device?.level}%{device?.charging ? " ⚡" : ""}</span>
 * ```
 */
export function useDeviceState(
  deviceName?: string,
  options?: QueryOptionsFor<DevicesMap>,
): DeviceStateResult {
  const socket = useDoughminationSocket();
  const query = useDevices(options);

  return {
    device: deviceName ? query.data?.[deviceName] : undefined,
    devices: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    isLive: socket?.isOpen ?? false,
    refetch: () => {
      void query.refetch();
    },
  };
}
