/**
 * Component for displaying resolved regions and their values.
 */

import React from "react";
import type { Cursor, Data } from "@ethdebug/pointers";
import { formatData, formatDataShort } from "#utils/mockState";

export interface RegionOutputProps {
  /** Resolved regions to display */
  regions: Cursor.Region[];
  /** Values read from each region */
  values: Map<Cursor.Region, Data>;
  /** Whether to show full hex values or shortened */
  showFullValues?: boolean;
}

/**
 * Get the location type from a region.
 */
function getLocationType(region: Cursor.Region): string {
  if ("location" in region && typeof region.location === "string") {
    return region.location;
  }
  return "unknown";
}

/**
 * Get CSS class for a location type.
 */
function getLocationClass(location: string): string {
  const locationClasses: Record<string, string> = {
    storage: "region-storage",
    memory: "region-memory",
    stack: "region-stack",
    calldata: "region-calldata",
    returndata: "region-returndata",
    code: "region-code",
    transient: "region-transient",
  };
  return locationClasses[location] || "region-unknown";
}

/**
 * Component to display a single region with its value.
 */
function RegionItem({
  region,
  value,
  showFullValues,
  index,
}: {
  region: Cursor.Region;
  value: Data | undefined;
  showFullValues: boolean;
  index: number;
}): JSX.Element {
  const location = getLocationType(region);
  const locationClass = getLocationClass(location);
  const name = "name" in region ? (region.name as string) : undefined;

  // Format the value
  const valueDisplay = value
    ? showFullValues
      ? formatData(value)
      : formatDataShort(value, 16)
    : "(no value)";

  return (
    <div className={`region-output-item ${locationClass}`}>
      <div className="region-output-header">
        <span className="region-output-index">#{index + 1}</span>
        <span className="region-location-badge">{location}</span>
        {name && <span className="region-name-badge">{name}</span>}
      </div>
      <div className="region-output-details">
        {"slot" in region && region.slot !== undefined && (
          <div className="region-output-field">
            <span className="region-field-label">slot:</span>
            <code className="region-field-value">
              {formatData(region.slot)}
            </code>
          </div>
        )}
        {"offset" in region && region.offset !== undefined && (
          <div className="region-output-field">
            <span className="region-field-label">offset:</span>
            <code className="region-field-value">
              {formatData(region.offset)}
            </code>
          </div>
        )}
        {"length" in region && region.length !== undefined && (
          <div className="region-output-field">
            <span className="region-field-label">length:</span>
            <code className="region-field-value">
              {formatData(region.length)}
            </code>
          </div>
        )}
      </div>
      <div className="region-output-value">
        <span className="region-value-label">value:</span>
        <code
          className={`region-value-data ${!value ? "no-value" : ""}`}
          title={value ? formatData(value) : undefined}
        >
          {valueDisplay}
        </code>
      </div>
    </div>
  );
}

/**
 * Component to display all resolved regions and their values.
 */
export function RegionOutput({
  regions,
  values,
  showFullValues = false,
}: RegionOutputProps): JSX.Element {
  if (regions.length === 0) {
    return (
      <div className="region-output region-output-empty">
        <span className="region-output-empty-text">No regions resolved</span>
      </div>
    );
  }

  return (
    <div className="region-output">
      <div className="region-output-summary">
        {regions.length} region{regions.length !== 1 ? "s" : ""} resolved
      </div>
      <div className="region-output-list">
        {regions.map((region, index) => (
          <RegionItem
            key={index}
            region={region}
            value={values.get(region)}
            showFullValues={showFullValues}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}
