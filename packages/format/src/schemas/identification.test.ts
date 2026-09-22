import { describe, expect, it } from "vitest";
import "#test/hyperjump";

const program = {
  contract: {
    name: "A",
    definition: { source: { id: 0 }, range: { offset: 0, length: 1 } },
  },
  environment: "call",
  instructions: [{ offset: 0 }],
};
const id = (schema: string, version = "0.1.0-draft.0") => ({
  schema,
  version,
});

// Copied from schemas/info.schema.yaml's own example, so that this
// object satisfies schemas/materials/compilation.schema.yaml (id,
// compiler.name, compiler.version, sources).
const compilation = {
  id: "__301f3b6d85831638",
  compiler: {
    name: "egc",
    version: "0.2.3+commit.8b37fa7a",
  },
  settings: {
    turbo: true,
  },
  sources: [
    {
      id: 1,
      path: "Escrow.eg",
      language: "examplelang",
      contents: `import { Asset } from std::asset::fungible;

type State = !slots[
  ready: bool,
  complete: bool,

  beneficiary: address,

  asset: Asset,
  amount: uint256,

  canRemit: () -> bool,
]

@create
func setup(
  beneficiary: address,
  asset: Asset,
  canRemit: () -> bool,
) -> State:
  return {
    ready = False,
    complete = False,
    beneficiary,
    asset,
    amount = 0,
    canRemit,
  }

@abi
@state(self: State)
@account(self)
func deposit(depositor: address, amount: uint256):
  require(!self.ready)
  require(!self.complete)

  # expects an existing allowance (also known as "approval")
  self.asset.transferFrom(depositor, self, amount)

  self.amount = amount
  self.ready = True

@abi
@state(self: State)
func remit():
  require(self.ready)
  require(!self.complete)

  require(self.canRemit())

  asset.transfer(self.beneficiary, self.amount)

  self.complete = True
`,
    },
  ],
};

describe("identification", () => {
  it("accepts a program that names its own schema", async () => {
    await expect({
      ethdebug: id("schema:ethdebug/format/program"),
      ...program,
    }).toValidate({ schema: { id: "schema:ethdebug/format/program" } });
  });

  it("rejects a program that claims another schema", async () => {
    await expect({
      ethdebug: id("schema:ethdebug/format/info"),
      ...program,
    }).not.toValidate({ schema: { id: "schema:ethdebug/format/program" } });
  });

  it("rejects versions the pattern forbids", async () => {
    for (const version of [
      "0.1",
      "v0.1.0",
      "01.1.0",
      "0.1.0-draft.01",
      "0.1.0+build",
      "0.1.0-",
    ]) {
      await expect({
        ethdebug: id("schema:ethdebug/format/program", version),
        ...program,
      }).not.toValidate({ schema: { id: "schema:ethdebug/format/program" } });
    }
  });

  it("accepts numeric and named prereleases and stable versions", async () => {
    for (const version of ["0.1.0-2", "0.1.0-draft.3", "0.1.0", "1.0.0-rc.1"]) {
      await expect({
        ethdebug: id("schema:ethdebug/format/program", version),
        ...program,
      }).toValidate({ schema: { id: "schema:ethdebug/format/program" } });
    }
  });

  it("rejects an extra key inside the field", async () => {
    await expect({
      ethdebug: { ...id("schema:ethdebug/format/program"), extra: 1 },
      ...program,
    }).not.toValidate({ schema: { id: "schema:ethdebug/format/program" } });
  });

  it("lets an info document name info, and resources accept it too", async () => {
    const info = {
      ethdebug: id("schema:ethdebug/format/info"),
      compilation,
      programs: [],
      types: {},
      pointers: {},
    };
    await expect(info).toValidate({
      schema: { id: "schema:ethdebug/format/info" },
    });
    await expect(info).toValidate({
      schema: { id: "schema:ethdebug/format/info/resources" },
    });
    const resources = {
      ...info,
      ethdebug: id("schema:ethdebug/format/info/resources"),
    };
    await expect(resources).not.toValidate({
      schema: { id: "schema:ethdebug/format/info" },
    });
  });
});
