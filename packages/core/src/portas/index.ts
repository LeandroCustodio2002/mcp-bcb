import type { DefinicaoSerie, ExpectativaFocus, Intervalo, Observacao } from "../dominio/tipos.js";

/** De onde vêm as séries temporais (na prática, o SGS do Banco Central). */
export interface FonteDeSeries {
  /** Devolve as observações em ordem cronológica. */
  buscar(serie: DefinicaoSerie, intervalo: Intervalo): Promise<Observacao[]>;
}

/** De onde vêm as expectativas de mercado (na prática, o Focus via Olinda). */
export interface FonteFocus {
  /** A pesquisa mais recente para o indicador e ano, ou null se não houver. */
  expectativaAnual(indicador: string, anoReferencia: number): Promise<ExpectativaFocus | null>;
}

export interface Cache {
  obter<T>(chave: string): Promise<T | undefined>;
  guardar<T>(chave: string, valor: T, ttlSegundos: number): Promise<void>;
}

/** Tudo que as ferramentas precisam; cada entrada (CLI, Worker) monta o seu. */
export interface Dependencias {
  series: FonteDeSeries;
  focus: FonteFocus;
  agora: () => Date;
}
