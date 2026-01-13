import React from "react";
import type { JSONSchema } from "json-schema-typed/draft-2020-12";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

import {
  SchemaHierarchyContextProvider,
  useSchemaHierarchyContext,
} from "@theme-original/JSONSchemaViewer/contexts";

import { CreateNodes } from "@theme-original/JSONSchemaViewer/components";

export interface Discriminator {
  propertyName: string;
  schemasByConst: {
    [value: string]: {
      schema: JSONSchema;
      index: number;
    };
  };
}

export interface DiscriminatorSchemaProps extends Discriminator {}

export default function DiscriminatorSchema({
  propertyName,
  schemasByConst,
}: DiscriminatorSchemaProps): JSX.Element {
  const { jsonPointer: currentJsonPointer, level: currentLevel } =
    useSchemaHierarchyContext();

  return (
    <div>
      <hr />
      <span className="badge badge--info">polymorphic discriminator</span>&nbsp;
      The value of the <strong>{propertyName}</strong> field determines which
      sub-schema applies:
      <Tabs>
        {Object.entries(schemasByConst).map(([value, { schema, index }]) => (
          <TabItem key={value} label={value} value={value}>
            <SchemaHierarchyContextProvider
              value={{
                level: currentLevel + 1,
                jsonPointer: `${currentJsonPointer}/allOf/${index}/then`,
              }}
            >
              <CreateNodes schema={schema} />
            </SchemaHierarchyContextProvider>
          </TabItem>
        ))}
      </Tabs>
    </div>
  );
}

export function detectDiscriminator(schema: {
  allOf: JSONSchema[];
}): Discriminator | undefined {
  const { allOf } = schema;

  const allIfThen = allOf.every(
    (clause: JSONSchema): clause is { if: JSONSchema; then: JSONSchema } => {
      if (typeof clause === "boolean") {
        return false;
      }

      const {
        title: _title,
        description: _description,
        if: if_,
        then,
        ...others
      } = clause;

      return !!if_ && !!then && Object.keys(others).length === 0;
    },
  );

  if (!allIfThen) {
    return;
  }

  const allIfsHaveSinglePropertyWithConst = allOf.every(
    (ifThen: {
      if: JSONSchema;
      then: JSONSchema;
    }): ifThen is {
      if: {
        properties: {
          [propertyName: string]: {
            const: string;
          };
        };
      };
      then: JSONSchema;
    } => {
      const { if: if_ } = ifThen;

      if (
        typeof if_ === "boolean" ||
        !("properties" in if_) ||
        !if_.properties
      ) {
        return false;
      }

      const ifProperties = if_.properties;

      if (Object.keys(ifProperties).length !== 1) {
        return false;
      }

      const propertyName = Object.keys(ifProperties)[0];
      const propertySchema = ifProperties[propertyName];

      return (
        typeof propertySchema === "object" &&
        "const" in propertySchema &&
        typeof propertySchema.const === "string" &&
        !!propertySchema.const
      );
    },
  );

  if (!allIfsHaveSinglePropertyWithConst) {
    return;
  }

  const propertyName = Object.keys(allOf[0]["if"].properties)[0];

  const schemasByConst = allOf
    .map(({ if: if_, then }, index) => {
      const value = if_.properties[propertyName]["const"];

      return {
        [value]: {
          schema: then,
          index,
        },
      };
    })
    .reduce((a, b) => ({ ...a, ...b }), {});

  const isUniquelyDiscriminating =
    Object.keys(schemasByConst).length === allOf.length;

  if (!isUniquelyDiscriminating) {
    return;
  }

  return {
    propertyName,
    schemasByConst,
  };
}
