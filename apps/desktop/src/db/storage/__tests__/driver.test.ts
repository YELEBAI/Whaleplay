import { afterEach, describe, expect, it, vi } from "vitest";
import { restBackendDriver } from "../driver";

describe("restBackendDriver", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("treats an authoritative null as missing without browser fallback", async () => {
    localStorage.setItem("prefs:theme", "stale-local-value");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: null }), { status: 200 })));

    expect(await restBackendDriver.get("prefs:theme")).toEqual({ status: "missing" });
  });

  it("returns an explicit error when the host schema is not ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "shared storage migration is not complete" }), { status: 503 }),
        ),
    );

    const result = await restBackendDriver.get("data:characters");
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.reason).toContain("HTTP 503");
  });

  it("uses the scoped session token for authenticated writes", async () => {
    sessionStorage.setItem("session:auth-token", "token-1");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await restBackendDriver.set("prefs:theme", "dark");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/store/prefs%3Atheme",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer token-1" }),
      }),
    );
  });
});
