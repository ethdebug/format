import { type SchemaById, describeSchema, schemas } from "@ethdebug/format";
import Editor, { useMonaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import { useEffect, useRef, useState } from "react";

// To use Ajv with the support of all JSON Schema draft-2019-09/2020-12
// features you need to use a different export:
// refer: https://github.com/ajv-validator/ajv/issues/2335
import Ajv, { ErrorObject } from "ajv/dist/2020";

export interface PlaygroundProps {
  schema: SchemaById;
}

/* The EthDebug Playground: An interactive component for developers */
/* and tinkerers to build and test EthDebug schemas.               */
export default function Playground(props: PlaygroundProps): JSX.Element {
  let { schema } = describeSchema(props);
  const exampleSchema = schema.examples?.[0] ?? {};

  // Ref to hold the editor instance
  const monaco = useMonaco();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // Compile all schemas to Ajv instance
  const ajv = new Ajv({ schemas: Object.values(schemas), strict: false });

  const [editorInput, setEditorInput] = useState(exampleSchema);

  useEffect(() => {
    validateSchema();
  }, [editorInput]);

  function handleEditorDidMount(editor: editor.IStandaloneCodeEditor) {
    // here is the editor instance
    editorRef.current = editor;
  }

  function showValidationError(key: string, message: string) {
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const lines = editorInput.split("\n");
        let keyFound = false;
        for (let i = 1; i <= lines.length; i++) {
          const line = lines[i - 1];
          const keyIndex = line.indexOf(`"${key}"`);
          if (keyIndex !== -1) {
            // Found the key in this line
            monaco?.editor.setModelMarkers(model, "EthDebug", [
              {
                startLineNumber: i,
                startColumn: 1,
                endColumn: line.length,
                endLineNumber: i,
                message,
                severity: monaco.MarkerSeverity.Error,
              },
            ]);
            keyFound = true;
          }
        }
      }
    }
  }

  function clearValidationErrors() {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    monaco?.editor.setModelMarkers(model, "EthDebug", []);
  }

  function validateSchema() {
    const validate = ajv.getSchema(props.schema.id);
    if (!validate) return showError("Unable to validate schema");
    const isValid = validate(getParsedEditorInput());

    clearValidationErrors();

    validate.errors?.forEach((error: ErrorObject) => {
      // Instance path points to a key in the source file.
      let key = error.instancePath.split("/").pop();
      if (!isValid && error.message && key) {
        showValidationError(key, `${error.instancePath}: ${error.message}`);
      }
    });
  }

  function getParsedEditorInput() {
    try {
      return JSON.parse(editorInput);
    } catch {
      showError("Unable to parse input");
    }
  }

  function showError(error: string) {
    console.warn("errors");
  }

  function handleEditorChange(value: string | undefined) {
    setEditorInput(value);
  }

  return (
    <section className="playground-container">
      <Editor
        height="50vh"
        language="json"
        defaultValue={JSON.stringify(exampleSchema, undefined, 2)}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
      />
    </section>
  );
}
