declare module "@jest/expect" {
  interface Matchers<R> {
    toSatisfy(received: any): R;
    toSatisfyAll(values: readonly any[]): R;
  }
}
