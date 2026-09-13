import type { ImportSource } from "./import-sources.js";

export interface ImportSourceTable extends ImportSource {
  bucket: string;
  objectKey: string;
}
