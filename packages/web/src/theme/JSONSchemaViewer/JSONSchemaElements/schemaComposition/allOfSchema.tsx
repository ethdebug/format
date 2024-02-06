import React from 'react';
import type { JSONSchema } from "json-schema-typed/draft-2020-12"
import AllOfSchema from '@theme-original/JSONSchemaViewer/JSONSchemaElements/schemaComposition/allOfSchema';

import DiscriminatorSchema, {
  detectDiscriminator
} from "./DiscriminatorSchema";

import ExclusiveRequiredPropertiesSchema, {
  detectExclusiveRequiredProperties
} from "./ExclusiveRequiredPropertiesSchema";

export default function allOfSchemaWrapper(props: {
  schema: Exclude<JSONSchema, boolean> & { allOf: JSONSchema[]; }
}) {
  const { schema } = props;

  const discriminator = detectDiscriminator(schema);
  if (discriminator) {
    return <DiscriminatorSchema {...discriminator} />
  }

  const exclusions = detectExclusiveRequiredProperties(schema);
  if (exclusions) {
    return <ExclusiveRequiredPropertiesSchema {...exclusions} />
  }

  return (
    <>
      <AllOfSchema {...props} />
    </>
  );
}

