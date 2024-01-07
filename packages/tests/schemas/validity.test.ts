import { describe, it } from "@jest/globals";
import {
  validate,
  InvalidSchemaError,
} from "@hyperjump/json-schema/draft-2020-12";

import schemas from "../src/schemas.js";
import printErrors from "../src/printErrors.js";

// loads schemas into global hyperjump json schema validator
import "../src/loadSchemas.js";

describe("Valid schemas", () => {
  for (const [id, schema] of Object.entries(schemas)) {
    it(`should include ${id}`, async () => {
      try {
        await validate(id);
      } catch (error) {
        if (!(error instanceof InvalidSchemaError)) {
          throw error;
        }

        throw new Error(`Invalid schema. Errors:\n${
          printErrors(error.output)
        }`);
      }

    });
  }
});
