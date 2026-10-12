#!/usr/bin/env node
// Extracção de sistemas de design a partir de sites publicados.
// Recolhe apenas padrões visuais (estilos computados, tokens, regras CSS).
// Não guarda texto, imagens nem logótipos.
//
// Uso:
//   node design/extract.js                       # recolhe e agrega os sites por omissão
//   node design/extract.js --build-only          # só reagrega a partir de design/<site>/raw/
//   node design/extract.js --site nome=https://… # site arbitrário (repetível)
//   node design/extract.js --out <pasta>         # pasta de saída (omissão: design/)

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_SITES = {
  '1367studio': 'https://www.1367studio.com/',
  oryzo: 'https://oryzo.ai/',
};
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
const STYLE_PROPS = [
  'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height',
  'letter-spacing', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'row-gap', 'column-gap',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius',
  'border-bottom-left-radius', 'box-shadow', 'transition', 'animation',
  // auxiliares para classificar componentes e cores de contorno
  'border-top-color', 'border-top-width', 'display', 'position', 'text-transform',
  'outline', 'opacity', 'backdrop-filter', 'mix-blend-mode', 'max-width',
];
const STATE_PROPS = ['color', 'background-color', 'border-top-color', 'box-shadow', 'outline',
  'outline-offset', 'text-decoration-line', 'opacity', 'transform', 'filter'];

// ───────────────────────────── argumentos ─────────────────────────────
function parseArgs(argv) {
  const args = { sites: {}, out: HERE, buildOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--build-only') args.buildOnly = true;
    else if (a === '--out') args.out = path.resolve(argv[++i]);
    else if (a === '--site') {
      const [k, ...v] = argv[++i].split('=');
      args.sites[k] = v.join('=');
    }
  }
  if (!Object.keys(args.sites).length) args.sites = DEFAULT_SITES;
  return args;
}

// ───────────────────────────── recolha ─────────────────────────────
async function launch() {
  try {
    return await chromium.launch();
  } catch {
    // Ambiente com Chromium pré-instalado noutra versão
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let last = -1;
    for (let i = 0; i < 400; i++) {
      const h = document.documentElement.scrollHeight;
      window.scrollBy(0, Math.round(window.innerHeight * 0.6));
      await sleep(180);
      const y = window.scrollY + window.innerHeight;
      if (y >= h - 2) {
        if (h === last) break;
        last = h;
        await sleep(600);
      }
    }
    await sleep(800);
    window.scrollTo(0, 0);
    await sleep(800);
  });
}

