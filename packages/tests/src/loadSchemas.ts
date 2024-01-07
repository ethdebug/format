import {
  addSchema,
  validate,
  setMetaSchemaOutputFormat,
} from "@hyperjump/json-schema/draft-2020-12";

import schemas from "./schemas.js";

const main = () => {
  setMetaSchemaOutputFormat("BASIC");

  for (const schema of Object.values(schemas)) {
    addSchema(schema as any);
  }
}

main();
