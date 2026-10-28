import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { DefinicaoSerie, ExpectativaFocus, Intervalo, Observacao } from "../src/dominio/tipos.js";
import { ErroDaFonte } from "../src/dominio/tipos.js";
import { criarServidor } from "../src/ferramentas/index.js";
import type { Dependencias } from "../src/portas/index.js";

/** Fonte de séries em memória: devolve o que estiver em `dados[codigo]` dentro do intervalo. */
class SeriesFalsas {
  pedidos: Array<{ codigo: number; intervalo: Intervalo }> = [];
  constructor(private readonly dados: Record<number, Observacao[]>) {}

  async buscar(serie: DefinicaoSerie, intervalo: Intervalo): Promise<Observacao[]> {
    this.pedidos.push({ codigo: serie.codigo, intervalo });
    const todas = this.dados[serie.codigo] ?? [];
    if (intervalo.tipo === "ultimos") return todas.slice(-intervalo.quantidade);
    return todas.filter((o) => o.data >= intervalo.inicio && o.data <= intervalo.fim);
  }
}

const IPCA_2026: Observacao[] = [
  { data: "2026-07-01", valor: 0.07 },
  { data: "2026-08-01", valor: -0.32 },
  { data: "2026-09-01", valor: 0.82 },
];

const CDI: Observacao[] = [
  { data: "2026-10-26", valor: 0.05 },
  { data: "2026-10-27", valor: 0.05 },
  { data: "2026-10-28", valor: 0.05 },
];

const FOCUS: ExpectativaFocus = {
  indicador: "IPCA",
  anoReferencia: 2027,
  dataPesquisa: "2026-10-23",
  mediana: 4.3368,
  media: 4.3777,
  minimo: 3.2473,
  maximo: 6,
  desvioPadrao: 0.4337,
  respondentes: 142,
};

let series: SeriesFalsas;
let client: Client;

async function conectar(deps: Partial<Dependencias> = {}) {
  series = new SeriesFalsas({ 433: IPCA_2026, 12: CDI });
  const server = criarServidor({
    series,
    focus: { expectativaAnual: async (_indicador, ano) => (ano === 2027 ? FOCUS : null) },
    agora: () => new Date("2026-10-28T15:00:00Z"),
    ...deps,
  });
  const [ladoCliente, ladoServidor] = InMemoryTransport.createLinkedPair();
  await server.connect(ladoServidor);
  client = new Client({ name: "teste", version: "0.0.0" });
  await client.connect(ladoCliente);
}

/** Chama a ferramenta e devolve o JSON da resposta (ou a mensagem, se for erro). */
async function chamar(name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args });
  const [conteudo] = r.content as Array<{ type: string; text: string }>;
  return { erro: r.isError === true, texto: conteudo!.text, json: r.isError ? undefined : JSON.parse(conteudo!.text) };
}

beforeEach(() => conectar());

describe("ferramentas MCP", () => {
  it("expõe as quatro ferramentas, todas somente leitura", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["buscar_serie", "corrigir_valor", "expectativas_focus", "listar_series"]);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });

  it("buscar_serie devolve resumo e variação acumulada", async () => {
    const { json } = await chamar("buscar_serie", { serie: "ipca", ultimos: 3 });
    expect(json.serie.codigo).toBe(433);
    expect(json.resumo.ultima).toEqual({ data: "2026-09-01", valor: 0.82 });
    // 1,0007 × 0,9968 × 1,0082 = 1,00568224
    expect(json.variacao_acumulada_percentual).toBe("0.5677");
    expect(json.observacoes).toHaveLength(3);
  });

  it("buscar_serie aceita meses para séries mensais e usa hoje como fim", async () => {
    await chamar("buscar_serie", { serie: "433", data_inicial: "2026-08" });
    expect(series.pedidos[0]).toEqual({
      codigo: 433,
      intervalo: { tipo: "datas", inicio: "2026-08-01", fim: "2026-10-01" },
    });
  });

  it("buscar_serie recusa mais de 10 anos de série diária", async () => {
    const r = await chamar("buscar_serie", { serie: "cdi", data_inicial: "2010-01-01", data_final: "2026-01-01" });
    expect(r.erro).toBe(true);
    expect(r.texto).toMatch(/10 anos/);
  });

  it("buscar_serie explica quando a série não existe", async () => {
    const r = await chamar("buscar_serie", { serie: "inflacao" });
    expect(r.erro).toBe(true);
    expect(r.texto).toMatch(/apelidos/);
  });

  it("corrigir_valor corrige pelo IPCA e avisa que outubro ainda não saiu", async () => {
    const { json } = await chamar("corrigir_valor", { valor: 1000, indice: "ipca", data_inicial: "2026-07" });
    expect(json.valorCorrigido).toBe("1005.68");
    expect(json.periodo_efetivo).toEqual({ de: "2026-07-01", ate: "2026-09-01" });
    expect(json.avisos[0]).toMatch(/2026-10 ainda não foi divulgado/);
  });

  it("corrigir_valor com CDI exclui o dia final e aplica o percentual", async () => {
    const { json } = await chamar("corrigir_valor", {
      valor: 1000,
      indice: "cdi",
      data_inicial: "2026-10-26",
      data_final: "2026-10-28",
      percentual_do_indice: 200,
    });
    // Dois dias a 0,1%: 1000 × 1,001² = 1002,001
    expect(json.valorCorrigido).toBe("1002.00");
    expect(json.periodos).toBe(2);
  });

  it("corrigir_valor recusa formato de data errado para índice diário", async () => {
    const r = await chamar("corrigir_valor", { valor: 1000, indice: "cdi", data_inicial: "2026-10" });
    expect(r.erro).toBe(true);
    expect(r.texto).toMatch(/aaaa-mm-dd/);
  });

  it("expectativas_focus usa ano atual e seguinte por padrão e lista os anos sem projeção", async () => {
    const { json } = await chamar("expectativas_focus", { indicador: "ipca" });
    expect(json.expectativas).toEqual([FOCUS]);
    expect(json.anos_sem_projecao).toEqual([2026]);
  });

  it("transforma falha da API do BCB em erro legível para o assistente", async () => {
    await conectar({
      series: {
        buscar: async () => {
          throw new ErroDaFonte("A API do Banco Central (SGS) não respondeu em 15s.");
        },
      },
    });
    const r = await chamar("buscar_serie", { serie: "ipca" });
    expect(r).toMatchObject({ erro: true, texto: "A API do Banco Central (SGS) não respondeu em 15s." });
  });
});
