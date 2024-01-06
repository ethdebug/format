import React from 'react';
import AllOfSchema from '@theme-original/JSONSchemaViewer/JSONSchemaElements/schemaComposition/allOfSchema';
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

import { CreateNodes } from "@theme-original/JSONSchemaViewer/components"
import {
  SchemaHierarchyContextProvider,
  useSchemaHierarchyContext,
} from "@theme-original/JSONSchemaViewer/contexts"
import { Collapsible } from "@theme-original/JSONSchemaViewer/components";

export default function allOfSchemaWrapper(props) {
  const { schema } = props;
  const { jsonPointer: currentJsonPointer, level: currentLevel } =
    useSchemaHierarchyContext()

  const discriminator = detectDiscriminator(schema);
  if (!discriminator) {
    return (
      <>
        <AllOfSchema {...props} />
      </>
    );
  }

  const { propertyName, schemasByConst } = discriminator;

  return (
    <div>
      <hr />
      <span className="badge badge--info">polymorphic discriminator</span>&nbsp;
      The value of the <strong>{propertyName}</strong> field
      determines which sub-schema applies:

        <Tabs>{
          Object.entries(schemasByConst)
            .map(([value, { schema, index }]) => (
              <TabItem
                key={value}
                label={value}
                value={value}
              >
                <SchemaHierarchyContextProvider
                  value={{
                    level: currentLevel + 1,
                    jsonPointer: `${currentJsonPointer}/allOf/${index}`,
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

function detectDiscriminator(schema: {
  allOf: any[]
}): {
  propertyName: string;
  schemasByConst: {
    [value: string]: {
      schema: object;
      index: number;
    }
  }
} | undefined {
  const { allOf } = schema;

  const allIfThen = allOf.every(
    (clause: any): clause is { "if": any; then: any } => {
      const { title, description, "if": if_, then, ...others } = clause;

      return if_ && then && Object.keys(others).length === 0;
    }
  )

  if (!allIfThen) {
    return;
  }

  const allIfsHaveSinglePropertyWithConst = allOf.every(
    (ifThen: { "if": any; then: any }): ifThen is {
      "if": {
        properties: {
          [propertyName: string]: {
            "const": string
          }
        }
      };
      then: any;
    } => {
      const { "if": if_ } = ifThen;

      if (!("properties" in if_)) {
        return false;
      }

      const ifProperties = if_.properties;

      if (Object.keys(ifProperties).length !== 1) {
        return false;
      }

      const propertyName = Object.keys(ifProperties)[0];

      const { "const": const_ } = ifProperties[propertyName];

      return typeof const_ === "string" && !!const_;
    }
  );

  if (!allIfsHaveSinglePropertyWithConst) {
    return;
  }

  const propertyName = Object.keys(allOf[0]["if"].properties)[0];

  const schemasByConst = allOf
    .map(({ "if": if_, then }, index) => {
      const value = if_.properties[propertyName]["const"];

      return {
        [value]: {
          schema: then,
          index
        }
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
    schemasByConst
  };
}

