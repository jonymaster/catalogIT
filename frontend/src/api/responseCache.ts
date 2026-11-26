import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";

type Entry = { at: number; promise: Promise<AxiosResponse> };

export type CachingAdapterOptions = {
  ttlMs: number;
  isCacheable: (url: string) => boolean;
  now?: () => number;
};

export type CachingAdapter = AxiosAdapter & { clear: () => void };

function cacheKey(config: InternalAxiosRequestConfig): string {
  const auth = config.headers?.Authorization ?? "";
  return `${config.url}|${JSON.stringify(config.params ?? {})}|${String(auth)}`;
}

/**
 * Short-lived cache for large GET lists that several pages load.
 * Concurrent callers share one request. Any other method clears the cache,
 * so a page that saves and then reloads always sees fresh data.
 */
export function createCachingAdapter(
  base: AxiosAdapter,
  { ttlMs, isCacheable, now = Date.now }: CachingAdapterOptions,
): CachingAdapter {
  const cache = new Map<string, Entry>();

  const adapter = ((config: InternalAxiosRequestConfig) => {
    const method = (config.method ?? "get").toLowerCase();
    if (method !== "get") {
      cache.clear();
      // Also clear after the write: a GET started meanwhile may hold old data.
      return base(config).finally(() => cache.clear());
    }
    if (!config.url || !isCacheable(config.url)) return base(config);

    const key = cacheKey(config);
    const hit = cache.get(key);
    const entry =
      hit && now() - hit.at < ttlMs ? hit : { at: now(), promise: base(config) };
    if (entry !== hit) {
      cache.set(key, entry);
      entry.promise.catch(() => {
        if (cache.get(key) === entry) cache.delete(key);
      });
    }
    // Callers get their own copy so in-place edits do not leak into the cache.
    return entry.promise.then((res) => ({ ...res, config, data: structuredClone(res.data) }));
  }) as CachingAdapter;

  adapter.clear = () => cache.clear();
  return adapter;
}
