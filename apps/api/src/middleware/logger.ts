import type { MiddlewareHandler } from "hono"
import type { Logger } from "pino"

export const accessLogger = (logger: Logger): MiddlewareHandler => {
  return async function accessLogMiddleware(c, next) {
    const { method, url } = c.req

    const requestId = c.get("requestId")

    const path = url.slice(url.indexOf("/", 8))
    const start = Date.now()

    await next()

    const end = Date.now()

    logger.info({
      correlationId: requestId,
      method: method,
      path: path,
      status: c.res.status,
      duration: end - start
    })
  }
}
