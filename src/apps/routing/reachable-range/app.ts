/*
 * Copyright (C) 2025 TomTom Navigation B.V.
 * Licensed under the Apache License, Version 2.0
 */

import { App } from '@modelcontextprotocol/ext-apps';
import { TomTomConfig, bboxFromGeoJSON } from '@tomtom-org/maps-sdk/core';
import { TomTomMap, PlacesModule } from '@tomtom-org/maps-sdk/map';
import { createMapControls } from '../../shared/map-controls';
import { parseReachableRangeResponse } from '../../shared/sdk-parsers';
import { shouldShowUI, hideMapUI } from '../../shared/ui-visibility';
import { API_KEY } from '../../shared/config';
import './styles.css';

TomTomConfig.instance.put({ apiKey: API_KEY, language: 'en-GB' });

const map = new TomTomMap({
  mapLibre: { container: 'sdk-map', center: [4.8156, 52.4414], zoom: 8 },
});

let placesModule: PlacesModule | null = null;
const rangeSourceId = 'range-source';
const rangeFillId = 'range-fill';
const rangeLineId = 'range-line';

(async () => {
  placesModule = await PlacesModule.get(map, {
    text: { title: () => 'Center' },
    theme: 'pin',
  });

  // Add map controls for theme and traffic
  await createMapControls(map, {
    position: 'top-right',
    showTrafficToggle: true,
    showThemeToggle: true,
  });

  map.mapLibreMap.on('load', () => {
    map.mapLibreMap.addSource(rangeSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.mapLibreMap.addLayer({ id: rangeFillId, type: 'fill', source: rangeSourceId, paint: { 'fill-color': '#4a90e2', 'fill-opacity': 0.3 } });
    map.mapLibreMap.addLayer({ id: rangeLineId, type: 'line', source: rangeSourceId, paint: { 'line-color': '#4a90e2', 'line-width': 2 } });
  });
})();

async function displayRange(apiResponse: any) {
  // Use SDK's built-in parser for correct format
  const rangeResult = parseReachableRangeResponse(apiResponse);

  if (!rangeResult?.features?.length) {
    await clear();
    return;
  }

  const rangeFeature = rangeResult.features[0];
  const geometry = rangeFeature.geometry;

  // Handle polygon geometry from SDK parser
  if (geometry.type === 'Polygon') {
    const src = map.mapLibreMap.getSource(rangeSourceId) as any;
    if (src) src.setData(rangeFeature);

    // Show center marker if available in properties
    const center = rangeFeature.properties?.center;
    if (placesModule && center) {
      await placesModule.show([{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [center.longitude, center.latitude] },
        properties: { label: 'Center' },
      }]);
    }

    // Fit bounds using SDK utility
    const bbox = bboxFromGeoJSON(rangeResult);
    if (bbox) {
      map.mapLibreMap.fitBounds(bbox as [number, number, number, number], {
        padding: 50,
      });
    }
  }
}

async function clear() {
  const src = map.mapLibreMap.getSource(rangeSourceId) as any;
  if (src) src.setData({ type: 'FeatureCollection', features: [] });
  if (placesModule) await placesModule.clear();
}

const app = new App({ name: 'TomTom Reachable Range', version: '1.0.0' });
app.ontoolresult = (r) => {
  if (r.isError) return;
  try {
    if (r.content[0].type === 'text') {
      const apiResponse = JSON.parse(r.content[0].text);
      if (!shouldShowUI(apiResponse)) {
        hideMapUI();
        return;
      }
      displayRange(apiResponse);
    }
  } catch (e) { console.error(e); }
};
app.onteardown = async () => { await clear(); return {}; };
app.connect();
