import { toHex } from "ethereum-cryptography/utils";

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
    const bytes = new Uint8Array(hex.length / 2 - 1);
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
}