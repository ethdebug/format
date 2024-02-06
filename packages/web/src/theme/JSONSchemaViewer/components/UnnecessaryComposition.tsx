import React from "react";
import type { JSONSchema } from "json-schema-typed/draft-2020-12";
import CreateNodes from "@theme/JSONSchemaViewer/components/CreateNodes";
import CreateEdge from "@theme-original/JSONSchemaViewer/components/CreateEdge";
import { SchemaHierarchyComponent } from "@theme-original/JSONSchemaViewer/contexts"
import { Collapsible } from "@theme/JSONSchemaViewer/components";
import { GenerateFriendlyName, QualifierMessages } from "@theme/JSONSchemaViewer/utils";
import { internalIdKey } from "@site/src/contexts/SchemaContext";
import { CreateDescription } from "@theme/JSONSchemaViewer/JSONSchemaElements";
import { useJSVOptionsContext } from "@theme/JSONSchemaViewer/contexts"

export interface UnnecessaryComposition {
  schemaWithoutUnnecessaryComposition: Exclude<JSONSchema, boolean>;
  unnecessaryCompositionKeyword: "allOf" | "oneOf" | "anyOf";
  unnecessarilyComposedSchema: JSONSchema;
}

export function detectUnnecessaryComposition(
  schema: JSONSchema
): UnnecessaryComposition | undefined {
  if (typeof schema === "boolean") {
    return;
  }

  const unnecessaryCompositionKeywords = (["allOf", "oneOf", "anyOf"] as const)
    .filter(keyword => keyword in schema && (schema[keyword] || []).length === 1);

  if (unnecessaryCompositionKeywords.length !== 1) {
    return;
  }

  const [unnecessaryCompositionKeyword] = unnecessaryCompositionKeywords;

  const {
    [unnecessaryCompositionKeyword]: composition,
    ...schemaWithoutUnnecessaryComposition
  } = schema;

  const [unnecessarilyComposedSchema] =
    composition as [JSONSchema] /* (we know this from filter above) */;

  return {
    unnecessarilyComposedSchema,
    unnecessaryCompositionKeyword,
    schemaWithoutUnnecessaryComposition
  };
}

export interface UnnecessaryCompositionSchemaProps extends UnnecessaryComposition {
}

export default function UnnecessaryCompositionSchema({
  schemaWithoutUnnecessaryComposition,
  unnecessaryCompositionKeyword,
  unnecessarilyComposedSchema
}: UnnecessaryCompositionSchemaProps): JSX.Element {
  const jsvOptions = useJSVOptionsContext();

  // treat the unnecessary composition to represent the extension of a base
  // schema, where the unnecessarily composed schema is the base
  const baseSchema = unnecessarilyComposedSchema;
  const extensionSchema = schemaWithoutUnnecessaryComposition;
  const {
    documentation,
    semantics
  } = separateDocumentationFromSemantics(extensionSchema);

  if (Object.keys(semantics).length === 0) {
    const { description } = documentation;

    return <>
      <QualifierMessages schema={documentation} options={jsvOptions} />
      {description && <CreateDescription description={description} />}
      <hr />

      <SchemaHierarchyComponent
        innerJsonPointer={`/${unnecessaryCompositionKeyword}/0`}
      >
        <CreateNodes schema={unnecessarilyComposedSchema} />
      </SchemaHierarchyComponent>
    </>;
  }

  return (
    <>
      <span className="badge badge--info">extensions</span>&nbsp;
      These extensions apply to the base schema below:
      <p>
      <CreateNodes schema={extensionSchema} />
      </p>

      <Collapsible
        summary={
          <>
            <strong><GenerateFriendlyName schema={baseSchema} /></strong>&nbsp;
            <span className="badge badge--info">base schema</span>
          </>
        }
        detailsProps={{
          open: true
        }}
      >
        <SchemaHierarchyComponent
          innerJsonPointer={`/${unnecessaryCompositionKeyword}/0`}
        >
          <CreateNodes schema={unnecessarilyComposedSchema} />
        </SchemaHierarchyComponent>
      </Collapsible>

    </>
  );
}

function separateDocumentationFromSemantics(schema: JSONSchema): {
  documentation: Exclude<JSONSchema, boolean>,
  semantics: JSONSchema
} {
  if (typeof schema === "boolean") {
    return {
      documentation: {},
      semantics: schema
    };
  }

  const {
    title,
    description,
    examples,
    default: default_,
    // @ts-ignore
    [internalIdKey]: _id,
    ...semantics
  } = schema;

  return {
    documentation: {
      title,
      description,
      examples,
      default: default_
    },
    semantics
  };
}
