import { schemaYamls } from "../yamls";
import { describeSchema } from "./describe";

export const schemaIds: string[] = Object.keys(schemaYamls);
export const schemas = schemaIds
  .map(id => ({
    [id]: describeSchema({ schema: { id } }).schema
  }))
  .reduce((a, b) => ({ ...a, ...b }), {});
