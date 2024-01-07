const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const filename = __dirname;
const repositoryRoot = path.resolve(filename, "../../../");
const schemasRoot = path.resolve(repositoryRoot, "./schemas");

const readSchemaYamls = (directory) => {
  const schemaYamls = {};
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const subdirectorySchemaYamls = readSchemaYamls(fullPath);
      for (const id in subdirectorySchemaYamls) {
        schemaYamls[id] = subdirectorySchemaYamls[id];
      }
    } else if (entry.isFile() && entry.name.endsWith(".schema.yaml")) {
      const contents = fs.readFileSync(fullPath, "utf8");
      const { $id: id } = YAML.parse(contents);

      schemaYamls[id] = contents;
    }
  }

  return schemaYamls;
}

const schemaYamls = readSchemaYamls(schemasRoot);

console.log(`export type SchemaYamlsById = {
  [id: string]: string;
};

export const schemaYamls: SchemaYamlsById = ${
  JSON.stringify(schemaYamls, undefined, 2)
};
`);
