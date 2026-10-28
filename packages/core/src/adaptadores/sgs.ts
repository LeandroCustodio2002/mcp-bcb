import { brParaIso, hojeEmBrasilia, isoParaBr } from "../dominio/datas.js";
import { type DefinicaoSerie, ErroDaFonte, type Intervalo, type Observacao } from "../dominio/tipos.js";
import type { FonteDeSeries } from "../portas/index.js";
import { obterJson, type OpcoesHttp } from "./http.js";

const BASE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";
/** Limite do endpoint /ultimos/{n} do SGS. */
export const MAXIMO_ULTIMOS = 20;

export interface OpcoesSgs extends OpcoesHttp {
  agora?: () => Date;
}

/** Cliente da API de séries temporais do BCB (SGS). */
export class ClienteSgs implements FonteDeSeries {
  constructor(private readonly opcoes: OpcoesSgs = {}) {}

  async buscar(serie: DefinicaoSerie, intervalo: Intervalo): Promise<Observacao[]> {
    const url =
      intervalo.tipo === "datas"
        ? `${BASE}.${serie.codigo}/dados?formato=json&dataInicial=${isoParaBr(intervalo.inicio)}&dataFinal=${isoParaBr(intervalo.fim)}`
        : // Sempre o máximo: algumas séries (ex.: meta Selic) já vêm preenchidas uma semana adiante,
          // e as datas futuras são descartadas abaixo.
          `${BASE}.${serie.codigo}/dados/ultimos/${MAXIMO_ULTIMOS}?formato=json`;

    const json = await obterJson(url, this.opcoes, "A API do Banco Central (SGS)");
    if (json === null) return [];
    if (!Array.isArray(json)) throw new ErroDaFonte("O SGS devolveu um formato inesperado.");

    const observacoes = json
      .map((item: { data?: unknown; valor?: unknown }) => ({
        data: brParaIso(String(item.data)),
        valor: Number.parseFloat(String(item.valor)),
      }))
      .filter((o) => Number.isFinite(o.valor))
      // O SGS nem sempre devolve em ordem (ex.: série 4389).
      .sort((a, b) => a.data.localeCompare(b.data));

    if (intervalo.tipo === "datas") return observacoes;

    const hoje = hojeEmBrasilia((this.opcoes.agora ?? (() => new Date()))());
    return observacoes.filter((o) => o.data <= hoje).slice(-intervalo.quantidade);
  }
}
