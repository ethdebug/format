import React from "react";
import Link from "@docusaurus/Link";
import { schemaStatus } from "@site/src/status/status-config";
import StatusBadge from "./StatusBadge";
import styles from "./StatusTable.module.css";

const schemaOrder = [
  "pointer",
  "type",
  "program",
  "data",
  "materials",
  "info",
] as const;

const schemaNames: Record<string, string> = {
  pointer: "ethdebug/format/pointer",
  type: "ethdebug/format/type",
  program: "ethdebug/format/program",
  data: "ethdebug/format/data",
  materials: "ethdebug/format/materials",
  info: "ethdebug/format/info",
};

export default function StatusTable(): JSX.Element {
  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Schema</th>
            <th>Status</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {schemaOrder.map((key) => {
            const info = schemaStatus[key];
            return (
              <tr key={key}>
                <td>
                  <Link to={info.detailsPath} className={styles.schemaName}>
                    {schemaNames[key]}
                  </Link>
                </td>
                <td>
                  <StatusBadge
                    status={info.level}
                    linkToStatus={false}
                    size="small"
                  />
                </td>
                <td className={styles.notes}>
                  {info.caveats.length > 0 ? (
                    <ul className={styles.caveats}>
                      {info.caveats.map((caveat, index) => (
                        <li key={index}>{caveat}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className={styles.stable}>Stable</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
