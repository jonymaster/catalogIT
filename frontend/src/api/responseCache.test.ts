import { describe, expect, it, vi } from "vitest";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { createCachingAdapter } from "./responseCache";

function setup() {
  let clock = 0;
  const base = vi.fn((config: InternalAxiosRequestConfig) =>
    Promise.resolve({ data: { url: config.url, items: [3, 1, 2] }, status: 200 } as AxiosResponse),
  );
  const adapter = createCachingAdapter(base, {
    ttlMs: 1000,
    isCacheable: (url) => url === "/api/services/",
    now: () => clock,
  });
  const req = (url: string, method = "get", headers: Record<string, string> = {}) =>
    adapter({ url, method, headers } as unknown as InternalAxiosRequestConfig);
  return { base, req, tick: (ms: number) => (clock += ms) };
}

describe("createCachingAdapter", () => {
  it("shares one request between concurrent and repeated GETs", async () => {
    const { base, req } = setup();
    await Promise.all([req("/api/services/"), req("/api/services/")]);
    await req("/api/services/");
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL", async () => {
    const { base, req, tick } = setup();
    await req("/api/services/");
    tick(1001);
    await req("/api/services/");
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("clears on writes", async () => {
    const { base, req } = setup();
    await req("/api/services/");
    await req("/api/services/x", "put");
    await req("/api/services/");
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("does not cache other URLs or share between tokens", async () => {
    const { base, req } = setup();
    await req("/api/vendors/");
    await req("/api/vendors/");
    await req("/api/services/", "get", { Authorization: "Bearer a" });
    await req("/api/services/", "get", { Authorization: "Bearer b" });
    expect(base).toHaveBeenCalledTimes(4);
  });

  it("gives each caller its own copy of the data", async () => {
    const { req } = setup();
    const first = await req("/api/services/");
    first.data.items.sort();
    const second = await req("/api/services/");
    expect(second.data.items).toEqual([3, 1, 2]);
  });

  it("drops failed requests from the cache", async () => {
    const { base, req } = setup();
    base.mockRejectedValueOnce(new Error("boom"));
    await expect(req("/api/services/")).rejects.toThrow("boom");
    await req("/api/services/");
    expect(base).toHaveBeenCalledTimes(2);
  });
});
