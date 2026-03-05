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
 *
 * Search SDK Service
 * Uses TomTom Maps SDK search(), geocode(), and reverseGeocode() directly
 * instead of raw REST API calls.
 */

import {
  search,
  geocode,
  reverseGeocode as sdkReverseGeocode,
  type SearchResponse,
  type FuzzySearchParams,
  type GeocodingResponse,
  type ReverseGeocodingResponse,
} from "@tomtom-org/maps-sdk/services";
import { getEffectiveApiKey } from "../base/tomtomClient";
import { logger } from "../../utils/logger";
import type { Position } from "geojson";
import type { BBox, Language } from "@tomtom-org/maps-sdk/core";

// Options shared by multiple search functions
interface BaseSearchOptions {
  limit?: number;
  language?: string;
  countries?: string[];
  position?: Position;
  radius?: number;
  boundingBox?: BBox;
}

interface FuzzySearchOptions extends BaseSearchOptions {
  typeahead?: boolean;
  minFuzzyLevel?: number;
  maxFuzzyLevel?: number;
  categorySet?: string;
  // Legacy compat: still accept countrySet string
  countrySet?: string;
  // Legacy compat: still accept separate lat/lon
  lat?: number;
  lon?: number;
  topLeft?: string;
  btmRight?: string;
}

interface NearbySearchOptions {
  radius?: number;
  limit?: number;
  language?: Language;
  countries?: string[];
  categorySet?: string;
  countrySet?: string;
}

interface GeocodeOptions extends BaseSearchOptions {
  countrySet?: string;
  // Legacy compat
  lat?: number;
  lon?: number;
  topLeft?: string;
  btmRight?: string;
}

interface ReverseGeocodeOptions {
  language?: Language;
  radius?: number;
}

/**
 * Helper: normalize countries array or legacy countrySet string to SDK countries array
 */
function toCountries(countries?: string[], countrySet?: string): string[] | undefined {
  if (countries && countries.length > 0) return countries;
  if (countrySet) return countrySet.split(",").map((c) => c.trim());
  return undefined;
}

/**
 * Helper: normalize categorySet string/number array to SDK poiCategories number array
 */
function toPoiCategories(categorySet?: string | number[]): number[] | undefined {
  if (!categorySet) return undefined;
  if (Array.isArray(categorySet)) return categorySet.map(Number);
  return categorySet
    .split(",")
    .map((c) => Number.parseInt(c.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

/**
 * Helper: parse legacy "lat,lon" bounding box strings into SDK [minLon, minLat, maxLon, maxLat]
 */
function parseLegacyBoundingBox(topLeft?: string, btmRight?: string): BBox | undefined {
  if (!topLeft || !btmRight) return undefined;
  const [tlLat, tlLon] = topLeft.split(",").map(Number);
  const [brLat, brLon] = btmRight.split(",").map(Number);
  return [tlLon, brLat, brLon, tlLat]; // [minLon, minLat, maxLon, maxLat]
}

/**
 * Helper: resolve position from options — accepts new Position tuple or legacy lat/lon
 */
function resolvePosition(options: FuzzySearchOptions | GeocodeOptions): Position | undefined {
  if (options.position) return options.position;
  if (options.lat !== undefined && options.lon !== undefined) {
    return [options.lon, options.lat];
  }
  return undefined;
}

/**
 * Helper: resolve bounding box from options — accepts new tuple or legacy string pair
 */
function resolveBoundingBox(options: FuzzySearchOptions | GeocodeOptions): BBox | undefined {
  if (options.boundingBox) return options.boundingBox;
  return parseLegacyBoundingBox(options.topLeft, options.btmRight);
}

/**
 * Searches for places based on a free-text query
 */
export async function searchPlaces(query: string): Promise<SearchResponse> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) throw new Error("API key not available");

  logger.debug({ query }, "Searching for places via SDK");
  return search({ apiKey, query, limit: 10 });
}

/**
 * Performs a fuzzy search for places, addresses, and POIs with advanced options
 */
export async function fuzzySearch(
  query: string,
  options?: FuzzySearchOptions
): Promise<SearchResponse> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) throw new Error("API key not available");

  logger.debug({ query }, "Fuzzy searching via SDK");

  const params: Record<string, unknown> = {
    apiKey,
    query,
    limit: options?.limit ?? 10,
  };

  const position = options ? resolvePosition(options) : undefined;
  if (position) params.position = position;
  if (options?.radius !== undefined) params.radiusMeters = options.radius;
  if (options?.language !== undefined) params.language = options.language;
  if (options?.typeahead !== undefined) params.typeahead = options.typeahead;
  if (options?.minFuzzyLevel !== undefined) params.minFuzzyLevel = options.minFuzzyLevel;
  if (options?.maxFuzzyLevel !== undefined) params.maxFuzzyLevel = options.maxFuzzyLevel;

  const countries = toCountries(options?.countries, options?.countrySet);
  if (countries) params.countries = countries;

  const poiCategories = toPoiCategories(options?.categorySet);
  if (poiCategories) params.poiCategories = poiCategories;

  const boundingBox = options ? resolveBoundingBox(options) : undefined;
  if (boundingBox) params.boundingBox = boundingBox;

  return search(params as Parameters<typeof search>[0]);
}

