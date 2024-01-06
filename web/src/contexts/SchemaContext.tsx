import { useContext, createContext } from "react";
import type { SchemaInfo, SchemaIndex } from "@site/src/schemas";

export interface SchemaContextValue {
  rootSchemaInfo?: SchemaInfo;
  schemaIndex: SchemaIndex;
}

export type PointerSchemaIds = {
  [jsonPointer: string]: string
};

export const SchemaContext = createContext<SchemaContextValue>({
  schemaIndex: {},
});

export const useSchemaContext = () => useContext(SchemaContext);

export const internalIdKey = Symbol("__$internalId");
