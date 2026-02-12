import { ExportConfig, SheetData } from '../types';
import { MONTHS, PLATFORMS } from '../constants';

// ─── Minimal XLSX generator (no external deps) ───
export function makeXLSX(sheets: SheetData[]): Uint8Array {
  function escXml(s: string | number): string { 
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); 
  }
  function colLetter(c: number): string { 
    let s=""; c++; 
    while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26)} 
    return s; 
  }

  function makeSheet(data: (string|number|null)[][]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    // col widths
    const maxCols = Math.max(...data.map(r=>r.length),0);
    xml += '<cols>';
    for(let c=0;c<maxCols;c++) {
      const w = c===0 ? 30 : 12;
      xml += `<col min="${c+1}" max="${c+1}" width="${w}" customWidth="1"/>`;
    }
    xml += '</cols><sheetData>';
    data.forEach((row,ri) => {
      xml += `<row r="${ri+1}">`;
      row.forEach((cell,ci) => {
        const ref = colLetter(ci)+(ri+1);
        if(cell===null||cell===undefined||cell==="") return;
        if(typeof cell === "number") {
          xml += `<c r="${ref}"><v>${cell}</v></c>`;
        } else {
          xml += `<c r="${ref}" t="inlineStr"><is><t>${escXml(cell)}</t></is></c>`;
        }
      });
      xml += '</row>';
    });
    xml += '</sheetData></worksheet>';
    return xml;
  }

  // Build ZIP (minimal implementation for XLSX)
  const files: {[key:string]: string} = {};

  // Content Types
  let ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';
  ct += '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>';
  ct += '<Default Extension="xml" ContentType="application/xml"/>';
  ct += '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
  sheets.forEach((_,i) => { ct += `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`; });
  ct += '</Types>';
  files['[Content_Types].xml'] = ct;

  // Rels
  files['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';

  // Workbook rels
  let wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  sheets.forEach((_,i) => { wbRels += `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`; });
  wbRels += '</Relationships>';
  files['xl/_rels/workbook.xml.rels'] = wbRels;

  // Workbook
  let wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
  sheets.forEach((s,i) => { wb += `<sheet name="${escXml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`; });
  wb += '</sheets></workbook>';
  files['xl/workbook.xml'] = wb;

  // Sheets
  sheets.forEach((s,i) => { files[`xl/worksheets/sheet${i+1}.xml`] = makeSheet(s.data); });

  // Create ZIP
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = enc.encode(name);
    const dataBytes = enc.encode(content);

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // sig
    lv.setUint16(4, 20, true); // version
    lv.setUint16(6, 0, true);  // flags
    lv.setUint16(8, 0, true);  // compression (store)
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0, true); // mod date
    // CRC32
    let crc = 0xFFFFFFFF;
    for(let i=0;i<dataBytes.length;i++){crc^=dataBytes[i];for(let j=0;j<8;j++)crc=(crc>>>1)^(crc&1?0xEDB88320:0)}
    crc^=0xFFFFFFFF;
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true); // compressed
    lv.setUint32(22, dataBytes.length, true); // uncompressed
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    local.set(dataBytes, 30 + nameBytes.length);
    parts.push(local);

    // Central directory entry
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    centralDir.push(cd);

    offset += local.length;
  });

  // Write central directory
  const cdOffset = offset;
  let cdSize = 0;
  centralDir.forEach(cd => { parts.push(cd); cdSize += cd.length; });

  // End of central directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, centralDir.length, true);
  ev.setUint16(10, centralDir.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);
  parts.push(eocd);

  const total = parts.reduce((s,p)=>s+p.length,0);
  const result = new Uint8Array(total);
  let pos = 0;
  parts.forEach(p => { result.set(p, pos); pos += p.length; });
  return result;
}

