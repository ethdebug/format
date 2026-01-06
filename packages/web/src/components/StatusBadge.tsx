import React from "react";
import Link from "@docusaurus/Link";
import {
  statusLevels,
  type StatusLevel,
} from "@site/src/status/status-config";
import styles from "./StatusBadge.module.css";

export interface StatusBadgeProps {
  status: StatusLevel;
  size?: "small" | "medium" | "large";
  linkToStatus?: boolean;
}

export default function StatusBadge({
  status,
  size = "medium",
  linkToStatus = true,
}: StatusBadgeProps): JSX.Element {
  const info = statusLevels[status];

  const badge = (
    <span
      className={`${styles.badge} ${styles[size]} ${styles[status]}`}
      title={info.description}
    >
      {info.label}
    </span>
  );

  if (linkToStatus) {
    return (
      <Link to="/status" className={styles.link}>
        {badge}
      </Link>
    );
  }

  return badge;
}
