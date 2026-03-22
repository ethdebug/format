import React from "react";
import Link from "@docusaurus/Link";
import styles from "./SpecLink.module.css";

export interface SpecLinkProps {
  /**
   * The schema ID (e.g., "ethdebug/format/type", "ethdebug/format/pointer")
   */
  schema: string;
  /**
   * The URL path to the spec page (e.g., "/spec/type/overview")
   */
  href: string;
}

/**
 * A badge-style link to the specification for a schema.
 * Place this near the top of reference documentation pages.
 */
export default function SpecLink({ schema, href }: SpecLinkProps): JSX.Element {
  return (
    <div className={styles.container}>
      <Link to={href} className={styles.link}>
        <span className={styles.label}>Schema:</span>
        <span className={styles.schema}>{schema}</span>
        <span className={styles.arrow}>→</span>
      </Link>
    </div>
  );
}
