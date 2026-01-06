import React from "react";
import Link from "@docusaurus/Link";
import {
  schemaStatus,
  statusLevels,
} from "@site/src/status/status-config";
import StatusBadge from "./StatusBadge";
import styles from "./StatusBanner.module.css";

export interface StatusBannerProps {
  schema: keyof typeof schemaStatus;
}

export default function StatusBanner({
  schema,
}: StatusBannerProps): JSX.Element {
  const info = schemaStatus[schema];
  const levelInfo = statusLevels[info.level];

  return (
    <div className={`${styles.banner} ${styles[info.level]}`}>
      <div className={styles.header}>
        <StatusBadge status={info.level} linkToStatus={false} size="large" />
      </div>
      <p className={styles.summary}>{info.summary}</p>
      {info.caveats.length > 0 && (
        <div className={styles.caveats}>
          <strong>Known limitations:</strong>
          <ul>
            {info.caveats.map((caveat, index) => (
              <li key={index}>{caveat}</li>
            ))}
          </ul>
        </div>
      )}
      <p className={styles.note}>{levelInfo.adoptersNote}</p>
      {info.referenceUrl && (
        <p className={styles.reference}>
          <Link to={info.referenceUrl}>
            View reference implementation guide &rarr;
          </Link>
        </p>
      )}
      <p className={styles.learnMore}>
        <Link to="/status">Learn more about status levels &rarr;</Link>
      </p>
    </div>
  );
}
