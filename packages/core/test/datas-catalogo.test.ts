import { describe, expect, it } from "vitest";
import { resolverSerie } from "../src/dominio/catalogo.js";
import { brParaIso, hojeEmBrasilia, isoParaBr, primeiroDiaDoMes, validarDia } from "../src/dominio/datas.js";
import { buscarPeriodoLongo } from "../src/dominio/periodo.js";
import { ErroDeEntrada, type Intervalo } from "../src/dominio/tipos.js";

describe("datas", () => {
  it("converte entre o formato do SGS e ISO", () => {
    expect(brParaIso("05/10/2026")).toBe("2026-10-05");
    expect(isoParaBr("2026-10-05")).toBe("05/10/2026");
  });

  it("usa o fuso de Brasília para definir 'hoje'", () => {
    // 01:00 UTC do dia 28 ainda é dia 27 em Brasília.
    expect(hojeEmBrasilia(new Date("2026-10-28T01:00:00Z"))).toBe("2026-10-27");
  });

  it("rejeita datas inexistentes", () => {
    expect(() => validarDia("2026-02-30", "data")).toThrow(ErroDeEntrada);
    expect(() => validarDia("30/01/2026", "data")).toThrow(ErroDeEntrada);
    expect(validarDia("2024-02-29", "data")).toBe("2024-02-29");
  });

  it("normaliza meses para o primeiro dia", () => {
    expect(primeiroDiaDoMes("2026-03", "x")).toBe("2026-03-01");
    expect(primeiroDiaDoMes("2026-03-17", "x")).toBe("2026-03-01");
    expect(() => primeiroDiaDoMes("2026-13", "x")).toThrow(ErroDeEntrada);
  });
});

describe("resolverSerie", () => {
  it("aceita apelido, ignorando caixa e espaços", () => {
    expect(resolverSerie(" IPCA ").codigo).toBe(433);
  });

  it("aceita código do catálogo e devolve a definição completa", () => {
    expect(resolverSerie("12").apelido).toBe("cdi");
  });

  it("aceita códigos fora do catálogo", () => {
    expect(resolverSerie(7832)).toMatchObject({ codigo: 7832, apelido: "sgs_7832" });
  });

  it("explica quais apelidos existem quando o nome é desconhecido", () => {
    expect(() => resolverSerie("inflacao")).toThrow(/ipca/);
  });
});

describe("buscarPeriodoLongo", () => {
  it("divide séries diárias em janelas de até 9 anos sem buracos nem sobreposição", async () => {
    const pedidos: Intervalo[] = [];
    const fonte = {
      buscar: async (_: unknown, intervalo: Intervalo) => {
        pedidos.push(intervalo);
        return [];
      },
    };
    await buscarPeriodoLongo(fonte, resolverSerie("cdi"), "2005-01-10", "2026-10-28");
    expect(pedidos).toEqual([
      { tipo: "datas", inicio: "2005-01-10", fim: "2014-01-09" },
      { tipo: "datas", inicio: "2014-01-10", fim: "2023-01-09" },
      { tipo: "datas", inicio: "2023-01-10", fim: "2026-10-28" },
    ]);
  });

  it("faz uma consulta só para séries mensais", async () => {
    let chamadas = 0;
    const fonte = { buscar: async () => (chamadas++, []) };
    await buscarPeriodoLongo(fonte, resolverSerie("ipca"), "1995-01-01", "2026-10-01");
    expect(chamadas).toBe(1);
  });
});
