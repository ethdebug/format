/**
 * Component for displaying a map of named regions.
 */

import React from "react";
import type { Cursor } from "@ethdebug/pointers";
import { formatData } from "#utils/mockState";

export interface RegionMapProps {
  /** Named regions to display */
  regions: Record<string, Cursor.Region[]>;
  /** Currently selected region name */
  selectedName?: string;
  /** Callback when a region is clicked */
  onRegionClick?: (name: string, region: Cursor.Region) => void;
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
 * Format a region for display.
 */
function formatRegion(region: Cursor.Region): string {
  const location = getLocationType(region);
  const parts: string[] = [location];

  if ("slot" in region && region.slot !== undefined) {
    const slotHex = formatData(region.slot);
    parts.push(`slot: ${slotHex}`);
  }

  if ("offset" in region && region.offset !== undefined) {
    const offsetHex = formatData(region.offset);
    parts.push(`offset: ${offsetHex}`);
  }

  if ("length" in region && region.length !== undefined) {
    const lengthHex = formatData(region.length);
    parts.push(`length: ${lengthHex}`);
  }

  return parts.join(", ");
}

/**
 * Component to display a map of named regions.
 */
export function RegionMap({
  regions,
  selectedName,
  onRegionClick,
}: RegionMapProps): JSX.Element {
  const names = Object.keys(regions).sort();

  if (names.length === 0) {
    return (
      <div className="region-map region-map-empty">
        <span className="region-map-empty-text">No named regions</span>
      </div>
    );
  }

  return (
    <div className="region-map">
      {names.map((name) => {
        const regionList = regions[name];
        const isSelected = name === selectedName;

        return (
          <div
            key={name}
            className={`region-map-entry ${isSelected ? "selected" : ""}`}
          >
            <div className="region-map-name">{name}</div>
            <div className="region-map-regions">
              {regionList.map((region, index) => {
                const location = getLocationType(region);
                const locationClass = getLocationClass(location);

                return (
                  <div
                    key={index}
                    className={`region-map-region ${locationClass}`}
                    onClick={() => onRegionClick?.(name, region)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        onRegionClick?.(name, region);
                      }
                    }}
                  >
                    <span className="region-location-badge">{location}</span>
                    <span className="region-details">
                      {formatRegion(region)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
