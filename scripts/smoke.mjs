// Teste de fumaça: chama cada ferramenta contra as APIs reais do BCB.
// Uso: pnpm smoke                                 → sobe a CLI compilada por stdio
//      node scripts/smoke.mjs http://localhost:8787/mcp → testa um servidor HTTP (ex.: wrangler dev)
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const url = process.argv[2];
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(
  url
    ? new StreamableHTTPClientTransport(new URL(url))
    : new StdioClientTransport({ command: "node", args: ["packages/cli/dist/index.js"] }),
);

const chamadas = [
  ["buscar_serie", { serie: "selic", ultimos: 1 }],
  ["buscar_serie", { serie: "ipca", data_inicial: "2025-10", data_final: "2026-09" }],
  ["expectativas_focus", { indicador: "ipca" }],
  ["corrigir_valor", { valor: 1000, indice: "ipca", data_inicial: "2020-01" }],
  ["corrigir_valor", { valor: 1000, indice: "cdi", data_inicial: "2015-01-02", data_final: "2026-01-02" }],
];

let falhas = 0;
for (const [name, args] of chamadas) {
  const r = await client.callTool({ name, arguments: args });
  const texto = r.content[0].text;
  if (r.isError) falhas++;
  console.log(`\n## ${name} ${JSON.stringify(args)}${r.isError ? "  ← ERRO" : ""}`);
  console.log(texto.length > 900 ? `${texto.slice(0, 900)}\n…` : texto);
}

await client.close();
process.exit(falhas > 0 ? 1 : 0);
