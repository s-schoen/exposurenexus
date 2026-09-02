import type { UserProfile } from "../model/user.js";

interface APIReply {
  correlationId: string;
}

export interface APISingleDataReply<T extends object> extends APIReply {
  data: T;
}

export interface APIArrayDataReply<T extends object> extends APIReply {
  data: {
    currentItemCount: number;
    startIndex: number;
    totalItems: number;
    items: T[];
  };
}

export interface APIErrorReply extends APIReply {
  status: number;
  error: string;
  reason?: string;
}

export interface AuthSessionReply {
  id: string;
  userId: string;
  sourceIp: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthSessionDataReply {
  user: UserProfile;
  session: AuthSessionReply;
}

export function createObjectReply<T extends object>(
  correlationId: string,
  data: T,
): APISingleDataReply<T> {
  return { correlationId, data };
}

export function createArrayReply<T extends object>(
  correlationId: string,
  data: T[],
): APIArrayDataReply<T> {
  return {
    correlationId,
    data: {
      items: data,
      totalItems: data.length,
      startIndex: 0,
      currentItemCount: data.length,
    },
  };
}
