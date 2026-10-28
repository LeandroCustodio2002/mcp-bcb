import { type DefinicaoSerie, ErroDeEntrada } from "./tipos.js";

/** Séries do SGS (Sistema Gerenciador de Séries Temporais) com atalho por nome. */
export const CATALOGO: readonly DefinicaoSerie[] = [
  { apelido: "selic", codigo: 432, nome: "Meta Selic definida pelo Copom", unidade: "% a.a.", periodicidade: "diaria", acumulavel: false },
  { apelido: "selic_diaria", codigo: 11, nome: "Taxa Selic diária", unidade: "% a.d.", periodicidade: "diaria", acumulavel: true },
  { apelido: "cdi", codigo: 12, nome: "Taxa DI (CDI) diária", unidade: "% a.d.", periodicidade: "diaria", acumulavel: true },
  { apelido: "cdi_anual", codigo: 4389, nome: "Taxa DI (CDI) anualizada base 252", unidade: "% a.a.", periodicidade: "diaria", acumulavel: false },
  { apelido: "ipca", codigo: 433, nome: "IPCA - variação mensal", unidade: "% a.m.", periodicidade: "mensal", acumulavel: true },
  { apelido: "igpm", codigo: 189, nome: "IGP-M - variação mensal", unidade: "% a.m.", periodicidade: "mensal", acumulavel: true },
  { apelido: "incc", codigo: 192, nome: "INCC - variação mensal", unidade: "% a.m.", periodicidade: "mensal", acumulavel: true },
  { apelido: "dolar", codigo: 1, nome: "Dólar comercial (PTAX venda)", unidade: "R$/US$", periodicidade: "diaria", acumulavel: false },
  { apelido: "euro", codigo: 21619, nome: "Euro (PTAX venda)", unidade: "R$/€", periodicidade: "diaria", acumulavel: false },
];

/**
 * Aceita um apelido do catálogo ("ipca") ou um código SGS ("433", 433).
 * Códigos fora do catálogo viram uma definição genérica: periodicidade desconhecida
 * é tratada como diária, porque é o caso em que o BCB exige intervalo de datas.
 */
export function resolverSerie(entrada: string | number): DefinicaoSerie {
  const texto = String(entrada).trim().toLowerCase();
  const porApelido = CATALOGO.find((s) => s.apelido === texto);
  if (porApelido) return porApelido;

  if (!/^\d+$/.test(texto)) {
    const apelidos = CATALOGO.map((s) => s.apelido).join(", ");
    throw new ErroDeEntrada(`Série "${entrada}" desconhecida. Use um código SGS numérico ou um destes apelidos: ${apelidos}.`);
  }

  const codigo = Number(texto);
  const porCodigo = CATALOGO.find((s) => s.codigo === codigo);
  if (porCodigo) return porCodigo;

  return {
    apelido: `sgs_${codigo}`,
    codigo,
    nome: `Série SGS ${codigo}`,
    unidade: "conforme a série",
    periodicidade: "diaria",
    acumulavel: false,
  };
}
