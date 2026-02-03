/*
 * Copyright (C) 2025 TomTom Navigation B.V.
 * Licensed under the Apache License, Version 2.0
 */

/**
 * Utility to check if the UI should be displayed based on the tool response.
 *
 * When show_ui is false, the App should minimize its footprint - showing only
 * a small indicator that data was received but no interactive map visualization.
 * This is useful for intermediate operations (e.g., geocoding as part of routing).
 *
 * @param apiResponse - The parsed API response from the tool
 * @returns true if UI should be displayed, false otherwise
 */
export function shouldShowUI(apiResponse: any): boolean {
  // Default to true if _meta or show_ui is not present
  if (!apiResponse?._meta) return true;
  if (typeof apiResponse._meta.show_ui !== 'boolean') return true;
  return apiResponse._meta.show_ui;
}

/**
 * Hides the map container and shows a compact status indicator.
 * Call this when show_ui is false.
 */
export function hideMapUI(): void {
  const mapContainer = document.getElementById('sdk-map');
  if (mapContainer) {
    mapContainer.style.display = 'none';
  }

  // Create compact status indicator
  let indicator = document.getElementById('ui-hidden-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'ui-hidden-indicator';
    indicator.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        border: 1px solid #dee2e6;
        border-radius: 8px;
        margin: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="font-size: 13px; font-weight: 600; color: #212529;">Data processed successfully</span>
          <span style="font-size: 11px; color: #6c757d;">Map visualization skipped for this step</span>
        </div>
      </div>
    `;
    document.body.appendChild(indicator);
  }
  indicator.style.display = 'block';
}

/**
 * Shows the map container and hides the minimal indicator.
 * Call this when show_ui is true (default behavior).
 */
export function showMapUI(): void {
  const mapContainer = document.getElementById('sdk-map');
  if (mapContainer) {
    mapContainer.style.display = 'block';
  }

  const indicator = document.getElementById('ui-hidden-indicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
}
