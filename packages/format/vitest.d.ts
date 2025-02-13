import "vitest";
import type { DescribeSchemaOptions } from "./src/describe";

interface CustomMatchers<R = unknown> {
  toValidate(schemaOptions: DescribeSchemaOptions): R;

  toSatisfy(received: any): R;
  toSatisfyAll(values: readonly any[]): R;
}

declare module "vitest" {
  interface Assertion<T = any> extends CustomMatchers<T> {}

  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
