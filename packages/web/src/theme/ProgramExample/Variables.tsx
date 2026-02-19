import React from "react";
import Admonition from "@theme/Admonition";
import Link from "@docusaurus/Link";
import {
  useProgramExampleContext,
  ShikiCodeBlock,
} from "@ethdebug/programs-react";

import { Program } from "@ethdebug/format";

export function Variables(): JSX.Element {
  const { highlightedInstruction } = useProgramExampleContext();

  const link = (
    <Link to="/spec/program/context/variables">
      <strong>ethdebug/format/program</strong> Variables context schema
    </Link>
  );

  if (highlightedInstruction === undefined) {
    return (
      <Admonition type="tip">
        Hover or click on an offset above to see the {link} object for that
        instruction.
      </Admonition>
    );
  }

  const { context } = highlightedInstruction;
  if (!(context && "variables" in context)) {
    return (
      <Admonition type="warning" title="No variables at instruction">
        The highlighted instruction does not specify any variables in context
        information. See other tab for full instruction object.
      </Admonition>
    );
  }

  const { variables } = context;

  if (!variables.every((variable) => "identifier" in variable)) {
    throw new Error(
      "Unnamed variables are currently unsupported by this documentation system",
    );
  }

  return (
    <>
      <Admonition type="info">
        The following is the {link} object for the selected instruction.
      </Admonition>

      <dl className="variables">
        {variables.map((variable) => (
          <Variable key={variable.identifier} variable={variable} />
        ))}
      </dl>
    </>
  );
}

interface VariableProps {
  variable: Program.Context.Variables.Variable;
}

function Variable(props: VariableProps): JSX.Element {
  const { variable } = props;

  const details = (["type", "pointer"] as const)
    .filter((detail) => detail in variable)
    .map((detail) => (
      <div key={detail}>
        <h3>{`${detail.slice(0, 1).toUpperCase()}${detail.slice(1)}`}</h3>

        <ShikiCodeBlock
          language="javascript"
          code={JSON.stringify(variable[detail], undefined, 2)}
        />
      </div>
    ));
  return (
    <>
      <dt>
        <code>{variable.identifier}</code>
      </dt>
      <dd>
        <div className="viewer-row">{details}</div>
      </dd>
    </>
  );
}
