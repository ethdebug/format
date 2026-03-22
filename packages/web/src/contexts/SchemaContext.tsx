import { useContext, createContext } from "react";
import type { JSONSchema } from "json-schema-typed/draft-2020-12";

import type { SchemaInfo } from "@ethdebug/format";
import type { SchemaIndex } from "@site/src/schemas";

export type JSONSchemaWithInternalIdKeys =
  | boolean
  | (Exclude<JSONSchema, boolean> & {
      [internalIdKey]: string;
    });

export interface SchemaContextValue {
  rootSchemaInfo?: SchemaInfo;
  schemaIndex: SchemaIndex;
}

export type PointerSchemaIds = {
  [jsonPointer: string]: string;
};

export const SchemaContext = createContext<SchemaContextValue>({
  schemaIndex: {},
});

export const useSchemaContext = () => useContext(SchemaContext);

export const internalIdKey = Symbol("__$internalId");
