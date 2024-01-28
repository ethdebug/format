import React from "react";
import Link from "@docusaurus/Link";

import type { JSONSchema } from "json-schema-typed/draft-2020-12"
import { CreateNodes } from "@theme-original/JSONSchemaViewer/components"
import { CreateDescription } from "@theme-original/JSONSchemaViewer/JSONSchemaElements";
import { useSchemaContext, internalIdKey } from "@site/src/contexts/SchemaContext";

export interface GenericRealization {
  genericSchema: JSONSchema;
  concreteSchemasByDynamicAnchor: {
    [anchorName: string]: JSONSchema;
  }
}

export interface GenericRealizationSchemaProps extends GenericRealization {
  schema: JSONSchema;
}

export default function GenericRealizationSchema({
  schema,
  genericSchema,
  concreteSchemasByDynamicAnchor
}: GenericRealizationSchemaProps): JSX.Element {
  const { schemaIndex } = useSchemaContext();

  let genericSchemaLink = (
    <></>
  );

  if (
    typeof genericSchema === "object" &&
    "$id" in genericSchema &&
    genericSchema.$id &&
    genericSchema.$id in schemaIndex
  ) {
    const { $id: id } = genericSchema;

    const {
      href,
      title = `${
        id.startsWith("schema:")
          ? id.slice("schema:".length)
          : id
      } schema`
    } = schemaIndex[id as keyof typeof schemaIndex];

    genericSchemaLink = (
      <>
        {" "}
        <span>
          See <Link to={href}>{title}</Link> for the generic schema itself.
        </span>
      </>
    );
  }

  const concreteSchema = replaceDynamicReferences(
    genericSchema,
    concreteSchemasByDynamicAnchor
  );

  console.debug("schema %o", schema);
  console.debug("genericSchema %o", genericSchema);
  console.debug("concreteSchemasByDynamicAnchor %o", concreteSchemasByDynamicAnchor);
  console.debug("concreteSchema %o", concreteSchema);

  return (
    <div>
      {
        // HACK to workaround docusaurus-json-schema-plugin not showing
        // description unless `type` is defined
        typeof schema === "object" &&
        !("type" in schema) &&
        schema.description
          ? <CreateDescription description={schema.description} />
          : <></>
      }
      <br />
      <p>
        <span className="badge badge--warning">realized generic schema</span>&nbsp;
        This listing shows the complete schema with all{" "}
        <code>$dynamicRef</code>s replaced with their corresponding
        anchors.
        {genericSchemaLink}
      </p>


      <CreateNodes schema={concreteSchema} />
    </div>
  );
}


export function detectGenericRealization(schema: JSONSchema): GenericRealization | undefined {
  if (typeof schema === "boolean") {
    return;
  }

  const {
    $dynamicAnchor,
    allOf,
    $defs = {}
  } = schema;

  // THIS IS A GIANT HACK
  //
  // this relies on the source schema using the pattern:
  //
  //    allOf: [{ $ref: "..." }]
  //
  // as a signal to this code that the relationship implied by the $ref
  // is more than just a direct replacement.
  //
  // this pattern serves to WORKAROUND a limitation with
  // docusaurus-json-schema-plugin's integration of the now-unmaintained
  // @stoplight/json-ref-resolver, where the former package uses the
  // latter to preprocess schemas by overwriting objects containing $ref
  // with the whole referenced schema.
  //
  // this direct overwrite prevents docusaurus-json-schema-plugin code
  // from accessing any properties on the schema that does the $ref
  // (since it's overwritten completely... i.e. object === matching)
  //
  // injecting a needless `allOf` with only one item provides a
  // sufficient interruption in json-ref-resolver's behavior that this
  // code can handle special case rendering here
  if (!allOf || allOf.length !== 1) {
    return;
  }

  const [referencedSchema] = allOf;

  // once we detect that the schema is referring to a single other schema
  // inside a redundant `allOf`, find $dynamicAnchor instances either at
  // the top-level of a $defs definition or at the top-level of the
  // schema itself

  Object.entries($defs)
    .flatMap(([definitionName, definitionSchema]) => {
      if (typeof definitionSchema === "boolean") {
        return [];
      }

      const { $dynamicAnchor } = definitionSchema;

      if (!$dynamicAnchor) {
        return [];
      }

      return [{
        [$dynamicAnchor]: definitionSchema
      }];
    })
    .reduce((a, b) => ({ ...a, ...b }), {});

  const concreteSchemasByDynamicAnchor = {
    // concrete schema for dynamic anchor at schema root
    ...(
      $dynamicAnchor
        ? { [$dynamicAnchor]: schema }
        : {}
    ),

    // concrete schemas defined for dynamic anchors inside $defs
    ...(Object.entries($defs)
      .flatMap(([definitionName, definitionSchema]) => {
        if (typeof definitionSchema === "boolean") {
          return [];
        }

        const { $dynamicAnchor } = definitionSchema;

        if (!$dynamicAnchor) {
          return [];
        }

        return [{
          [$dynamicAnchor]: definitionSchema
        }];
      })
      .reduce((a, b) => ({ ...a, ...b }), {})
    )
  };

  if (Object.keys(concreteSchemasByDynamicAnchor).length === 0) {
    return;
  }

  return {
    genericSchema: referencedSchema,
    concreteSchemasByDynamicAnchor
  };
}

function replaceDynamicReferences<T>(
  obj: T,
  concreteSchemasByDynamicAnchor: {
    [$dynamicAnchor: string]: T
  }
): T {

  if (Array.isArray(obj)) {
    return obj.map(
      (item) => replaceDynamicReferences(item, concreteSchemasByDynamicAnchor)
    ) as T;
  }

  if (obj !== null && typeof obj === "object") {
    if (
      "$dynamicRef" in obj
    ) {
      const { $dynamicRef } = obj as { $dynamicRef?: string };

      if ($dynamicRef && $dynamicRef.slice(1) in concreteSchemasByDynamicAnchor) {
        const concreteSchema = concreteSchemasByDynamicAnchor[$dynamicRef.slice(1)];
        return concreteSchema;
      }
    }

    return Object.entries(obj).reduce((newObj, [key, value]) => {
      // @ts-ignore
      newObj[key] = replaceDynamicReferences(
        value,
        concreteSchemasByDynamicAnchor
      );
      return newObj;
    }, {} as T);
  }

  return obj;
}
