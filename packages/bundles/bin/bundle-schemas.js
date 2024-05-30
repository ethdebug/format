const { schemas } = require("@ethdebug/format");

async function main() {
  const { bundle } = await import("@hyperjump/json-schema/bundle");
  const { addSchema } = await import("@hyperjump/json-schema/draft-2020-12");

  for (const schema of Object.values(schemas)) {
    addSchema(schema);
  }

  const bundles = {};
  for (const id of Object.keys(schemas)) {
    bundles[id] = await bundle(id);
  }

  console.log(`export const bundledSchemas = ${
    JSON.stringify(bundles, undefined, 2)
  } as const;`);
}

main();

