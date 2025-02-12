import { describeSchema } from "../describe";
import { schemaYamls } from "./yamls";
export type { Schema } from "./yamls";

export const schemaIds: string[] = Object.keys(schemaYamls);
export const schemas = schemaIds
  .map(id => ({
    [id]: describeSchema({ schema: { id } }).schema
  }))
  .reduce((a, b) => ({ ...a, ...b }), {});
