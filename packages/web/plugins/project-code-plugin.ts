import path from "path";
import type { LoadContext, Plugin } from "@docusaurus/types";
import { Project } from "ts-morph";

export interface PluginOptions {
  packages: {
    [packageName: string]: {
      tsConfigFilePath: string;
    };
  };
}

export type LoadedContent = {
  packages: {
    [packageName: string]: {
      sourceFiles: {
        filePath: string;
        text: string;
      }[];
    };
  };
};

export default function projectCodePlugin(
  context: LoadContext,
  options: PluginOptions,
): Plugin<LoadedContent> {
  const { packages } = options;

  return {
    name: "project-code-plugin",

    async loadContent() {
      const content: LoadedContent = {
        packages: {},
      };

      for (const [packageName, packageConfig] of Object.entries(packages)) {
        const { tsConfigFilePath } = packageConfig;

        const project = new Project({
          tsConfigFilePath,
        });

        const sourceFiles = project.getSourceFiles().map((sourceFile) => ({
          filePath: path.relative(
            path.dirname(tsConfigFilePath),
            sourceFile.getFilePath(),
          ),

          text: sourceFile.getText(),
        }));

        content.packages[packageName] = {
          sourceFiles,
        };
      }

      return content;
    },

    async contentLoaded({ content, actions }) {
      const { setGlobalData } = actions;

      setGlobalData(content);
    },
  };
}
