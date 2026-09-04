import type { Database } from "./index.js";
import type { Kysely, Transaction } from "kysely";

export type DatabaseExecutor = Kysely<Database> | Transaction<Database>;
