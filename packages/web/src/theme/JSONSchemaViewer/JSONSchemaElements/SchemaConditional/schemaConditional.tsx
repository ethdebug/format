import React from "react";

import {
  IfElseThen,
  DependentRequired,
  DependentSchemas,
  Dependencies,
} from "@theme-original/JSONSchemaViewer/JSONSchemaElements/SchemaConditional";

type Props = {
  schema: any;
};

// To handle Schema Conditional (if-then-else , dependentRequired , dependentSchemas , dependencies )
export default function SchemaConditional(props: Props): JSX.Element {
  const { schema } = props;

  // Checks
  const isIfThenElse = schema.if !== undefined;

  const isDependentRequired = schema.dependentRequired !== undefined;
  const isDependentSchemas = schema.dependentSchemas !== undefined;
  const isDependencies = schema.dependencies !== undefined;

  return (
    <>
      {/* Handles if-then-else case */}
      {isIfThenElse && <IfElseThen schema={schema} />}
      {/* Handles dependentRequired case */}
      {isDependentRequired && <DependentRequired schema={schema} />}
      {/* Handles dependentSchemas case */}
      {isDependentSchemas && <DependentSchemas schema={schema} />}
      {/* Handles dependencies (deprecated) */}
      {isDependencies && <Dependencies schema={schema} />}
    </>
  );
}
