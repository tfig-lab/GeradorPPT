/*
 * Gerador de PPT de Saúde de Frota
 * --------------------------------
 * Recebe "fichas" (dados extraídos de cada print do BI) e monta um .pptx
 * com gráficos e tabelas NATIVOS do PowerPoint, no padrão visual do modelo.
 *
 * Funciona no navegador (window.GeradorPPT) e no Node (module.exports).
 *
 * Ficha (um print = uma ficha):
 * {
 *   titulo, cabecalho, frota, local, qtd_equipamentos,
 *   indicador: "DF" | "MTBF" | outro, indicador_titulo, unidade: "%" | "h" | "",
 *   grafico: { anos:[{rotulo,valor}], meses:[{rotulo,realizado,orcado}], resumo:[{rotulo,valor,tipo}] },
 *   tabela:  { colunas:[...], linhas:[{tag, horimetro, valores:[...], cores:["r"|"y"|"g"|"w"|null]}] },
 *   nota:    { itens:[...], destaque }, fontes, avisos:[...]
 * }
 */
(function (root) {
  "use strict";

  // ---------- Estilo padrão (extraído do modelo "Frota ... agenda DIs") ----------
  var ESTILO_PADRAO = {
    fonte: "Vale Sans",
    fonteTitulo: "Vale Sans",
    cabecalho: "Diretoria de Engenharia | Mineração, Pelotização e Processo",
    cores: {
      primaria: "009287",      // verde-azulado do modelo (barras, cabeçalho de tabela, título)
      primariaEscura: "007E79",
      ytd: "0BBF9F",
      orcado: "FFC000",
      rt: "555555",
      texto: "262626",
      textoSuave: "7F7F7F",
      borda: "A9D9D5",
      fundoNota: "F2F2F2",
      total: "D9D9D9",
      // mapa de calor
      r: "F7C7AC",  // < 95% do orçado
      y: "F9F1A1",  // entre 95% e 100%
      g: "DAF2D0",  // >= 100%
      w: "FFFFFF"   // não identificado / vazio
    },
    // até quantas linhas de tabela o slide combinado (DF + MTBF juntos, igual ao modelo) é usado
    maxLinhasSlideCombinado: 10,
    // mostrar rótulos de valor na linha do orçado (o modelo mostra só o realizado)
    rotulosOrcado: false,
    // rótulos longos do BI encurtados no eixo do gráfico
    rotulosCurtos: { "Acum. 12M": "12M", "Acum 12M": "12M", "ORC": "Orç" }
  };

  var W = 13.333, H = 7.5;

  function mesclar(base, extra) {
    var out = JSON.parse(JSON.stringify(base));
    if (!extra) return out;
    Object.keys(extra).forEach(function (k) {
      if (extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k]) && out[k] && typeof out[k] === "object") {
        out[k] = mesclar(out[k], extra[k]);
      } else if (extra[k] !== undefined && extra[k] !== null && extra[k] !== "") {
        out[k] = extra[k];
      }
    });
    return out;
  }

  function ehPercentual(f) { return (f.unidade || "").trim() === "%"; }

  function fmtValor(v, f) {
    if (v === null || v === undefined || v === "") return "";
    var n = Number(v);
    if (isNaN(n)) return String(v);
    if (ehPercentual(f)) return Math.round(n) + "%";
    return String(Math.round(n));
  }

  function fmtHorimetro(v) {
    if (v === null || v === undefined || v === "") return "";
    var n = Number(String(v).replace(/[^\d.-]/g, ""));
    if (isNaN(n)) return String(v);
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function limparTituloFrota(f) {
    // "Performance - Frota 794AC Serra Norte - 26 equipamentos." -> "Frota 794AC Serra Norte"
    if (f.frota) return "Frota " + f.frota + (f.local ? " " + f.local : "");
    var t = (f.titulo || "").replace(/^performance\s*[-–]\s*/i, "").replace(/\s*[-–]\s*\d+\s*equipamentos\.?$/i, "");
    return t.trim();
  }

  function rotuloIndicador(f) {
    if (f.indicador_titulo) return f.indicador_titulo;
    if (f.indicador === "DF") return "Disponibilidade Física (DF %)";
    if (f.indicador === "MTBF") return "MTBF (h)";
    return f.indicador || "";
  }

  // texto com **negrito** -> runs do pptxgenjs
  function runsComNegrito(txt, base) {
    var partes = String(txt).split(/(\*\*[^*]+\*\*)/g).filter(function (p) { return p !== ""; });
    return partes.map(function (p) {
      var b = /^\*\*.*\*\*$/.test(p);
      var o = Object.assign({}, base);
      if (b) o.bold = true;
      return { text: b ? p.slice(2, -2) : p, options: o };
    });
  }

  // ---------- Elementos comuns do slide ----------
  function moldura(pres, slide, E, f, subtitulo) {
    // faixa lateral e cabeçalho exatamente como no modelo
    slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: H, fill: { color: E.cores.primaria }, line: { color: E.cores.primaria, width: 0 }, objectName: "Faixa lateral" });
    slide.addText(f.cabecalho || E.cabecalho, {
      x: 0.39, y: 0.12, w: 9, h: 0.32, margin: 0, fontFace: E.fonte, fontSize: 14, color: E.cores.textoSuave, isTextBox: true, objectName: "Cabeçalho"
    });
    slide.addText([
      { text: "Performance", options: { fontSize: 32, color: E.cores.primaria, fontFace: E.fonteTitulo } },
      { text: " – " + limparTituloFrota(f), options: { fontSize: 24, color: E.cores.primaria, fontFace: E.fonteTitulo } }
    ], { x: 0.39, y: 0.46, w: 10.2, h: 0.62, margin: 0, valign: "bottom", isTextBox: true, objectName: "Título" });
    if (subtitulo) {
      slide.addText(subtitulo, {
        x: 0.39, y: 1.08, w: 10, h: 0.26, margin: 0, fontFace: E.fonte, fontSize: 12, color: E.cores.textoSuave, isTextBox: true, objectName: "Subtítulo"
      });
    }
  }

  function legenda(slide, pres, E, x, y) {
    var itens = [["RT", E.cores.rt], ["Orçado", E.cores.orcado], ["Realizado", E.cores.primaria]];
    var cx = x;
    itens.forEach(function (it) {
      slide.addShape(pres.shapes.RECTANGLE, { x: cx, y: y + 0.06, w: 0.12, h: 0.12, fill: { color: it[1] }, line: { color: it[1], width: 0 } });
      slide.addText(it[0], { x: cx + 0.16, y: y, w: 0.9, h: 0.24, margin: 0, fontFace: E.fonte, fontSize: 9, color: E.cores.texto, isTextBox: true });
      cx += 0.16 + (it[0].length * 0.075) + 0.35;
    });
  }

  // ---------- Gráfico combinado (barras anos/resumo + linhas mensais) ----------
  function dadosGrafico(f, E) {
    var g = f.grafico || {};
    var anos = g.anos || [], meses = g.meses || [], resumo = g.resumo || [];
    var pct = ehPercentual(f);
    var conv = function (v) {
      if (v === null || v === undefined || v === "" || isNaN(Number(v))) return null;
      return pct ? Number(v) / 100 : Number(v);
    };
    var labels = [], barras = [], coresBarras = [], linhaReal = [], linhaOrc = [];
    var curto = E.rotulosCurtos || {};
    var rot = function (t) { t = String(t); return curto[t] || t; };
    anos.forEach(function (a) {
      labels.push(rot(a.rotulo)); barras.push(conv(a.valor)); coresBarras.push(E.cores.primaria);
      linhaReal.push(null); linhaOrc.push(null);
    });
    meses.forEach(function (m) {
      labels.push(rot(m.rotulo)); barras.push(null); coresBarras.push(E.cores.primaria);
      linhaReal.push(conv(m.realizado)); linhaOrc.push(conv(m.orcado));
    });
    resumo.forEach(function (r) {
      labels.push(rot(r.rotulo)); barras.push(conv(r.valor));
      var c = r.tipo === "orcado" ? E.cores.orcado : r.tipo === "rt" ? E.cores.rt : (/ytd/i.test(r.rotulo) ? E.cores.ytd : E.cores.primaria);
      coresBarras.push(c);
      linhaReal.push(null); linhaOrc.push(null);
    });
    var todos = barras.concat(linhaReal, linhaOrc).filter(function (v) { return v !== null; });
    var max = todos.length ? Math.max.apply(null, todos) : 1;
    return { labels: labels, barras: barras, coresBarras: coresBarras, linhaReal: linhaReal, linhaOrc: linhaOrc, max: max, pct: pct };
  }

  function addGrafico(slide, pres, E, f, box) {
    var d = dadosGrafico(f, E);
    var fmt = d.pct ? "0%" : "0";
    var rotulo = { fontFace: E.fonte, fontSize: 9, color: "404040" };
    var tipos = [
      {
        type: pres.charts.BAR,
        data: [{ name: "Realizado / Referência", labels: d.labels, values: d.barras }],
        options: {
          chartColors: d.coresBarras, barGapWidthPct: 40,
          showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: fmt,
          dataLabelFontFace: rotulo.fontFace, dataLabelFontSize: rotulo.fontSize, dataLabelColor: rotulo.color
        }
      },
      {
        type: pres.charts.LINE,
        data: [{ name: "Orçado", labels: d.labels, values: d.linhaOrc }],
        options: {
          chartColors: [E.cores.orcado], lineSize: 2, lineDataSymbol: "none",
          showValue: !!E.rotulosOrcado, dataLabelPosition: "b", dataLabelFormatCode: fmt,
          dataLabelFontFace: rotulo.fontFace, dataLabelFontSize: rotulo.fontSize - 1, dataLabelColor: "B38600"
        }
      },
      {
        type: pres.charts.LINE,
        data: [{ name: "Realizado", labels: d.labels, values: d.linhaReal }],
        options: {
          chartColors: [E.cores.primaria], lineSize: 2.25, lineDataSymbol: "none",
          showValue: true, dataLabelPosition: "t", dataLabelFormatCode: fmt,
          dataLabelFontFace: rotulo.fontFace, dataLabelFontSize: rotulo.fontSize, dataLabelColor: E.cores.primariaEscura
        }
      }
    ];
    slide.addChart(tipos, {
      x: box.x, y: box.y, w: box.w, h: box.h,
      objectName: "Gráfico " + (f.indicador || ""),
      showLegend: false, showTitle: false,
      displayBlanksAs: "gap",
      valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: d.max * 1.18,
      valGridLine: { style: "none" }, catGridLine: { style: "none" },
      catAxisLabelFontFace: E.fonte, catAxisLabelFontSize: box.rotacionar ? 8 : 7, catAxisLabelColor: "595959",
      catAxisLabelRotate: -45,
      catAxisLineShow: true, catAxisLineColor: "D9D9D9",
      layout: { x: 0.02, y: 0.04, w: 0.96, h: box.rotacionar ? 0.72 : 0.66 }
    });
  }

  function cardGrafico(slide, pres, E, f, box) {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: box.x, y: box.y, w: box.w, h: box.h, rectRadius: 0.08,
      fill: { color: "FFFFFF" }, line: { color: E.cores.borda, width: 0.75 }, objectName: "Moldura do gráfico"
    });
    slide.addText(rotuloIndicador(f), {
      x: box.x + 0.12, y: box.y + 0.06, w: box.w - 0.24, h: 0.28, margin: 0,
      fontFace: E.fonte, fontSize: 12, color: "555555", isTextBox: true, objectName: "Título do gráfico"
    });
    addGrafico(slide, pres, E, f, { x: box.x + 0.05, y: box.y + 0.34, w: box.w - 0.1, h: box.h - 0.66, rotacionar: box.rotacionar });
    legenda(slide, pres, E, box.x + box.w / 2 - 1.2, box.y + box.h - 0.3);
  }

  // ---------- Mapa de calor (tabela nativa) ----------
  // largura aproximada de um texto em polegadas (métricas de fonte sem serifa tipo Arial, com folga)
  function larguraTexto(txt, fs, negrito, folga) {
    var em = 0;
    String(txt).split("").forEach(function (ch) {
      if (/[0-9]/.test(ch)) em += 0.556;
      else if (/[MW]/.test(ch)) em += 0.86;
      else if (/[IJ]/.test(ch)) em += 0.30;
      else if (/[A-Z]/.test(ch)) em += 0.68;
      else if (/[mw]/.test(ch)) em += 0.80;
      else if (/[ijlft]/.test(ch)) em += 0.28;
      else if (/[a-zà-ú]/.test(ch)) em += 0.53;
      else if (ch === "%") em += 0.89;
      else if (/[.,:;'\/| ]/.test(ch)) em += 0.29;
      else em += 0.45;
    });
    return em * (fs / 72) * (negrito ? 1.07 : 1) * (folga || 1.12);
  }

  var PAD_CELULA = 0.09; // margens internas + folga, em polegadas

  // calcula fonte e larguras para que TAG e HOR nunca quebrem e os valores caibam
  function medirTabela(cols, linhas, f, box, fsInicial) {
    var tags = ["TAG"].concat(linhas.map(function (l) { return String(l.tag || ""); }));
    var hors = ["HOR"].concat(linhas.map(function (l) { return fmtHorimetro(l.horimetro); }));
    var fs = fsInicial;
    for (; fs >= 5; fs -= 0.5) {
      var wTag = Math.max.apply(null, tags.map(function (x) { return larguraTexto(x, fs, true); })) + PAD_CELULA;
      var wHor = Math.max.apply(null, hors.map(function (x) { return larguraTexto(x, fs, true); })) + PAD_CELULA;
      // valores: maior número da coluna; cabeçalho pode quebrar em "Nov/" + "25"
      var wVal = Math.max.apply(null, cols.map(function (c, i) {
        var partes = String(c).split("/").map(function (p, k, arr) { return k < arr.length - 1 ? p + "/" : p; });
        var cab = Math.max.apply(null, partes.map(function (p) { return larguraTexto(p, fs, true, 1.04); }));
        var vals = linhas.map(function (l) { return larguraTexto(fmtValor((l.valores || [])[i], f), fs, true, 1.04); });
        return Math.max.apply(null, [cab].concat(vals));
      }).concat([0])) + PAD_CELULA * 0.75;
      if (wTag + wHor + wVal * cols.length <= box.w) {
        var sobra = box.w - wTag - wHor - wVal * cols.length;
        // a sobra vai quase toda para os valores; TAG e HOR ganham um pouco de respiro
        var extraTH = Math.min(sobra * 0.2, 0.25);
        wTag += extraTH / 2; wHor += extraTH / 2;
        var wCol = cols.length ? (box.w - wTag - wHor) / cols.length : 0;
        return { fs: fs, colW: [wTag, wHor].concat(cols.map(function () { return wCol; })) };
      }
    }
    // último recurso: fonte mínima, tudo proporcional
    var wT = larguraTexto(tags.reduce(function (a, b) { return a.length > b.length ? a : b; }), 5, true) + PAD_CELULA;
    var wH = larguraTexto(hors.reduce(function (a, b) { return a.length > b.length ? a : b; }), 5, true) + PAD_CELULA;
    var wc = (box.w - wT - wH) / Math.max(1, cols.length);
    return { fs: 5, colW: [wT, wH].concat(cols.map(function () { return wc; })) };
  }

  function addTabela(slide, pres, E, f, box) {
    var t = f.tabela || { colunas: [], linhas: [] };
    var cols = t.colunas || [];
    var linhas = t.linhas || [];
    var nLin = linhas.length + 1;
    var hLin = Math.min(0.27, box.h / nLin);
    var fsIni = Math.max(6, Math.min(9.5, Math.round(hLin * 72 * 0.62 * 2) / 2));
    if (box.fsMax) fsIni = Math.min(fsIni, box.fsMax);
    var medida = medirTabela(cols, linhas, f, box, fsIni);
    var fs = medida.fs;
    var borda = { type: "dash", pt: 0.25, color: "808080" };
    var base = { fontFace: E.fonte, fontSize: fs, align: "center", valign: "middle", margin: 0.02, border: [borda, borda, borda, borda] };

    var cab = ["TAG", "HOR"].concat(cols).map(function (c) {
      return { text: String(c), options: Object.assign({}, base, { bold: true, color: "FFFFFF", fill: { color: E.cores.primaria } }) };
    });
    var rows = [cab];
    linhas.forEach(function (l) {
      var total = /^total$/i.test(String(l.tag || "").trim());
      var fundoBase = total ? E.cores.total : "FFFFFF";
      var r = [
        { text: String(l.tag || ""), options: Object.assign({}, base, { color: "404040", fill: { color: fundoBase }, bold: total }) },
        { text: fmtHorimetro(l.horimetro), options: Object.assign({}, base, { color: "404040", fill: { color: fundoBase }, bold: total }) }
      ];
      (l.valores || []).forEach(function (v, i) {
        var k = (l.cores || [])[i];
        var vazio = v === null || v === undefined || v === "";
        var cor = vazio ? "FFFFFF" : (E.cores[k] || "FFFFFF");
        r.push({ text: fmtValor(v, f), options: Object.assign({}, base, { color: "000000", fill: { color: cor }, bold: total }) });
      });
      while (r.length < cols.length + 2) r.push({ text: "", options: Object.assign({}, base, { fill: { color: "FFFFFF" } }) });
      rows.push(r);
    });

    var colW = medida.colW;
    slide.addTable(rows, { x: box.x, y: box.y, w: box.w, colW: colW, rowH: hLin, autoPage: false, objectName: "Mapa de calor " + (f.indicador || "") });
    return hLin * nLin;
  }

  function legendaCalor(slide, pres, E, x, y) {
    var itens = [["< 95% do Orçado", "r"], ["Entre 95% e 100% do Orçado", "y"], ["≥ 100% do Orçado", "g"]];
    var cx = x;
    itens.forEach(function (it) {
      slide.addShape(pres.shapes.OVAL, { x: cx, y: y + 0.055, w: 0.13, h: 0.13, fill: { color: E.cores[it[1]] }, line: { color: "BFBFBF", width: 0.5 } });
      slide.addText(it[0], { x: cx + 0.17, y: y, w: 2.2, h: 0.24, margin: 0, fontFace: E.fonte, fontSize: 9, color: "555555", isTextBox: true });
      cx += 0.17 + it[0].length * 0.068 + 0.3;
    });
  }

  // ---------- Nota ----------
  function addNota(slide, pres, E, itens, destaques, box, fs) {
    fs = fs || 12;
    var esp = fs >= 12 ? 4 : 1;
    slide.addShape(pres.shapes.RECTANGLE, { x: box.x, y: box.y, w: box.w, h: box.h, fill: { color: E.cores.fundoNota }, line: { color: E.cores.fundoNota, width: 0 }, objectName: "Fundo da nota" });
    var base = { fontFace: E.fonte, fontSize: fs, color: E.cores.texto };
    var paras = [{ text: "Nota:", options: Object.assign({}, base, { bold: true, breakLine: true, paraSpaceAfter: esp }) }];
    itens.forEach(function (it) {
      // "- " literal, igual ao print do BI (bullets do pptxgenjs quebram parágrafos com negrito no meio)
      var runs = [{ text: "- ", options: Object.assign({}, base, { paraSpaceAfter: esp }) }]
        .concat(runsComNegrito(String(it).replace(/^\s*[-•]\s*/, ""), Object.assign({}, base, { paraSpaceAfter: esp })));
      runs[runs.length - 1].options = Object.assign({}, runs[runs.length - 1].options, { breakLine: true });
      paras = paras.concat(runs);
    });
    (destaques || []).forEach(function (d) {
      paras.push({ text: d, options: Object.assign({}, base, { bold: true, breakLine: true, paraSpaceAfter: esp }) });
    });
    var last = paras[paras.length - 1];
    if (last) delete last.options.breakLine;
    slide.addText(paras, { x: box.x + 0.1, y: box.y + 0.08, w: box.w - 0.2, h: box.h - 0.16, margin: 0.04, valign: "top", isTextBox: true, objectName: "Nota" });
  }

  function addFontes(slide, E, txt, y) {
    if (!txt) return;
    slide.addText("Fontes: " + String(txt).replace(/^fontes?:\s*/i, ""), {
      x: 0.39, y: y || 7.17, w: 8, h: 0.24, margin: 0, fontFace: E.fonte, fontSize: 8, color: "404040", isTextBox: true, objectName: "Fontes"
    });
  }

  function notasAvisos(f) {
    return (f.avisos || []).filter(Boolean).join("\n");
  }

  // ---------- Slide individual (um print por slide) ----------
  function slideIndividual(pres, E, f) {
    var slide = pres.addSlide();
    var sub = f.qtd_equipamentos ? f.qtd_equipamentos + " equipamentos" : "";
    moldura(pres, slide, E, f, sub);

    cardGrafico(slide, pres, E, f, { x: 0.39, y: 1.45, w: 5.85, h: 3.05, rotacionar: true });
    addNota(slide, pres, E, (f.nota && f.nota.itens) || [], f.nota && f.nota.destaque ? [f.nota.destaque] : [], { x: 0.39, y: 4.68, w: 5.85, h: 2.38 }, 12);

    legendaCalor(slide, pres, E, 6.45, 1.18);
    addTabela(slide, pres, E, f, { x: 6.45, y: 1.45, w: 6.72, h: 5.62 });
    addFontes(slide, E, f.fontes, 7.17);
    var av = notasAvisos(f);
    if (av) slide.addNotes("Avisos da leitura do print:\n" + av);
    return slide;
  }

  // ---------- Slide combinado (DF + MTBF, igual ao modelo) ----------
  function slideCombinado(pres, E, fDF, fMT) {
    var slide = pres.addSlide();
    var base = fDF || fMT;
    moldura(pres, slide, E, base, base.qtd_equipamentos ? base.qtd_equipamentos + " equipamentos" : "");
    var par = [fDF, fMT].filter(Boolean);
    var y0 = 1.42, hBloco = 2.0, gap = 0.1;
    // mesma fonte nas duas tabelas do slide: a menor que couber em ambas
    var boxTab = { w: 6.72, h: hBloco - 0.1 };
    var fsComum = Math.min.apply(null, par.map(function (f) {
      var t = f.tabela || { colunas: [], linhas: [] };
      var hL = Math.min(0.27, boxTab.h / ((t.linhas || []).length + 1));
      return medirTabela(t.colunas || [], t.linhas || [], f, boxTab, Math.max(6, Math.min(9.5, Math.round(hL * 72 * 0.62 * 2) / 2))).fs;
    }));
    par.forEach(function (f, i) {
      var y = y0 + i * (hBloco + gap);
      cardGrafico(slide, pres, E, f, { x: 0.39, y: y, w: 5.85, h: hBloco, rotacionar: false });
      addTabela(slide, pres, E, f, { x: 6.45, y: y + 0.05, w: 6.72, h: hBloco - 0.1, fsMax: fsComum });
    });
    // nota única, sem repetir itens iguais
    var itens = [], vistos = {}, dest = [];
    par.forEach(function (f) {
      ((f.nota && f.nota.itens) || []).forEach(function (it) {
        var k = String(it).toLowerCase().replace(/[^a-zà-ú0-9]/g, "");
        if (!vistos[k]) { vistos[k] = 1; itens.push(it); }
      });
      if (f.nota && f.nota.destaque) dest.push(f.indicador + " " + f.nota.destaque);
    });
    dest = dest.length ? [dest.join("   •   ")] : [];
    var yN = y0 + par.length * (hBloco + gap) + 0.02;
    addNota(slide, pres, E, itens, dest, { x: 0.39, y: yN, w: 12.78, h: Math.max(0.9, 7.1 - yN) }, itens.length > 4 ? 9.5 : 10.5);
    addFontes(slide, E, base.fontes, 7.17);
    var av = par.map(notasAvisos).filter(Boolean).join("\n");
    if (av) slide.addNotes("Avisos da leitura do print:\n" + av);
    return slide;
  }

  function slideCapa(pres, E, opc) {
    var slide = pres.addSlide();
    slide.background = { color: E.cores.primaria };
    slide.addText(opc.capaTitulo || "Saúde de Frota", { x: 0.8, y: 2.3, w: 11.5, h: 0.9, margin: 0, fontFace: E.fonteTitulo, fontSize: 40, bold: true, color: "FFFFFF", isTextBox: true });
    slide.addText(opc.capaSubtitulo || "Performance Equipamentos Mina", { x: 0.8, y: 3.2, w: 11.5, h: 0.6, margin: 0, fontFace: E.fonte, fontSize: 24, color: "FFFFFF", isTextBox: true });
    if (opc.fornecedorNome) slide.addText(opc.fornecedorNome, { x: 0.8, y: 3.85, w: 11.5, h: 0.5, margin: 0, fontFace: E.fonte, fontSize: 20, bold: true, color: "FFFFFF", isTextBox: true });
    slide.addText(E.cabecalho.replace(" | ", " – "), { x: 0.8, y: 5.6, w: 11.5, h: 0.4, margin: 0, fontFace: E.fonte, fontSize: 14, color: "FFFFFF", isTextBox: true });
    if (opc.periodo) slide.addText(opc.periodo, { x: 0.8, y: 6.0, w: 11.5, h: 0.4, margin: 0, fontFace: E.fonte, fontSize: 14, color: "FFFFFF", isTextBox: true });
    return slide;
  }

  // agrupa fichas da mesma frota, DF antes de MTBF, mantendo a ordem de chegada das frotas
  function agrupar(fichas) {
    var grupos = [], idx = {};
    fichas.forEach(function (f) {
      var k = (limparTituloFrota(f) || f.titulo || "").toLowerCase();
      if (!(k in idx)) { idx[k] = grupos.length; grupos.push({ chave: k, itens: [] }); }
      grupos[idx[k]].itens.push(f);
    });
    var ordem = { DF: 0, MTBF: 1 };
    grupos.forEach(function (g) {
      g.itens.sort(function (a, b) { return (ordem[a.indicador] ?? 9) - (ordem[b.indicador] ?? 9); });
    });
    return grupos;
  }

  /**
   * Monta a apresentação.
   * @param PptxGenJS  construtor (window.PptxGenJS no navegador, require("pptxgenjs") no Node)
   * @param fichas     array de fichas
   * @param opc        { estilo, fornecedorNome, incluirCapa, capaTitulo, capaSubtitulo, periodo, layout: "auto"|"individual"|"combinado" }
   */
  function gerarApresentacao(PptxGenJS, fichas, opc) {
    opc = opc || {};
    var E = mesclar(ESTILO_PADRAO, opc.estilo);
    var pres = new PptxGenJS();
    pres.layout = "LAYOUT_WIDE"; // 13,333 x 7,5 pol., igual ao modelo
    pres.title = "Saúde de Frota" + (opc.fornecedorNome ? " – " + opc.fornecedorNome : "");
    pres.author = "Gerador de PPT de Frota";
    pres.theme = { headFontFace: E.fonteTitulo, bodyFontFace: E.fonte };

    if (opc.incluirCapa) slideCapa(pres, E, opc);

    agrupar(fichas).forEach(function (g) {
      var df = g.itens.filter(function (f) { return f.indicador === "DF"; })[0];
      var mt = g.itens.filter(function (f) { return f.indicador === "MTBF"; })[0];
      var maxLin = Math.max.apply(null, g.itens.map(function (f) { return ((f.tabela && f.tabela.linhas) || []).length; }));
      var modo = opc.layout || "auto";
      var combinar = df && mt && (modo === "combinado" || (modo === "auto" && maxLin <= E.maxLinhasSlideCombinado));
      if (combinar) {
        slideCombinado(pres, E, df, mt);
        g.itens.filter(function (f) { return f !== df && f !== mt; }).forEach(function (f) { slideIndividual(pres, E, f); });
      } else {
        g.itens.forEach(function (f) { slideIndividual(pres, E, f); });
      }
    });
    return pres;
  }

  var api = { gerarApresentacao: gerarApresentacao, ESTILO_PADRAO: ESTILO_PADRAO, agrupar: agrupar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GeradorPPT = api;
})(typeof window !== "undefined" ? window : this);
