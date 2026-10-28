# mcp-bcb

Servidor [MCP](https://modelcontextprotocol.io) que dá a assistentes de IA (Claude, Cursor, VS Code...) acesso a **dados econômicos oficiais do Banco Central do Brasil**: Selic, CDI, IPCA, IGP-M, INCC, câmbio e as projeções do Boletim Focus.

Em vez de chutar um número, o assistente consulta a fonte oficial:

> **Você:** Quanto R$ 1.000 de janeiro de 2020 valem hoje, corrigidos pelo IPCA?
>
> **Claude:** *(chama `corrigir_valor`)* R$ 1.446,51, uma inflação acumulada de 44,65% entre jan/2020 e set/2026. O IPCA de outubro ainda não foi divulgado.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `buscar_serie` | Valores de qualquer série do SGS (por apelido como `ipca`, `selic`, `dolar` ou por código), com resumo e variação acumulada |
| `expectativas_focus` | Mediana, média, mínimo e máximo das projeções do mercado para IPCA, Selic, câmbio, PIB e IGP-M |
| `corrigir_valor` | Corrige um valor pela inflação ou calcula o rendimento por um percentual do CDI ou da Selic |
| `listar_series` | Séries com atalho por nome |

## Como usar

### Opção 1: local, via npx

No Claude Desktop, adicione em `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bcb": { "command": "npx", "args": ["-y", "mcp-bcb"] }
  }
}
```

No Claude Code:

```bash
claude mcp add bcb -- npx -y mcp-bcb
```

### Opção 2: remoto, sem instalar nada

No claude.ai, vá em **Configurações → Conectores → Adicionar conector personalizado** e cole:

```
https://mcp-bcb.SEU_USUARIO.workers.dev/mcp
```

## Arquitetura

Monorepo em TypeScript com arquitetura hexagonal enxuta: a lógica fica no `core` e as duas entradas só montam as dependências.

```
packages/
├── core/      domínio (cálculos, datas, catálogo), portas, adaptadores do BCB e ferramentas MCP
├── cli/       entrada stdio → publicada no npm como `mcp-bcb`
└── worker/    entrada HTTP → Cloudflare Workers, com cache opcional no KV
```

- **Domínio puro:** os cálculos usam `decimal.js`, sem `float`, e não sabem nada de MCP ou HTTP.
- **Cache como decorador:** `SeriesComCache` e `FocusComCache` embrulham os clientes do BCB; séries diárias ficam 3 h em cache e mensais, 12 h.
- **Erros úteis para o modelo:** entradas inválidas e falhas da API viram mensagens que o assistente entende e corrige sozinho.
- **Robustez:** os clientes repetem a chamada uma vez em timeout ou erro 5xx, quebram consultas diárias longas em janelas de 9 anos (o SGS aceita no máximo 10) e descartam as datas futuras que a série da meta Selic traz.

## Desenvolvimento

Requer Node 20+ e pnpm.

```bash
pnpm install
pnpm test          # testes unitários e das ferramentas, com fontes falsas
pnpm typecheck
pnpm smoke         # compila a CLI e chama as ferramentas contra as APIs reais
pnpm inspector     # abre o MCP Inspector para testar na mão
pnpm dev:worker    # Worker local em http://localhost:8787/mcp
```

## Publicação

**npm:**

```bash
pnpm --filter mcp-bcb publish --access public
```

**Cloudflare Workers:** é grátis até 100 mil requisições por dia.

```bash
pnpm deploy:worker
```

Para compartilhar o cache entre instâncias, crie um namespace KV com `npx wrangler kv namespace create CACHE` e descomente o bloco `kv_namespaces` em `packages/worker/wrangler.jsonc`.

## Fontes dos dados

- [SGS - Sistema Gerenciador de Séries Temporais](https://www3.bcb.gov.br/sgspub) (`api.bcb.gov.br`)
- [Expectativas de Mercado - Focus](https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/aplicacao) (API Olinda)

Projeto independente, sem vínculo com o Banco Central do Brasil.

## Licença

MIT