// Corre no browser: estilos computados, tokens, regras CSS e assinaturas de bibliotecas.
function collectInPage({ STYLE_PROPS, cssTexts }) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const docH = document.documentElement.scrollHeight;
  const isVisible = (el, cs, r) =>
    r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' &&
    parseFloat(cs.opacity) > 0;
  const landmark = (el) => {
    const l = el.closest('header,nav,footer,main,section,article,aside,[role=banner],[role=navigation],[role=contentinfo]');
    return l ? (l.getAttribute('role') || l.tagName.toLowerCase()) : 'body';
  };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const elements = [];
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'META', 'LINK', 'BR'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!isVisible(el, cs, r)) continue;
    const s = {};
    for (const p of STYLE_PROPS) s[p] = cs.getPropertyValue(p);
    elements.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      landmark: landmark(el),
      cls: typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '',
      hasText: ownText(el),
      interactive: el.matches('a[href],button,[role=button],input,select,textarea,summary'),
      rect: { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      childCount: el.children.length,
      s,
    });
  }

  // Regras CSS: CSSOM das folhas acessíveis + texto das folhas cross-origin re-analisado.
  const fontFaces = [], keyframes = [], media = [], rootVars = {}, scrollRules = [];
  const seenFF = new Set(), seenKF = new Set();
  const walk = (rules, source) => {
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) {
        const ff = {
          family: rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim(),
          weight: rule.style.getPropertyValue('font-weight'),
          style: rule.style.getPropertyValue('font-style'),
          display: rule.style.getPropertyValue('font-display'),
          formats: [...rule.style.getPropertyValue('src').matchAll(/format\(["']?([\w-]+)/g)].map((m) => m[1]),
        };
        const k = JSON.stringify(ff);
        if (!seenFF.has(k)) { seenFF.add(k); fontFaces.push(ff); }
      } else if (rule instanceof CSSKeyframesRule) {
        if (!seenKF.has(rule.name)) {
          seenKF.add(rule.name);
          keyframes.push({ name: rule.name, steps: [...rule.cssRules].map((k) => `${k.keyText} { ${k.style.cssText} }`) });
        }
      } else if (rule instanceof CSSMediaRule) {
        media.push(rule.conditionText || rule.media.mediaText);
        walk(rule.cssRules, source);
      } else if (rule.cssRules && rule.cssRules.length) {
        walk(rule.cssRules, source);
      }
      if (rule instanceof CSSStyleRule) {
        if (/(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selectorText)) {
          for (const p of rule.style) if (p.startsWith('--')) rootVars[p] = rule.style.getPropertyValue(p).trim();
        }
        const t = rule.style.cssText;
        if (/animation-timeline|view-timeline|scroll-timeline|scroll-snap-type|scroll-behavior/.test(t)) {
          scrollRules.push(t.match(/(animation-timeline|view-timeline[\w-]*|scroll-timeline[\w-]*|scroll-snap-type|scroll-behavior)\s*:\s*[^;]+/g));
        }
      }
    }
  };
  const blocked = [];
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules, sheet.href || 'inline'); }
    catch { blocked.push(sheet.href); }
  }
  for (const { url, text } of cssTexts) {
    if (!blocked.includes(url)) continue;
    try { const s = new CSSStyleSheet(); s.replaceSync(text); walk(s.cssRules, url); } catch {}
  }
  const rootCS = getComputedStyle(document.documentElement);
  const rootResolved = {};
  for (const k of Object.keys(rootVars)) rootResolved[k] = rootCS.getPropertyValue(k).trim();

  // Canvas / WebGL / vídeo
  const canvases = [...document.querySelectorAll('canvas')].map((c) => {
    const r = c.getBoundingClientRect();
    // Tipo registado pelo hook de getContext instalado antes do carregamento
    const ctx = c.dataset.__ctx || 'sem contexto';
    return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y + scrollY), ctx,
      fixed: getComputedStyle(c).position, landmark: landmark(c) };
  });

  const g = window;
  const globals = {
    'three.js': !!(g.THREE || g.__THREE__),
    GSAP: !!g.gsap || !!g.TweenMax,
    ScrollTrigger: !!g.ScrollTrigger,
    Lenis: !!g.Lenis || !!g.lenis || document.documentElement.classList.contains('lenis'),
    'Locomotive Scroll': !!g.LocomotiveScroll || document.documentElement.classList.contains('has-scroll-smooth'),
    'Framer Motion': !!document.querySelector('[data-framer-appear-id],[data-framer-component-type],[data-projection-id]'),
    Framer: !!document.querySelector('#__framer-badge-container,[data-framer-name]') || !!g.__framer_importFromPackage,
    Webflow: !!g.Webflow || document.documentElement.hasAttribute('data-wf-page'),
    'Barba.js': !!g.barba,
    Swiper: !!g.Swiper || !!document.querySelector('.swiper'),
    'Next.js': !!g.__NEXT_DATA__ || !!document.querySelector('#__next'),
    Nuxt: !!g.__NUXT__,
    Spline: !!document.querySelector('spline-viewer, canvas[data-engine*=spline]'),
  };
  if (g.THREE && g.THREE.REVISION) globals['three.js'] = 'r' + g.THREE.REVISION;
  if (g.__THREE__) globals['three.js'] = 'r' + g.__THREE__;
  if (g.gsap && g.gsap.version) globals.GSAP = g.gsap.version;

  return {
    vpSize: { w: vw, h: vh }, docHeight: docH,
    elements, fontFaces, keyframes, media, rootVars, rootResolved, scrollRules: scrollRules.flat().filter(Boolean),
    blockedSheets: blocked, canvases,
    videos: document.querySelectorAll('video').length,
    globals,
    htmlClass: document.documentElement.className.toString().slice(0, 200),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
  };
}

// Estados hover/focus em botões, links de navegação e cartões.
async function collectStates(page) {
  const handles = await page.$$('a[href], button, [role=button]');
  const picked = [];
  for (const h of handles) {
    if (picked.length >= 30) break;
    const info = await h.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') return null;
      const lm = el.closest('header,nav,footer,[role=navigation]');
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const hasBox = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0;
      const kind = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || (hasBox && pad >= 16)
        ? 'botão' : lm ? `link (${lm.tagName.toLowerCase()})` : 'link';
      return { kind, sig: kind + '|' + cs.backgroundColor + '|' + cs.color + '|' + cs.fontSize };
    }).catch(() => null);
    if (!info || picked.some((p) => p.info.sig === info.sig)) continue;
    picked.push({ h, info });
  }
  const read = (el, props) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
  };
  const out = [];
  for (const { h, info } of picked) {
    try {
      await h.scrollIntoViewIfNeeded({ timeout: 2000 });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(250);
      const base = await h.evaluate(read, STATE_PROPS);
      const transition = await h.evaluate((el) => getComputedStyle(el).transition);
      await h.hover({ timeout: 2000, force: true });
      await page.waitForTimeout(700);
      const hover = await h.evaluate(read, STATE_PROPS);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
      await page.keyboard.press('Tab').catch(() => {});
      await h.evaluate((el) => el.focus({ focusVisible: true }));
      await page.waitForTimeout(400);
      const focus = await h.evaluate(read, STATE_PROPS);
      await h.evaluate((el) => el.blur());
      // Ignora derivações de currentColor sem efeito visível (contorno nulo, outline none)
      const silent = (k, x, y) => (k === 'outline' && /none/.test(x) && /none/.test(y)) ||
        (k === 'border-top-color' && base['border-top-color'] === base.color);
      const diff = (a, b) => Object.fromEntries(Object.keys(a).filter((k) => a[k] !== b[k] && !silent(k, a[k], b[k])).map((k) => [k, [a[k], b[k]]]));
      out.push({ kind: info.kind, base, transition, hover: diff(base, hover), focus: diff(base, focus) });
    } catch { /* elemento sobreposto ou removido */ }
  }
  return out;
}

