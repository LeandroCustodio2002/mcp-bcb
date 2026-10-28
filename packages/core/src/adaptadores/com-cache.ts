import type { DefinicaoSerie, ExpectativaFocus, Intervalo, Observacao } from "../dominio/tipos.js";
import type { Cache, FonteDeSeries, FonteFocus } from "../portas/index.js";

const HORA = 60 * 60;

/** Tempo de cache por periodicidade: dados diários mudam mais vezes que mensais. */
export const TTL_SERIES = { diaria: 3 * HORA, mensal: 12 * HORA } as const;
export const TTL_FOCUS = 6 * HORA;

/** Decorador: mesma interface do SGS, consultando o cache antes. */
export class SeriesComCache implements FonteDeSeries {
  constructor(
    private readonly fonte: FonteDeSeries,
    private readonly cache: Cache,
  ) {}

  async buscar(serie: DefinicaoSerie, intervalo: Intervalo): Promise<Observacao[]> {
    const sufixo = intervalo.tipo === "datas" ? `${intervalo.inicio}:${intervalo.fim}` : `ultimos:${intervalo.quantidade}`;
    const chave = `sgs:${serie.codigo}:${sufixo}`;

    const guardado = await this.cache.obter<Observacao[]>(chave);
    if (guardado) return guardado;

    const observacoes = await this.fonte.buscar(serie, intervalo);
    await this.cache.guardar(chave, observacoes, TTL_SERIES[serie.periodicidade]);
    return observacoes;
  }
}

export class FocusComCache implements FonteFocus {
  constructor(
    private readonly fonte: FonteFocus,
    private readonly cache: Cache,
  ) {}

  async expectativaAnual(indicador: string, anoReferencia: number): Promise<ExpectativaFocus | null> {
    const chave = `focus:${indicador}:${anoReferencia}`;
    // Embrulhado em {valor} para que um null também fique no cache e não repita consultas vazias.
    const guardado = await this.cache.obter<{ valor: ExpectativaFocus | null }>(chave);
    if (guardado) return guardado.valor;

    const valor = await this.fonte.expectativaAnual(indicador, anoReferencia);
    await this.cache.guardar(chave, { valor }, TTL_FOCUS);
    return valor;
  }
}