export function exportToExcel(config: ExportConfig): { [key: string]: string } {
  const r = (n: number) => Math.round(n||0);

  const sheet1 = [
    ["SIMULADOR ALWAYS ON MEDIA"],
    ["Marca / Produto", config.brandName || "–"],
    [],
    ["CONFIGURAÇÃO","Valor","Unidade"],
    ["Budget Anual (com Fee)", r(config.budgetAnual), "€"],
    ["Fee Agência", config.feePercent, "%"],
    ["Budget Media Líquido", r(config.budgetMedia), "€"],
    ["Conteúdos Anuais", config.numConteudos, "un."],
    ["Investimento Médio / Publicação", r(config.budgetMedia / (config.numConteudos||1)), "€"],
    [],
    ["OBJETIVOS MEDIA","Percentagem","Investimento €"],
    ["Notoriedade", config.objNotoriedade+"%", r(config.budgetMedia * config.objNotoriedade/100)],
    ["Engagement", config.objEngagement+"%", r(config.budgetMedia * config.objEngagement/100)],
    ["Tráfego", config.objTrafego+"%", r(config.budgetMedia * config.objTrafego/100)],
    [],
    ["PLATAFORMAS","Percentagem","Investimento €"],
    ["Instagram", config.platIG+"%", r(config.budgetMedia * config.platIG/100)],
    ["Facebook", config.platFB+"%", r(config.budgetMedia * config.platFB/100)],
    ["TikTok", config.platTT+"%", r(config.budgetMedia * config.platTT/100)],
    [],
    ["MÉTRICAS POR PLATAFORMA","CPM €","CPE €","CPC €","ER%","CTR%"],
    ...PLATFORMS.map(p => [p, config.metrics[p].cpm, config.metrics[p].cpe, config.metrics[p].cpc, config.metrics[p].er, config.metrics[p].ctr]),
    [],
    ["ESTIMATIVAS ANUAIS","Budget €","Impressões","Engagements","Clicks"],
    ...PLATFORMS.map(p => {
      const b = config.budgetMedia * config.platPcts[p] / 100;
      const m = config.metrics[p];
      return [p, r(b), r(m.cpm>0?(b/m.cpm)*1000:0), r(m.cpe>0?b/m.cpe:0), r(m.cpc>0?b/m.cpc:0)];
    }),
  ];

  const sheet2 = [
    ["Cluster \\ Mês", ...MONTHS, "Total"],
    ...config.monthlyData.map((row,i) => [config.clusterNames[i], ...row.map(v=>r(v)), r(row.reduce((a,b)=>a+b,0))]),
    ["TOTAL", ...config.monthlyTotals.map(t=>r(t)), r(config.monthlyTotals.reduce((a,b)=>a+b,0))],
  ];

  const totalPub = config.monthlyTotals.reduce((s,v)=>s+v,0);
  const sheet3 = [
    ["BUDGET MENSAL POR PLATAFORMA (€)"],
    ["Plataforma \\ Mês", ...MONTHS, "Total"],
    ...PLATFORMS.map(p => {
      const pct = config.platPcts[p]/100;
      const vals = config.monthlyTotals.map(t => totalPub>0 ? r(config.budgetMedia * pct * (t/totalPub)) : 0);
      return [p, ...vals, r(vals.reduce((a,b)=>a+b,0))];
    }),
    [],
    ["PUBLICAÇÕES MENSAIS POR PLATAFORMA"],
    ["Plataforma \\ Mês", ...MONTHS, "Total"],
    ...PLATFORMS.map(p => {
      const pct = config.platPcts[p]/100;
      const vals = config.monthlyTotals.map(t => r(t*pct));
      return [p, ...vals, r(vals.reduce((a,b)=>a+b,0))];
    }),
  ];

  const sheet4: (string | number | null)[][] = [
    ["Cluster · Plataforma", ...MONTHS, "Total"],
  ];
  config.clusterNames.forEach((cname,ci) => {
    PLATFORMS.forEach(p => {
      const pct = config.platPcts[p]/100;
      const vals = config.monthlyData[ci].map(v => r(v*pct));
      sheet4.push([`${cname} · ${p}`, ...vals, r(vals.reduce((a,b)=>a+b,0))]);
    });
  });

  // Build all CSV sheets
  const toCsv = (data: (string|number|null)[][]) => data.map(row => row.map(c => {
    const s = String(c===null||c===undefined?"":c);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(",")).join("\n");

  const csvSheets = {
    "Resumo": toCsv(sheet1),
    "Conteúdos por Mês": toCsv(sheet2),
    "Budget Mensal": toCsv(sheet3),
    "Cluster x Plataforma": toCsv(sheet4),
  };

  // Try XLSX download first
  try {
    const xlsxData = makeXLSX([
      { name: "Resumo", data: sheet1 },
      { name: "Conteúdos por Mês", data: sheet2 },
      { name: "Budget Mensal", data: sheet3 },
      { name: "Cluster x Plataforma", data: sheet4 },
    ]);
    const blob = new Blob([xlsxData], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Simulador_AlwaysOn_${config.brandName||"Media"}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch(e) { /* fallback below */ }

  return csvSheets;
}