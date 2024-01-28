import React from 'react';
import type { JSONSchema } from "json-schema-typed/draft-2020-12"
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

import { CreateNodes } from "@theme-original/JSONSchemaViewer/components"
import {
  SchemaHierarchyContextProvider,
  useSchemaHierarchyContext,
} from "@theme-original/JSONSchemaViewer/contexts"

export interface Exclusions {
  propertyNames: string[];
  schemasByPropertyName: {
    [propertyName: string]: {
      schema: JSONSchema & { type: "object" };
      index: number;
    }
  }
}

export interface ExclusiveRequiredPropertiesSchemaProps extends Exclusions {
}

export default function ExcusiveRequiredPropertiesSchema({
  propertyNames,
  schemasByPropertyName
}: ExclusiveRequiredPropertiesSchemaProps): JSX.Element {
  const { jsonPointer: currentJsonPointer, level: currentLevel } =
    useSchemaHierarchyContext()

  return (
    <div>
      <hr />
      <span className="badge badge--info">mutually-exclusive required properties</span>&nbsp;
      This object must specify exactly one of the following:
      <ul>
        {propertyNames.map((propertyName, index) =>
          <li key={index}><code>{propertyName}</code></li>
        )}
      </ul>

      Depending on which required property is used, one of the following
      sub-schemas applies:

      <Tabs>{
        Object.entries(schemasByPropertyName)
          .map(([propertyName, { schema, index }]) => (
            <TabItem
              key={propertyName}
              label={("title" in schema && typeof schema.title === "string" && schema.title) || propertyName}
              value={propertyName}
            >
              <SchemaHierarchyContextProvider
                value={{
                  level: currentLevel + 1,
                  jsonPointer: `${currentJsonPointer}/allOf/${index + 1}/then`
                }}
              >
                <CreateNodes schema={schema} />
              </SchemaHierarchyContextProvider>
            </TabItem>
          ))
      }</Tabs>

    </div>
  );
}


export function detectExclusiveRequiredProperties(schema: {
  allOf: JSONSchema[]
}): Exclusions | undefined {
  const { allOf } = schema;

  // look for the first clause in an `allOf` to be a `oneOf` different
  // required properties

  const [firstClause, ...conditionals] = allOf;
  if (typeof firstClause === "boolean" || !("oneOf" in firstClause)) {
    return;
  }

  const { oneOf } = firstClause;

  if (
    !oneOf ||
    !oneOf.every(
      (clause: JSONSchema): clause is { required: [string] } => (
        typeof clause === "object" &&
        "required" in clause &&
        clause.required instanceof Array &&
        clause.required.length === 1
      )
    )
  ) {
    return;
  }

  const propertyNames = (
    oneOf as (JSONSchema & { required: [propertyName: string] })[]
  )
    .map(({ required: [propertyName] }) => propertyName);

  // check that there is one conditional for each `oneOf` required
  // property and that the conditional is the right kind of if/then

  if (conditionals.length !== propertyNames.length) {
    return;
  }

  const allIfThen = conditionals.every(
    (clause: JSONSchema): clause is { "if": JSONSchema; then: JSONSchema } => {
      if (typeof clause === "boolean") {
        return false;
      }

      const { title, description, "if": if_, then, ...others } = clause;

      return !!if_ && !!then && Object.keys(others).length === 0;
    }
  )

  if (!allIfThen) {
    return;
  }

  const allIfsIndicateASingleRequiredProperty = conditionals.every(
    (ifThen: { "if": JSONSchema; then: JSONSchema }): ifThen is {
      "if": {
        required: [string];
      };
      then: any;
    } => {
      const { "if": if_ } = ifThen;

      if (typeof if_ === "boolean" || !("required" in if_)) {
        return false;
      }

      const { required } = if_;

      if (!required || required.length !== 1) {
        return false;
      }

      const [propertyName] = required;

      return typeof propertyName === "string" && !!propertyName;
    }
  );

  if (!allIfsIndicateASingleRequiredProperty) {
    return;
  }

  const schemasByPropertyName = conditionals
    .map(
      (
        {
          "if": { required: [propertyName] },
          then
        },
        index
      ) => ({
        [propertyName]: {
          schema: then,
          index
        }
      })
    )
    .reduce((a, b) => ({ ...a, ...b }), {});

  return {
    propertyNames,
    schemasByPropertyName
  };
}

