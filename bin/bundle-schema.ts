import { addSchema } from "@hyperjump/json-schema/draft-2020-12";
import { bundle as bundleSchema } from "@hyperjump/json-schema/bundle";
import { schemas, describeSchema } from "@ethdebug/format";
import type { JSONSchema } from "json-schema-typed/draft-2020-12"

async function main() {
  const schema = { id: process.argv[2] }; // a bit brittle

  if (!schema.id) {
    console.error(
      "Please provide a schema ID, e.g. `schema:ethdebug/format/pointer`"
    );
    process.exit(1);
  }

  // pre-flight check to make sure schema exists
  describeSchema({ schema });

  for (const schema of Object.values(schemas)) {
    addSchema(schema as any);
  }

  const bundle = await bundleSchema(schema.id);

  console.log(JSON.stringify(bundle, undefined, 2));
}

main();
