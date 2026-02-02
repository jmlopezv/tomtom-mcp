/*
 * Copyright (C) 2025 TomTom Navigation B.V.
 * Licensed under the Apache License, Version 2.0
 */

import { App } from '@modelcontextprotocol/ext-apps';
import { TomTomConfig, bboxFromGeoJSON } from '@tomtom-org/maps-sdk/core';
import { TomTomMap, PlacesModule } from '@tomtom-org/maps-sdk/map';
import { createMapControls } from '../../shared/map-controls';
import { setupPoiPopups, closePoiPopup } from '../../shared/poi-popup';
import { parseSearchResponse } from '../../shared/sdk-parsers';
import { API_KEY } from '../../shared/config';
import './styles.css';

TomTomConfig.instance.put({ apiKey: API_KEY, language: 'en-GB' });

const map = new TomTomMap({
  mapLibre: { container: 'sdk-map', center: [4.8156, 52.4414], zoom: 8 },
});

let placesModule: PlacesModule | null = null;

(async () => {
  placesModule = await PlacesModule.get(map, {
    text: { title: (p: any) => p.properties.poi?.name || p.properties.address?.freeformAddress || 'Unknown' },
    theme: 'pin',
  });

  // Setup click handlers for POI popups
  setupPoiPopups(map, placesModule);

  // Add map controls for theme and traffic
  await createMapControls(map, {
    position: 'top-right',
    showTrafficToggle: true,
    showThemeToggle: true,
  });
})();

async function displayResults(apiResponse: any) {
  if (!placesModule) return;

  // Use SDK's built-in parser for correct format
  const searchResult = parseSearchResponse(apiResponse);

  if (!searchResult.features?.length) {
    await placesModule.clear();
    return;
  }

  await placesModule.show(searchResult.features as any);

  // Fit bounds using SDK utility
  const bbox = bboxFromGeoJSON(searchResult);
  if (bbox) {
    map.mapLibreMap.fitBounds(bbox as [number, number, number, number], {
      padding: 50,
      maxZoom: 15,
    });
  }
}

const app = new App({ name: 'TomTom Fuzzy Search', version: '1.0.0' });
app.ontoolresult = (r) => {
  if (r.isError) return;
  try { if (r.content[0].type === 'text') displayResults(JSON.parse(r.content[0].text)); }
  catch (e) { console.error(e); }
};
app.onteardown = async () => { closePoiPopup(); if (placesModule) await placesModule.clear(); return {}; };
app.connect();
