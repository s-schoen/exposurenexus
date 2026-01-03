import type {
  APIArrayDataReply,
  APIErrorReply,
  APISingleDataReply
} from "@openvlp/types/api"

export const DEFAULT_QUERY_STALE_TIME = 1000 * 60 * 5

export class APIError extends Error {
  statusCode: number

  constructor(status: number, message: string) {
    super(message)
    this.statusCode = status
  }
}

export async function parseErrorReply(r: Response): Promise<Error> {
  const errorJson = (await r.json()) as APIErrorReply
  return new APIError(r.status, errorJson.error)
}

export async function parseArrayReply<T extends object>(
  r: Response
): Promise<Array<T>> {
  const parsed = (await r.json()) as APIArrayDataReply<T>
  return parsed.data.items
}

export async function parseObjectReply<T extends object>(
  r: Response
): Promise<T> {
  const parsed = (await r.json()) as APISingleDataReply<T>
  return parsed.data
}
