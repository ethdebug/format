import { useProgramExampleContext } from "./ProgramExampleContext";
import { SourceContents } from "./SourceContents";
import { Opcodes } from "./Opcodes";

import "./Viewer.css";

export interface Props {
}

export function Viewer(props: Props): JSX.Element {
  return <>
    <div className="viewer-row">
      <div>
        <h2>Source contents</h2>
        <SourceContents />
      </div>
      <div>
        <h2>Compiled opcodes</h2>
        <Opcodes />
      </div>
    </div>
  </>;
}
