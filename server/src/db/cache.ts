import { logger } from '~/utils/logger';
import { env } from '~/config/app';

// ─────────────────────────────────────────────────────────────
// CacheAdapter interface — allows swapping Redis ↔ in-memory
// ─────────────────────────────────────────────────────────────

export interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────
// In-Memory adapter (always available as fallback)
// ─────────────────────────────────────────────────────────────

interface CacheEntry {
  value: string;
  expiresAt: number | null; // ms timestamp or null = no expiry
}

class InMemoryAdapter implements CacheAdapter {
  private store = new Map<string, CacheEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}

// ─────────────────────────────────────────────────────────────
// Upstash Redis HTTP adapter (used when REDIS_URL is set)
// ─────────────────────────────────────────────────────────────

class UpstashAdapter implements CacheAdapter {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async fetch(command: string[]): Promise<unknown> {
    const res = await globalThis.fetch(`${this.url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`Upstash error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { result: unknown };
    return json.result;
  }

  async get(key: string): Promise<string | null> {
    const result = await this.fetch(['GET', key]);
    return (result as string | null) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.fetch(['SET', key, value, 'EX', String(ttlSeconds)]);
    } else {
      await this.fetch(['SET', key, value]);
    }
  }

  async del(key: string): Promise<void> {
    await this.fetch(['DEL', key]);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.fetch(['EXISTS', key]);
    return result === 1;
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton cache instance
// ─────────────────────────────────────────────────────────────

function createCache(): CacheAdapter {
  if (env.REDIS_URL && env.REDIS_TOKEN) {
    logger.info('Cache: Using Upstash Redis');
    return new UpstashAdapter(env.REDIS_URL, env.REDIS_TOKEN);
  }
  logger.info('Cache: Using in-memory fallback (REDIS_URL not set)');
  return new InMemoryAdapter();
}

export const cache: CacheAdapter = createCache();
