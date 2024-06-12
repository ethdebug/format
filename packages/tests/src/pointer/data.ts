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
}

export namespace Data {
  export class Word extends Data {
    static zero(): Word {
      return new Word([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
    }

    static fromUint(value: bigint): Word {
      const bytes = this.zero();
      for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(value & 0xffn);
        value >>= 8n;
      }
      return new Word(bytes as unknown as FixedSizeUint8Array<32>);
    }

    static fromNumber(value: number): Word {
      const bytes = this.zero();
      for (let i = 31; i >= 0; i--) {
        bytes[i] = value & 0xff;
        value >>= 8;
      }
      return new Word(bytes as unknown as FixedSizeUint8Array<32>);
    }

    static fromBytes(bytes: Uint8Array): Word {
      if (bytes.length !== 32) {
        throw new Error(`Invalid byte length for Word. Expected 32 bytes, but got ${bytes.length}.`);
      }

      return new Word(bytes as unknown as FixedSizeUint8Array<32>);
    }


    static fromHex(hex: string): Word {
      if (!hex.startsWith('0x')) {
        throw new Error('Invalid hex string format. Expected "0x" prefix.');
      }

      if (hex.length !== 66) {
        throw new Error(`Invalid hex string length. Expected 66 characters (including "0x" prefix), but got ${hex.length}.`);
      }

      const bytes = new Uint8Array(32);
      for (let i = 2; i < hex.length; i += 2) {
        bytes[i / 2 - 1] = parseInt(hex.slice(i, i + 2), 16);
      }

      return new Word(bytes as unknown as FixedSizeUint8Array<32>);
    }

    constructor (values: FixedSizeUint8Array<32>) {
      if (values.length !== 32) {
        throw new Error(
          `Unexpected runtime length assertion failed; received ${values.length} values instead of expected 32`
        );
      }

      super(values);
    }
  }
}

export type FixedSizeUint8Array<N extends number> =
  N extends N
    ? number extends N
      ? never
      : _FixedSizeUint8Array<N, []>
    : never;

export type _FixedSizeUint8Array<N extends number, T extends unknown[]> =
  T['length'] extends N
    ? T
    : _FixedSizeUint8Array<N, [...T, number]>;
