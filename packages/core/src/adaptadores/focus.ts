import { ErroDaFonte, type ExpectativaFocus } from "../dominio/tipos.js";
import type { FonteFocus } from "../portas/index.js";
import { obterJson, type OpcoesHttp } from "./http.js";

const BASE = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais";

interface LinhaFocus {
  Indicador: string;
  Data: string;
  DataReferencia: string;
  Media: number;
  Mediana: number;
  DesvioPadrao: number;
  Minimo: number;
  Maximo: number;
  numeroRespondentes: number;
}

/** Cliente das expectativas anuais do Boletim Focus (API Olinda do BCB). */
export class ClienteFocus implements FonteFocus {
  constructor(private readonly opcoes: OpcoesHttp = {}) {}

  async expectativaAnual(indicador: string, anoReferencia: number): Promise<ExpectativaFocus | null> {
    // baseCalculo 0 = projeções enviadas nos últimos 30 dias, a estatística que o Focus divulga.
    const filtro = `Indicador eq '${indicador.replaceAll("'", "''")}' and DataReferencia eq '${anoReferencia}' and baseCalculo eq 0`;
    // OData exige espaço como %20; URLSearchParams usaria "+", que o Olinda rejeita.
    const consulta = [
      ["$top", "1"],
      ["$filter", filtro],
      ["$orderby", "Data desc"],
      ["$format", "json"],
    ]
      .map(([chave, valor]) => `${encodeURIComponent(chave!)}=${encodeURIComponent(valor!)}`)
      .join("&");

    const json = (await obterJson(`${BASE}?${consulta}`, this.opcoes, "A API do Focus (Olinda)")) as {
      value?: LinhaFocus[];
    } | null;
    if (json === null) return null;
    if (!Array.isArray(json.value)) throw new ErroDaFonte("O Focus devolveu um formato inesperado.");

    const [linha] = json.value;
    if (!linha) return null;
    return {
      indicador: linha.Indicador,
      anoReferencia: Number(linha.DataReferencia),
      dataPesquisa: linha.Data,
      mediana: linha.Mediana,
      media: linha.Media,
      minimo: linha.Minimo,
      maximo: linha.Maximo,
      desvioPadrao: linha.DesvioPadrao,
      respondentes: linha.numeroRespondentes,
    };
  }
}
