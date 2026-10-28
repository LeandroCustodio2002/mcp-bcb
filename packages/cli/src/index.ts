import { criarServidor, dependenciasPadrao } from "@mcp-bcb/core";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

// Entrada local: o cliente (Claude Desktop, Claude Code, Cursor...) inicia este processo e conversa por stdin/stdout.
const server = criarServidor(dependenciasPadrao());
await server.connect(new StdioServerTransport());
