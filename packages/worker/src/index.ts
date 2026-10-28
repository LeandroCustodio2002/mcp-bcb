import { CacheMemoria, criarServidor, dependenciasPadrao, VERSAO } from "@mcp-bcb/core";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { CacheKV } from "./cache-kv.js";

interface Env {
  CACHE?: KVNamespace;
}

// Fora do fetch para ser reaproveitado entre requisições da mesma instância.
const cacheLocal = new CacheMemoria();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/mcp") {
      const deps = dependenciasPadrao(env.CACHE ? new CacheKV(env.CACHE) : cacheLocal);
      // Sem estado: cada requisição recebe um servidor novo. Clientes antigos (protocolo 2025) também são atendidos.
      return createMcpHandler(() => criarServidor(deps)).fetch(request);
    }

    if (pathname === "/") {
      return Response.json({
        nome: "mcp-bcb",
        versao: VERSAO,
        descricao: "Servidor MCP com dados oficiais do Banco Central do Brasil.",
        endpoint_mcp: new URL("/mcp", request.url).toString(),
        codigo: "https://github.com/SEU_USUARIO/mcp-bcb",
      });
    }

    return new Response("Não encontrado", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
