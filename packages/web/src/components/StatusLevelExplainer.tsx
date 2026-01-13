import React from "react";
import { statusLevels, type StatusLevel } from "@site/src/status/status-config";
import StatusBadge from "./StatusBadge";
import styles from "./StatusLevelExplainer.module.css";

const levelOrder: StatusLevel[] = [
  "in-design",
  "implementable",
  "reference-available",
];

export default function StatusLevelExplainer(): JSX.Element {
  return (
    <div className={styles.container}>
      {levelOrder.map((level) => {
        const info = statusLevels[level];
        return (
          <div key={level} className={`${styles.level} ${styles[level]}`}>
            <div className={styles.badge}>
              <StatusBadge status={level} linkToStatus={false} size="large" />
            </div>
            <div className={styles.content}>
              <p className={styles.description}>{info.description}</p>
              <p className={styles.adoptersNote}>
                <strong>For implementers:</strong> {info.adoptersNote}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
