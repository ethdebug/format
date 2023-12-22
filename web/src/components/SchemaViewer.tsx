import JSONSchemaViewer from "@theme/JSONSchemaViewer";
import CodeBlock from "@theme/CodeBlock";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import {
  type DescribeSchemaOptions,
  describeSchema
} from "@site/src/schemas";
import ReactMarkdown from "react-markdown";
import SchemaListing from "./SchemaListing";

export interface SchemaViewerProps extends DescribeSchemaOptions {
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

export default function SchemaViewer(props: SchemaViewerProps): JSX.Element {
  const {
    schema: rawSchema,
    yaml,
    pointer
  } = describeSchema(props);

  const {
    detect = () => false,
    transform = (x) => x
  } = props;

  const transformedSchema = transformObject(
    rawSchema,
    detect,
    transform
  );

  return (
    <Tabs>
      <TabItem value="viewer" label="Explore">
        <JSONSchemaViewer
          schema={transformedSchema}
          resolverOptions={{
            resolvers: {
              schema: {
                resolve: (uri) => {
                  const { schema } = describeSchema({
                    schema: {
                      id: uri.toString()
                    }
                  });
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
          }} />
      </TabItem>
      <TabItem value="listing" label="View source">
        <SchemaListing schema={props.schema} pointer={props.pointer} />
      </TabItem>
    </Tabs>
  );
}
