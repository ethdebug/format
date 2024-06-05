import type { DescribeSchemaOptions } from "@ethdebug/format";

declare module "@jest/expect" {
  interface Matchers<R> {
    toValidate(schemaOptions: DescribeSchemaOptions): R;

    toSatisfy(received: any): R;
    toSatisfyAll(values: readonly any[]): R;
  }
}
