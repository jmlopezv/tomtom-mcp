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

import { describe, it, expect } from "vitest";
import { getAppConfig } from "./appConfig";
import { IncorrectError } from "./types/types";

describe("getAppConfig - authMethod", () => {
  it("defaults to api-key when AUTH_METHOD is not set", () => {
    expect(getAppConfig({}).authMethod).toBe("api-key");
  });

  it("returns oauth2 when AUTH_METHOD is 'oauth2'", () => {
    expect(getAppConfig({ AUTH_METHOD: "oauth2" }).authMethod).toBe("oauth2");
  });

  it("returns api-key when AUTH_METHOD is 'tomtom-api-key'", () => {
    expect(getAppConfig({ AUTH_METHOD: "tomtom-api-key" }).authMethod).toBe("api-key");
  });

  it("throws IncorrectError when AUTH_METHOD is an unrecognised value", () => {
    expect(() => getAppConfig({ AUTH_METHOD: "unknown" })).toThrow(IncorrectError);
  });
});
