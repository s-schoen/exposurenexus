import type { MiddlewareHandler } from "hono"
import { createLogger } from "../logging.js"

const apiLogger = createLogger("audit/api")

export const accessLogger = (): MiddlewareHandler => {
  return async function logger(c, next) {
    const { method, url } = c.req

    const requestId = c.get("requestId")

    const path = url.slice(url.indexOf("/", 8))
    const start = Date.now()

    await next()

    const end = Date.now()

    apiLogger.info({
      correlationId: requestId,
      method: method,
      path: path,
      status: c.res.status,
      duration: end - start
    })
  }
}
