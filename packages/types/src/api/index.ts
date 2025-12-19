interface APIReply {
  correlationId: string
}

export interface APISingleDataReply<T extends object> extends APIReply {
  data: T
}

export interface APIArrayDataReply<T extends object> extends APIReply {
  data: {
    currentItemCount: number
    startIndex: number
    totalItems: number
    items: T[]
  }
}

export interface APIErrorReply extends APIReply {
  status: number
  error: string
}

export function createObjectReply<T extends object>(
  correlationId: string,
  data: T
): APISingleDataReply<T> {
  return { correlationId, data }
}

export function createArrayReply<T extends object>(
  correlationId: string,
  data: T[]
): APIArrayDataReply<T> {
  return {
    correlationId,
    data: {
      items: data,
      totalItems: data.length,
      startIndex: 0,
      currentItemCount: data.length
    }
  }
}

export function createErrorReply(
  correlationId: string,
  httpStatus: number,
  error: Error
): APIErrorReply {
  return { correlationId, error: error.message, status: httpStatus }
}
