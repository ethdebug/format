import Admonition from "@theme/Admonition";
import Link from "@docusaurus/Link";
import { useProgramExampleContext } from "./ProgramExampleContext";
import { SourceContents } from "./SourceContents";
import { Opcodes } from "./Opcodes";
import { HighlightedInstruction } from "./HighlightedInstruction";
import { Variables } from "./Variables";

import "./Viewer.css";
import "./SourceContents.css";

export interface Props {
}

export function Viewer(props: Props): JSX.Element {
  const { highlightedInstruction, highlightMode } = useProgramExampleContext();

  const basicAdmonition = <Admonition type="tip">
    Select an instruction offset to see associated <strong>
      ethdebug/format
    </strong> debugging information.
  </Admonition>;

  const detailedAdmonition = <Admonition type="info">
    <p>
      The selected instruction provides the following <Link to="/spec/program/context">
        <strong>ethdebug/format</strong> Program contexts
      </Link>:
    </p>
    <ul>
      <li>
        <strong>Code context</strong> is highlighted <span className="highlighted-code">in this
        style</span> above.
      </li>
      <li>
        <strong>Variables context</strong> is indicated by variable declarations
        highlighted <span className="highlighted-variable-declaration">in this
        style</span> above.
      </li>
    </ul>
  </Admonition>;

  const details = highlightedInstruction && highlightMode === "detailed"
    ? <>
        <h3>Details</h3>
        {detailedAdmonition}
        <details>
          <summary>See full <strong>ethdebug/format/program/instruction</strong> object</summary>
          <HighlightedInstruction />
        </details>
      </>
    : <>
        <h3>Details</h3>
        {basicAdmonition}
      </>;


  return <>
    <h2>Interactive example</h2>
    <div className="viewer-row">
      <div>
        <h3 id="source-contents">Source contents</h3>
        <SourceContents />
      </div>
      <div>
        <h3 id="compiled-opcodes">Compiled opcodes</h3>
        <Opcodes />
      </div>
    </div>
    {details}
  </>;
}
