import React from 'react';
import CreateTypes from "@theme-original/JSONSchemaViewer/components/CreateTypes";
import CreateNodes from '@theme-original/JSONSchemaViewer/components/CreateNodes';
import { useSchemaHierarchyContext } from "@theme-original/JSONSchemaViewer/contexts";
import {
  useSchemaContext,
  internalIdKey,
  type JSONSchemaWithInternalIdKeys as JSONSchema
} from "@site/src/contexts/SchemaContext";
import Link from "@docusaurus/Link";

import UnnecessaryCompositionSchema, {
  detectUnnecessaryComposition
} from "./UnnecessaryComposition";

export default function CreateNodesWrapper(props: {
  schema: Exclude<JSONSchema, boolean>
}) {
  const { level } = useSchemaHierarchyContext();
  const { schemaIndex } = useSchemaContext();

  const {
    schema,
    ...otherProps
  } = props;

  const { [internalIdKey]: id } = schema;

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

  const unnecessaryComposition = detectUnnecessaryComposition(schema);
  if (unnecessaryComposition) {
    return <UnnecessaryCompositionSchema {...unnecessaryComposition} />;
  }

  return (
    <>
      <CreateNodes schema={schema} {...otherProps} />
    </>
  );
}
