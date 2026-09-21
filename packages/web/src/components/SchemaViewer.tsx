import React, { Suspense } from "react";
import type { URL } from "url";
import type { JSONSchema } from "json-schema-typed/draft-2020-12";
import JSONSchemaViewer from "@theme/JSONSchemaViewer";
import CodeBlock from "@theme/CodeBlock";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import BrowserOnly from "@docusaurus/BrowserOnly";
import { type DescribeSchemaOptions, describeSchema } from "@ethdebug/format";
import { schemaIndex } from "@site/src/schemas";
import { SchemaContext, internalIdKey } from "@site/src/contexts/SchemaContext";
import ReactMarkdown from "react-markdown";
import SchemaListing from "./SchemaListing";

const Playground = React.lazy(() => import("./Playground"));

export interface SchemaViewerProps extends DescribeSchemaOptions {}

export default function SchemaViewer(props: SchemaViewerProps): JSX.Element {
  const rootSchemaInfo = describeSchema(props);
  const { id, rootSchema, yaml: _yaml, pointer } = rootSchemaInfo;

  // the schema this page shows is outermost in the dynamic scope, so its
  // dynamic anchors take precedence over those of any schema it references
  const pageAnchors = dynamicAnchors(rootSchema);

  const transformedSchema = transformSchema(rootSchema, id || "", pageAnchors);

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
                    const { schema, rootSchema } = describeSchema({
                      schema: { id },
                    });
                    return transformSchema(schema, id, {
                      ...dynamicAnchors(rootSchema),
                      ...pageAnchors,
                    });
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
        <BrowserOnly fallback={<div>Loading playground...</div>}>
          {() => (
            <Suspense fallback={<div>Loading playground...</div>}>
              <Playground schema={props.schema} pointer={props.pointer} />
            </Suspense>
          )}
        </BrowserOnly>
      </TabItem>
    </Tabs>
  );
}

type DynamicAnchors = { [name: string]: JSONSchema };

function transformSchema(
  schema: JSONSchema,
  id: string,
  anchors: DynamicAnchors,
): JSONSchema {
  return insertIds(
    ensureRefsLackSiblings(resolveDynamicRefs(schema, anchors)),
    `${id}#`,
  );
}

// collects the schemas in a root schema's `$defs` that declare a
// `$dynamicAnchor`, keyed by anchor name
function dynamicAnchors(rootSchema: JSONSchema): DynamicAnchors {
  const anchors: DynamicAnchors = {};

  const definitions =
    (typeof rootSchema === "object" && rootSchema.$defs) || {};

  for (const definition of Object.values(definitions)) {
    if (typeof definition !== "object") {
      continue;
    }

    const { $dynamicAnchor, ...rest } = definition as {
      $dynamicAnchor?: string;
    };

    if (typeof $dynamicAnchor === "string") {
      anchors[$dynamicAnchor] = rest as JSONSchema;
    }
  }

  return anchors;
}

// recursively replaces each `{ $dynamicRef: "#name" }` with the schema
// that the dynamic anchor `name` resolves to.
//
// docusaurus-json-schema-plugin reports any `$dynamicRef` as an unresolved
// reference, so this integration resolves them itself. The caller supplies
// the anchors in dynamic-scope order: those of the page's own schema
// override those of a schema that the page references.
function resolveDynamicRefs<T>(obj: T, anchors: DynamicAnchors): T {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveDynamicRefs(item, anchors)) as T;
  }

  const { $dynamicRef, ...rest } = obj as T & object & { $dynamicRef?: string };

  const result = Object.entries(rest).reduce((newObj, [key, value]) => {
    // @ts-expect-error dynamic key assignment
    newObj[key] = resolveDynamicRefs(value, anchors);
    return newObj;
  }, {} as T);

  if ($dynamicRef === undefined) {
    return result;
  }

  const anchor = $dynamicRef.startsWith("#")
    ? anchors[$dynamicRef.slice(1)]
    : undefined;

  if (!anchor) {
    throw new Error(`Could not resolve $dynamicRef "${$dynamicRef}"`);
  }

  return { ...anchor, ...result };
}

function insertIds<T>(obj: T, rootId: string): T {
  if (Array.isArray(obj)) {
    return obj.map((item, index) => insertIds(item, `${rootId}/${index}`)) as T;
  } else if (obj !== null && typeof obj === "object") {
    return Object.entries(obj).reduce(
      (newObj, [key, value]) => {
        // @ts-expect-error dynamic key assignment
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
    // @ts-expect-error dynamic key assignment
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

  // @ts-expect-error dynamic property assignment
  result[propertyName] = [{ $ref: $ref }];

  return result;
}
