import React from "react";
import Link from "@docusaurus/Link";
import CreateNodes from "@theme/JSONSchemaViewer/components/CreateNodes";
import { SchemaHierarchyComponent } from "@theme-original/JSONSchemaViewer/contexts";
import {
  GenerateFriendlyName,
  QualifierMessages,
} from "@theme/JSONSchemaViewer/utils";
import {
  useSchemaContext,
  internalIdKey,
  type JSONSchemaWithInternalIdKeys,
} from "@site/src/contexts/SchemaContext";
import type { JSONSchema } from "json-schema-typed/draft-2020-12";
import { CreateDescription } from "@theme/JSONSchemaViewer/JSONSchemaElements";
import { useJSVOptionsContext } from "@theme/JSONSchemaViewer/contexts";

export interface UnnecessaryComposition {
  schemaWithoutUnnecessaryComposition: Exclude<
    JSONSchemaWithInternalIdKeys,
    boolean
  >;
  unnecessaryCompositionKeyword: "allOf" | "oneOf" | "anyOf";
  unnecessarilyComposedSchema: JSONSchemaWithInternalIdKeys;
}

export function detectUnnecessaryComposition(
  schema: JSONSchemaWithInternalIdKeys,
): UnnecessaryComposition | undefined {
  if (typeof schema === "boolean") {
    return;
  }

  const unnecessaryCompositionKeywords = (
    ["allOf", "oneOf", "anyOf"] as const
  ).filter(
    (keyword) => keyword in schema && (schema[keyword] || []).length === 1,
  );

  if (unnecessaryCompositionKeywords.length !== 1) {
    return;
  }

  const [unnecessaryCompositionKeyword] = unnecessaryCompositionKeywords;

  const {
    [unnecessaryCompositionKeyword]: composition,
    ...schemaWithoutUnnecessaryComposition
  } = schema;

  const [unnecessarilyComposedSchema] = composition as [
    JSONSchemaWithInternalIdKeys,
  ]; /* (we know this from filter above) */

  return {
    unnecessarilyComposedSchema,
    unnecessaryCompositionKeyword,
    schemaWithoutUnnecessaryComposition,
  };
}

export interface UnnecessaryCompositionSchemaProps extends UnnecessaryComposition {}

export default function UnnecessaryCompositionSchema({
  schemaWithoutUnnecessaryComposition,
  unnecessaryCompositionKeyword,
  unnecessarilyComposedSchema,
}: UnnecessaryCompositionSchemaProps): JSX.Element {
  const jsvOptions = useJSVOptionsContext();
  const { schemaIndex } = useSchemaContext();

  // treat the unnecessary composition to represent the extension of a base
  // schema, where the unnecessarily composed schema is the base
  const baseSchema = unnecessarilyComposedSchema;
  const extensionSchema = schemaWithoutUnnecessaryComposition;
  const { documentation, semantics } =
    separateDocumentationFromSemantics(extensionSchema);

  // due to a limitation of docusaurus-json-schema-plugin, use of the `type`
  // field is necessary in order for the plugin to display schema descriptions.
  //
  // for a given extension schema, check whether the use of the `type` field
  // is actually a semantic difference vs. the base schema
  const onlyExtendsDocumentation =
    Object.keys(semantics).length === 0 ||
    (Object.keys(semantics).length === 1 &&
      "type" in semantics &&
      typeof baseSchema === "object" &&
      "type" in baseSchema &&
      ((typeof semantics.type === "string" &&
        semantics.type === baseSchema.type) ||
        (semantics.type instanceof Array &&
          baseSchema.type instanceof Array &&
          semantics.type.length === baseSchema.type.length &&
          (semantics.type as string[]).every((type_) =>
            (baseSchema.type as string[]).includes(type_),
          ))));

  if (onlyExtendsDocumentation) {
    const onlyChangesTitle =
      Object.keys(documentation).length === 1 && "title" in documentation;

    if (onlyChangesTitle) {
      return (
        <>
          <SchemaHierarchyComponent
            innerJsonPointer={`/${unnecessaryCompositionKeyword}/0`}
          >
            <CreateNodes schema={unnecessarilyComposedSchema} />
          </SchemaHierarchyComponent>
        </>
      );
    }

    const { description } = documentation;

    return (
      <>
        <QualifierMessages schema={documentation} options={jsvOptions} />
        {description && <CreateDescription description={description} />}
        <hr />

        <SchemaHierarchyComponent
          innerJsonPointer={`/${unnecessaryCompositionKeyword}/0`}
        >
          <CreateNodes schema={unnecessarilyComposedSchema} />
        </SchemaHierarchyComponent>
      </>
    );
  }

  const { [internalIdKey]: id } = baseSchema;

  if (id && id in schemaIndex) {
    const {
      href,
      title = `${
        id.startsWith("schema:") ? id.slice("schema:".length) : id
      } schema`,
    } = schemaIndex[id as keyof typeof schemaIndex];

    return (
      <>
        <span className="badge badge--info">extensions</span>&nbsp; This schema
        extends the <Link to={href}>{title}</Link>.
        <p>
          <CreateNodes schema={extensionSchema} />
        </p>
      </>
    );
  }

  return (
    <>
      <span className="badge badge--info">extensions</span>&nbsp; These
      extensions apply to the base schema below:
      <p>
        <CreateNodes schema={extensionSchema} />
      </p>
      <Collapsible
        summary={
          <>
            <strong>
              <GenerateFriendlyName schema={baseSchema} />
            </strong>
            &nbsp;
            <span className="badge badge--info">base schema</span>
          </>
        }
        detailsProps={{
          open: true,
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
  documentation: Exclude<JSONSchema, boolean>;
  semantics: JSONSchema;
} {
  if (typeof schema === "boolean") {
    return {
      documentation: {},
      semantics: schema,
    };
  }

  const {
    title,
    description,
    examples,
    default: default_,
    // @ts-expect-error internal key for tracking
    [internalIdKey]: _id,
    ...semantics
  } = schema;

  const documentation = Object.entries({
    title,
    description,
    examples,
    default: default_,
  })
    .filter(
      (
        pair: [string, string | object | undefined],
      ): pair is [string, string | object] => pair[1] !== undefined,
    )
    .map(([key, value]) => ({ [key]: value }))
    .reduce((a, b) => ({ ...a, ...b }), {}) as Partial<
    Pick<typeof schema, "title" | "description" | "examples" | "default">
  >;

  return {
    documentation,
    semantics,
  };
}
