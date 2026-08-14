import { Hono } from "hono";

import { replyObject } from "../lib/reply.js";

const health = new Hono();

health.get("/", (c) => {
  return replyObject(c, { status: "ok" });
});

export default health;
