# Extracção de sistemas de design

`extract.js` recolhe padrões visuais (nunca texto, imagens ou logótipos) de sites publicados e gera tokens reutilizáveis.

## Execução

```bash
npm i -D playwright && npx playwright install chromium
npm run design:extract              # recolhe 1367studio.com e oryzo.ai e agrega
npm run design:extract -- --build-only   # reagrega a partir de design/<site>/raw/
```

## O que faz, por site e por largura (1440px e 390px)

1. Abre a página, espera por `load` + `networkidle` e faz scroll até ao fim (lazy-load e animações de entrada).
2. Recolhe `getComputedStyle` de todos os elementos visíveis: cor, fundo, família, tamanho, peso, line-height, letter-spacing, padding, margin, gap, border-radius, box-shadow, transition, animation.
3. Lê custom properties de `:root`/`html`, `@font-face`, `@keyframes` e media queries (CSSOM; folhas cross-origin são re-analisadas a partir da resposta de rede).
4. Mede estados hover e focus de até 30 botões/links distintos (diferença de estilos computados).
5. Detecta canvas (contexto `webgl`/`webgl2`/`2d` via hook em `getContext`), vídeo e bibliotecas (three.js, GSAP, ScrollTrigger, Lenis, Framer Motion, Locomotive, Barba, Spline, Lottie…) por globais de runtime e assinaturas nos scripts.
6. Guarda screenshots (viewport e full-page) em `screenshots/`.

## Agregação

Valores agrupados por frequência; tudo o que surge uma única vez é descartado. Gera por site:

- `tokens.css`: `--color-*`, `--font-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--ease-*`, `--duration-*`
- `tailwind.config.js`: `theme.extend` apontando para os tokens
- `MEDICOES.md`: relatório factual (base do `DESIGN.md`)
- `raw/`: dados brutos (ignorados no git)

Os valores são medidos; os nomes dos tokens e a função atribuída a cada cor são inferidos e marcados `[estimado]`.

## Estado

A primeira execução neste ambiente cloud falhou: `www.1367studio.com` e `oryzo.ai` são recusados pela política de rede (`ERR_TUNNEL_CONNECTION_FAILED`, 403 no proxy). Os entregáveis `DESIGN.md`, `screenshots/` e `COMPARACAO.md` ficam pendentes até os domínios serem autorizados.
