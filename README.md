<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1QvWXji6SDzAVMv9rC100uw7sijCFBOru

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## Automação diária — Novidades de IA no Notion

O workflow [`.github/workflows/daily-ai-news.yml`](.github/workflows/daily-ai-news.yml) corre todos os dias às 08:00 UTC (~09:00 em Lisboa) e publica uma nova página numa database do Notion com as novidades de IA das últimas 24h, em português, usando o Gemini com pesquisa Google.

### 1. Criar a integração no Notion

1. Abre <https://www.notion.so/profile/integrations> e cria uma **nova integração interna**.
2. Copia o **Internal Integration Secret** — vai ser o `NOTION_TOKEN`.

### 2. Criar a database

1. No Notion, cria uma página nova e adiciona dentro uma database (`/database` → *Table — Inline*).
2. Garante que existe pelo menos uma propriedade do tipo **Title** (já vem por defeito como `Name`). Mais propriedades são opcionais — o script só preenche o título.
3. No canto superior direito da database, clica `…` → *Connections* → adiciona a integração que criaste.
4. Copia o **Database ID** a partir do URL da página. Por exemplo, em
   `https://www.notion.so/myworkspace/abcd1234efgh5678ijkl9012mnop3456?v=…`
   o ID é `abcd1234efgh5678ijkl9012mnop3456`.

### 3. Configurar os secrets do GitHub

Em `Settings → Secrets and variables → Actions → New repository secret` cria três secrets:

| Nome                 | Valor                                                       |
| -------------------- | ----------------------------------------------------------- |
| `GEMINI_API_KEY`     | A tua chave do Gemini ([AI Studio](https://aistudio.google.com/apikey)) |
| `NOTION_TOKEN`       | O secret da integração Notion (passo 1)                     |
| `NOTION_DATABASE_ID` | O ID da database (passo 2)                                  |

### 4. Testar manualmente

Em `Actions → Daily AI News to Notion → Run workflow` consegues correr já. Localmente:

```bash
GEMINI_API_KEY=... NOTION_TOKEN=... NOTION_DATABASE_ID=... \
  node scripts/daily-ai-news.mjs
```

Para mudar o horário, edita o `cron` no workflow. Para mudar o modelo, define o env `GEMINI_MODEL` (default `gemini-2.5-flash`).
