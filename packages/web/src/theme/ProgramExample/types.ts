export type Id = number | string;

export interface Source {
  id: Id;
  path: string;
  contents: string;
  encoding?: string;
  langauge: string;
}

export type Reference<S extends { id: Id; }> = Pick<S, "id">;

export interface SourceRange {
  source: Reference<Source>;
  // DANGER schema mismatch - range is optional in schema
  range: {
    offset: number;
    length: number;
  }
}

export interface Context {
  code?: SourceRange;
  remark?: string;
}

export interface Instruction {
  offset: number;
  // DANGER schema mismatch - operation is optional in schema
  operation: Operation;
  context: Context;
}

export interface Operation {
  mnemonic: string;
  arguments?: `0x${string}`[];
  comment?: string;
}
