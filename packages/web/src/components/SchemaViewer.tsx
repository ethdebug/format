import React from "react";
import type { URL } from "url";
import type { JSONSchema } from "json-schema-typed/draft-2020-12";
import JSONSchemaViewer from "@theme/JSONSchemaViewer";
import CodeBlock from "@theme/CodeBlock";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import { type DescribeSchemaOptions, describeSchema } from "@ethdebug/format";
import { schemaIndex } from "@site/src/schemas";
import {
  SchemaContext,
  type PointerSchemaIds,
  internalIdKey,
} from "@site/src/contexts/SchemaContext";
import ReactMarkdown from "react-markdown";
import SchemaListing from "./SchemaListing";
import Playground from "./Playground";

export interface SchemaViewerProps extends DescribeSchemaOptions {}

export default function SchemaViewer(props: SchemaViewerProps): JSX.Element {
  const rootSchemaInfo = describeSchema(props);
  const { id, rootSchema, yaml, pointer } = rootSchemaInfo;

  const transformedSchema = transformSchema(rootSchema, id || "");

  return (
    <Tabs>
      <TabItem value="viewer" label="Explore">
        <SchemaContext.Provider
          value={{
            rootSchemaInfo,
            schemaIndex,
          }}
        >
          <JSONSchemaViewer
            schema={transformedSchema}
            resolverOptions={{
              jsonPointer: pointer,
              resolvers: {
                schema: {
                  resolve: (uri: URL) => {
                    const id = uri.toString();
                    const { schema } = describeSchema({
                      schema: { id },
                    });
                    return transformSchema(schema, id);
                  },
                },
              },
            }}
            viewerOptions={{
              showExamples: true,
              ValueComponent: ({ value }: { value: unknown }) => {
                // deal with simple types first
                if (
                  ["string", "number", "bigint", "boolean"].includes(
                    typeof value,
                  )
                ) {
                  return (
                    <code>
                      {(value as string | number | bigint | boolean).toString()}
                    </code>
                  );
                }

                // for complex types use a whole CodeBlock
                return (
                  <CodeBlock language="json">{`${JSON.stringify(
                    value,
                    undefined,
                    2,
                  )}`}</CodeBlock>
                );
              },
              DescriptionComponent: ({
                description,
              }: {
                description: string;
              }) => <ReactMarkdown children={description} />,
            }}
          />
        </SchemaContext.Provider>
      </TabItem>
      <TabItem value="listing" label="View source">
        <SchemaListing schema={props.schema} pointer={props.pointer} />
      </TabItem>
      <TabItem value="playground" label="Playground">
        <Playground schema={props.schema} pointer={props.pointer} />
      </TabItem>
    </Tabs>
  );
}

function transformSchema(schema: JSONSchema, id: string): JSONSchema {
  return insertIds(ensureRefsLackSiblings(schema), `${id}#`);
}

function insertIds<T>(obj: T, rootId: string): T {
  if (Array.isArray(obj)) {
    return obj.map((item, index) => insertIds(item, `${rootId}/${index}`)) as T;
  } else if (obj !== null && typeof obj === "object") {
    return Object.entries(obj).reduce(
      (newObj, [key, value]) => {
        // @ts-ignore
        newObj[key] = insertIds(value, `${rootId}/${key}`);
        return newObj;
      },
      {
        [internalIdKey]: rootId.endsWith("#") ? rootId.slice(0, -1) : rootId,
      } as T,
    );
  }
  return obj;
}

// recursively iterates over a schema and finds all instances where `$ref` is
// defined alonside other fields.
//
// this function is a HACK to get around docusaurus-json-schema-plugin's use of
// @stoplight/json-ref-resolver, whose behavior is to override all objects
// containing `$ref` with the resolved reference itself (thus clobbering those
// other fields).
//
// this integration preprocesses all such occurrences by moving any sibling
// $ref field into an available `allOf`/`oneOf`/`anyOf` (or throwing an error
// if all three are already used)
//
// NOTE that it would be fine to re-use an existing `allOf`, but the approach
// that this integration takes is to handle those composition keywords
// as a special-case when rendering a composition of size one
// (i.e., when rendering, detect single-child compositions as the signal that
// this processing step was used).
function ensureRefsLackSiblings<T>(obj: T): T {
  // base case
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  // array case
  if (Array.isArray(obj)) {
    return obj.map(ensureRefsLackSiblings) as T;
  }

  // check for just { $ref: ... }
  if (Object.keys(obj).length === 1 && "$ref" in obj) {
    return obj;
  }

  const { $ref, ...rest } = obj as T & object & { $ref?: string };

  const result = Object.entries(rest).reduce((newObj, [key, value]) => {
    // @ts-ignore
    newObj[key] = ensureRefsLackSiblings(value);
    return newObj;
  }, {} as T);

  if (!$ref) {
    return result;
  }

  // find an unused schema composition keyword and move the $ref there
  const propertyName = ["allOf", "oneOf", "anyOf"].find(
    (candidate) => !(candidate in obj),
  );

  if (!propertyName) {
    throw new Error(
      `Could not find available composition keyword in ${JSON.stringify(obj)}`,
    );
  }

  // @ts-ignore
  result[propertyName] = [{ $ref: $ref }];

  return result;
}
