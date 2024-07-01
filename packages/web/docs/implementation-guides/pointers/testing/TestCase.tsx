import { useState, useEffect } from "react";

import prettier from "prettier/standalone";

import { describeSchema } from "@ethdebug/format";
import { observeTraceTests } from "@ethdebug/pointers/dist/src/test-cases"

import { Collapsible } from "@theme/JSONSchemaViewer/components";
import CodeBlock from "@theme/CodeBlock";
import CodeListing from "@site/src/components/CodeListing";

const solidityPlugin: any = require("prettier-plugin-solidity/standalone");

export interface TestCaseProps {
  name: string;
  variableName: string;
}

export default function TestCase({
  name,
  variableName
}: TestCaseProps): JSX.Element {
  const {
    pointer,
    compileOptions,
    expectedValues
  } = observeTraceTests[name as keyof typeof observeTraceTests];

  const [sourcePath, { content }] =
    // use the first since all test cases use only one source file
    Object.entries(compileOptions.sources)[0];

  const [
    formattedContent,
    setFormattedContent
  ] = useState<string | undefined>();

  useEffect(() => {
    prettier.format(content, {
      parser: "solidity-parse",
      plugins: [solidityPlugin]
    })
    .then(setFormattedContent);
  }, [setFormattedContent]);

  return <>
    <h3>Solidity code</h3>

    {typeof formattedContent === "undefined"
      ? <>Loading Solidity code...</>
      : <CodeBlock language="solidity">{formattedContent}</CodeBlock>}

    <h3>Expected value sequence</h3>

    <ol>
      {expectedValues.map((expectedValue, index) => <li key={index}><code>{
        JSON.stringify(expectedValue)
      }</code></li>)}
    </ol>

    <h3>Pointer</h3>
    <Collapsible summary="See Pointer JSON">
      <CodeBlock language="json">{
        JSON.stringify(pointer, undefined, 2)
      }</CodeBlock>
    </Collapsible>

    <h3>Full test case code listing</h3>
    <Collapsible summary="See TypeScript test case definition">
      <CodeListing
        packageName="@ethdebug/pointers"
        sourcePath="src/test-cases.ts"
        extract={sourceFile => sourceFile.getVariableStatement(variableName)}
      />
    </Collapsible>


  </>;
}
