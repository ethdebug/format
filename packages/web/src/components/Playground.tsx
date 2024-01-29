import {
  type DescribeSchemaOptions
} from "@ethdebug/format";
import Editor from '@monaco-editor/react';

export interface PlaygroundProps extends DescribeSchemaOptions {
}
export default function Playground(props: any): JSX.Element {
  return <Editor height="90vh" defaultLanguage="javascript" defaultValue="// some comment" />;
}

