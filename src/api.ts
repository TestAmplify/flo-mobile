import { useCallback, useEffect, useState } from "react";

export const origin = "https://taskologic-staging-api.onrender.com";
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Client = <T>(path: string, body?: unknown) => Promise<T>;
export function client(token?: string): Client {
  return async (path, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new ApiError(
          response.status,
          typeof data?.message === "string"
            ? data.message
            : "Flo could not complete this request.",
        );
      return data;
    } finally {
      clearTimeout(timer);
    }
  };
}
export type Meeting = {
  _id: string;
  title: string;
  startTime: string;
  bookingManaged?: boolean;
  mediaProvider?: string;
  recordingMode?: string;
  callMode?: string;
  organizer?: {
    state: string;
    canPrepare: boolean;
    roomOpen: boolean;
    hasJoined: boolean;
  };
  capabilities?: { canManage: boolean };
};
export type UserContext = {
  user: { name?: string; firstName?: string; email: string };
  workspace: { name: string; workspaceMode: string };
};
export const pathFor = (m: Meeting) =>
  "/flo/meetings/" + encodeURIComponent(m._id);
export const history = (m: Meeting) =>
  ["ended", "past", "cancelled", "missed"].includes(m.organizer?.state ?? "");
export const dateLabel = (time: string) =>
  new Date(time).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
export const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
export function useResource<T>(read: () => Promise<T>, interval = 0) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await read();
        if (active) {
          setValue(next);
          setError("");
        }
      } catch (e) {
        if (active) {
          setValue(undefined);
          setError(message(e));
        }
      } finally {
        if (active && interval) timer = setTimeout(poll, interval);
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [read, interval, version]);
  return { value, error, refresh };
}
