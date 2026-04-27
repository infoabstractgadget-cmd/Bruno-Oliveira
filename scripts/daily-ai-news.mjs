#!/usr/bin/env node
// Publica diariamente no Notion as novidades de Inteligência Artificial
// usando o Gemini API com grounding via Google Search.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const NOTION_VERSION = "2022-06-28";

const missing = [
  ["GEMINI_API_KEY", GEMINI_API_KEY],
  ["NOTION_TOKEN", NOTION_TOKEN],
  ["NOTION_DATABASE_ID", NOTION_DATABASE_ID],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error(`Variáveis de ambiente em falta: ${missing.join(", ")}`);
  process.exit(1);
}

const today = new Date();
const isoDate = today.toISOString().slice(0, 10);
const longDate = today.toLocaleDateString("pt-PT", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

async function fetchAINews() {
  const prompt = `És um editor de uma newsletter portuguesa sobre Inteligência Artificial.
Pesquisa as novidades mais relevantes do mundo da IA publicadas nas últimas 24 horas (data de referência: ${isoDate}).

Devolve até 8 novidades, ordenadas por relevância, em **português europeu**.

Formato OBRIGATÓRIO (cada novidade separada por linha em branco):

## Título curto da novidade
Resumo em 2 a 3 frases, claro e factual, sem hype.
Fonte: [Nome do site](URL)

Regras:
- Não inventes notícias. Se não encontrares fontes recentes, indica isso.
- Usa apenas links reais devolvidos pela pesquisa.
- Não incluas introduções nem conclusões — começa logo na primeira novidade.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.4 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text || "").join("").trim();
  if (!text) throw new Error("Resposta vazia do Gemini.");
  return text;
}

function parseRichText(line) {
  const out = [];
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIdx = 0;
  let m;
  while ((m = linkRe.exec(line)) !== null) {
    if (m.index > lastIdx) out.push(...splitText(line.slice(lastIdx, m.index)));
    out.push({
      type: "text",
      text: { content: m[1].slice(0, 2000), link: { url: m[2] } },
    });
    lastIdx = linkRe.lastIndex;
  }
  if (lastIdx < line.length) out.push(...splitText(line.slice(lastIdx)));
  return out.length ? out : [{ type: "text", text: { content: line.slice(0, 2000) } }];
}

function splitText(raw) {
  const segments = [];
  const boldRe = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let match;
  while ((match = boldRe.exec(raw)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", text: { content: raw.slice(last, match.index).slice(0, 2000) } });
    }
    segments.push({
      type: "text",
      text: { content: match[1].slice(0, 2000) },
      annotations: { bold: true },
    });
    last = boldRe.lastIndex;
  }
  if (last < raw.length) {
    segments.push({ type: "text", text: { content: raw.slice(last).slice(0, 2000) } });
  }
  return segments;
}

function textToBlocks(text) {
  const blocks = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: parseRichText(line.slice(3)) },
      });
    } else if (line.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: parseRichText(line.slice(2)) },
      });
    } else if (/^\s*[-*]\s+/.test(line)) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: parseRichText(line.replace(/^\s*[-*]\s+/, "")) },
      });
    } else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: parseRichText(line) },
      });
    }
  }
  return blocks;
}

async function notion(path, init = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Notion API ${res.status} em ${path}: ${await res.text()}`);
  }
  return res.json();
}

async function getTitleProperty() {
  const db = await notion(`/databases/${NOTION_DATABASE_ID}`);
  for (const [name, prop] of Object.entries(db.properties)) {
    if (prop.type === "title") return name;
  }
  throw new Error("Não foi encontrada uma propriedade 'title' na database.");
}

async function publishToNotion(content) {
  const titleProp = await getTitleProperty();
  const blocks = textToBlocks(content);

  const first100 = blocks.slice(0, 100);
  const rest = blocks.slice(100);

  const page = await notion("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        [titleProp]: {
          title: [{ type: "text", text: { content: `Novidades de IA — ${isoDate}` } }],
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              { type: "text", text: { content: longDate }, annotations: { italic: true } },
            ],
          },
        },
        ...first100,
      ],
    }),
  });

  for (let i = 0; i < rest.length; i += 100) {
    await notion(`/blocks/${page.id}/children`, {
      method: "PATCH",
      body: JSON.stringify({ children: rest.slice(i, i + 100) }),
    });
  }

  return page;
}

(async () => {
  try {
    console.log(`A obter novidades de IA para ${isoDate}…`);
    const news = await fetchAINews();
    console.log(`Recebidos ${news.length} caracteres do Gemini. A publicar no Notion…`);
    const page = await publishToNotion(news);
    console.log(`Página criada: ${page.url}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
