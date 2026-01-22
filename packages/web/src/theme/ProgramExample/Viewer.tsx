import { SourceContents, Opcodes } from "@ethdebug/programs-react";
import { Details } from "./Details";

// Import CSS for the components (programs-react expects consumers to provide)
import "./Opcodes.css";
import "./SourceContents.css";
import "./Viewer.css";

export interface Props {}

export function Viewer(_props: Props): JSX.Element {
  return (
    <>
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
      <Details />
    </>
  );
}
