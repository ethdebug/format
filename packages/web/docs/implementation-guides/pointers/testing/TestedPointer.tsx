import { Collapsible } from "@theme/JSONSchemaViewer/components";
import CodeBlock from "@theme/CodeBlock";
import { describeSchema } from "@ethdebug/format";

export interface TestedPointerProps {
  pointerQuery: string;
}

export default function TestedPointer({
  pointerQuery
}: TestedPointerProps): JSX.Element {
  const { schema } = describeSchema({
    schema: { id: "schema:ethdebug/format/pointer" }
  });

  const [exampleIndex] = [...(schema.examples?.entries() || [])]
    .find(([_, example]) => JSON.stringify(example).includes(pointerQuery))
    || [];

  if (typeof exampleIndex === "undefined") {
    throw new Error("Could not find example in pointer schema");
  }

  const { yaml: pointerYaml } = describeSchema({
    schema: { id: "schema:ethdebug/format/pointer" },
    pointer: `#/examples/${exampleIndex}`
  });

  return <CodeBlock language="yaml">{pointerYaml}</CodeBlock>;
}
