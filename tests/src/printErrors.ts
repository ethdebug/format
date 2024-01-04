import type { OutputUnit } from "@hyperjump/json-schema/draft-2020-12";

const printErrors = (output: OutputUnit): string => output.errors!
  .map((error) => {
    if (!error.valid && !error.keyword.endsWith("#validate")) {
      return `${
        error.instanceLocation
      } fails schema constraint ${
        error.absoluteKeywordLocation
      }`;
    }
  })
  .filter((message): message is string => !!message)
  .map(message => `  - ${message}`)
  .join("\n");

export default printErrors;
