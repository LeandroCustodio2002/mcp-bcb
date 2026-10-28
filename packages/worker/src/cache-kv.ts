import type { Cache } from "@mcp-bcb/core";

/** O KV exige TTL mínimo de 60 segundos. */
const TTL_MINIMO_KV = 60;

/** Cache compartilhado entre todas as instâncias do Worker, no Cloudflare KV. */
export class CacheKV implements Cache {
  constructor(private readonly kv: KVNamespace) {}

  async obter<T>(chave: string): Promise<T | undefined> {
    return (await this.kv.get<T>(chave, "json")) ?? undefined;
  }

  async guardar<T>(chave: string, valor: T, ttlSegundos: number): Promise<void> {
    await this.kv.put(chave, JSON.stringify(valor), { expirationTtl: Math.max(ttlSegundos, TTL_MINIMO_KV) });
  }
}
