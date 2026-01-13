import Admonition from "@theme/Admonition";
import Link from "@docusaurus/Link";
import { SourceContents } from "./SourceContents";
import { Opcodes } from "./Opcodes";
import { Details } from "./Details";
import { Variables } from "./Variables";

import "./Viewer.css";

export interface Props {}

export function Viewer(props: Props): JSX.Element {
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
