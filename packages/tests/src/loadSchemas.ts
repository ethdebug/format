import * as fs from "fs";
import * as path from "path";

import {
  addSchema,
  validate,
  setMetaSchemaOutputFormat,
  InvalidSchemaError,
} from "@hyperjump/json-schema/draft-2020-12";
import * as YAML from "yaml";
import type { JSONSchema } from "json-schema-typed/draft-2020-12"

import schemas from "./schemas.js";

const main = () => {
  setMetaSchemaOutputFormat("BASIC");

  for (const schema of Object.values(schemas)) {
    addSchema(schema as any);
  }
}

main();
