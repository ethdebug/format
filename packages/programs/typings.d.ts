declare module "@jest/expect" {
  interface Matchers<R> {
    toSatisfy(received: any): R;
    toSatisfyAll(values: readonly any[]): R;
  }
}

declare module "solc" {
  function compile(input: string): string;
};
