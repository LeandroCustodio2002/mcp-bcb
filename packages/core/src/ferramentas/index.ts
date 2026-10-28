import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { corrigirValor, resumir, variacaoAcumulada } from "../dominio/calculos.js";
import { CATALOGO, resolverSerie } from "../dominio/catalogo.js";
import { anosEntre, hojeEmBrasilia, primeiroDiaDoMes, validarDia } from "../dominio/datas.js";
import { buscarPeriodoLongo } from "../dominio/periodo.js";
import { ErroDaFonte, ErroDeEntrada, type Intervalo } from "../dominio/tipos.js";
import { MAXIMO_ULTIMOS } from "../adaptadores/sgs.js";
import type { Dependencias } from "../portas/index.js";

export const VERSAO = "0.1.0";

/** Máximo de observações devolvidas numa resposta, para não estourar o contexto do assistente. */
const MAXIMO_OBSERVACOES = 500;

const INDICADORES_FOCUS = {
  ipca: { nome: "IPCA", unidade: "% no ano" },
  selic: { nome: "Selic", unidade: "% a.a. no fim do ano" },
  cambio: { nome: "Câmbio", unidade: "R$/US$ no fim do ano" },
  pib: { nome: "PIB Total", unidade: "% de crescimento no ano" },
  igpm: { nome: "IGP-M", unidade: "% no ano" },
} as const;

const INDICES_CORRECAO = ["ipca", "igpm", "incc", "cdi", "selic_diaria"] as const;

const SOMENTE_LEITURA = { readOnlyHint: true, openWorldHint: true } as const;

export function criarServidor(deps: Dependencias): McpServer {
  const server = new McpServer({ name: "mcp-bcb", version: VERSAO });
  registrarFerramentas(server, deps);
  return server;
}

