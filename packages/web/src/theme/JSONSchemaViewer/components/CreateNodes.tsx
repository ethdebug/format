import React from 'react';
import CreateTypes from "@theme-original/JSONSchemaViewer/components/CreateTypes";
import CreateNodes from '@theme-original/JSONSchemaViewer/components/CreateNodes';
import type { JSONSchema } from "json-schema-typed/draft-2020-12";
import { useSchemaHierarchyContext } from "@theme-original/JSONSchemaViewer/contexts";
import { useSchemaContext, internalIdKey } from "@site/src/contexts/SchemaContext";
import Link from "@docusaurus/Link";

export default function CreateNodesWrapper(props: {
  schema: Exclude<JSONSchema, boolean> & {
    [internalIdKey]: string
  }
}) {
  const { level } = useSchemaHierarchyContext();
  const { schemaIndex } = useSchemaContext();

  const {
    schema: {
      [internalIdKey]: id,
      ...schema
    },
    ...otherProps
  } = props;

  if (id && id in schemaIndex && level > 0) {
    const {
      href,
      title = `${
        id.startsWith("schema:")
          ? id.slice("schema:".length)
          : id
      } schema`
    } = schemaIndex[id as keyof typeof schemaIndex];

    return (
      <>
        <p>See <Link to={href}>{title}</Link> documentation.</p>
      </>
    );
  }

  return (
    <>
      <CreateNodes schema={props.schema} {...otherProps} />
    </>
  );
}
