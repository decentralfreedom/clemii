// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Goals (PRD: the Goals tab): the catalog of what can be measured, a quarter's
// objectives with progress from the data, proposals (an agent's wait for the
// owner), and the owner's approval, archive and manual check-ins.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireScope, type AuthVariables } from "../auth/tokens";
import type { Database } from "../db/client";
import { metrics, type Metric } from "../goals/metrics";
import { approveObjective, archiveObjective, catalog, checkIn, listObjectives, proposeObjective } from "../goals/service";
import { pacificDay } from "../search/analytics";
import { errorSchema, validationHook } from "./errors";

const scopeSchema = z.object({
  postId: z.uuid().optional(), pageType: z.string().max(40).optional(), channel: z.string().max(40).optional(),
  source: z.string().max(200).optional(), campaign: z.string().max(200).optional(),
}).strict().openapi("GoalScope");

const measuredSchema = z.object({
  value: z.number().nullable(), from: z.iso.date().nullable(), to: z.iso.date().nullable(),
  taggedOnly: z.boolean().describe("Downloads through tagged links only"),
}).openapi("GoalMeasurement");

const keyResultSchema = z.object({
  id: z.uuid(), title: z.string(), kind: z.enum(["measured", "manual"]), metric: z.enum(metrics).nullable(), scope: scopeSchema,
  target: z.number(), baseline: z.number().nullable().describe("The metric over the period of equal length before, when the CMS has all of it"),
  manualValue: z.number().nullable(),
  measured: measuredSchema.nullable().describe("For a measured key result: the value and the days it covers"),
  progress: z.object({
    value: z.number().nullable(), share: z.number().nullable().describe("Value of target; for position, target of value"),
    projected: z.number().nullable().describe("Counts: the value plus the measured days' rate over the days left; rates and positions: their value"),
    onTrack: z.boolean().nullable(),
  }),
}).openapi("GoalKeyResult");

const objectiveSchema = z.object({
  id: z.uuid(), quarter: z.string(), title: z.string(), status: z.enum(["draft", "active", "archived"]),
  createdBy: z.string(), createdAt: z.iso.datetime(), approvedBy: z.string().nullable(), approvedAt: z.iso.datetime().nullable(),
  period: z.object({ from: z.iso.date(), to: z.iso.date() }),
  keyResults: z.array(keyResultSchema),
}).openapi("GoalObjective");

const newObjectiveSchema = z.object({
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/).describe("e.g. 2026-Q4"),
  title: z.string().trim().min(1).max(200),
  keyResults: z.array(z.object({
    title: z.string().trim().min(1).max(200), kind: z.enum(["measured", "manual"]),
    metric: z.enum(metrics).optional(), scope: scopeSchema.optional(), target: z.number().finite().nonnegative(),
  })).min(1).max(5),
}).openapi("NewGoalObjective");

const catalogSchema = z.object({
  metrics: z.array(z.object({ name: z.enum(metrics), label: z.string(), source: z.string(), scopes: z.string(), note: z.string().optional() })),
  posts: z.array(z.object({ id: z.uuid(), title: z.string(), path: z.string() })),
  pageTypes: z.array(z.string()), channels: z.array(z.string()), sources: z.array(z.string()), campaigns: z.array(z.string()),
  coverage: z.object({
    search: z.object({ from: z.iso.date(), to: z.iso.date() }).nullable(),
    traffic: z.object({ from: z.iso.date(), to: z.iso.date() }).nullable(),
  }),
}).openapi("GoalCatalog");

const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });

/** The quarter of today, in US Pacific days as the numbers. */
export function currentQuarter(now = new Date()) {
  const day = pacificDay(now);
  return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
}

