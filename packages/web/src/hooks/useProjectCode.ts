import { Project } from "ts-morph";
import { usePluginData } from "@docusaurus/useGlobalData";

export default function useProjectCode(packageName: string): Project {
  const { packages }: any = usePluginData("project-code-plugin");
  if (!(packageName in packages)) {
    throw new Error(`Unknown package name ${packageName}`);
  }

  const { sourceFiles } = packages[packageName];

  const project = new Project({
    useInMemoryFileSystem: true,
  });
  for (const { filePath, text } of sourceFiles) {
    project.createSourceFile(filePath, text, { overwrite: true });
  }

  return project;
}