export function registrarFerramentas(server: McpServer, deps: Dependencias): void {
  const hoje = () => hojeEmBrasilia(deps.agora());

  server.registerTool(
    "listar_series",
    {
      title: "Listar séries disponíveis",
      description:
        "Lista as séries do Banco Central com atalho por nome (apelido), com código SGS, unidade e periodicidade. " +
        "Qualquer outro código SGS também pode ser usado em buscar_serie.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => responder({ series: CATALOGO }),
  );

  server.registerTool(
    "buscar_serie",
    {
      title: "Buscar série do Banco Central",
      description:
        "Busca valores oficiais de uma série temporal do Banco Central (SGS): Selic, CDI, IPCA, IGP-M, INCC, dólar, euro ou qualquer código SGS. " +
        "Informe um intervalo de datas OU a quantidade de valores mais recentes. " +
        "Para séries de variação (IPCA, IGP-M, CDI...), a resposta traz também a variação acumulada no período.",
      inputSchema: z.object({
        serie: z.string().describe('Apelido (ex.: "ipca", "selic", "dolar") ou código SGS numérico (ex.: "433").'),
        data_inicial: z.string().optional().describe("Início do período, aaaa-mm-dd (ou aaaa-mm para séries mensais)."),
        data_final: z.string().optional().describe("Fim do período, mesmo formato. Padrão: hoje."),
        ultimos: z
          .number()
          .int()
          .min(1)
          .max(MAXIMO_ULTIMOS)
          .optional()
          .describe(`Quantidade de valores mais recentes (1 a ${MAXIMO_ULTIMOS}). Ignorado se data_inicial for informada.`),
      }),
      annotations: SOMENTE_LEITURA,
    },
    async (entrada) =>
      executar(async () => {
        const serie = resolverSerie(entrada.serie);
        const intervalo = montarIntervalo(serie.periodicidade, entrada, hoje());
        const observacoes = await deps.series.buscar(serie, intervalo);
        if (observacoes.length === 0) {
          throw new ErroDeEntrada(`Não há valores de ${serie.nome} no período pedido.`);
        }

        const truncado = observacoes.length > MAXIMO_OBSERVACOES;
        return {
          serie: { apelido: serie.apelido, codigo: serie.codigo, nome: serie.nome, unidade: serie.unidade, periodicidade: serie.periodicidade },
          resumo: resumir(observacoes),
          ...(serie.acumulavel && { variacao_acumulada_percentual: variacaoAcumulada(observacoes) }),
          ...(truncado && {
            aviso: `O período tem ${observacoes.length} valores; mostrando só os ${MAXIMO_OBSERVACOES} mais recentes. O resumo e o acumulado consideram todos.`,
          }),
          observacoes: truncado ? observacoes.slice(-MAXIMO_OBSERVACOES) : observacoes,
        };
      }),
  );

  server.registerTool(
    "expectativas_focus",
    {
      title: "Expectativas do mercado (Boletim Focus)",
      description:
        "Projeções do mercado para IPCA, Selic, câmbio, PIB e IGP-M no fim de cada ano, segundo a pesquisa Focus do Banco Central mais recente.",
      inputSchema: z.object({
        indicador: z.enum(Object.keys(INDICADORES_FOCUS) as [keyof typeof INDICADORES_FOCUS]),
        anos: z
          .array(z.number().int().min(2000).max(2100))
          .min(1)
          .max(5)
          .optional()
          .describe("Anos de referência. Padrão: ano atual e o seguinte."),
      }),
      annotations: SOMENTE_LEITURA,
    },
    async ({ indicador, anos }) =>
      executar(async () => {
        const definicao = INDICADORES_FOCUS[indicador];
        const anoAtual = Number(hoje().slice(0, 4));
        const anosPedidos = anos ?? [anoAtual, anoAtual + 1];

        const resultados = await Promise.all(anosPedidos.map((ano) => deps.focus.expectativaAnual(definicao.nome, ano)));
        const expectativas = resultados.filter((r) => r !== null);
        const semDados = anosPedidos.filter((_, i) => resultados[i] === null);

        if (expectativas.length === 0) {
          throw new ErroDeEntrada(`O Focus não tem projeções de ${definicao.nome} para ${anosPedidos.join(", ")}.`);
        }
        return {
          indicador: definicao.nome,
          unidade: definicao.unidade,
          expectativas,
          ...(semDados.length > 0 && { anos_sem_projecao: semDados }),
        };
      }),
  );

  server.registerTool(
    "corrigir_valor",
    {
      title: "Corrigir valor por índice",
      description:
        "Corrige um valor em reais pela inflação (IPCA, IGP-M, INCC) ou calcula o rendimento por um percentual do CDI ou da Selic. " +
        "Índices mensais usam a variação de cada mês de data_inicial até data_final, inclusive. " +
        "CDI e Selic usam as taxas diárias de data_inicial (inclusive) até data_final (exclusive).",
      inputSchema: z.object({
        valor: z.number().positive().describe("Valor em reais."),
        indice: z.enum(INDICES_CORRECAO),
        data_inicial: z.string().describe("aaaa-mm para índices mensais; aaaa-mm-dd para CDI e Selic."),
        data_final: z.string().optional().describe("Mesmo formato. Padrão: hoje."),
        percentual_do_indice: z
          .number()
          .positive()
          .max(1000)
          .optional()
          .describe("Percentual do índice aplicado, ex.: 110 para 110% do CDI. Padrão: 100."),
      }),
      annotations: SOMENTE_LEITURA,
    },
    async (entrada) =>
      executar(async () => {
        const serie = resolverSerie(entrada.indice);
        const mensal = serie.periodicidade === "mensal";
        const normalizar = mensal ? primeiroDiaDoMes : validarDia;
        const inicio = normalizar(entrada.data_inicial, "data_inicial");
        const fim = normalizar(entrada.data_final ?? hoje(), "data_final");
        if (inicio > fim) throw new ErroDeEntrada("data_inicial precisa ser anterior a data_final.");

        const todas = await buscarPeriodoLongo(deps.series, serie, inicio, fim);
        const observacoes = mensal ? todas : todas.filter((o) => o.data < fim);
        const primeira = observacoes[0];
        const ultima = observacoes.at(-1);
        if (!primeira || !ultima) {
          throw new ErroDeEntrada(`Não há valores de ${serie.nome} entre ${inicio} e ${fim}.`);
        }

        const avisos: string[] = [];
        if (mensal && ultima.data < fim) {
          avisos.push(
            `${serie.nome} de ${fim.slice(0, 7)} ainda não foi divulgado; o cálculo vai até ${ultima.data.slice(0, 7)}.`,
          );
        }
        if (mensal && primeira.data > inicio) {
          avisos.push(`A série só tem dados a partir de ${primeira.data.slice(0, 7)}.`);
        }

        return {
          indice: serie.nome,
          percentual_do_indice: entrada.percentual_do_indice ?? 100,
          ...corrigirValor(entrada.valor, observacoes, entrada.percentual_do_indice),
          periodo_efetivo: { de: primeira.data, ate: ultima.data },
          ...(avisos.length > 0 && { avisos }),
        };
      }),
  );
}

function montarIntervalo(
  periodicidade: "diaria" | "mensal",
  entrada: { data_inicial?: string | undefined; data_final?: string | undefined; ultimos?: number | undefined },
  hoje: string,
): Intervalo {
  if (!entrada.data_inicial) {
    if (entrada.data_final) throw new ErroDeEntrada("Informe data_inicial junto com data_final.");
    return { tipo: "ultimos", quantidade: entrada.ultimos ?? (periodicidade === "mensal" ? 12 : 10) };
  }

  const normalizar = periodicidade === "mensal" ? primeiroDiaDoMes : validarDia;
  const inicio = normalizar(entrada.data_inicial, "data_inicial");
  const fim = normalizar(entrada.data_final ?? hoje, "data_final");
  if (inicio > fim) throw new ErroDeEntrada("data_inicial precisa ser anterior a data_final.");
  if (periodicidade === "diaria" && anosEntre(inicio, fim) > 10) {
    throw new ErroDeEntrada("Séries diárias aceitam no máximo 10 anos por consulta. Divida o período.");
  }
  return { tipo: "datas", inicio, fim };
}

/** Converte o resultado em resposta MCP e erros conhecidos em mensagens que o assistente entende. */
async function executar(fn: () => Promise<object>) {
  try {
    return responder(await fn());
  } catch (erro) {
    if (erro instanceof ErroDeEntrada || erro instanceof ErroDaFonte) {
      return { isError: true, content: [{ type: "text" as const, text: erro.message }] };
    }
    throw erro;
  }
}

function responder(dados: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify(dados, null, 2) }] };
}
