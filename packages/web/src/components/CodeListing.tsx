import CodeBlock, { type Props as CodeBlockProps } from "@theme/CodeBlock";
import { Project, type SourceFile, type ts } from "ts-morph";

import useProjectCode from "@site/src/hooks/useProjectCode";
import LinkedCodeBlock from "./LinkedCodeBlock";

export interface CodeListingProps extends Omit<
  CodeBlockProps,
  "language" | "children"
> {
  packageName: string;
  sourcePath: string;
  includePackageNameInTitle?: boolean;
  extract?: (
    sourceFile: SourceFile,
    project: Project,
  ) => Pick<ts.Node, "getFullText">;
  links?: { [key: string]: string };
}

export default function CodeListing({
  packageName,
  sourcePath,
  includePackageNameInTitle = false,
  extract,
  links = {},
  ...codeBlockProps
}: CodeListingProps): JSX.Element {
  const project = useProjectCode(packageName);

  const sourceFile = project.getSourceFileOrThrow(sourcePath);

  const node = !extract ? sourceFile : extract(sourceFile, project);

  const code = node.getFullText().trim();

  // bit of a HACK
  const listingFullSource = !extract;

  const title = includePackageNameInTitle ? (
    <>
      <strong>{packageName}</strong> {sourcePath}
    </>
  ) : (
    sourcePath
  );

  if (Object.keys(links).length > 0) {
    return (
      <LinkedCodeBlock
        code={code}
        links={links}
        language="typescript"
        {...codeBlockProps}
      />
    );
  }

  return (
    // @ts-expect-error element seems to work even though title says it wants string
    <CodeBlock
      language="typescript"
      {...{
        ...(listingFullSource
          ? { title, showLineNumbers: true }
          : { showLineNumbers: false }),
        ...codeBlockProps,
      }}
    >
      {node.getFullText().trim()}
    </CodeBlock>
  );
}
