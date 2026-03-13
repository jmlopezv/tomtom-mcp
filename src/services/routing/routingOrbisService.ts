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
  type MaxNumberOfAlternatives,
  type RouteType,
  type TrafficInput,
} from "@tomtom-org/maps-sdk/services";
import { type Routes, type Avoidable, type TravelMode, type Language } from "@tomtom-org/maps-sdk/core";
import type { Position } from "geojson";
import { tomtomClient, validateApiKey, getEffectiveApiKey, ORBIS_API_VERSION } from "../base/tomtomClient";
import { handleApiError } from "../../utils/apiErrorHandler";
import { logger } from "../../utils/logger";
import { IncorrectError } from "../../types/types";
import type { ReachableRangeOptionsOrbis, ReachableRangeResult } from "./types";

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
 * Helper function to build reachable range parameters from options
 */
function buildReachableRangeParams(options: ReachableRangeOptionsOrbis): Record<string, unknown> {
  const params: Record<string, unknown> = {
    apiVersion: ORBIS_API_VERSION.ROUTING,
  };

  // Budget parameters (one required)
  if (options.timeBudgetInSec !== undefined) params.timeBudgetInSec = options.timeBudgetInSec;
  if (options.distanceBudgetInMeters !== undefined)
    params.distanceBudgetInMeters = options.distanceBudgetInMeters;
  if (options.fuelBudgetInLiters !== undefined)
    params.fuelBudgetInLiters = options.fuelBudgetInLiters;

  // Basic routing options
  if (options.routeType) params.routeType = options.routeType;
  if (options.travelMode) params.travelMode = options.travelMode;
  if (options.traffic) params.traffic = options.traffic;
  if (options.avoid) params.avoid = options.avoid;
  if (options.departAt) params.departAt = options.departAt;

  // Vehicle specifications
  if (options.vehicleMaxSpeed) params.vehicleMaxSpeed = options.vehicleMaxSpeed;
  if (options.vehicleWeight) params.vehicleWeight = options.vehicleWeight;
  if (options.vehicleEngineType) params.vehicleEngineType = options.vehicleEngineType;

  // Electric vehicle options
  if (options.constantSpeedConsumptionInkWhPerHundredkm) {
    params.constantSpeedConsumptionInkWhPerHundredkm =
      options.constantSpeedConsumptionInkWhPerHundredkm;
  }
  if (options.currentChargeInkWh !== undefined)
    params.currentChargeInkWh = options.currentChargeInkWh;
  if (options.maxChargeInkWh !== undefined) params.maxChargeInkWh = options.maxChargeInkWh;
  if (options.auxiliaryPowerInkW !== undefined)
    params.auxiliaryPowerInkW = options.auxiliaryPowerInkW;

  // Combustion vehicle options
  if (options.constantSpeedConsumptionInLitersPerHundredkm) {
    params.constantSpeedConsumptionInLitersPerHundredkm =
      options.constantSpeedConsumptionInLitersPerHundredkm;
  }
  if (options.currentFuelInLiters !== undefined)
    params.currentFuelInLiters = options.currentFuelInLiters;
  if (options.auxiliaryPowerInLitersPerHour !== undefined)
    params.auxiliaryPowerInLitersPerHour = options.auxiliaryPowerInLitersPerHour;
  if (options.fuelEnergyDensityInMJoulesPerLiter !== undefined)
    params.fuelEnergyDensityInMJoulesPerLiter = options.fuelEnergyDensityInMJoulesPerLiter;

  // Efficiency parameters
  if (options.accelerationEfficiency !== undefined)
    params.accelerationEfficiency = options.accelerationEfficiency;
  if (options.decelerationEfficiency !== undefined)
    params.decelerationEfficiency = options.decelerationEfficiency;
  if (options.uphillEfficiency !== undefined) params.uphillEfficiency = options.uphillEfficiency;
  if (options.downhillEfficiency !== undefined)
    params.downhillEfficiency = options.downhillEfficiency;
  if (options.consumptionInkWhPerkmAltitudeGain !== undefined)
    params.consumptionInkWhPerkmAltitudeGain = options.consumptionInkWhPerkmAltitudeGain;
  if (options.recuperationInkWhPerkmAltitudeLoss !== undefined)
    params.recuperationInkWhPerkmAltitudeLoss = options.recuperationInkWhPerkmAltitudeLoss;

  // Other options
  if (options.report !== undefined) params.report = options.report;
  if (options.hilliness) params.hilliness = options.hilliness;
  if (options.windingness) params.windingness = options.windingness;

  return params;
}

/**
 * Calculate reachable range from a starting point.
 * Uses direct HTTP call — SDK v0.46.0 does not export calculateReachableRanges yet.
 * @param origin [longitude, latitude] (GeoJSON convention)
 */
export async function getReachableRange(
  origin: Position,
  options: ReachableRangeOptionsOrbis
): Promise<ReachableRangeResult> {
  try {
    validateApiKey();

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

    logger.debug(
      { origin: { lng: origin[0], lat: origin[1] } },
      "Calculating reachable range"
    );

    // Format origin as lat,lon for the API URL path
    const originCoords = `${origin[1]},${origin[0]}`;
    const params = buildReachableRangeParams(options);

    const response = await tomtomClient.get(
      `/maps/orbis/routing/calculateReachableRange/${originCoords}/json`,
      { params }
    );

    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}
