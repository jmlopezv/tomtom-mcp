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
 * Routing SDK Service
 * Uses TomTom Maps SDK calculateRoute() and calculateReachableRange() directly.
 */

import {
  calculateRoute,
  calculateReachableRange,
  type ReachableRangeParams,
  type CostModel,
  type MaxNumberOfAlternatives,
  type ReachableRangeBudget,
  type RouteType,
  type TrafficInput,
} from "@tomtom-org/maps-sdk/services";
import { Routes, Avoidable, TravelMode, PolygonFeature, Language } from "@tomtom-org/maps-sdk/core";
import type { Position } from "geojson";
import { getEffectiveApiKey } from "../base/tomtomClient";
import { logger } from "../../utils/logger";
import { IncorrectError } from "../../types/types";
import type { ReachableRangeOptionsOrbis } from "./types";

interface RouteOptions {
  routeType?: RouteType;
  traffic?: TrafficInput;
  avoid?: Avoidable | Avoidable[];
  travelMode?: TravelMode;
  departAt?: string;
  arriveAt?: string;
  maxAlternatives?: MaxNumberOfAlternatives;
  language?: Language;
  instructionsType?: string;
}

/**
 * Build SDK CalculateRouteParams from route options
 */
function buildSdkRouteParams(
  locations: Position[],
  options?: RouteOptions
): Record<string, unknown> {
  const params: Record<string, unknown> = { locations };

  // Cost model (routeType, traffic, avoid)
  const costModel: Record<string, unknown> = {};
  if (options?.routeType) costModel.routeType = options.routeType;
  if (options?.traffic) costModel.traffic = options.traffic;
  if (options?.avoid) {
    costModel.avoid = Array.isArray(options.avoid) ? options.avoid : [options.avoid];
  }
  if (Object.keys(costModel).length > 0) params.costModel = costModel;

  // Travel mode
  if (options?.travelMode) params.travelMode = options.travelMode;

  // Departure / arrival time
  if (options?.departAt) {
    params.when = { option: "departAt", date: new Date(options.departAt) };
  } else if (options?.arriveAt) {
    params.when = { option: "arriveBy", date: new Date(options.arriveAt) };
  }

  // Alternative routes
  if (options?.maxAlternatives !== undefined) params.maxAlternatives = options.maxAlternatives;

  // Language
  if (options?.language) params.language = options.language;

  // Guidance / instructions
  if (options?.instructionsType) {
    params.guidance = { type: options.instructionsType };
  }

  return params;
}

/**
 * Calculate a route through an ordered list of locations.
 * @param locations Array of [longitude, latitude] positions (GeoJSON convention)
 *   in the form [origin, ...intermediateStops, destination].
 *   Minimum 2 positions (origin + destination). Add intermediate positions for multi-stop routes.
 */
export async function getRoute(locations: Position[], options?: RouteOptions): Promise<Routes> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) throw new Error("API key not available");

  if (locations.length < 2) {
    throw new IncorrectError("At least two locations (origin and destination) are required", {
      location_count: locations.length,
      minimum_required: 2,
    });
  }

  logger.debug({ location_count: locations.length }, "Calculating route via SDK");

  const routeParams = buildSdkRouteParams(locations, options);
  routeParams.apiKey = apiKey;

  return calculateRoute(routeParams as Parameters<typeof calculateRoute>[0]);
}

/**
 * Map legacy flat budget parameters to SDK ReachableRangeBudget format.
 * SDK supports a single budget of one type.
 * Priority: time > distance > fuel > charge
 */
function buildSdkBudget(options: ReachableRangeOptionsOrbis): ReachableRangeBudget {
  if (options.timeBudgetInSec !== undefined) {
    return { type: "timeMinutes", value: options.timeBudgetInSec / 60 };
  }
  if (options.distanceBudgetInMeters !== undefined) {
    return { type: "distanceKM", value: options.distanceBudgetInMeters / 1000 };
  }
  if (options.fuelBudgetInLiters !== undefined) {
    return { type: "spentFuelLiters", value: options.fuelBudgetInLiters };
  }
  if (options.chargeBudgetPercent !== undefined) {
    return { type: "spentChargePCT", value: options.chargeBudgetPercent };
  }
  throw new IncorrectError(
    "At least one budget parameter (time, distance, fuel, or charge) must be provided",
    { provided_options: Object.keys(options) }
  );
}

/**
 * Calculate reachable range from a starting point using SDK.
 * Returns a GeoJSON PolygonFeature (SDK format).
 * @param origin [longitude, latitude] (GeoJSON convention)
 */
export async function getReachableRange(
  origin: Position,
  options: ReachableRangeOptionsOrbis
): Promise<PolygonFeature<ReachableRangeParams>> {
  if (
    options.timeBudgetInSec === undefined &&
    options.distanceBudgetInMeters === undefined &&
    options.chargeBudgetPercent === undefined &&
    options.fuelBudgetInLiters === undefined
  ) {
    throw new IncorrectError(
      "At least one budget parameter (time, distance, fuel, or charge) must be provided",
      { provided_options: Object.keys(options) }
    );
  }

  const apiKey = getEffectiveApiKey();
  if (!apiKey) throw new Error("API key not available");

  logger.debug(
    { origin: { lng: origin[0], lat: origin[1] } },
    "Calculating reachable range via SDK"
  );

  const budget = buildSdkBudget(options);

  const rangeParams: ReachableRangeParams = {
    apiKey,
    origin,
    budget,
  };

  // Cost model (routeType, traffic, avoid)
  const costModel: CostModel = {};
  if (options.routeType) costModel.routeType = options.routeType;
  if (options.traffic) costModel.traffic = options.traffic;
  if (options.avoid) {
    costModel.avoid = (
      Array.isArray(options.avoid) ? options.avoid : [options.avoid]
    );
  }
  if (Object.keys(costModel).length > 0) rangeParams.costModel = costModel;

  if (options.travelMode) rangeParams.travelMode = options.travelMode;

  if (options.departAt) {
    rangeParams.when = { option: "departAt", date: new Date(options.departAt) };
  }

  return calculateReachableRange(rangeParams);
}
