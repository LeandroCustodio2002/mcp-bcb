import { ErroDaFonte } from "../dominio/tipos.js";

export type Fetch = typeof globalThis.fetch;

export interface OpcoesHttp {
  fetch?: Fetch;
  timeoutMs?: number;
}

/**
 * GET com timeout que transforma qualquer falha em ErroDaFonte com mensagem legível.
 * Devolve null num 404, que no SGS significa "não há dados no intervalo".
 */
export async function obterJson(url: string, opcoes: OpcoesHttp, nomeDaFonte: string): Promise<unknown> {
  try {
    return await obterJsonUmaVez(url, opcoes, nomeDaFonte);
  } catch (erro) {
    // As APIs do BCB oscilam bastante; uma segunda tentativa resolve a maioria dos casos.
    if (erro instanceof ErroTransitorio) return obterJsonUmaVez(url, opcoes, nomeDaFonte);
    throw erro;
  }
}

/** Timeout ou 5xx: vale tentar de novo. */
class ErroTransitorio extends ErroDaFonte {}

async function obterJsonUmaVez(url: string, opcoes: OpcoesHttp, nomeDaFonte: string): Promise<unknown> {
  const fetchFn = opcoes.fetch ?? globalThis.fetch;
  const timeoutMs = opcoes.timeoutMs ?? 20_000;

  let resposta: Response;
  try {
    resposta = await fetchFn(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (erro) {
    if (erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError")) {
      throw new ErroTransitorio(
        `${nomeDaFonte} não respondeu em ${timeoutMs / 1000}s. A API pode estar instável ou o código consultado não existe; tente de novo.`,
      );
    }
    throw new ErroDaFonte(`Não foi possível acessar ${nomeDaFonte}: ${String(erro)}`);
  }

  const corpo = await resposta.text();
  if (resposta.status === 404) return null;
  if (!resposta.ok) {
    const Erro = resposta.status >= 500 ? ErroTransitorio : ErroDaFonte;
    throw new Erro(`${nomeDaFonte} respondeu ${resposta.status}: ${extrairMensagem(corpo)}`);
  }
  try {
    return JSON.parse(corpo);
  } catch {
    throw new ErroDaFonte(`${nomeDaFonte} devolveu uma resposta que não é JSON.`);
  }
}

/**
 * O SGS manda {error, message} ou {erro: {detail: "...Exception: texto"}};
 * o Olinda manda {mensagem} dentro de um comentário /* *\/.
 */
function extrairMensagem(corpo: string): string {
  const limpo = corpo.replace(/^\s*\/\*/, "").replace(/\*\/\s*$/, "");
  try {
    const json = JSON.parse(limpo) as Record<string, unknown>;
    const erro = json.erro as Record<string, unknown> | undefined;
    const detalhe = typeof erro?.detail === "string" ? erro.detail.replace(/^.*Exception:\s*/, "") : undefined;
    const partes = [json.error, json.message, json.mensagem, detalhe].filter((p) => typeof p === "string");
    if (partes.length > 0) return partes.join(" ");
  } catch {
    // corpo não é JSON; cai para o texto cru
  }
  return limpo.slice(0, 300) || "(sem corpo)";
}
