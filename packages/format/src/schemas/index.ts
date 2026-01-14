import { describeSchema } from "#describe";
import { schemaYamls } from "./yamls.js";
export type { Schema } from "./yamls.js";

export const schemaIds: string[] = Object.keys(schemaYamls);
export const schemas = schemaIds
  .map((id) => ({
    [id]: describeSchema({ schema: { id } }).schema,
  }))
  .reduce((a, b) => ({ ...a, ...b }), {});