const LIB_SIGNATURES = {
  'three.js': /three\.module|THREE\.WebGLRenderer|__THREE__|WebGLRenderer\(/,
  GSAP: /gsap\.(to|from|timeline)|GreenSock|_gsScope/,
  ScrollTrigger: /ScrollTrigger/,
  Lenis: /lenis|@studio-freight\/lenis|darkroom\.engineering/i,
  'Framer Motion': /framer-motion|motion\.div|useScroll\(|useTransform\(/,
  Framer: /framerusercontent\.com|framer\.com\/m\//,
  OGL: /\bogl\b.*Renderer|new Renderer\(\{.*dpr/,
  'PixiJS': /PIXI\.|pixi\.js/,
  'Barba.js': /@barba\/core|barba\.init/,
  'Locomotive Scroll': /locomotive-scroll|LocomotiveScroll/,
  'SplitType/SplitText': /SplitType|SplitText/,
  'Spline': /@splinetool|spline\.design/,
  'Rive': /@rive-app|rive\.wasm/,
  'Lottie': /lottie|bodymovin/,
};

async function collectSite(browser, slug, url, outDir) {
  const shotsDir = path.join(outDir, slug, 'screenshots');
  const rawDir = path.join(outDir, slug, 'raw');
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor || 1, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch,
      reducedMotion: 'no-preference',
    });
    await ctx.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        try { if (!this.dataset.__ctx) this.dataset.__ctx = type; } catch {}
        return orig.call(this, type, ...rest);
      };
    });
    const page = await ctx.newPage();
    const cssTexts = [], scriptHits = {}, scriptHosts = new Set();
    page.on('response', async (res) => {
      try {
        const type = res.request().resourceType();
        if (type === 'stylesheet') cssTexts.push({ url: res.url(), text: await res.text() });
        else if (type === 'script') {
          scriptHosts.add(new URL(res.url()).host);
          const text = await res.text();
          for (const [lib, re] of Object.entries(LIB_SIGNATURES)) if (re.test(text)) scriptHits[lib] = (scriptHits[lib] || 0) + 1;
        }
      } catch {}
    });
    const result = { slug, url, viewport: vp.name, width: vp.width, collectedAt: new Date().toISOString() };
    try {
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      result.status = resp ? resp.status() : null;
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2500); // preloaders e animações de entrada
      await autoScroll(page);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.screenshot({ path: path.join(shotsDir, `${vp.name}-${vp.width}-viewport.png`) });
      await page.screenshot({ path: path.join(shotsDir, `${vp.name}-${vp.width}-full.png`), fullPage: true, timeout: 90000 })
        .catch((e) => { result.screenshotError = e.message; });
      Object.assign(result, await page.evaluate(collectInPage, { STYLE_PROPS, cssTexts }));
      result.states = await collectStates(page);
      result.scriptSignatures = scriptHits;
      result.scriptHosts = [...scriptHosts];
    } catch (e) {
      result.error = e.message.split('\n')[0];
    }
    fs.writeFileSync(path.join(rawDir, `${vp.name}.json`), JSON.stringify(result));
    console.log(`[${slug}] ${vp.name}: ${result.error ? 'ERRO ' + result.error : (result.elements?.length ?? 0) + ' elementos visíveis'}`);
    await ctx.close();
  }
}

