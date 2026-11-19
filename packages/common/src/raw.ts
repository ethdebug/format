import { toHex as hexOf } from "ethereum-cryptography/utils";

/**
 * A byte string, most significant byte first.
 */
export type Raw = Uint8Array;

export namespace Raw {
  export function zero(): Raw {
    return new Uint8Array([]);
  }

  export function fromUint(value: bigint): Raw {
    if (value === 0n) {
      return zero();
    }

    const byteCount = Math.ceil(Number(value.toString(2).length) / 8);
    const bytes = new Uint8Array(byteCount);
    for (let i = byteCount - 1; i >= 0; i--) {
      bytes[i] = Number(value & 0xffn);
      value >>= 8n;
    }
    return bytes;
  }

  export function fromNumber(value: number): Raw {
    const byteCount = Math.ceil(Math.log2(value + 1) / 8);
    const bytes = new Uint8Array(byteCount);
    for (let i = byteCount - 1; i >= 0; i--) {
      bytes[i] = value & 0xff;
      value >>= 8;
    }
    return bytes;
  }

  export function fromHex(hex: string): Raw {
    if (!hex.startsWith("0x")) {
      throw new Error('Invalid hex string format. Expected "0x" prefix.');
    }
    const bytes = new Uint8Array((hex.length - 2) / 2 + 0.5);
    for (let i = 2; i < hex.length; i += 2) {
      bytes[i / 2 - 1] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }

  export function asUint(raw: Raw): bigint {
    const bits = 8n;

    let value = 0n;
    for (const byte of raw.values()) {
      const byteValue = BigInt(byte);
      value = (value << bits) + byteValue;
    }
    return value;
  }

  export function toHex(raw: Raw): string {
    return `0x${hexOf(raw)}`;
  }

  export function padUntilAtLeast(raw: Raw, length: number): Raw {
    if (raw.length >= length) {
      return raw;
    }

    const padded = new Uint8Array(length);
    padded.set(raw, length - raw.length);
    return padded;
  }

  export function resizeTo(raw: Raw, length: number): Raw {
    if (raw.length === length) {
      return raw;
    }

    const resized = new Uint8Array(length);

    if (raw.length < length) {
      resized.set(raw, length - raw.length);
    } else {
      resized.set(raw.slice(raw.length - length));
    }

    return resized;
  }

  export function concat(...raws: Raw[]): Raw {
    const length = raws.reduce((total, raw) => total + raw.length, 0);
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const raw of raws) {
      joined.set(raw, offset);
      offset += raw.length;
    }
    return joined;
  }
}
