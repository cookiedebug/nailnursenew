const defaultApiBase =
  typeof window !== "undefined" && window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:5000/api"
    : "http://localhost:5000/api";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? defaultApiBase;

const API_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  status: number;
  requiresConfirmation: boolean;
  timedOut: boolean;

  constructor(message: string, status: number, requiresConfirmation = false, timedOut = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requiresConfirmation = requiresConfirmation;
    this.timedOut = timedOut;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  let body: unknown;
  let timedOut = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    body = await response.json().catch((reason: unknown) => {
      if (controller.signal.aborted) throw reason;
      return {};
    });
  } catch (reason) {
    if (timedOut) {
      throw new ApiError("The booking service took too long to respond. Please try again.", 0, false, true);
    }
    if (reason instanceof Error && reason.name === "AbortError") throw reason;
    throw new ApiError("Could not connect to the booking service. Please try again.", 0);
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }

  const data =
    body && typeof body === "object"
      ? (body as { error?: unknown; requires_confirmation?: unknown })
      : {};
  if (!response.ok) {
    throw new ApiError(
      typeof data.error === "string" ? data.error : "Something went wrong. Please try again.",
      response.status,
      data.requires_confirmation === true,
    );
  }
  return body as T;
}

export async function logout(): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    await api("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: "client" | "admin";
}

export interface Availability {
  date: string;
  available: boolean;
  start_time: string | null;
  end_time: string | null;
  booked_slots?: { start_time: string; end_time: string }[];
}

export interface Booking {
  id: number;
  client_name: string;
  email: string;
  phone: string;
  service: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "pending" | "confirmed" | "cancelled";
}

export interface ClientBooking {
  id: number;
  date: string;
  service: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "pending" | "confirmed" | "cancelled";
}
