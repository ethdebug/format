import { describe, it } from "vitest";
import {
  type OutputUnit,
  validate,
  InvalidSchemaError,
} from "@hyperjump/json-schema/draft-2020-12";

import { schemas } from ".";

// loads schemas into global hyperjump json schema validator
import "../../test/hyperjump";

const printErrors = (output: OutputUnit): string =>
  output
    .errors!.map((error) => {
      if (!error.valid && !error.keyword.endsWith("#validate")) {
        return `${error.instanceLocation} fails schema constraint ${
          error.absoluteKeywordLocation
        }`;
      }
    })
    .filter((message): message is string => !!message)
    .map((message) => `  - ${message}`)
    .join("\n");

describe("Valid schemas", () => {
  for (const [id, _schema] of Object.entries(schemas)) {
    it(`should include ${id}`, async () => {
      try {
        await validate(id);
      } catch (error) {
        if (!(error instanceof InvalidSchemaError)) {
          throw error;
        }

        throw new Error(
          `Invalid schema. Errors:\n${printErrors(error.output)}`,
        );
      }
    });
  }
});
