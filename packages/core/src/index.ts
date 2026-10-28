export * from "./dominio/tipos.js";
export { CATALOGO, resolverSerie } from "./dominio/catalogo.js";
export { corrigirValor, fatorAcumulado, variacaoAcumulada } from "./dominio/calculos.js";
export type { Cache, Dependencias, FonteDeSeries, FonteFocus } from "./portas/index.js";
export { ClienteSgs } from "./adaptadores/sgs.js";
export { ClienteFocus } from "./adaptadores/focus.js";
export { CacheMemoria } from "./adaptadores/cache-memoria.js";
export { FocusComCache, SeriesComCache } from "./adaptadores/com-cache.js";
export { criarServidor, registrarFerramentas, VERSAO } from "./ferramentas/index.js";

import { CacheMemoria } from "./adaptadores/cache-memoria.js";
import { FocusComCache, SeriesComCache } from "./adaptadores/com-cache.js";
import { ClienteFocus } from "./adaptadores/focus.js";
import { ClienteSgs } from "./adaptadores/sgs.js";
import type { Cache, Dependencias } from "./portas/index.js";

/** Monta as dependências reais (APIs do BCB) com o cache informado. */
export function dependenciasPadrao(cache: Cache = new CacheMemoria()): Dependencias {
  return {
    series: new SeriesComCache(new ClienteSgs(), cache),
    focus: new FocusComCache(new ClienteFocus(), cache),
    agora: () => new Date(),
  };
}
