import JSONSchemaViewer from "@theme/JSONSchemaViewer";
import CodeBlock from "@theme/CodeBlock";
import { loadSchema } from "@site/src/loadSchema";
import ReactMarkdown from "react-markdown";

export interface SchemaViewerProps {
  schema: string | object;
  pointer?: string;
  detect?: (item: object) => boolean;
  transform?: (item: object, root: object) => object;
}


export const transformObject = (
  obj: object,
  predicate: (item: object) => boolean,
  transform: (item: object, root: object) => object
): object => {
  const process = (currentObj: object): object => {
    if (predicate(currentObj)) {
      return transform(currentObj, obj);
    }

    if (typeof currentObj !== 'object' || currentObj === null) {
      return currentObj;
    }

    // Using Array.isArray to differentiate between array and object
    if (Array.isArray(currentObj)) {
      return currentObj.map(item => process(item));
    } else {
      return Object.keys(currentObj).reduce((acc, key) => {
        acc[key] = process(currentObj[key]);
        return acc;
      }, {});
    }
  };

  return process(obj);
}

export default function SchemaViewer({
  schema: schemaName,
  pointer = "",
  detect = () => false,
  transform = (x) => x
}: SchemaViewerProps): JSX.Element {
  const rawSchema = typeof schemaName === "string"
    ? loadSchema(schemaName)
    : schemaName;
  const schema = transformObject(
    rawSchema,
    detect,
    transform
  );

  return (
    <JSONSchemaViewer
      schema={schema}
      resolverOptions={{
        jsonPointer: pointer,
        resolvers: {
          schema: {
            resolve: (uri) => {
              const schema = loadSchema(uri.toString());
              return schema;

            }
          }
        }
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
        },
        DescriptionComponent: ({description}) =>
          <ReactMarkdown children={description} />
        }
      }} />
  );
}
