import { describe, expect, it } from "vitest";
import { CacheMemoria } from "../src/adaptadores/cache-memoria.js";
import { FocusComCache, SeriesComCache } from "../src/adaptadores/com-cache.js";
import { ClienteFocus } from "../src/adaptadores/focus.js";
import { ClienteSgs } from "../src/adaptadores/sgs.js";
import { resolverSerie } from "../src/dominio/catalogo.js";
import { ErroDaFonte } from "../src/dominio/tipos.js";

/** fetch falso que registra as URLs pedidas e devolve a resposta configurada. */
function fetchFalso(status: number, corpo: unknown) {
  const urls: string[] = [];
  const fetch = (async (url: string) => {
    urls.push(url);
    return new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status });
  }) as typeof globalThis.fetch;
  return { fetch, urls };
}

const AGORA = () => new Date("2026-10-28T15:00:00Z");

describe("ClienteSgs", () => {
  it("monta a URL com datas no formato brasileiro e converte a resposta", async () => {
    const { fetch, urls } = fetchFalso(200, [
      { data: "01/09/2026", valor: "0.82" },
      { data: "01/08/2026", valor: "-0.32" },
    ]);
    const obs = await new ClienteSgs({ fetch }).buscar(resolverSerie("ipca"), {
      tipo: "datas",
      inicio: "2026-08-01",
      fim: "2026-09-01",
    });
    expect(urls[0]).toBe(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/08/2026&dataFinal=01/09/2026",
    );
    // Ordenado por data, mesmo que o SGS mande fora de ordem.
    expect(obs).toEqual([
      { data: "2026-08-01", valor: -0.32 },
      { data: "2026-09-01", valor: 0.82 },
    ]);
  });

  it("descarta datas futuras em /ultimos (a meta Selic vem preenchida adiante)", async () => {
    const { fetch, urls } = fetchFalso(200, [
      { data: "27/10/2026", valor: "13.75" },
      { data: "28/10/2026", valor: "13.75" },
      { data: "29/10/2026", valor: "13.75" },
      { data: "03/11/2026", valor: "13.75" },
    ]);
    const obs = await new ClienteSgs({ fetch, agora: AGORA }).buscar(resolverSerie("selic"), {
      tipo: "ultimos",
      quantidade: 2,
    });
    expect(urls[0]).toContain("/dados/ultimos/20?");
    expect(obs.map((o) => o.data)).toEqual(["2026-10-27", "2026-10-28"]);
  });

  it("trata 404 como período sem dados", async () => {
    const { fetch } = fetchFalso(404, { erro: { statusCode: 404, detail: "x.SGSNegocioException: Value(s) not found" } });
    const obs = await new ClienteSgs({ fetch }).buscar(resolverSerie("ipca"), {
      tipo: "datas",
      inicio: "2030-01-01",
      fim: "2030-02-01",
    });
    expect(obs).toEqual([]);
  });

  it("repassa a mensagem de erro do BCB sem o nome da exceção Java", async () => {
    const { fetch } = fetchFalso(400, {
      erro: { statusCode: 400, detail: "br.gov.bcb.pec.sgs.comum.excecoes.SGSNegocioException: Invalid initial date" },
    });
    await expect(
      new ClienteSgs({ fetch }).buscar(resolverSerie("ipca"), { tipo: "datas", inicio: "2020-01-01", fim: "2021-01-01" }),
    ).rejects.toThrow(new ErroDaFonte("A API do Banco Central (SGS) respondeu 400: Invalid initial date"));
  });

  it("transforma timeout em mensagem útil", async () => {
    const fetch = (async () => {
      throw new DOMException("tempo", "TimeoutError");
    }) as typeof globalThis.fetch;
    await expect(
      new ClienteSgs({ fetch, timeoutMs: 5000 }).buscar(resolverSerie("999999"), { tipo: "ultimos", quantidade: 1 }),
    ).rejects.toThrow(/não respondeu em 5s/);
  });

  it("tenta de novo uma vez quando o BCB responde 5xx", async () => {
    const respostas = [new Response("instável", { status: 503 }), Response.json([{ data: "01/09/2026", valor: "0.82" }])];
    const fetch = (async () => respostas.shift()!) as typeof globalThis.fetch;
    const obs = await new ClienteSgs({ fetch, agora: AGORA }).buscar(resolverSerie("ipca"), { tipo: "ultimos", quantidade: 1 });
    expect(obs).toEqual([{ data: "2026-09-01", valor: 0.82 }]);
  });

  it("não repete pedidos com erro do cliente (4xx)", async () => {
    let chamadas = 0;
    const fetch = (async () => (chamadas++, new Response("{}", { status: 400 }))) as typeof globalThis.fetch;
    await expect(
      new ClienteSgs({ fetch }).buscar(resolverSerie("ipca"), { tipo: "ultimos", quantidade: 1 }),
    ).rejects.toThrow(ErroDaFonte);
    expect(chamadas).toBe(1);
  });
});

