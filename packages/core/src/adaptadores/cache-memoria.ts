import type { Cache } from "../portas/index.js";

/** Cache em memória do processo; serve para a CLI e para testes. */
export class CacheMemoria implements Cache {
  private readonly itens = new Map<string, { valor: unknown; expiraEm: number }>();

  constructor(private readonly agora: () => number = Date.now) {}

  async obter<T>(chave: string): Promise<T | undefined> {
    const item = this.itens.get(chave);
    if (!item) return undefined;
    if (item.expiraEm <= this.agora()) {
      this.itens.delete(chave);
      return undefined;
    }
    return item.valor as T;
  }

  async guardar<T>(chave: string, valor: T, ttlSegundos: number): Promise<void> {
    this.itens.set(chave, { valor, expiraEm: this.agora() + ttlSegundos * 1000 });
  }
}
