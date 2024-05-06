import { type SchemaById, describeSchema, schemas } from "@ethdebug/format";
import Editor, { useMonaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import { useEffect, useRef, useState } from "react";
import { useColorMode } from "@docusaurus/theme-common";
import JSONSourceMap from "@mischnic/json-sourcemap";

// To use Ajv with the support of all JSON Schema draft-2019-09/2020-12
// features you need to use a different export:
// refer: https://github.com/ajv-validator/ajv/issues/2335
import Ajv, { ErrorObject } from "ajv/dist/2020";

export interface PlaygroundProps {
  schema: SchemaById;
}

/* Source map types */
type SourceMap = { data: any; pointers: Record<string, Pointer> };

type Pointer = {
  value: Position;
  valueEnd: Position;
  key?: Position;
  keyEnd?: Position;
};

type Position = {
  line: number;
  column: number;
  pos: number;
};

/* The EthDebug Playground: An interactive component for developers */
/* and tinkerers to build and test EthDebug schemas.                */
export default function Playground(props: PlaygroundProps): JSX.Element {
  const { schema } = describeSchema(props);
  const { colorMode } = useColorMode();

  // Setting exampleSchema to the first example or an empty object
  const exampleSchema = schema.examples?.[0] ?? {};

  // Ref to hold the Monaco editor instance
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // Ref to hold the Monaco editor instance
  const monaco = useMonaco();

  // Tab width
  const TAB_WIDTH = 2;

  // Compile all schemas to Ajv instance
  const ajv = new Ajv({
    schemas: Object.values(schemas),
    strict: false,
    allErrors: true,
    verbose: true,
    messages: true,
    code: {
      source: true,
    },
  });

  // State to hold editor input
  const [editorInput, setEditorInput] = useState(exampleSchema);
  const [ready, setReady] = useState(false);

  // Validate schema on editor input change
  useEffect(() => {
    ready && validateSchema();
  }, [editorInput]);

  /**
   * Handles editor did mount event
   * @param {editor.IStandaloneCodeEditor} editor - Monaco editor instance
   */
  function handleEditorDidMount(editor: editor.IStandaloneCodeEditor) {
    editorRef.current = editor;
  }

  /**
   * Validates the schema using Ajv and displays errors in the Monaco editor
   */
  function validateSchema() {
    const validate = ajv.getSchema(props.schema.id);
    if (!validate) return showError("Unable to validate schema");
    const sourceMap = getParsedEditorInput();
    const isValid = validate(sourceMap.data);

    showValidationErrors(validate.errors, sourceMap);
  }

  /**
   * Shows validation error in the Monaco editor
   * @param {ErrorObject[] | null | undefined} errors - Validation errors if any
   * @param {string} sourceMap - The source map of the editor input
   */
  function showValidationErrors(
    errors: ErrorObject[] | null | undefined,
    sourceMap: SourceMap
  ) {
    const model = editorRef.current?.getModel();
    if (!model || !monaco) return showError("Unable to validate schema");
    let markers = [];
    if (errors) {
      for (const [_, error] of Object.entries(errors)) {
        let node = sourceMap.pointers[error.instancePath];
        const message = error.message;

        if (!node || !message) continue;

        markers.push({
          startLineNumber: node.value.line + 1,
          startColumn: node.value.column + 1,
          endColumn: node.valueEnd.line + 1,
          endLineNumber: node.valueEnd.column + 1,
          message,
          severity: monaco.MarkerSeverity.Error,
        });

        if (node.key && node.keyEnd) {
          markers.push({
            startLineNumber: node.key.line + 1,
            startColumn: node.key.column + 1,
            endColumn: node.keyEnd.line + 1,
            endLineNumber: node.keyEnd.column + 1,
            message,
            severity: monaco.MarkerSeverity.Error,
          });
        }
      }
    }
    monaco.editor.setModelMarkers(model, "EthDebug", markers);
  }

  /**
   * Parses the editor input into a JSON object
   * @returns {Object} - Parsed JSON object
   */
  function getParsedEditorInput(): SourceMap {
    try {
      return JSONSourceMap.parse(editorInput, undefined, {
        tabWidth: TAB_WIDTH,
      });
    } catch {
      return { data: "", pointers: {} };
    }
  }

  /**
   * Displays an error message in the console
   * @param {string} error - The error message
   */
  function showError(error: string) {
    console.error(error);
  }

  /**
   * Handles editor value change event
   * @param {string | undefined} value - The new value of the editor
   */
  function handleEditorChange(value: string | undefined) {
    setReady(true);
    setEditorInput(value);
  }

  return (
    <section className="playground-container">
      <Editor
        height="50vh"
        language="json"
        theme={colorMode == "dark" ? "vs-dark" : "vs-light"}
        defaultValue={JSON.stringify(exampleSchema, undefined, TAB_WIDTH)}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
      />
    </section>
  );
}