/**
 * Search specifically for Points of Interest (POIs)
 */
export async function poiSearch(
  query: string,
  options?: FuzzySearchOptions
): Promise<SearchResponse> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) throw new Error("API key not available");

  logger.debug({ query }, "POI searching via SDK");

  const params: Record<string, unknown> = {
    apiKey,
    query,
    indexes: ["POI"],
    limit: options?.limit ?? 10,
  };

  const position = options ? resolvePosition(options) : undefined;
  if (position) params.position = position;
  if (options?.radius !== undefined) params.radiusMeters = options.radius;
  if (options?.language !== undefined) params.language = options.language;

  const countries = toCountries(options?.countries, options?.countrySet);
  if (countries) params.countries = countries;

  const poiCategories = toPoiCategories(options?.categorySet);
  if (poiCategories) params.poiCategories = poiCategories;

  return search(params as Parameters<typeof search>[0]);
}

/**
 * Geocodes an address to coordinates
 */
export async function geocodeAddress(query: string, options?: GeocodeOptions): Promise<GeocodingResponse> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) throw new Error("API key not available");

  logger.debug({ query }, "Geocoding via SDK");

  const params: Record<string, unknown> = {
    apiKey,
    query,
    limit: options?.limit ?? 10,
  };

  if (options?.language !== undefined) params.language = options.language;

  const countries = toCountries(options?.countries, options?.countrySet);
  if (countries) params.countrySet = countries;

  const position = options ? resolvePosition(options) : undefined;
  if (position) params.position = position;

  const boundingBox = options ? resolveBoundingBox(options) : undefined;
  if (boundingBox) params.boundingBox = boundingBox;

  return geocode(params as Parameters<typeof geocode>[0]);
}

/**
 * Reverse geocodes coordinates to an address.
 * @param position [longitude, latitude] (GeoJSON convention)
 */
export async function reverseGeocode(
  position: Position,
  options?: ReverseGeocodeOptions
): Promise<ReverseGeocodingResponse> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) throw new Error("API key not available");

  logger.debug({ lng: position[0], lat: position[1] }, "Reverse geocoding via SDK");

  const params: Record<string, unknown> = {
    apiKey,
    position,
  };

  if (options?.language !== undefined) params.language = options.language;
  if (options?.radius !== undefined) params.radius = options.radius;

  return sdkReverseGeocode(params as Parameters<typeof sdkReverseGeocode>[0]);
}

/**
 * Searches for points of interest (POIs) near a location.
 * @param position [longitude, latitude] (GeoJSON convention)
 * @param options
 */
export async function searchNearby(
  position: Position,
  options?: NearbySearchOptions
): Promise<SearchResponse> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) throw new Error("API key not available");

  logger.debug(
    { lng: position[0], lat: position[1], radius: options?.radius ?? 1000 },
    "Nearby search via SDK"
  );

  const params: FuzzySearchParams = {
    apiKey,
    query: ".",
    position,
    radiusMeters: options?.radius ?? 1000,
    limit: options?.limit ?? 20,
  };

  if (options?.language) params.language = options.language;

  const countries = toCountries(options?.countries, options?.countrySet);
  if (countries) params.countries = countries;

  const poiCategories = toPoiCategories(options?.categorySet);
  if (poiCategories) params.poiCategories = poiCategories;

  return search(params);
}
