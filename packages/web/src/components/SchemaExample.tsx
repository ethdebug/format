import React from "react";
import Link from "@docusaurus/Link";
import CodeBlock from "@theme/CodeBlock";
import styles from "./SchemaExample.module.css";

export interface SchemaExampleProps {
  /**
   * The schema ID (e.g., "ethdebug/format/type", "pointer/region/memory")
   * Can be a short form like "type" or full form like "ethdebug/format/type"
   */
  schema: string;
  /**
   * The URL path to the spec page for this schema
   */
  href: string;
  /**
   * The JSON content to display (as a string or object)
   */
  children: string | object;
  /**
   * Optional title for the example
   */
  title?: string;
}

/**
 * A code block with a schema badge linking to the specification.
 * Use this for JSON examples that conform to a specific schema.
 */
export default function SchemaExample({
  schema,
  href,
  children,
  title,
}: SchemaExampleProps): JSX.Element {
  const code =
    typeof children === "string" ? children : JSON.stringify(children, null, 2);

  // Ensure schema displays with full "ethdebug/format/" prefix
  const displaySchema = schema.startsWith("ethdebug/format/")
    ? schema
    : `ethdebug/format/${schema}`;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {title && <span className={styles.title}>{title}</span>}
        <Link to={href} className={styles.schemaLink}>
          <span className={styles.schemaLabel}>Schema:</span>
          <span className={styles.schemaName}>{displaySchema}</span>
        </Link>
      </div>
      <CodeBlock language="json">{code}</CodeBlock>
    </div>
  );
}