// ───────────────────────────── agregação ─────────────────────────────
const count = (arr) => {
  const m = new Map();
  for (const v of arr) if (v !== undefined && v !== null && v !== '') m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const keepRepeated = (entries) => entries.filter(([, n]) => n >= 2);
const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function toHex(c) {
  const m = c && c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (a === 0) return null;
  const h = (n) => Math.round(n).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b) + (a < 1 ? h(a * 255) : '');
}
function luminance(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function saturation(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(...v), min = Math.min(...v);
  return max === 0 ? 0 : (max - min) / max;
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const firstFamily = (f) => f.split(',')[0].replace(/["']/g, '').trim();

function splitTopLevel(str) {
  const out = []; let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function aggregate(runs) {
  const els = runs.flatMap((r) => (r.elements || []).map((e) => ({ ...e, vp: r.viewport })));
  const S = (p) => els.map((e) => e.s[p]);

  // Cores, com a função onde aparecem
  const colorUse = new Map();
  const addColor = (hex, role) => {
    if (!hex) return;
    const u = colorUse.get(hex) || { hex, total: 0, text: 0, bg: 0, border: 0 };
    u.total++; u[role]++; colorUse.set(hex, u);
  };
  for (const e of els) {
    if (e.hasText) addColor(toHex(e.s.color), 'text');
    addColor(toHex(e.s['background-color']), 'bg');
    if (px(e.s['border-top-width']) > 0) addColor(toHex(e.s['border-top-color']), 'border');
  }
  for (const r of runs) { addColor(toHex(r.bodyBg), 'bg'); addColor(toHex(r.htmlBg), 'bg'); }
  const colors = [...colorUse.values()].filter((c) => c.total >= 2).sort((a, b) => b.total - a.total);

  // Tipografia: tamanho → combinações mais frequentes
  const textEls = els.filter((e) => e.hasText);
  const families = keepRepeated(count(textEls.map((e) => e.s['font-family'])));
  const sizeGroups = new Map();
  for (const e of textEls) {
    const k = `${e.vp}|${e.s['font-size']}`;
    if (!sizeGroups.has(k)) sizeGroups.set(k, []);
    sizeGroups.get(k).push(e);
  }
  const typeScale = [...sizeGroups.entries()].map(([k, list]) => {
    const [vp, size] = k.split('|');
    const top = (p) => count(list.map((e) => e.s[p]))[0]?.[0];
    return { vp, size: px(size), n: list.length, family: firstFamily(top('font-family') || ''),
      weight: top('font-weight'), lineHeight: top('line-height'), letterSpacing: top('letter-spacing'),
      transform: top('text-transform'), tags: count(list.map((e) => e.tag)).slice(0, 3).map(([t]) => t).join(' ') };
  }).filter((t) => t.n >= 2).sort((a, b) => b.size - a.size);

  // Espaçamento
  const spaceProps = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top',
    'margin-right', 'margin-bottom', 'margin-left', 'row-gap', 'column-gap'];
  const spacing = keepRepeated(count(els.flatMap((e) => spaceProps.map((p) => px(e.s[p])))
    .filter((n) => n !== null && n > 0 && n <= 400).map((n) => round(n, 1))));

  const radii = keepRepeated(count(els.flatMap((e) => {
    const vals = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'].map((p) => e.s[p]);
    return [...new Set(vals)].filter((v) => v && v !== '0px');
  })));
  const shadows = keepRepeated(count(S('box-shadow').filter((v) => v && v !== 'none')));

  // Movimento
  // Só transições com duração > 0 (a primeira duração da declaração)
  const transitions = els.flatMap((e) => (e.s.transition ? splitTopLevel(e.s.transition) : []))
    .filter((t) => { const d = t.match(/(\d*\.?\d+)m?s/); return d && parseFloat(d[1]) > 0; });
  const durations = keepRepeated(count(transitions.map((t) => (t.match(/(\d*\.?\d+)m?s/) || [])[0]).filter((d) => d && !/^0s$/.test(d))));
  const easings = keepRepeated(count(transitions.map((t) => (t.match(/cubic-bezier\([^)]+\)|linear\([^)]*\)|ease-in-out|ease-out|ease-in|steps\([^)]+\)|\bease\b|\blinear\b/) || [])[0])));
  const transProps = keepRepeated(count(transitions.map((t) => t.split(' ')[0])));
  const animations = keepRepeated(count(S('animation').filter((a) => a && !/^none 0s/.test(a) && !/\bnone\b/.test(a.split(' ').slice(-1)[0]))));

  const media = count(runs.flatMap((r) => r.media || []));
  const bpVals = keepRepeated(count(media.flatMap(([m, n]) => [...m.matchAll(/(min|max)-width:\s*([\d.]+)(px|em|rem)/g)]
    .map((x) => { const v = parseFloat(x[2]) * (x[3] === 'px' ? 1 : 16); return Array(n).fill(`${x[1]} ${v}px`); }).flat())));

  const maxWidths = keepRepeated(count(els.filter((e) => e.vp === 'desktop').map((e) => e.s['max-width'])
    .filter((v) => v && v !== 'none' && px(v) >= 600)));
  const containerWidths = keepRepeated(count(els.filter((e) => e.vp === 'desktop' && e.rect.w >= 600 && e.rect.w < 1440 && e.childCount > 0)
    .map((e) => e.rect.w)));

  const desktop = runs.find((r) => r.viewport === 'desktop') || runs[0] || {};
  return {
    colors, families, typeScale, spacing, radii, shadows, durations, easings, transProps, animations,
    media, bpVals, maxWidths, containerWidths,
    rootVars: Object.assign({}, ...runs.map((r) => r.rootResolved || {})),
    fontFaces: dedupe(runs.flatMap((r) => r.fontFaces || []), (f) => JSON.stringify(f)),
    keyframes: dedupe(runs.flatMap((r) => r.keyframes || []), (k) => k.name),
    scrollRules: [...new Set(runs.flatMap((r) => r.scrollRules || []))],
    canvases: runs.flatMap((r) => (r.canvases || []).map((c) => ({ ...c, vp: r.viewport }))),
    videos: Math.max(0, ...runs.map((r) => r.videos || 0)),
    libraries: detectLibraries(runs),
    components: components(runs),
    states: runs.flatMap((r) => (r.states || []).map((s) => ({ ...s, vp: r.viewport }))),
    bg: toHex(desktop.bodyBg) || toHex(desktop.htmlBg),
    docHeights: Object.fromEntries(runs.map((r) => [r.viewport, r.docHeight])),
    errors: runs.filter((r) => r.error).map((r) => `${r.viewport}: ${r.error}`),
  };
}
const dedupe = (arr, key) => { const s = new Set(); return arr.filter((x) => (s.has(key(x)) ? false : s.add(key(x)))); };

function detectLibraries(runs) {
  const libs = {};
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.globals || {})) if (v) libs[k] = { ...(libs[k] || {}), runtime: v };
    for (const [k, n] of Object.entries(r.scriptSignatures || {})) libs[k] = { ...(libs[k] || {}), scripts: Math.max(n, libs[k]?.scripts || 0) };
  }
  return libs;
}

