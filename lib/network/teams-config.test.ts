import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isPropertyTeamsConfigured, isTeamsGraphConfigured } from "./teams-config";

const GRAPH_VARS = ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET"] as const;

function clearGraphEnv(): void {
  for (const v of GRAPH_VARS) delete process.env[v];
}

describe("isTeamsGraphConfigured / isPropertyTeamsConfigured", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const v of GRAPH_VARS) original[v] = process.env[v];
    clearGraphEnv();
  });

  afterEach(() => {
    for (const v of GRAPH_VARS) {
      if (original[v] === undefined) delete process.env[v];
      else process.env[v] = original[v];
    }
  });

  it("false when no Graph env vars are set", () => {
    expect(isTeamsGraphConfigured()).toBe(false);
  });

  it("false when only some Graph env vars are set", () => {
    process.env.MS_GRAPH_TENANT_ID = "tenant";
    process.env.MS_GRAPH_CLIENT_ID = "client";
    // MS_GRAPH_CLIENT_SECRET intentionally unset
    expect(isTeamsGraphConfigured()).toBe(false);
  });

  it("true when all Graph env vars are set", () => {
    process.env.MS_GRAPH_TENANT_ID = "tenant";
    process.env.MS_GRAPH_CLIENT_ID = "client";
    process.env.MS_GRAPH_CLIENT_SECRET = "secret";
    expect(isTeamsGraphConfigured()).toBe(true);
  });

  it("isPropertyTeamsConfigured false when env unset even with a channel id", () => {
    expect(isPropertyTeamsConfigured({ teamsChannelId: "channel-123" })).toBe(false);
  });

  it("isPropertyTeamsConfigured false when env set but property has no channel id", () => {
    process.env.MS_GRAPH_TENANT_ID = "tenant";
    process.env.MS_GRAPH_CLIENT_ID = "client";
    process.env.MS_GRAPH_CLIENT_SECRET = "secret";
    expect(isPropertyTeamsConfigured({ teamsChannelId: null })).toBe(false);
  });

  it("isPropertyTeamsConfigured true when env set and property has a channel id", () => {
    process.env.MS_GRAPH_TENANT_ID = "tenant";
    process.env.MS_GRAPH_CLIENT_ID = "client";
    process.env.MS_GRAPH_CLIENT_SECRET = "secret";
    expect(isPropertyTeamsConfigured({ teamsChannelId: "channel-123" })).toBe(true);
  });
});
