/*
 * Copyright (C) 2025 TomTom Navigation B.V.
 * Licensed under the Apache License, Version 2.0
 */

import { App } from "@modelcontextprotocol/ext-apps";
import { bboxFromGeoJSON, type Place, type PolygonFeature } from "@tomtom-org/maps-sdk/core";
import { TomTomMap, PlacesModule, GeometriesModule } from "@tomtom-org/maps-sdk/map";
import { createMapControls } from "../../shared/map-controls";
import { shouldShowUI, showMapUI, hideMapUI, showErrorUI } from "../../shared/ui-visibility";
import { extractFullData } from "../../shared/decompress";
import { ensureTomTomConfigured } from "../../shared/sdk-config";
import "./styles.css";

// State tracking - map initialized lazily only when show_ui is true
let map: TomTomMap | null = null;
let placesModule: PlacesModule | null = null;
let geometriesModule: GeometriesModule | null = null;
let isReady = false;
let pendingData: PolygonFeature | null = null;

// App instance created early so we can reference it
const app = new App({ name: "TomTom Reachable Range", version: "1.0.0" });

async function initializeMap() {
  if (map) return; // Already initialized

  // Ensure TomTom SDK is configured with API key from server
  await ensureTomTomConfigured(app);

  map = new TomTomMap({
    mapLibre: { container: "sdk-map", center: [0, 20], zoom: 2 },
  });

  placesModule = await PlacesModule.get(map, {
    text: { title: () => "Center" },
    theme: "pin",
  });

  // Use GeometriesModule with inverted theme to highlight the reachable area
  // by darkening everything outside the polygon boundary
  geometriesModule = await GeometriesModule.get(map);

  // Add map controls for theme and traffic
  await createMapControls(map, {
    position: "top-right",
    showTrafficToggle: true,
    showThemeToggle: true,
  });

  isReady = true;
  if (pendingData) {
    processData(pendingData);
    pendingData = null;
  }
}

function processData(rangeFeature: PolygonFeature) {
  if (!map || !geometriesModule) return;

  // SDK calculateReachableRange returns a GeoJSON PolygonFeature directly
  if (!rangeFeature?.geometry) {
    void clear();
    return;
  }

  const geometry = rangeFeature.geometry;

  // Handle polygon geometry from SDK
  if (geometry?.type === "Polygon") {
    void geometriesModule.show({
      type: "FeatureCollection" as const,
      features: [rangeFeature],
    } as Parameters<typeof geometriesModule.show>[0]);

    // Show center marker — SDK stores origin in properties.origin (HasLngLat)
    const origin = (rangeFeature.properties as Record<string, unknown>)?.origin;
    if (placesModule && origin) {
      // HasLngLat can be [lng, lat] array or { lon, lat } object
      const originVal = origin as [number, number] | { lon?: number; lng?: number; lat: number };
      const coords: [number, number] = Array.isArray(originVal)
        ? [originVal[0], originVal[1]]
        : [(originVal.lon ?? originVal.lng) as number, originVal.lat];
      void placesModule.show([
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: coords },
          properties: {},
        } as unknown as Place,
      ]);
    }

    // Fit bounds using SDK utility
    const bbox = bboxFromGeoJSON(rangeFeature);
    if (bbox) {
      map.mapLibreMap.fitBounds(bbox, {
        padding: 50,
      });
    }
  }
}

async function displayRange(apiResponse: PolygonFeature) {
  if (!isReady) {
    pendingData = apiResponse;
    return;
  }
  processData(apiResponse);
}

async function clear() {
  if (!map) return;
  if (geometriesModule) await geometriesModule.clear();
  if (placesModule) await placesModule.clear();
}

app.ontoolresult = async (r) => {
  if (r.isError) {
    showErrorUI();
    return;
  }
  try {
    if (r.content[0].type === "text") {
      const apiResponse = JSON.parse(r.content[0].text) as unknown;
      if (!shouldShowUI(apiResponse)) {
        hideMapUI();
        return;
      }
      // Only initialize map when we actually need to show UI
      showMapUI();
      await initializeMap();
      // Fetch full data from cache using viz_id
      void displayRange((await extractFullData(app, apiResponse)) as PolygonFeature);
    }
  } catch (e) {
    console.error(e);
  }
};

app.onteardown = async () => {
  await clear();
  return {};
};

app.connect();
