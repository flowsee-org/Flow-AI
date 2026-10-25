import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';

/**
 * Centralized AI API Management Service
 *
 * Responsibilities:
 * 1. API Key Rotation / Load Balancing across multiple keys/accounts
 * 2. Request Deduplication via response caching for identical inputs
 * 3. Per-client Rate Limiting to prevent 429 Too Many Requests
 * 4. Structured Token Usage Tracking (prompt / completion tokens per user/request)
 * 5. Automatic fallback to next key on rate-limit/error
 */

export interface TokenUsageLog {
  userId: string;
  requestId: string;
  endpoint: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  apiKeyIndex: number;
  timestamp: string;
  success: boolean;
  cached: boolean;
}

interface CacheEntry {
  data: { text: string; usage: any };
  expiry: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface ApiKeyState {
  key: string;
  client: GoogleGenAI;
  errorCount: number;
  lastErrorAt: number | null;
  cooldownUntil: number;
}

export class CentralizedAIService {
  private keys: ApiKeyState[] = [];
  private currentIndex = 0;
  private cache = new Map<string, CacheEntry>();
  private rateLimitStore = new Map<string, RateLimitEntry>();
  private tokenLogs: TokenUsageLog[] = [];

  // Configuration
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  private readonly RATE_LIMIT_MAX = 30; // max requests per window per client
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
  private readonly KEY_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown on 429

