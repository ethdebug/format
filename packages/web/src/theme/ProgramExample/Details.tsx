import Admonition from "@theme/Admonition";
import Link from "@docusaurus/Link";
import { Program } from "@ethdebug/format";
import {
  useProgramExampleContext,
  HighlightedInstruction,
} from "@ethdebug/programs-react";

// imported for style legend
import "./SourceContents.css";

export interface Props {}

export function Details(_props: Props): JSX.Element {
  const { highlightedInstruction, highlightMode } = useProgramExampleContext();

  if (highlightMode === "simple" || !highlightedInstruction) {
    return (
      <>
        <h3>Details</h3>
        <BasicAdmonition />
      </>
    );
  }

  return (
    <>
      <h3>Details</h3>
      <InstructionAdmonition instruction={highlightedInstruction} />
      <details>
        <summary>
          See full <strong>ethdebug/format/program/instruction</strong> object
        </summary>
        <HighlightedInstruction />
      </details>
    </>
  );
}

interface InstructionAdmonitionProps {
  instruction: Program.Instruction;
}
function InstructionAdmonition({
  instruction: _instruction,
}: InstructionAdmonitionProps): JSX.Element {
  return (
    <Admonition type="info">
      <p>
        The selected instruction provides the following{" "}
        <Link to="/spec/program/context">
          <strong>ethdebug/format</strong> Program contexts
        </Link>
        :
      </p>
      <ul>
        <li>
          <strong>Code context</strong> is highlighted{" "}
          <span className="highlighted-code">in this style</span> above.
        </li>
        <li>
          <strong>Variables context</strong> is indicated by variable
          declarations highlighted{" "}
          <span className="highlighted-variable-declaration">
            in this style
          </span>{" "}
          above.
        </li>
      </ul>
    </Admonition>
  );
}

function BasicAdmonition(_props: {}): JSX.Element {
  return (
    <Admonition type="tip">
      Select an instruction offset to see associated{" "}
      <strong>ethdebug/format</strong> debugging information.
    </Admonition>
  );
}
