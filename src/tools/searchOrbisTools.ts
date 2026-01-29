/*
 * Copyright (C) 2025 TomTom Navigation B.V.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// tools/searchTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { schemas } from "../schemas/indexOrbis";
import {
  createGeocodeHandler,
  createReverseGeocodeHandler,
  createFuzzySearchHandler,
  createPoiSearchHandler,
  createNearbySearchHandler,
} from "../handlers/searchOrbisHandler";
import fs from "node:fs/promises";
import path from "node:path";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps/server";
import { fileURLToPath } from "node:url";

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resource URI for the POI search MCP app
const POI_SEARCH_RESOURCE_URI = "ui://tomtom-poi-search/mcp-app.html";

/**
 * Creates and registers search-related tools
 */
export function createSearchOrbisTools(server: McpServer): void {
  // Register the POI search UI resource
  registerAppResource(
    server,
    POI_SEARCH_RESOURCE_URI,
    POI_SEARCH_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const htmlPath = path.join(__dirname, "ui_resources/mcp-app.html");
      try {
        const html = await fs.readFile(htmlPath, "utf-8");
        return {
          contents: [{
            uri: POI_SEARCH_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
                ui: {
                    csp: {
                        connectDomains: [
                            "https://api.tomtom.com",
                            "https://*.api.tomtom.com",
                            "https://unpkg.com",
                        ],
                        resourceDomains: [
                            "https://unpkg.com",
                        ],
                        styleDomains: [
                            "https://unpkg.com",
                        ],
                    },
                },
            },
          }],
        };
      } catch (error) {
        console.error("Failed to load MCP app HTML:", error);
        return {
          contents: [{
            uri: POI_SEARCH_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: `<!DOCTYPE html><html><head><title>Error</title></head><body><p>Failed to load POI Search UI. Run <code>npm run build:ui</code>.</p></body></html>`,
          }],
        };
      }
    }
  );

  // Geocode tool
  server.registerTool(
    "tomtom-geocode",
    {
      title: "TomTom Geocode",
      description: "Convert street addresses to coordinates (does not support points of interest)",
      inputSchema: schemas.tomtomGeocodeSearchSchema as any,
      _meta: { backend: "orbis" },
    },
    createGeocodeHandler() as any
  );

  // Reverse geocode tool
  server.registerTool(
    "tomtom-reverse-geocode",
    {
      title: "TomTom Reverse Geocode",
      description: "Convert coordinates to addresses",
      inputSchema: schemas.tomtomReverseGeocodeSearchSchema as any,
      _meta: { backend: "orbis" },
    },
    createReverseGeocodeHandler() as any
  );

  // Fuzzy search tool
  server.registerTool(
    "tomtom-fuzzy-search",
    {
      title: "TomTom Fuzzy Search",
      description: "Typo-tolerant search for addresses, points of interest, and geographies",
      inputSchema: schemas.tomtomFuzzySearchSchema as any,
      _meta: { backend: "orbis" },
    },
    createFuzzySearchHandler() as any
  );

  // POI search tool with UI
  registerAppTool(
    server,
    "tomtom-poi-search",
    {
      title: "TomTom POI Search",
      description: "Find specific business categories with interactive UI",
      inputSchema: schemas.tomtomPOISearchSchema as any,
      _meta: {
        backend: "orbis",
        [RESOURCE_URI_META_KEY]: POI_SEARCH_RESOURCE_URI,
      },
    },
    createPoiSearchHandler() as any
  );


  // Nearby search tool
  server.registerTool(
    "tomtom-nearby",
    {
      title: "TomTom Nearby Search",
      description: "Discover services within a radius",
      inputSchema: schemas.tomtomNearbySearchSchema as any,
      _meta: { backend: "orbis" },
    },
    createNearbySearchHandler() as any
  );
}
