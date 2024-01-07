import YAML from "yaml";
import {
  type DescribeSchemaOptions,
  describeSchema
} from "@site/src/schemas";
import CodeBlock from "@theme/CodeBlock";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

export interface SchemaListingProps extends DescribeSchemaOptions {
}

export default function SchemaListing(props: SchemaListingProps): JSX.Element {
  const {
    id: qualifiedId,
    pointer,
    schema,
    yaml
  } = describeSchema(props);

  const id =
    qualifiedId
      ? qualifiedId.startsWith("schema:")
        ? qualifiedId.slice(7)
        : qualifiedId
      : undefined;

  const reference = id && pointer
    ? `${id}${pointer}`
    : id
      ? id
      : undefined;

  return (
    <Tabs groupId="schema-language">
      <TabItem value="yaml" label="YAML">
        <CodeBlock
          className="schema-listing"
          language="yaml"
          showLineNumbers
          title={
            reference
              ? reference
              : "schema.yaml"
          }
        >{
          yaml
        }</CodeBlock>
      </TabItem>
      <TabItem value="json" label="JSON">
        <CodeBlock
          className="schema-listing"
          language="json"
          showLineNumbers
          title={
            reference
              ? `${reference}`
              : "schema.json"
          }
        >{
          JSON.stringify(schema, undefined, 2)
        }</CodeBlock>
      </TabItem>
    </Tabs>
  );
}
