import React from "react";
import type { JSONSchema } from "json-schema-typed/draft-2020-12";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

import { CreateNodes } from "@theme-original/JSONSchemaViewer/components";
import {
  SchemaHierarchyContextProvider,
  useSchemaHierarchyContext,
} from "@theme-original/JSONSchemaViewer/contexts";

export interface Inclusions {
  propertyNames: string[];
  schemasByPropertyName: {
    [propertyName: string]: {
      schema: Exclude<JSONSchema, boolean>;
      index: number;
    };
  };
}

export interface InclusiveRequiredPropertiesSchemaProps extends Inclusions {}

export default function InclusiveRequiredPropertiesSchema({
  propertyNames,
  schemasByPropertyName,
}: InclusiveRequiredPropertiesSchemaProps): JSX.Element {
  const { jsonPointer: currentJsonPointer, level: currentLevel } =
    useSchemaHierarchyContext();

  return (
    <div>
      <hr />
      <span className="badge badge--info">
        independently-inclusive required properties
      </span>
      &nbsp; This object may specify any of the following:
      <ul>
        {propertyNames.map((propertyName, index) => (
          <li key={index}>
            <code>{propertyName}</code>
          </li>
        ))}
      </ul>
      Depending on which required properties are used, the following
      corresponding sub-schemas may apply:
      <Tabs>
        {Object.entries(schemasByPropertyName).map(
          ([propertyName, { schema, index }]) => (
            <TabItem
              key={propertyName}
              label={
                ("title" in schema &&
                  typeof schema.title === "string" &&
                  schema.title) ||
                propertyName
              }
              value={propertyName}
            >
              <SchemaHierarchyContextProvider
                value={{
                  level: currentLevel + 1,
                  jsonPointer: `${currentJsonPointer}/allOf/${index + 1}/then`,
                }}
              >
                <CreateNodes schema={schema} />
              </SchemaHierarchyContextProvider>
            </TabItem>
          ),
        )}
      </Tabs>
    </div>
  );
}

const isIfThen = (
  schema: JSONSchema,
): schema is JSONSchema & {
  if: JSONSchema;
  then: JSONSchema;
} => typeof schema !== "boolean" && "if" in schema && "then" in schema;

const isSingleRequiredProperty = (
  schema: JSONSchema,
): schema is JSONSchema & {
  required: [string];
} =>
  typeof schema !== "boolean" &&
  "required" in schema &&
  schema.required?.length === 1;

export function detectInclusiveRequiredProperties(schema: {
  allOf: JSONSchema[];
}): Inclusions | undefined {
  const { allOf } = schema;

  // every schema in the `allOf` should be structured as an if/then/else,
  // where every `if` schema checks only for a single, unique required property

  if (!allOf.every(isIfThen)) {
    return;
  }

  const ifs = allOf.map(({ if: if_ }) => if_);

  if (!ifs.every(isSingleRequiredProperty)) {
    return;
  }

  const propertyNames = [
    ...new Set(ifs.map(({ required: [propertyName] }) => propertyName)),
  ];

  // check that property names are unique
  if (propertyNames.length !== ifs.length) {
    console.debug("property names are not unique");
    return;
  }

  const schemasByPropertyName = (
    allOf as (JSONSchema & {
      if: { required: [string] };
      then: Exclude<JSONSchema, boolean>;
    })[]
  )
    .map(
      (
        {
          if: {
            required: [propertyName],
          },
          then,
        },
        index,
      ) => ({
        [propertyName]: {
          schema: then,
          index,
        },
      }),
    )
    .reduce((a, b) => ({ ...a, ...b }), {});

  return {
    propertyNames,
    schemasByPropertyName,
  };
}