  constructor(apiKeys: string[]) {
    if (!apiKeys || apiKeys.length === 0) {
      throw new Error('At least one GEMINI_API_KEY is required');
    }

    this.keys = apiKeys.map((key) => ({
      key,
      client: new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'flow-ai-centralized-service',
          },
        },
      }),
      errorCount: 0,
      lastErrorAt: null,
      cooldownUntil: 0,
    }));

    console.log(
      JSON.stringify({
        event: 'ai_service_initialized',
        keyCount: this.keys.length,
        timestamp: new Date().toISOString(),
      })
    );
  }

  /**
   * Select the next available API key client (round-robin, skipping cooled-down keys).
   */
  private getClient(): { client: GoogleGenAI; index: number } | null {
    const now = Date.now();
    const total = this.keys.length;
    const start = this.currentIndex;

    for (let i = 0; i < total; i++) {
      const idx = (start + i) % total;
      const keyState = this.keys[idx];
      if (keyState.cooldownUntil <= now) {
        this.currentIndex = (idx + 1) % total;
        return { client: keyState.client, index: idx };
      }
    }

    // All keys are in cooldown: return the one whose cooldown expires soonest
    let bestIdx = 0;
    let bestCooldown = this.keys[0].cooldownUntil;
    for (let i = 1; i < total; i++) {
      if (this.keys[i].cooldownUntil < bestCooldown) {
        bestCooldown = this.keys[i].cooldownUntil;
        bestIdx = i;
      }
    }
    this.currentIndex = (bestIdx + 1) % total;
    return { client: this.keys[bestIdx].client, index: bestIdx };
  }

  private markKeyError(index: number, isRateLimit: boolean) {
    this.keys[index].errorCount++;
    this.keys[index].lastErrorAt = Date.now();
    if (isRateLimit) {
      this.keys[index].cooldownUntil = Date.now() + this.KEY_COOLDOWN_MS;
    }
  }

  /**
   * Build a stable cache key from the request parameters so identical inputs hit the cache.
   */
  private getCacheKey(endpoint: string, body: any): string {
    const hashInput = JSON.stringify({
      endpoint,
      model: body.model,
      prompt: body.prompt ?? JSON.stringify(body.contents ?? body.messages ?? ''),
      systemInstruction:
        body.systemInstruction ?? body.config?.systemInstruction ?? '',
      temperature: body.temperature ?? body.config?.temperature ?? undefined,
    });
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  private getFromCache(cacheKey: string): { text: string; usage: any } | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;
    if (entry.expiry <= Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }
    return entry.data;
  }

  private setCache(cacheKey: string, data: { text: string; usage: any }) {
    this.cache.set(cacheKey, { data, expiry: Date.now() + this.CACHE_TTL_MS });
  }

  /**
   * Fixed-window rate limiter per client identifier (IP or userId).
   */
  private checkRateLimit(identifier: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const entry = this.rateLimitStore.get(identifier);

    if (!entry || entry.resetTime <= now) {
      this.rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW_MS,
      });
      return {
        allowed: true,
        remaining: this.RATE_LIMIT_MAX - 1,
        resetTime: now + this.RATE_LIMIT_WINDOW_MS,
      };
    }

    if (entry.count >= this.RATE_LIMIT_MAX) {
      return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: this.RATE_LIMIT_MAX - entry.count,
      resetTime: entry.resetTime,
    };
  }

  /**
   * Structured logging of token usage to console (and retained in-memory).
   */
  private logTokenUsage(log: TokenUsageLog) {
    this.tokenLogs.push(log);
    if (this.tokenLogs.length > 1000) {
      this.tokenLogs.shift();
    }
    console.log(JSON.stringify({ event: 'ai_token_usage', ...log }));
  }

  /**
   * Get recent token usage logs (for inspection / debugging).
   */
  getTokenLogs(): TokenUsageLog[] {
    return [...this.tokenLogs];
  }

  /**
   * Get current cache statistics.
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      ttlMs: this.CACHE_TTL_MS,
    };
  }

  /**
   * Get current rate limit store stats.
   */
  getRateLimitStats() {
    return {
      trackedClients: this.rateLimitStore.size,
      maxRequestsPerWindow: this.RATE_LIMIT_MAX,
      windowMs: this.RATE_LIMIT_WINDOW_MS,
    };
  }

  /**
   * Centralized generateContent entry point.
   *
   * Applies: rate limit -> dedup cache -> key rotation -> GenAI call ->
   * token logging -> cache store.
   *
   * On 429/quota errors, automatically rotates to the next key and retries.
   */
  async generateContent(params: {
    endpoint: string;
    model: string;
    contents: any;
    config?: any;
    userId?: string;
    requestId?: string;
    ip?: string;
  }): Promise<{ text: string; usage: any }> {
    const requestId = params.requestId || crypto.randomUUID();
    const userId = params.userId || 'anonymous';
    const identifier = params.ip || userId || 'anonymous';

    // 1. Rate limiting
    const rateLimit = this.checkRateLimit(identifier);
    if (!rateLimit.allowed) {
      console.log(
        JSON.stringify({
          event: 'ai_rate_limited',
          requestId,
          userId,
          endpoint: params.endpoint,
          model: params.model,
          remaining: rateLimit.remaining,
          resetTime: rateLimit.resetTime,
        })
      );
      throw new Error(
        `Rate limit exceeded. Please try again in ${Math.ceil(
          (rateLimit.resetTime - Date.now()) / 1000
        )}s.`
      );
    }

    // 2. Deduplication cache
    const cacheKey = this.getCacheKey(params.endpoint, {
      model: params.model,
      prompt: params.contents,
      systemInstruction: params.config?.systemInstruction,
      temperature: params.config?.temperature,
    });
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logTokenUsage({
        userId,
        requestId,
        endpoint: params.endpoint,
        model: params.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        apiKeyIndex: -1,
        timestamp: new Date().toISOString(),
        success: true,
        cached: true,
      });
      console.log(
        JSON.stringify({
          event: 'ai_cache_hit',
          requestId,
          userId,
          endpoint: params.endpoint,
          model: params.model,
        })
      );
      return cached;
    }

    // 3. Key rotation + GenAI call with retry on 429
    let lastError: any = null;
    const maxAttempts = this.keys.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const selected = this.getClient();
      if (!selected) break;

      try {
        const response = await selected.client.models.generateContent({
          model: params.model,
          contents: params.contents,
          config: params.config,
        });

        const text = response.text || '';
        const usage = response.usageMetadata || {};

        const tokenLog: TokenUsageLog = {
          userId,
          requestId,
          endpoint: params.endpoint,
          model: params.model,
          promptTokens: usage.promptTokenCount ?? 0,
          completionTokens: usage.candidatesTokenCount ?? 0,
          totalTokens: usage.totalTokenCount ?? 0,
          apiKeyIndex: selected.index,
          timestamp: new Date().toISOString(),
          success: true,
          cached: false,
        };
        this.logTokenUsage(tokenLog);

        const result = { text, usage };
        this.setCache(cacheKey, result);
        return result;
      } catch (err: any) {
        lastError = err;
        const isRateLimit =
          err?.status === 429 ||
          err?.message?.includes('429') ||
          err?.message?.includes('quota') ||
          err?.message?.includes('rate limit');

        this.markKeyError(selected.index, isRateLimit);

        if (isRateLimit) {
          console.warn(
            JSON.stringify({
              event: 'ai_key_rate_limited',
              keyIndex: selected.index,
              endpoint: params.endpoint,
              model: params.model,
              attempt: attempt + 1,
            })
          );
          // Rotate to next key and retry
          continue;
        }

        // Non-rate-limit error: propagate immediately
        throw err;
      }
    }

    throw lastError || new Error('All API keys exhausted or failed');
  }
}
