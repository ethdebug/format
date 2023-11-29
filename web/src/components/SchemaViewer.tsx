import JSONSchemaViewer from "@theme/JSONSchemaViewer";
import { loadSchema } from "@site/src/loadSchema";

export interface SchemaViewerProps {
  schema: string;
  pointer?: string;
}

export default function SchemaViewer({
  schema,
  pointer = ""
}: SchemaViewerProps): JSX.Element {
  return (
    <JSONSchemaViewer
      schema={ loadSchema(schema) }
      resolverOptions={{
        jsonPointer: pointer
      }}
      viewerOptions={{
        showExamples: true
      }} />
  );
}