describe("ClienteFocus", () => {
  const linha = {
    Indicador: "IPCA",
    Data: "2026-10-23",
    DataReferencia: "2027",
    Media: 4.3777,
    Mediana: 4.3368,
    DesvioPadrao: 0.4337,
    Minimo: 3.2473,
    Maximo: 6,
    numeroRespondentes: 142,
    baseCalculo: 0,
  };

  it("codifica espaços como %20 (o Olinda rejeita +) e converte a linha", async () => {
    const { fetch, urls } = fetchFalso(200, { value: [linha] });
    const r = await new ClienteFocus({ fetch }).expectativaAnual("PIB Total", 2027);
    expect(urls[0]).not.toContain("+");
    expect(decodeURIComponent(urls[0]!)).toContain("$filter=Indicador eq 'PIB Total' and DataReferencia eq '2027'");
    expect(r).toEqual({
      indicador: "IPCA",
      anoReferencia: 2027,
      dataPesquisa: "2026-10-23",
      mediana: 4.3368,
      media: 4.3777,
      minimo: 3.2473,
      maximo: 6,
      desvioPadrao: 0.4337,
      respondentes: 142,
    });
  });

  it("devolve null quando não há projeção", async () => {
    const { fetch } = fetchFalso(200, { value: [] });
    expect(await new ClienteFocus({ fetch }).expectativaAnual("IPCA", 2040)).toBeNull();
  });

  it("lê a mensagem de erro que o Olinda manda dentro de comentário", async () => {
    const { fetch } = fetchFalso(400, '/*{\n  "codigo" : 400,\n  "mensagem" : "Filtro inválido"\n}*/');
    await expect(new ClienteFocus({ fetch }).expectativaAnual("IPCA", 2027)).rejects.toThrow(/Filtro inválido/);
  });
});

describe("cache", () => {
  it("CacheMemoria expira itens pelo TTL", async () => {
    let agora = 0;
    const cache = new CacheMemoria(() => agora);
    await cache.guardar("a", 1, 10);
    agora = 9_999;
    expect(await cache.obter("a")).toBe(1);
    agora = 10_000;
    expect(await cache.obter("a")).toBeUndefined();
  });

  it("SeriesComCache só consulta a fonte uma vez para o mesmo pedido", async () => {
    let chamadas = 0;
    const fonte = { buscar: async () => (chamadas++, [{ data: "2026-09-01", valor: 0.82 }]) };
    const series = new SeriesComCache(fonte, new CacheMemoria());
    const ipca = resolverSerie("ipca");
    await series.buscar(ipca, { tipo: "ultimos", quantidade: 1 });
    await series.buscar(ipca, { tipo: "ultimos", quantidade: 1 });
    await series.buscar(ipca, { tipo: "ultimos", quantidade: 2 });
    expect(chamadas).toBe(2);
  });

  it("FocusComCache também guarda respostas vazias", async () => {
    let chamadas = 0;
    const focus = new FocusComCache({ expectativaAnual: async () => (chamadas++, null) }, new CacheMemoria());
    expect(await focus.expectativaAnual("IPCA", 2040)).toBeNull();
    expect(await focus.expectativaAnual("IPCA", 2040)).toBeNull();
    expect(chamadas).toBe(1);
  });
});
