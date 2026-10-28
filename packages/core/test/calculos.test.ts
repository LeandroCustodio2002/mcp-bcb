import { describe, expect, it } from "vitest";
import { corrigirValor, resumir, variacaoAcumulada } from "../src/dominio/calculos.js";

const obs = (...valores: number[]) => valores.map((valor, i) => ({ data: `2026-0${i + 1}-01`, valor }));

describe("variacaoAcumulada", () => {
  it("compõe as taxas em vez de somar", () => {
    // 1,005 × 1,005 = 1,010025
    expect(variacaoAcumulada(obs(0.5, 0.5))).toBe("1.0025");
  });

  it("lida com deflação", () => {
    expect(variacaoAcumulada(obs(1, -1))).toBe("-0.0100");
  });

  it("aplica um percentual do índice (ex.: 110% do CDI)", () => {
    // 1 + 0,05 × 1,1 / 100
    expect(variacaoAcumulada(obs(0.05), 110)).toBe("0.0550");
  });
});

describe("corrigirValor", () => {
  it("corrige um valor e arredonda para centavos", () => {
    const r = corrigirValor(1000, obs(1, 2));
    expect(r.valorCorrigido).toBe("1030.20");
    expect(r.fatorAcumulado).toBe("1.03020000");
    expect(r.variacaoPercentual).toBe("3.0200");
    expect(r.periodos).toBe(2);
  });

  it("não perde precisão com muitos períodos", () => {
    // 1,005 ^ 120 = 1,81939673...
    const r = corrigirValor(100, obs(...Array<number>(120).fill(0.5)));
    expect(r.valorCorrigido).toBe("181.94");
  });
});

describe("resumir", () => {
  it("encontra primeira, última, mínima e máxima", () => {
    const r = resumir(obs(3, 1, 4, 1.5));
    expect(r?.primeira.valor).toBe(3);
    expect(r?.ultima.valor).toBe(1.5);
    expect(r?.minima.valor).toBe(1);
    expect(r?.maxima.valor).toBe(4);
  });

  it("devolve null sem observações", () => {
    expect(resumir([])).toBeNull();
  });
});
