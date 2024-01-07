import JSONSchemaViewer from "@theme/JSONSchemaViewer";
import CodeBlock from "@theme/CodeBlock";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import {
  type DescribeSchemaOptions,
  describeSchema,
} from "@ethdebug/format";
import {
  schemaIndex,
} from "@site/src/schemas";
import {
  SchemaContext ,
  type PointerSchemaIds,
  internalIdKey,
} from "@site/src/contexts/SchemaContext";
import ReactMarkdown from "react-markdown";
import SchemaListing from "./SchemaListing";

export interface SchemaViewerProps extends DescribeSchemaOptions {
}

export default function SchemaViewer(props: SchemaViewerProps): JSX.Element {
  const rootSchemaInfo = describeSchema(props);
  const {
    id,
    rootSchema,
    yaml,
    pointer
  } = rootSchemaInfo;

  const transformedSchema = insertIds(rootSchema, `${id}#`);

  return (
    <Tabs>
      <TabItem value="viewer" label="Explore">
        <SchemaContext.Provider value={{
          rootSchemaInfo,
          schemaIndex,
        }}>
          <JSONSchemaViewer
            schema={transformedSchema}
            resolverOptions={{
              jsonPointer: pointer,
              resolvers: {
                schema: {
                  resolve: (uri) => {
                    const id = uri.toString();
                    const { schema } = describeSchema({
                      schema: { id }
                    });
                    return insertIds(schema, `${id}#`);
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
          </SchemaContext.Provider>
      </TabItem>
      <TabItem value="listing" label="View source">
        <SchemaListing schema={props.schema} pointer={props.pointer} />
      </TabItem>
    </Tabs>
  );
}

function insertIds<T>(obj: T, rootId: string): T {
  if (Array.isArray(obj)) {
    return obj.map((item, index) => insertIds(item, `${rootId}/${index}`)) as T;
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((newObj, key) => {
      const value = obj[key];
      newObj[key] = insertIds(value, `${rootId}/${key}`);
      return newObj;
    }, {
      [internalIdKey]: rootId.endsWith("#")
        ? rootId.slice(0, -1)
        : rootId
    } as T);
  }
  return obj;
}
