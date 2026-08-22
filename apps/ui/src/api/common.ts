import { env } from "@/env.ts";

import type {
  APIArrayDataReply,
  APIErrorReply,
  APISingleDataReply,
} from "@exposurenexus/contracts/api";
import type { z } from "zod/v4";

export const DEFAULT_QUERY_STALE_TIME = 1000 * 60 * 5;
export const CSRF_COOKIE = "__Host-exposurenexus-csrf";
export const CSRF_HEADER = "X-CSRF-Token";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface APIRequestOptions {
  csrf?: boolean;
}

export class APIError extends Error {
  statusCode: number;
  reason?: string;

  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.statusCode = status;
    this.reason = reason;
  }
}

export function buildApiUrl(path: string, apiBaseUrl: string): string {
  const normalizedBase = apiBaseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (
    normalizedBase.endsWith("/api") &&
    (normalizedPath === "/api" || normalizedPath.startsWith("/api/"))
  ) {
    return `${normalizedBase}${normalizedPath.slice("/api".length)}`;
  }

  return `${normalizedBase}${normalizedPath}`;
}

function apiUrl(path: string): string {
  return buildApiUrl(path, env.VITE_API_URL);
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.slice(prefix.length));
}

export function csrfHeaders(): HeadersInit {
  const csrfToken = readCookie(CSRF_COOKIE);
  if (!csrfToken) {
    return {};
  }

  return {
    [CSRF_HEADER]: csrfToken,
  };
}

export async function apiRequest(
  path: string,
  init: RequestInit = {},
  options: APIRequestOptions = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if ((options.csrf ?? true) && UNSAFE_METHODS.has(method) && !headers.has(CSRF_HEADER)) {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) {
      headers.set(CSRF_HEADER, csrfToken);
    }
  }

  return fetch(apiUrl(path), {
    ...init,
    method,
    credentials: "include",
    headers,
  });
}

export async function parseErrorReply(r: Response): Promise<Error> {
  const errorJson = (await r.json()) as APIErrorReply;
  return new APIError(r.status, errorJson.error, errorJson.reason);
}

export async function parseArrayReply<T extends object>(
  r: Response,
  schema: z.ZodType<T>,
): Promise<Array<T>> {
  const parsed = (await r.json()) as APIArrayDataReply<T>;

  return parsed.data.items.map((item) => schema.parse(item));
}

export async function parseObjectReply<T extends object>(
  r: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const parsed = (await r.json()) as APISingleDataReply<T>;

  return schema.parse(parsed.data);
}
