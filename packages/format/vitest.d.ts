import "vitest";

interface CustomMatchers<R = unknown> {
  toSatisfy(received: any): R;
  toSatisfyAll(values: readonly any[]): R;
}

declare module "vitest" {
  interface Assertion<T = any> extends CustomMatchers<T> {}

  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
