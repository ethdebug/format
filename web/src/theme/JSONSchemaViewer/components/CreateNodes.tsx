import React from 'react';
import CreateTypes from "@theme-original/JSONSchemaViewer/components/CreateTypes";
import CreateNodes from '@theme-original/JSONSchemaViewer/components/CreateNodes';
import { useJSVOptionsContext, useSchemaHierarchyContext } from "@theme-original/JSONSchemaViewer/contexts";
import { useSchemaContext, internalIdKey } from "@site/src/contexts/SchemaContext";
import Link from "@docusaurus/Link";
import jsonpointer from "jsonpointer";

export default function CreateNodesWrapper(props) {
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
    } = schemaIndex[id];

    return (
      <>
        <p>See <Link to={href}>{title}</Link> documentation.</p>
      </>
    );
  }

  return (
    <>
      <CreateNodes schema={schema} {...otherProps} />
    </>
  );
}
