/** Uma observação de série temporal, com a data já em ISO (aaaa-mm-dd). */
export interface Observacao {
  data: string;
  valor: number;
}

export type Periodicidade = "diaria" | "mensal";

export interface DefinicaoSerie {
  apelido: string;
  codigo: number;
  nome: string;
  unidade: string;
  periodicidade: Periodicidade;
  /** Série de variação percentual por período, que pode ser acumulada. */
  acumulavel: boolean;
}

/** Ou um intervalo de datas (ISO, inclusivo), ou as últimas N observações. */
export type Intervalo =
  | { tipo: "datas"; inicio: string; fim: string }
  | { tipo: "ultimos"; quantidade: number };

export interface ExpectativaFocus {
  indicador: string;
  anoReferencia: number;
  /** Data em que o Focus foi publicado (ISO). */
  dataPesquisa: string;
  mediana: number;
  media: number;
  minimo: number;
  maximo: number;
  desvioPadrao: number;
  respondentes: number;
}

/** Erro causado por uma entrada inválida; a mensagem é mostrada ao assistente. */
export class ErroDeEntrada extends Error {
  override name = "ErroDeEntrada";
}

/** A API do Banco Central falhou, demorou demais ou respondeu algo inesperado. */
export class ErroDaFonte extends Error {
  override name = "ErroDaFonte";
}
