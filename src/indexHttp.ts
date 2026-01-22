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

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "./createServer";
import { logger } from "./utils/logger";
import { randomUUID } from "node:crypto";
import express, { Request, Response } from "express";
import cors from "cors";
import { runWithSessionContext, setHttpMode } from "./services/base/tomtomClient";
import { VERSION } from "./version";
import { registerErrorHandlers } from "./utils/uncaughtErrorHandlers";

registerErrorHandlers();

type Backend = "orbis" | "genesis";

interface ServerInstance {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

/**
 * Resolves backend configuration from environment variable.
 * Returns the fixed backend if MAPS env is set to a valid value, otherwise null for dual mode.
 */
export function resolveFixedBackend(mapsEnv: string | undefined): Backend | null {
  const normalized = mapsEnv?.toLowerCase();
  return (normalized === "orbis" || normalized === "genesis") ? normalized : null;
}

/**
 * Determines the backend for a request based on fixed config or header.
 */
export function resolveBackendFromHeader(
  fixedBackend: Backend | null,
  headerValue: string | undefined,
  defaultBackend: Backend = "genesis"
): Backend {
  if (fixedBackend) return fixedBackend;
  const normalized = headerValue?.toLowerCase();
  return (normalized === "orbis" || normalized === "genesis") ? normalized : defaultBackend;
}

const FIXED_BACKEND = resolveFixedBackend(process.env.MAPS);
const DEFAULT_BACKEND: Backend = "genesis";

async function createMcpInstance(backend: Backend): Promise<ServerInstance> {
  const server = createServer({ mapsBackend: backend });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return { server, transport };
}

async function startHttpServer(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    methods: ["POST", "GET"],
    allowedHeaders: ["Content-Type", "tomtom-api-key", "tomtom-maps-backend"],
    maxAge: 86400,
  }));

  const servers: Record<Backend, ServerInstance> = {} as Record<Backend, ServerInstance>;

  if (FIXED_BACKEND) {
    servers[FIXED_BACKEND] = await createMcpInstance(FIXED_BACKEND);
    logger.info({ backend: FIXED_BACKEND }, "MCP server initialized (fixed backend mode)");
  } else {
    servers.orbis = await createMcpInstance("orbis");
    servers.genesis = await createMcpInstance("genesis");
    logger.info({ default: DEFAULT_BACKEND }, "MCP servers initialized (dual backend mode)");
  }

  function getBackend(req: Request): Backend {
    return resolveBackendFromHeader(FIXED_BACKEND, req.header("tomtom-maps-backend"), DEFAULT_BACKEND);
  }

  app.post("/mcp", async (req: Request, res: Response) => {
    const requestId = randomUUID();

    try {
      const apiKey = req.header("tomtom-api-key");
      if (!apiKey?.trim()) {
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Missing or invalid tomtom-api-key header" },
          id: req.body?.id || null,
        });
        return;
      }

      const backend = getBackend(req);
      const { transport } = servers[backend];

      logger.debug({ requestId, backend }, "Processing MCP request");

      await runWithSessionContext(apiKey, backend, async () => {
        await transport.handleRequest(req, res, req.body);
      });
    } catch (error) {
      logger.error({ requestId, error: error instanceof Error ? error.message : error }, "Request failed");
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: req.body?.id || null,
        });
      }
    }
  });

  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: VERSION,
      mode: FIXED_BACKEND ? "fixed" : "dual",
      ...(FIXED_BACKEND
        ? { backend: FIXED_BACKEND }
        : { backends: ["orbis", "genesis"], default: DEFAULT_BACKEND }
      ),
    });
  });

  const PORT = process.env.PORT || 3000;
  const httpServer = app.listen(PORT, () => {
    logger.info({
      port: PORT,
      mode: FIXED_BACKEND ? "fixed" : "dual",
      backend: FIXED_BACKEND || `${DEFAULT_BACKEND} (default)`,
    }, "TomTom MCP HTTP Server started");
  });

  const shutdown = async () => {
    logger.info("Shutting down...");
    httpServer.close(async () => {
      await Promise.all(Object.values(servers).map(s => s.server.close()));
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  try {
    setHttpMode();
    await startHttpServer();
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.stack : error }, "Startup failed");
    process.exit(1);
  }
}

main();
