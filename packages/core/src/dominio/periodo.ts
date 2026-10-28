import type { FonteDeSeries } from "../portas/index.js";
import type { DefinicaoSerie, Observacao } from "./tipos.js";

/** O SGS aceita no máximo 10 anos por consulta em séries diárias; usamos 9 de margem. */
const ANOS_POR_JANELA = 9;

/**
 * Busca um intervalo de qualquer tamanho, quebrando em janelas quando a série é diária.
 * Útil para correções longas (ex.: CDI de 2010 até hoje).
 */
export async function buscarPeriodoLongo(
  fonte: FonteDeSeries,
  serie: DefinicaoSerie,
  inicio: string,
  fim: string,
): Promise<Observacao[]> {
  if (serie.periodicidade === "mensal") {
    return fonte.buscar(serie, { tipo: "datas", inicio, fim });
  }

  const janelas: Array<{ inicio: string; fim: string }> = [];
  let cursor = inicio;
  while (cursor <= fim) {
    const limite = somarAnos(cursor, ANOS_POR_JANELA);
    const fimJanela = limite < fim ? diaAnterior(limite) : fim;
    janelas.push({ inicio: cursor, fim: fimJanela });
    cursor = limite;
    if (fimJanela === fim) break;
  }

  const partes = await Promise.all(janelas.map((j) => fonte.buscar(serie, { tipo: "datas", ...j })));
  return partes.flat();
}

/** Date.UTC normaliza 29/02 em ano não bissexto para 01/03. */
function somarAnos(data: string, anos: number): string {
  const [ano, mes, dia] = data.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(ano + anos, mes - 1, dia)).toISOString().slice(0, 10);
}

function diaAnterior(data: string): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