// Componentes recorrentes por heurística (sem texto)
function components(runs) {
  const out = {};
  for (const r of runs) {
    const els = r.elements || [];
    const vh = r.vpSize?.h || 900, vw = r.vpSize?.w || 1440;
    const pick = (e) => e && {
      tag: e.tag, w: e.rect.w, h: e.rect.h, bg: toHex(e.s['background-color']), color: toHex(e.s.color),
      position: e.s.position, padding: `${e.s['padding-top']} ${e.s['padding-right']} ${e.s['padding-bottom']} ${e.s['padding-left']}`,
      radius: e.s['border-top-left-radius'], shadow: e.s['box-shadow'], border: `${e.s['border-top-width']} ${toHex(e.s['border-top-color']) || ''}`,
      font: `${e.s['font-weight']} ${e.s['font-size']}/${e.s['line-height']} ${firstFamily(e.s['font-family'])}`,
      backdrop: e.s['backdrop-filter'], blend: e.s['mix-blend-mode'], gap: e.s['column-gap'],
    };
    const nav = els.find((e) => ['header', 'nav'].includes(e.tag) || ['banner', 'navigation'].includes(e.role))
      || els.find((e) => ['fixed', 'sticky'].includes(e.s.position) && e.rect.y < 50 && e.rect.w >= vw * 0.8);
    const sections = els.filter((e) => ['section', 'main', 'footer', 'header'].includes(e.tag) || (e.rect.w >= vw - 20 && e.rect.h >= vh * 0.4 && e.childCount));
    const hero = sections.filter((e) => e !== nav && e.rect.y < vh * 0.5 && e.rect.h >= vh * 0.5).sort((a, b) => a.rect.y - b.rect.y)[0];
    const heroText = hero && els.filter((e) => e.hasText && e.rect.y >= hero.rect.y && e.rect.y < hero.rect.y + hero.rect.h)
      .sort((a, b) => px(b.s['font-size']) - px(a.s['font-size']))[0];
    const footer = els.find((e) => e.tag === 'footer' || e.role === 'contentinfo');
    const buttons = els.filter((e) => e.interactive && (e.tag === 'button' || e.role === 'button' ||
      ((toHex(e.s['background-color']) || px(e.s['border-top-width']) > 0) && px(e.s['padding-left']) >= 8)));
    const btnSig = count(buttons.map((b) => JSON.stringify(pick(b)))).slice(0, 4).map(([s, n]) => ({ ...JSON.parse(s), n }));
    // Cartões: irmãos repetidos com caixa (fundo, contorno, raio ou sombra)
    const boxed = els.filter((e) => e.rect.w >= 140 && e.rect.w <= vw * 0.7 && e.rect.h >= 120 && e.childCount >= 1 &&
      (toHex(e.s['background-color']) || px(e.s['border-top-width']) > 0 || px(e.s['border-top-left-radius']) > 0 || e.s['box-shadow'] !== 'none'));
    const cardGroups = count(boxed.map((e) => `${e.tag}.${e.cls}|${e.rect.w}`)).filter(([, n]) => n >= 2);
    const cards = cardGroups.slice(0, 3).map(([k, n]) => ({ ...pick(boxed.find((e) => `${e.tag}.${e.cls}|${e.rect.w}` === k)), n }));
    const sectionPads = keepRepeated(count(sections.filter((e) => e.rect.w >= vw - 20).map((e) => `${e.s['padding-top']} / ${e.s['padding-bottom']}`))).slice(0, 4);
    out[r.viewport] = { nav: pick(nav), hero: pick(hero), heroHeading: pick(heroText), footer: pick(footer), buttons: btnSig, cards, sectionPads, sectionCount: sections.length };
  }
  return out;
}

