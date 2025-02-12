import type { DescribeSchemaOptions } from "@ethdebug/format";

import "vitest";

interface CustomMatchers<R = unknown> {
  toValidate(schemaOptions: DescribeSchemaOptions): R;
}

declare module "vitest" {
  interface Assertion<T = any> extends CustomMatchers<T> {}

  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
