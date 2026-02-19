/**
 * Monaco editor language configuration for the BUG language.
 *
 * This module provides language definition and syntax highlighting for BUG
 * source code in Monaco editor instances.
 */

/**
 * BUG language keywords.
 */
export const keywords = [
  "contract",
  "function",
  "let",
  "if",
  "else",
  "while",
  "return",
  "storage",
  "memory",
  "calldata",
  "emit",
  "event",
  "mapping",
  "struct",
  "public",
  "private",
  "internal",
  "external",
  "view",
  "pure",
  "payable",
  "constant",
  "immutable",
];

/**
 * BUG language type keywords.
 */
export const typeKeywords = [
  "uint256",
  "uint128",
  "uint64",
  "uint32",
  "uint16",
  "uint8",
  "int256",
  "int128",
  "int64",
  "int32",
  "int16",
  "int8",
  "bool",
  "address",
  "bytes32",
  "bytes",
  "string",
];

/**
 * BUG language operators.
 */
export const operators = [
  "=",
  ">",
  "<",
  "!",
  "~",
  "?",
  ":",
  "==",
  "<=",
  ">=",
  "!=",
  "&&",
  "||",
  "++",
  "--",
  "+",
  "-",
  "*",
  "/",
  "&",
  "|",
  "^",
  "%",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "&=",
  "|=",
  "^=",
  "%=",
  "<<=",
  ">>=",
];

/**
 * Monaco language ID for BUG.
 */
export const languageId = "bug";

/**
 * Monaco Monarch tokenizer configuration for BUG syntax highlighting.
 */
export const monarchTokensProvider = {
  keywords,
  typeKeywords,
  operators,

  symbols: /[=><!~?:&|+\-*/^%]+/,

  escapes:
    /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      // Identifiers and keywords
      [
        /[a-zA-Z_$][\w$]*/,
        {
          cases: {
            "@keywords": "keyword",
            "@typeKeywords": "type",
            "@default": "identifier",
          },
        },
      ],

      // Whitespace
      { include: "@whitespace" },

      // Delimiters and operators
      [/[{}()[\]]/, "@brackets"],
      [/[<>](?!@symbols)/, "@brackets"],
      [
        /@symbols/,
        {
          cases: {
            "@operators": "operator",
            "@default": "",
          },
        },
      ],

      // Numbers
      [/\d*\.\d+([eE][-+]?\d+)?/, "number.float"],
      [/0[xX][0-9a-fA-F]+/, "number.hex"],
      [/\d+/, "number"],

      // Delimiter: after number because of .\d floats
      [/[;,.]/, "delimiter"],

      // Strings
      [/"([^"\\]|\\.)*$/, "string.invalid"],
      [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],

      // Characters
      [/'[^\\']'/, "string"],
      [/(')(@escapes)(')/, ["string", "string.escape", "string"]],
      [/'/, "string.invalid"],
    ],

    comment: [
      [/[^/*]+/, "comment"],
      [/\/\*/, "comment", "@push"],
      ["\\*/", "comment", "@pop"],
      [/[/*]/, "comment"],
    ],

    string: [
      [/[^\\"]+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
    ],

    whitespace: [
      [/[ \t\r\n]+/, "white"],
      [/\/\*/, "comment", "@comment"],
      [/\/\/.*$/, "comment"],
    ],
  },
};

/**
 * Monaco language configuration for BUG.
 */
export const languageConfiguration = {
  comments: {
    lineComment: "//",
    blockComment: ["/*", "*/"] as [string, string],
  },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ] as [string, string][],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
};

/**
 * Register the BUG language with a Monaco editor instance.
 *
 * @param monaco - The Monaco editor module
 */
export function registerBugLanguage(
  monaco: typeof import("monaco-editor"),
): void {
  // Register the language
  monaco.languages.register({ id: languageId });

  // Set the language configuration
  monaco.languages.setLanguageConfiguration(
    languageId,
    languageConfiguration as import("monaco-editor").languages.LanguageConfiguration,
  );

  // Set the tokenizer
  monaco.languages.setMonarchTokensProvider(
    languageId,
    monarchTokensProvider as import("monaco-editor").languages.IMonarchLanguage,
  );
}
