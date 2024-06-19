import CodeBlock, { type Props as CodeBlockProps } from "@theme/CodeBlock";
import { Project, type SourceFile, type ts } from "ts-morph";

import useProjectCode from "@site/src/hooks/useProjectCode";

export interface CodeListingProps
  extends Omit<CodeBlockProps, "language" | "children">
{
  packageName: string;
  sourcePath: string;
  extract?: <N extends ts.Node>(
    sourceFile: SourceFile,
    project: Project
  ) => N;
}

export default function CodeListing({
  packageName,
  sourcePath,
  extract,
  ...props
}: CodeListingProps): JSX.Element {
  const project = useProjectCode(packageName);

  const sourceFile = project.getSourceFileOrThrow(sourcePath);

  if (!extract) {
    return <CodeBlock
      title={sourcePath}
      language="typescript"
      showLineNumbers
    >{
      sourceFile.getFullText()
    }</CodeBlock>;
  }

  const node = extract(sourceFile, project);

  return <CodeBlock
    language="typescript"
    {...props}
  >{
    node.getFullText().trim()
  }</CodeBlock>;
}
