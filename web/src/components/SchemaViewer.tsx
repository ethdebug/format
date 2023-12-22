import JSONSchemaViewer from "@theme/JSONSchemaViewer";
import CodeBlock from "@theme/CodeBlock";
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
        showExamples: true,
        ValueComponent: ({ value }) => {
          // deal with simple types first
          if ([
            "string",
            "number",
            "bigint",
            "boolean"
          ].includes(typeof value)) {
            return <code>{
              (value as string | number | bigint | boolean).toString()
            }</code>;
          }

          // for complex types use a whole CodeBlock
          return <CodeBlock language="json">{`${
            JSON.stringify(value, undefined, 2)
          }`}</CodeBlock>;
        }
      }} />
  );
}
