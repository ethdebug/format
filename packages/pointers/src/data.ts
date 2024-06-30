import { toHex } from "ethereum-cryptography/utils";

import type * as Util from "util";

let util: typeof Util | undefined;
try {
  util = await import("util");
} catch {}

export class Data extends Uint8Array {
  static zero(): Data {
    return new Data([]);
  }

  static fromUint(value: bigint): Data {
    if (value === 0n) {
      return this.zero();
    }

    const byteCount = Math.ceil(Number(value.toString(2).length) / 8);
    const bytes = new Uint8Array(byteCount);
    for (let i = byteCount - 1; i >= 0; i--) {
      bytes[i] = Number(value & 0xffn);
      value >>= 8n;
    }
    return new Data(bytes);
  }

  static fromNumber(value: number): Data {
    const byteCount = Math.ceil(Math.log2(value + 1) / 8);
    const bytes = new Uint8Array(byteCount);
    for (let i = byteCount - 1; i >= 0; i--) {
      bytes[i] = value & 0xff;
      value >>= 8;
    }
    return new Data(bytes);
  }

  static fromHex(hex: string): Data {
    if (!hex.startsWith('0x')) {
      throw new Error('Invalid hex string format. Expected "0x" prefix.');
    }
    const bytes = new Uint8Array((hex.length - 2) / 2 + 0.5);
    for (let i = 2; i < hex.length; i += 2) {
      bytes[i / 2 - 1] = parseInt(hex.slice(i, i + 2), 16);
    }
    return new Data(bytes);
  }

  static fromBytes(bytes: Uint8Array): Data {
    return new Data(bytes);
  }

  asUint(): bigint {
    const bits = 8n;

    let value = 0n;
    for (const byte of this.values()) {
      const byteValue = BigInt(byte)
      value = (value << bits) + byteValue
    }
    return value;
  }

  toHex(): string {
    return `0x${toHex(this)}`;
  }

  padUntilAtLeast(length: number): Data {
    if (this.length >= length) {
      return this;
    }

    const padded = new Uint8Array(length);
    padded.set(this, length - this.length);
    return Data.fromBytes(padded);
  }

  resizeTo(length: number): Data {
    if (this.length === length) {
      return this;
    }

    const resized = new Uint8Array(length);

    if (this.length < length) {
      resized.set(this, length - this.length);
    } else {
      resized.set(this.slice(this.length - length));
    }

    return Data.fromBytes(resized);
  }

  concat(...others: Data[]): Data {
    // HACK concatenate via string representation
    const concatenatedHex = [this, ...others]
      .map(data => data.toHex().slice(2))
      .reduce((accumulator, hex) => `${accumulator}${hex}`, "0x");

    return Data.fromHex(concatenatedHex);
  }

  inspect(
    depth: number,
    options: Util.InspectOptionsStylized,
    inspect: typeof Util.inspect
  ): string {
    return `Data[${options.stylize(this.toHex(), "number")}]`;
  }

  [
    util
      ? util.inspect.custom
      : "_inspect"
  ](
    depth: number,
    options: Util.InspectOptionsStylized,
    inspect: typeof Util.inspect
  ): string {
    return this.inspect(depth, options, inspect);
  }

}