// ───────────────────────────── geração ─────────────────────────────
function nameColors(agg) {
  const named = [];
  const used = new Set();
  const take = (name, c, fn) => { if (c && !used.has(c.hex)) { used.add(c.hex); named.push({ name, ...c, fn }); } };
  const bg = agg.colors.find((c) => c.hex === agg.bg) || [...agg.colors].sort((a, b) => b.bg - a.bg)[0];
  take('bg', bg, 'fundo principal da página');
  const fg = [...agg.colors].filter((c) => c.text > 0).sort((a, b) => b.text - a.text)[0];
  take('fg', fg, 'texto principal');
  const surfaces = agg.colors.filter((c) => c.bg >= 2 && !used.has(c.hex) && saturation(c.hex.slice(0, 7)) < 0.25);
  surfaces.slice(0, 3).forEach((c, i) => take(`surface-${i + 1}`, c, 'superfície/fundo secundário'));
  const muted = agg.colors.filter((c) => c.text >= 2 && !used.has(c.hex) && saturation(c.hex.slice(0, 7)) < 0.25);
  muted.slice(0, 3).forEach((c, i) => take(`fg-muted-${i + 1}`, c, 'texto secundário'));
  const accents = agg.colors.filter((c) => !used.has(c.hex) && saturation(c.hex.slice(0, 7)) >= 0.25);
  accents.slice(0, 4).forEach((c, i) => take(`accent-${i + 1}`, c, 'cor de destaque [função estimada]'));
  const borders = agg.colors.filter((c) => c.border >= 2 && !used.has(c.hex));
  borders.slice(0, 2).forEach((c, i) => take(`border-${i + 1}`, c, 'contornos e divisores'));
  agg.colors.filter((c) => !used.has(c.hex)).slice(0, 6).forEach((c, i) => take(`neutral-${i + 1}`, c, 'apoio [função estimada]'));
  return named;
}

