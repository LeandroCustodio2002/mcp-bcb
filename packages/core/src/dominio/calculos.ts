import Decimal from "decimal.js";
import type { Observacao } from "./tipos.js";

export interface ResultadoCorrecao {
  valorOriginal: string;
  valorCorrigido: string;
  fatorAcumulado: string;
  variacaoPercentual: string;
  periodos: number;
}

/**
 * Compõe taxas percentuais por período: Π (1 + taxa × percentual/100 / 100).
 * `percentualDoIndice` permite calcular, por exemplo, 110% do CDI.
 */
export function fatorAcumulado(observacoes: readonly Observacao[], percentualDoIndice = 100): Decimal {
  const proporcao = new Decimal(percentualDoIndice).div(100);
  return observacoes.reduce(
    (fator, o) => fator.mul(new Decimal(o.valor).mul(proporcao).div(100).plus(1)),
    new Decimal(1),
  );
}

/** Variação acumulada em %, com 4 casas. */
export function variacaoAcumulada(observacoes: readonly Observacao[], percentualDoIndice = 100): string {
  return fatorAcumulado(observacoes, percentualDoIndice).minus(1).mul(100).toFixed(4);
}

/** Aplica o fator acumulado a um valor em reais, arredondando para centavos. */
export function corrigirValor(
  valor: number,
  observacoes: readonly Observacao[],
  percentualDoIndice = 100,
): ResultadoCorrecao {
  const fator = fatorAcumulado(observacoes, percentualDoIndice);
  return {
    valorOriginal: new Decimal(valor).toFixed(2),
    valorCorrigido: new Decimal(valor).mul(fator).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2),
    fatorAcumulado: fator.toFixed(8),
    variacaoPercentual: fator.minus(1).mul(100).toFixed(4),
    periodos: observacoes.length,
  };
}

export interface Resumo {
  primeira: Observacao;
  ultima: Observacao;
  minima: Observacao;
  maxima: Observacao;
  quantidade: number;
}

export function resumir(observacoes: readonly Observacao[]): Resumo | null {
  const [primeira] = observacoes;
  const ultima = observacoes.at(-1);
  if (!primeira || !ultima) return null;
  let minima = primeira;
  let maxima = primeira;
  for (const o of observacoes) {
    if (o.valor < minima.valor) minima = o;
    if (o.valor > maxima.valor) maxima = o;
  }
  return { primeira, ultima, minima, maxima, quantidade: observacoes.length };
}