export function goalsRoutes(db: Database) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook });
  app.use("/v1/goals", async (context, next) => requireScope(db, context.req.method === "GET" ? "posts:read" : "posts:write")(context, next));
  app.use("/v1/goals/*", async (context, next) => requireScope(db, context.req.method === "GET" ? "posts:read" : "posts:write")(context, next));
  const errors = { 400: json(errorSchema, "Invalid request"), 401: json(errorSchema, "Missing or invalid token"), 403: json(errorSchema, "Not allowed") };
  const present = (objective: Awaited<ReturnType<typeof listObjectives>>[number]) => ({
    ...objective, createdAt: objective.createdAt.toISOString(), approvedAt: objective.approvedAt?.toISOString() ?? null,
    keyResults: objective.keyResults.map(({ objectiveId: _objectiveId, position: _position, manualAt: _manualAt, ...keyResult }) => ({
      ...keyResult, metric: keyResult.metric as Metric | null, scope: keyResult.scope as z.infer<typeof scopeSchema>,
    })),
  });

  app.openapi(createRoute({
    method: "get", path: "/v1/goals/catalog", operationId: "getGoalCatalog", tags: ["Goals"], security: [{ bearer: [] }],
    description: "What a key result can measure: the metrics the CMS computes exactly, with the scopes each allows, the values that occur in its data (published posts, page types, channels, sources, campaigns, tracked links' tags) and the days it has numbers for. A proposal can name nothing else.",
    responses: { 200: json(catalogSchema, "The catalog"), ...errors },
  }), async (context) => context.json(await catalog(db), 200));

  app.openapi(createRoute({
    method: "get", path: "/v1/goals", operationId: "listGoals", tags: ["Goals"], security: [{ bearer: [] }],
    description: "A quarter's objectives (default: the current one), newest first, each key result with its progress from the CMS's numbers.",
    request: { query: z.object({ quarter: z.string().regex(/^\d{4}-Q[1-4]$/).optional(), archived: z.enum(["true", "false"]).default("false").transform((value) => value === "true") }) },
    responses: { 200: json(z.object({ quarter: z.string(), objectives: z.array(objectiveSchema) }).openapi("Goals"), "The goals"), ...errors },
  }), async (context) => {
    const { quarter = currentQuarter(), archived } = context.req.valid("query");
    return context.json({ quarter, objectives: (await listObjectives(db, quarter, archived)).map(present) }, 200);
  });

  app.openapi(createRoute({
    method: "post", path: "/v1/goals", operationId: "proposeGoal", tags: ["Goals"], security: [{ bearer: [] }],
    description: "Proposes an objective with one to five key results from the catalog. The CMS checks every metric and scope against its data and reads each baseline itself. From a token the objective is a draft until the owner approves it in the admin; from the owner it is active.",
    request: { body: { content: { "application/json": { schema: newObjectiveSchema } }, required: true } },
    responses: { 201: json(objectiveSchema, "The objective"), 422: json(errorSchema, "Names something the catalog does not have"), ...errors },
  }), async (context) => {
    const input = context.req.valid("json");
    const id = await proposeObjective(db, input, context.get("caller"));
    const objective = (await listObjectives(db, input.quarter, false)).find((item) => item.id === id)!;
    return context.json(present(objective), 201);
  });

  app.openapi(createRoute({
    method: "post", path: "/v1/goals/{id}/approve", operationId: "approveGoal", tags: ["Goals"], security: [{ bearer: [] }],
    description: "The owner, signed in to the admin, approves a proposed objective. Tokens are refused.",
    request: { params: z.object({ id: z.uuid() }) },
    responses: { 204: { description: "Approved" }, 404: json(errorSchema, "No such draft"), ...errors },
  }), async (context) => {
    await approveObjective(db, context.req.valid("param").id, context.get("caller"));
    return context.body(null, 204);
  });

  app.openapi(createRoute({
    method: "delete", path: "/v1/goals/{id}", operationId: "archiveGoal", tags: ["Goals"], security: [{ bearer: [] }],
    description: "The owner archives an objective, a draft or an active one. Tokens are refused.",
    request: { params: z.object({ id: z.uuid() }) },
    responses: { 204: { description: "Archived" }, 404: json(errorSchema, "No such objective"), ...errors },
  }), async (context) => {
    await archiveObjective(db, context.req.valid("param").id, context.get("caller"));
    return context.body(null, 204);
  });

  app.openapi(createRoute({
    method: "put", path: "/v1/goals/key-results/{id}/value", operationId: "checkInGoal", tags: ["Goals"], security: [{ bearer: [] }],
    description: "The owner enters a manual key result's current value. Measured key results take theirs from the data only.",
    request: { params: z.object({ id: z.uuid() }), body: { content: { "application/json": { schema: z.object({ value: z.number().finite() }) } }, required: true } },
    responses: { 204: { description: "Saved" }, 404: json(errorSchema, "No such manual key result"), ...errors },
  }), async (context) => {
    await checkIn(db, context.req.valid("param").id, context.req.valid("json").value, context.get("caller"));
    return context.body(null, 204);
  });

  return app;
}