const T_NAMES = ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'];
function tokenize(agg) {
  const colors = nameColors(agg);
  const familyRoles = [];
  agg.families.slice(0, 3).forEach(([stack], i) => {
    const role = /mono/i.test(stack) ? 'mono' : i === 0 ? 'sans' : /serif/i.test(stack) && !/sans/i.test(stack) ? 'serif' : `alt-${i}`;
    familyRoles.push({ role, stack });
  });
  const desk = agg.typeScale.filter((t) => t.vp === 'desktop').sort((a, b) => a.size - b.size);
  const mob = agg.typeScale.filter((t) => t.vp === 'mobile');
  // Até 14 degraus: os tamanhos mais frequentes no desktop
  const steps = [...desk].sort((a, b) => b.n - a.n).slice(0, T_NAMES.length).sort((a, b) => a.size - b.size);
  const baseIdx = steps.reduce((bi, t, i) => (Math.abs(t.size - 16) < Math.abs(steps[bi].size - 16) ? i : bi), 0);
  const text = steps.map((t, i) => ({ name: T_NAMES[Math.max(0, Math.min(T_NAMES.length - 1, 2 + i - baseIdx))] + (i - baseIdx < -2 ? `-${-(i - baseIdx) - 2}` : ''), ...t }));
  const space = agg.spacing.slice(0, 18).map(([v]) => v).sort((a, b) => a - b).map((v) => ({ name: String(v / 4).replace('.', '_'), v }));
  const radius = agg.radii.slice(0, 8).map(([v, n]) => ({ v, n })).sort((a, b) => px(a.v) - px(b.v))
    .map((r, i, all) => ({ ...r, name: px(r.v) >= 999 || /%/.test(r.v) ? 'full' : ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'][i] || `${i}` }));
  const shadow = agg.shadows.slice(0, 5).map(([v], i) => ({ name: ['sm', 'md', 'lg', 'xl', '2xl'][i], v }));
  const dur = agg.durations.slice(0, 6).map(([d]) => d).sort((a, b) => parseFloat(a) * (a.endsWith('ms') ? 1 : 1000) - parseFloat(b) * (b.endsWith('ms') ? 1 : 1000));
  const durations = dur.map((v, i) => ({ name: ['fast', 'base', 'slow', 'slower', 'slowest', 'xslow'][i], v }));
  const easings = agg.easings.slice(0, 5).map(([v], i) => ({ name: i === 0 ? 'default' : `alt-${i}`, v }));
  return { colors, familyRoles, text, mob, space, radius, shadow, durations, easings };
}

function tokensCss(slug, url, tk) {
  const L = [];
  L.push(`/* Tokens de design extraídos de ${url}`, ` * Gerado por design/extract.js. Valores medidos por getComputedStyle,`,
    ` * agregados por frequência (valores com uma única ocorrência descartados).`,
    ` * Nomes dos tokens e funções atribuídas são [estimado]; os valores são medidos. */`, '', ':root {');
  L.push('  /* Cor */');
  for (const c of tk.colors) L.push(`  --color-${c.name}: ${c.hex}; /* ${c.fn}; ${c.total} usos */`);
  L.push('', '  /* Famílias tipográficas */');
  for (const f of tk.familyRoles) L.push(`  --font-${f.role}: ${f.stack};`);
  L.push('', '  /* Escala tipográfica (desktop 1440px) */');
  for (const t of tk.text) {
    L.push(`  --text-${t.name}: ${t.size}px;`);
    L.push(`  --text-${t.name}--line-height: ${t.lineHeight};`);
    L.push(`  --text-${t.name}--letter-spacing: ${t.letterSpacing};`);
    L.push(`  --text-${t.name}--font-weight: ${t.weight};`);
  }
  L.push('', '  /* Espaçamento (nome = valor/4) */');
  for (const s of tk.space) L.push(`  --space-${s.name}: ${s.v}px;`);
  L.push('', '  /* Raios */');
  for (const r of tk.radius) L.push(`  --radius-${r.name}: ${r.v};`);
  if (tk.shadow.length) { L.push('', '  /* Sombras */'); for (const s of tk.shadow) L.push(`  --shadow-${s.name}: ${s.v};`); }
  L.push('', '  /* Movimento */');
  for (const e of tk.easings) L.push(`  --ease-${e.name}: ${e.v};`);
  for (const d of tk.durations) L.push(`  --duration-${d.name}: ${d.v};`);
  L.push('}', '');
  return L.join('\n');
}

function tailwindConfig(slug, tk) {
  const obj = (list, k, v) => Object.fromEntries(list.map((x) => [k(x), v(x)]));
  const theme = {
    colors: obj(tk.colors, (c) => c.name, (c) => `var(--color-${c.name})`),
    fontFamily: obj(tk.familyRoles, (f) => f.role, (f) => [`var(--font-${f.role})`]),
    fontSize: obj(tk.text, (t) => t.name, (t) => [`var(--text-${t.name})`, {
      lineHeight: `var(--text-${t.name}--line-height)`, letterSpacing: `var(--text-${t.name}--letter-spacing)`,
      fontWeight: `var(--text-${t.name}--font-weight)` }]),
    spacing: obj(tk.space, (s) => s.name.replace('_', '.'), (s) => `var(--space-${s.name})`),
    borderRadius: obj(tk.radius, (r) => r.name, (r) => `var(--radius-${r.name})`),
    boxShadow: obj(tk.shadow, (s) => s.name, (s) => `var(--shadow-${s.name})`),
    transitionTimingFunction: obj(tk.easings, (e) => e.name, (e) => `var(--ease-${e.name})`),
    transitionDuration: obj(tk.durations, (d) => d.name, (d) => `var(--duration-${d.name})`),
  };
  return `// Tailwind theme.extend para ${slug}. Gerado por design/extract.js.
// Importar design/${slug}/tokens.css na folha de estilos global.
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: ${JSON.stringify(theme, null, 2).replace(/\n/g, '\n    ')},
  },
};
`;
}

function measurementsMd(slug, url, agg, tk) {
  const L = [];
  const table = (head, rows) => { L.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'); rows.forEach((r) => L.push('| ' + r.join(' | ') + ' |')); L.push(''); };
  L.push(`# Medições: ${slug}`, '', `Fonte: ${url}. Gerado automaticamente por \`design/extract.js\`. Serve de base factual ao DESIGN.md.`, '');
  if (agg.errors.length) L.push('**Erros de recolha:** ' + agg.errors.join('; '), '');
  L.push('## Cores (≥2 ocorrências)');
  table(['token', 'hex', 'usos', 'texto', 'fundo', 'contorno', 'contraste vs bg'], tk.colors.map((c) => [`--color-${c.name}`, c.hex, c.total, c.text, c.bg, c.border, tk.colors[0] ? contrast(c.hex.slice(0, 7), tk.colors[0].hex.slice(0, 7)).toFixed(2) : '']));
  L.push('## Famílias'); table(['stack', 'elementos'], agg.families.map(([f, n]) => [f, n]));
  L.push('## @font-face'); table(['família', 'peso', 'estilo', 'display', 'formatos'], agg.fontFaces.map((f) => [f.family, f.weight, f.style, f.display, f.formats.join(', ')]));
  for (const vp of ['desktop', 'mobile']) {
    L.push(`## Escala tipográfica (${vp})`);
    table(['px', 'família', 'peso', 'line-height', 'letter-spacing', 'transform', 'tags', 'n'], agg.typeScale.filter((t) => t.vp === vp).map((t) => [t.size, t.family, t.weight, t.lineHeight, t.letterSpacing, t.transform, t.tags, t.n]));
  }
  L.push('## Espaçamento (px, frequência)'); L.push(agg.spacing.map(([v, n]) => `${v}×${n}`).join(' · '), '');
  L.push('## Raios'); L.push(agg.radii.map(([v, n]) => `${v}×${n}`).join(' · ') || 'nenhum', '');
  L.push('## Sombras'); L.push(agg.shadows.map(([v, n]) => `\`${v}\` ×${n}`).join('\n\n') || 'nenhuma', '');
  L.push('## Grelha e breakpoints');
  L.push('Media queries (largura): ' + (agg.bpVals.map(([v, n]) => `${v}×${n}`).join(' · ') || 'nenhuma'), '');
  L.push('max-width de contentores: ' + (agg.maxWidths.map(([v, n]) => `${v}×${n}`).join(' · ') || 'nenhum'), '');
  L.push('Larguras de contentores recorrentes (desktop): ' + agg.containerWidths.slice(0, 8).map(([v, n]) => `${v}px×${n}`).join(' · '), '');
  L.push('Altura do documento: ' + JSON.stringify(agg.docHeights), '');
  L.push('## Movimento');
  L.push('Durações: ' + (agg.durations.map(([v, n]) => `${v}×${n}`).join(' · ') || 'nenhuma'), '');
  L.push('Curvas: ' + (agg.easings.map(([v, n]) => `\`${v}\`×${n}`).join(' · ') || 'nenhuma'), '');
  L.push('Propriedades animadas: ' + (agg.transProps.map(([v, n]) => `${v}×${n}`).join(' · ') || 'nenhuma'), '');
  L.push('Animações CSS em uso: ' + (agg.animations.map(([v, n]) => `\`${v}\`×${n}`).join(' · ') || 'nenhuma'), '');
  L.push('@keyframes: ' + (agg.keyframes.map((k) => `\`${k.name}\``).join(', ') || 'nenhum'), '');
  L.push('Regras de scroll em CSS: ' + (agg.scrollRules.map((r) => `\`${r}\``).join(', ') || 'nenhuma'), '');
  L.push(`Canvas: ${agg.canvases.length ? agg.canvases.map((c) => `${c.vp} ${c.w}×${c.h} ${c.ctx} (${c.fixed}, ${c.landmark})`).join('; ') : 'nenhum'} · vídeos: ${agg.videos}`, '');
  L.push('Bibliotecas detectadas: ' + (Object.entries(agg.libraries).map(([k, v]) => `${k} (${[v.runtime && `runtime ${v.runtime === true ? 'sim' : v.runtime}`, v.scripts && `assinatura em ${v.scripts} script(s)`].filter(Boolean).join(', ')})`).join(' · ') || 'nenhuma'), '');
  L.push('## Componentes (heurística)');
  for (const [vp, c] of Object.entries(agg.components)) {
    L.push(`### ${vp}`, '```json', JSON.stringify(c, null, 2), '```', '');
  }
  L.push('## Estados hover/focus (diferenças medidas)');
  for (const s of agg.states) L.push(`- **${s.vp} · ${s.kind}** · transition \`${s.transition}\` · hover ${JSON.stringify(s.hover)} · focus ${JSON.stringify(s.focus)}`);
  L.push('', '## Custom properties em :root', '```css', ...Object.entries(agg.rootVars).slice(0, 200).map(([k, v]) => `${k}: ${v};`), '```', '');
  return L.join('\n');
}

function build(outDir, slug, url) {
  const rawDir = path.join(outDir, slug, 'raw');
  if (!fs.existsSync(rawDir)) return console.log(`[${slug}] sem dados em ${rawDir}`);
  const runs = fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')));
  if (runs.every((r) => r.error)) {
    console.log(`[${slug}] recolha falhou em todas as larguras: ${runs.map((r) => r.error).join(' | ')}`);
    return;
  }
  const agg = aggregate(runs);
  const tk = tokenize(agg);
  fs.writeFileSync(path.join(outDir, slug, 'tokens.css'), tokensCss(slug, url, tk));
  fs.writeFileSync(path.join(outDir, slug, 'tailwind.config.js'), tailwindConfig(slug, tk));
  fs.writeFileSync(path.join(outDir, slug, 'MEDICOES.md'), measurementsMd(slug, url, agg, tk));
  console.log(`[${slug}] tokens.css, tailwind.config.js e MEDICOES.md gerados`);
}

// ───────────────────────────── main ─────────────────────────────
const args = parseArgs(process.argv.slice(2));
if (!args.buildOnly) {
  const browser = await launch();
  for (const [slug, url] of Object.entries(args.sites)) await collectSite(browser, slug, url, args.out);
  await browser.close();
}
for (const [slug, url] of Object.entries(args.sites)) build(args.out, slug, url);
