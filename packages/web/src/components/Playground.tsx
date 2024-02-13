import { type SchemaById, describeSchema, schemas } from "@ethdebug/format";
import Editor, { useMonaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import { useEffect, useRef, useState } from "react";
import { useColorMode } from "@docusaurus/theme-common";
import "react-toastify/dist/ReactToastify.css";

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
  const { schema } = describeSchema(props);
  const { colorMode } = useColorMode();

  // Setting exampleSchema to the first example or an empty object
  const exampleSchema = schema.examples?.[0] ?? {};

  // Ref to hold the Monaco editor instance
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // Ref to hold the Monaco editor instance
  const monaco = useMonaco();

  // Compile all schemas to Ajv instance
  const ajv = new Ajv({ schemas: Object.values(schemas), strict: false });

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
   * Shows validation error in the Monaco editor
   * If the key is found, it is highlighted as error.
   * Otherwise, the whole JSON is highlighted.
   * @param {string | undefined} key - The key to highlight
   * @param {string} message - The error message
   */
  function showValidationError(key: string | undefined, message: string) {
    const model = editorRef.current?.getModel();
    if (!model) return showError("Unable to validate schema");

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

    if (!key || !keyFound) {
      monaco?.editor.setModelMarkers(model, "EthDebug", [
        {
          startLineNumber: 1,
          startColumn: 1,
          endColumn: 10,
          endLineNumber: lines.length,
          message,
          severity: monaco.MarkerSeverity.Error,
        },
      ]);
    }
  }

  /**
   * Clears validation errors in the Monaco editor
   */
  function clearValidationErrors() {
    const model = editorRef.current?.getModel();
    if (!model) return showError("Unable to validate schema");
    monaco?.editor.setModelMarkers(model, "EthDebug", []);
  }

  /**
   * Validates the schema using Ajv and displays errors in the Monaco editor
   */
  function validateSchema() {
    const validate = ajv.getSchema(props.schema.id);
    if (!validate) return showError("Unable to validate schema");
    const isValid = validate(getParsedEditorInput());

    clearValidationErrors();

    validate.errors?.forEach((error: ErrorObject) => {
      let key = error.instancePath.split("/").pop();
      if (!isValid && error.message) {
        showValidationError(key, getFormattedErrorMessage(error));
      }
    });
  }

  /**
   * Parses the editor input into a JSON object
   * @returns {Object} - Parsed JSON object
   */
  function getParsedEditorInput() {
    try {
      return JSON.parse(editorInput);
    } catch {
      showError("Schema is NOT a valid JSON.");
    }
  }

  /**
   * Formats an error message based on the Ajv ErrorObject.
   * If instancePath exists, it is included in the message.
   * If params.allowedValue exists, an additional message about the allowed value is included.
   *
   * @param {ErrorObject} error - The Ajv ErrorObject containing details about the validation error.
   * @returns {string} - The formatted error message.
   */
  function getFormattedErrorMessage(error: ErrorObject): string {
    const instancePathMessage = error.instancePath
      ? `${error.instancePath}: `
      : "";
    const allowedValueMessage =
      error.params && error.params.allowedValue
        ? `Allowed value: ${error.params.allowedValue}.`
        : "";
    return `${instancePathMessage}${error.message}. ${allowedValueMessage}`;
  }

  /**
   * Displays an error message in the console
   * @param {string} error - The error message
   */
  function showError(error: string) {}

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
        defaultValue={JSON.stringify(exampleSchema, undefined, 2)}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
      />
    </section>
  );
}
