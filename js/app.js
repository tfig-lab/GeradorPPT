(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var C = window.CONFIG || {};
  // Lista padrão de IAs, usada se o config.js estiver desatualizado (ex.: cópia antiga em cache)
  var PROVEDORES_PADRAO = [
    { id: "claude", nome: "Claude (Anthropic)", rotuloChave: "Chave da API do Claude", exemploChave: "sk-ant-api03-...",
      linkChave: "https://console.anthropic.com/settings/keys",
      modelos: [{ id: "claude-sonnet-5-5", nome: "Claude Sonnet 5.5 (recomendado)" }, { id: "claude-opus-5-5", nome: "Claude Opus 5.5 (mais preciso, mais caro)" }, { id: "claude-haiku-5-5", nome: "Claude Haiku 5.5 (mais rápido)" }] },
    { id: "openai", nome: "GPT (OpenAI)", rotuloChave: "Chave da API da OpenAI", exemploChave: "sk-proj-...",
      linkChave: "https://platform.openai.com/api-keys",
      modelos: [{ id: "gpt-6.1-sol", nome: "GPT-6.1 Sol (recomendado)" }, { id: "gpt-6-astra", nome: "GPT-6 Astra (mais preciso, mais caro)" }, { id: "gpt-6-luna", nome: "GPT-6 Luna (mais rápido)" }] }
  ];
  if (!Array.isArray(C.PROVEDORES) || !C.PROVEDORES.length) C.PROVEDORES = PROVEDORES_PADRAO;
  C.FORNECEDORES = C.FORNECEDORES || [];
  C.CAPA = C.CAPA || { titulo: "Saúde de Frota", subtitulo: "Performance Equipamentos Mina" };

  // itens: { id, nome, file, url, status: "aguardando"|"lendo"|"pronto"|"erro", erro, ficha }
  var itens = [];
  var seq = 0;
  var pincel = {}; // por ficha: "r" | "y" | "g" | "w" | null

  function salvarLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lerLocal(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- Configuração ----------
  function fornecedores() {
    var extras = [];
    try { extras = JSON.parse(lerLocal("gppt_fornecedores") || "[]"); } catch (e) {}
    return C.FORNECEDORES.concat(extras);
  }
  function montarSelects() {
    var sf = $("#fornecedor"); sf.innerHTML = "";
    fornecedores().forEach(function (f) { var o = document.createElement("option"); o.value = f.id; o.textContent = f.nome; sf.appendChild(o); });
    var ult = lerLocal("gppt_fornecedor"); if (ult) sf.value = ult;
    var sp = $("#provedor"); sp.innerHTML = "";
    C.PROVEDORES.forEach(function (p) { var o = document.createElement("option"); o.value = p.id; o.textContent = p.nome; sp.appendChild(o); });
    var up = lerLocal("gppt_provedor"); if (up && provedorPorId(up)) sp.value = up;
    aplicarProvedor();
  }
  function provedorPorId(id) { return C.PROVEDORES.filter(function (p) { return p.id === id; })[0]; }
  function provedorAtual() { return provedorPorId($("#provedor").value) || C.PROVEDORES[0]; }
  // troca modelos, rótulo e chave salva conforme o provedor escolhido
  function aplicarProvedor() {
    var p = provedorAtual();
    var sm = $("#modelo"); sm.innerHTML = "";
    p.modelos.forEach(function (m) { var o = document.createElement("option"); o.value = m.id; o.textContent = m.nome; sm.appendChild(o); });
    var um = lerLocal("gppt_modelo_" + p.id); if (um && p.modelos.some(function (m) { return m.id === um; })) sm.value = um;
    $("#rotuloChave").textContent = p.rotuloChave;
    $("#chave").placeholder = p.exemploChave;
    $("#linkChave").href = p.linkChave;
    var ch = lerLocal("gppt_chave_" + p.id) || (p.id === "claude" ? lerLocal("gppt_chave") : "");
    $("#chave").value = ch || "";
    $("#lembrarChave").checked = !!ch;
  }
  function periodoPadrao() {
    var m = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    var d = new Date(); return m[d.getMonth()] + "/" + d.getFullYear();
  }

  // ---------- Upload ----------
  function adicionarArquivos(lista) {
    Array.prototype.forEach.call(lista, function (file) {
      if (!/^image\//.test(file.type)) return;
      itens.push({ id: "p" + (++seq), nome: file.name || ("print-" + seq + ".png"), file: file, url: URL.createObjectURL(file), status: "aguardando" });
    });
    renderMiniaturas(); atualizarBotoes();
  }

  function renderMiniaturas() {
    var box = $("#miniaturas"); box.innerHTML = "";
    itens.forEach(function (it) {
      var d = document.createElement("div"); d.className = "mini";
      var rot = { aguardando: "aguardando", lendo: "lendo…", pronto: "lido", erro: "erro" }[it.status];
      d.innerHTML = (it.url ? '<img alt="" src="' + it.url + '">' : '<div style="height:96px;display:flex;align-items:center;justify-content:center;color:#999">JSON</div>') +
        '<div class="info"><div class="nome" title="' + esc(it.nome) + '">' + esc(it.nome) + '</div>' +
        '<span class="status ' + it.status + '">' + rot + '</span>' +
        (it.erro ? '<div class="erro-msg">' + esc(it.erro) + '</div>' : "") + '</div>' +
        '<button class="pequeno x" title="Remover">×</button>';
      d.querySelector(".x").onclick = function (ev) { ev.stopPropagation(); remover(it.id); };
      box.appendChild(d);
    });
  }

  function remover(id) {
    itens = itens.filter(function (i) { return i.id !== id; });
    renderMiniaturas(); renderFichas(); atualizarBotoes();
  }

  // ---------- Leitura com a API ----------
  function lerTodos() {
    var prov = provedorAtual();
    var chave = $("#chave").value.trim();
    if (!chave) { $("#msgLeitura").textContent = "Informe a " + prov.rotuloChave.toLowerCase() + " para ler os prints."; $("#chave").focus(); return; }
    salvarLocal("gppt_chave_" + prov.id, $("#lembrarChave").checked ? chave : "");
    if (prov.id === "claude") salvarLocal("gppt_chave", "");
    salvarLocal("gppt_provedor", prov.id);
    salvarLocal("gppt_modelo_" + prov.id, $("#modelo").value);
    var modelo = $("#modelo").value;
    var fila = itens.filter(function (i) { return i.file && (i.status === "aguardando" || i.status === "erro"); });
    if (!fila.length) return;
    $("#btnLer").disabled = true;
    $("#msgLeitura").textContent = "Lendo " + fila.length + " print(s)…";
    var ativos = 0, idx = 0, feitos = 0;
    return new Promise(function (fim) {
      function proximo() {
        if (feitos === fila.length) { fim(); return; }
        while (ativos < (C.LEITURAS_SIMULTANEAS || 3) && idx < fila.length) {
          (function (it) {
            ativos++; it.status = "lendo"; it.erro = ""; renderMiniaturas();
            Extrator.lerPrint(it.file, { provedor: prov.id, chave: chave, modelo: modelo }).then(function (f) {
              it.ficha = f; it.status = "pronto";
            }).catch(function (e) {
              it.status = "erro"; it.erro = traduzErro(e);
            }).then(function () {
              ativos--; feitos++; renderMiniaturas(); renderFichas(); atualizarBotoes();
              $("#msgLeitura").textContent = feitos + " de " + fila.length + " lido(s).";
              proximo();
            });
          })(fila[idx++]);
        }
      }
      proximo();
    }).then(function () { atualizarBotoes(); });
  }

  function traduzErro(e) {
    var m = String((e && e.message) || e);
    if (/invalid x-api-key|authentication|incorrect api key|invalid api key/i.test(m) || (e && e.status === 401)) return "Chave da API inválida para o provedor escolhido.";
    if (/quota|billing|credit/i.test(m)) return "Sem créditos ou cota na conta da API: " + m;
    if (/model.*(not found|does not exist)|model_not_found/i.test(m)) return "Modelo não disponível para esta chave: " + m;
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com a API (rede ou bloqueio do navegador).";
    if (/cortada/i.test(m)) return m + " Tente o modelo mais preciso ou um print menor.";
    if (/JSON/i.test(m)) return "Não foi possível interpretar a leitura. Tente de novo ou use outro modelo.";
    return m;
  }

  // ---------- Revisão ----------
  function fichasProntas() { return itens.filter(function (i) { return i.status === "pronto" && i.ficha; }); }

  function renderFichas() {
    var prontas = fichasProntas();
    $("#secRevisao").classList.toggle("oculto", !prontas.length);
    var box = $("#fichas"); box.innerHTML = "";
    prontas.forEach(function (it) { box.appendChild(cardFicha(it)); });
  }

  function campo(rot, valor, onchange, tipo, largura) {
    var w = document.createElement("div");
    if (largura) w.style.maxWidth = largura;
    w.innerHTML = "<label>" + esc(rot) + "</label>";
    var inp = document.createElement("input"); inp.type = tipo || "text"; inp.value = valor === null || valor === undefined ? "" : valor;
    inp.oninput = function () { onchange(inp.value); atualizarBotoes(); };
    w.appendChild(inp); return w;
  }

  function num(v) {
    v = String(v).trim().replace(/%/g, "");
    if (v === "") return null;
    if (/^-?\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, ""); // 31.851 -> 31851
    var n = Number(v.replace(",", "."));
    return isNaN(n) ? v : n;
  }

  function cardFicha(it) {
    var f = it.ficha;
    var card = document.createElement("section"); card.className = "card ficha";
    var topo = document.createElement("div"); topo.className = "ficha-topo";
    topo.innerHTML = '<h3>' + esc(f.titulo || "Print") + '<span class="chip">' + esc(f.indicador || "?") + '</span></h3>';
    var bRem = document.createElement("button"); bRem.className = "pequeno"; bRem.textContent = "Remover";
    bRem.onclick = function () { remover(it.id); };
    topo.appendChild(bRem); card.appendChild(topo);

    var g = document.createElement("div"); g.className = "grade"; g.style.marginTop = "10px";
    g.appendChild(campo("Frota", f.frota, function (v) { f.frota = v; }));
    g.appendChild(campo("Local", f.local, function (v) { f.local = v; }));
    g.appendChild(campo("Qtd. equipamentos", f.qtd_equipamentos, function (v) { f.qtd_equipamentos = num(v); }));
    var dInd = document.createElement("div");
    dInd.innerHTML = '<label>Indicador</label>';
    var sInd = document.createElement("select");
    ["DF", "MTBF", "Outro"].forEach(function (o) { var op = document.createElement("option"); op.value = o; op.textContent = o; sInd.appendChild(op); });
    sInd.value = (f.indicador === "DF" || f.indicador === "MTBF") ? f.indicador : "Outro";
    sInd.onchange = function () { f.indicador = sInd.value; f.unidade = sInd.value === "DF" ? "%" : sInd.value === "MTBF" ? "h" : f.unidade; renderFichas(); };
    dInd.appendChild(sInd); g.appendChild(dInd);
    g.appendChild(campo("Título do gráfico", f.indicador_titulo, function (v) { f.indicador_titulo = v; }));
    card.appendChild(g);

    if (f.avisos && f.avisos.length) {
      var av = document.createElement("div"); av.className = "avisos";
      av.innerHTML = "<strong>Pontos para conferir</strong><ul>" + f.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>";
      card.appendChild(av);
    }

    if (it.url || f._imagem) {
      var det = document.createElement("details");
      det.innerHTML = "<summary>Ver print original</summary>";
      var img = document.createElement("img"); img.className = "print-original"; img.src = it.url || f._imagem; img.alt = "Print original";
      det.appendChild(img); card.appendChild(det);
    }

    // gráfico
    var dg = document.createElement("details"); dg.open = true;
    dg.innerHTML = "<summary>Gráfico</summary>";
    dg.appendChild(tabelaGrafico(f)); card.appendChild(dg);

    // mapa de calor
    var dt = document.createElement("details"); dt.open = true;
    dt.innerHTML = "<summary>Mapa de calor (" + ((f.tabela && f.tabela.linhas) || []).length + " linhas)</summary>";
    dt.appendChild(barraPinceis(it)); dt.appendChild(tabelaCalor(it)); card.appendChild(dt);

    // nota
    var dn = document.createElement("details");
    dn.innerHTML = "<summary>Nota e fontes</summary>";
    var gn = document.createElement("div"); gn.className = "grade"; gn.style.marginTop = "8px";
    var wta = document.createElement("div"); wta.style.gridColumn = "1 / -1";
    wta.innerHTML = "<label>Tópicos da nota (um por linha; **texto** fica em negrito)</label>";
    var ta = document.createElement("textarea"); ta.value = ((f.nota && f.nota.itens) || []).join("\n");
    ta.oninput = function () { f.nota.itens = ta.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean); };
    wta.appendChild(ta); gn.appendChild(wta);
    gn.appendChild(campo("Linha de destaque", f.nota && f.nota.destaque, function (v) { f.nota.destaque = v; }));
    gn.appendChild(campo("Fontes", f.fontes, function (v) { f.fontes = v; }));
    dn.appendChild(gn); card.appendChild(dn);
    return card;
  }

  function tabelaGrafico(f) {
    var g = f.grafico; var wrap = document.createElement("div"); wrap.className = "tabela-wrap";
    var t = document.createElement("table"); t.className = "edit";
    var cols = [];
    (g.anos || []).forEach(function (a) { cols.push({ rot: a.rotulo, real: a, k: "valor" }); });
    (g.meses || []).forEach(function (m) { cols.push({ rot: m.rotulo, real: m, k: "realizado", orc: m }); });
    (g.resumo || []).forEach(function (r) { cols.push({ rot: r.rotulo, real: r, k: "valor" }); });
    var h = "<tr><th></th>" + cols.map(function (c) { return "<th>" + esc(c.rot) + "</th>"; }).join("") + "</tr>";
    t.innerHTML = h;
    ["Realizado / barras", "Orçado (mensal)"].forEach(function (nome, li) {
      var tr = document.createElement("tr");
      tr.innerHTML = '<th style="text-align:left">' + nome + "</th>";
      cols.forEach(function (c) {
        var td = document.createElement("td");
        var alvo = li === 0 ? c.real : c.orc; var k = li === 0 ? c.k : "orcado";
        if (!alvo) { td.style.background = "#F3F3F3"; tr.appendChild(td); return; }
        var inp = document.createElement("input"); inp.value = alvo[k] === null || alvo[k] === undefined ? "" : alvo[k];
        inp.oninput = function () { alvo[k] = num(inp.value); };
        td.appendChild(inp); tr.appendChild(td);
      });
      t.appendChild(tr);
    });
    wrap.appendChild(t); return wrap;
  }

  function barraPinceis(it) {
    var b = document.createElement("div"); b.className = "pinceis";
    b.innerHTML = "<span>Pincel de cor:</span>";
    [[null, "Nenhum (editar números)", ""], ["r", "< 95%", "var(--r)"], ["y", "95–100%", "var(--y)"], ["g", "≥ 100%", "var(--g)"], ["w", "Branco", "#fff"]].forEach(function (p) {
      var bt = document.createElement("button"); bt.className = "pincel" + ((pincel[it.id] || null) === p[0] ? " on" : "");
      bt.innerHTML = (p[2] ? '<i style="background:' + p[2] + '"></i>' : "") + p[1];
      bt.onclick = function () { pincel[it.id] = p[0]; renderFichas(); };
      b.appendChild(bt);
    });
    return b;
  }

  function tabelaCalor(it) {
    var f = it.ficha; var tb = f.tabela || { colunas: [], linhas: [] };
    var wrap = document.createElement("div"); wrap.className = "tabela-wrap";
    var t = document.createElement("table"); t.className = "edit";
    t.innerHTML = "<tr><th>Tag</th><th>Horímetro</th>" + tb.colunas.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "<th></th></tr>";
    tb.linhas.forEach(function (l, li) {
      var tr = document.createElement("tr");
      if (/^total$/i.test(String(l.tag).trim())) tr.className = "total";
      var td = document.createElement("td"); var inp = document.createElement("input"); inp.className = "tag"; inp.value = l.tag || "";
      inp.oninput = function () { l.tag = inp.value; }; td.appendChild(inp); tr.appendChild(td);
      td = document.createElement("td"); var ih = document.createElement("input"); ih.className = "hor"; ih.value = l.horimetro === null || l.horimetro === undefined ? "" : l.horimetro;
      ih.oninput = function () { l.horimetro = num(ih.value); }; td.appendChild(ih); tr.appendChild(td);
      tb.colunas.forEach(function (c, i) {
        var tdv = document.createElement("td");
        var cor = l.valores[i] === null || l.valores[i] === undefined ? "" : (l.cores[i] || "w");
        tdv.className = cor;
        var iv = document.createElement("input"); iv.value = l.valores[i] === null || l.valores[i] === undefined ? "" : l.valores[i];
        iv.oninput = function () {
          l.valores[i] = num(iv.value);
          if (l.valores[i] === null) l.cores[i] = null; else if (!l.cores[i]) l.cores[i] = "w";
          tdv.className = l.valores[i] === null ? "" : l.cores[i];
        };
        tdv.addEventListener("mousedown", function (ev) {
          var p = pincel[it.id];
          if (!p) return;
          ev.preventDefault();
          if (l.valores[i] === null || l.valores[i] === undefined) return;
          l.cores[i] = p; tdv.className = p;
        });
        tdv.appendChild(iv); tr.appendChild(tdv);
      });
      var tdx = document.createElement("td"); var bx = document.createElement("button"); bx.className = "pequeno"; bx.textContent = "×"; bx.title = "Remover linha";
      bx.style.border = "0"; bx.onclick = function () { tb.linhas.splice(li, 1); renderFichas(); };
      tdx.appendChild(bx); tr.appendChild(tdx);
      t.appendChild(tr);
    });
    wrap.appendChild(t); return wrap;
  }

  // ---------- Botões e geração ----------
  function atualizarBotoes() {
    var aguardando = itens.filter(function (i) { return i.file && (i.status === "aguardando" || i.status === "erro"); }).length;
    var lendo = itens.some(function (i) { return i.status === "lendo"; });
    $("#btnLer").disabled = !aguardando || lendo;
    $("#btnLer").textContent = aguardando ? "Ler " + aguardando + " print(s)" : "Ler prints";
    var n = fichasProntas().length;
    $("#btnGerar").disabled = !n || lendo;
    $("#btnExportar").disabled = !n;
    if (!n) { $("#resumo").textContent = itens.length ? itens.length + " print(s) carregado(s)." : "Nenhum print lido ainda."; return; }
    var frotas = {};
    fichasProntas().forEach(function (i) { frotas[(i.ficha.frota || "") + " " + (i.ficha.local || "")] = 1; });
    $("#resumo").textContent = n + " print(s) prontos · " + Object.keys(frotas).length + " frota(s)";
  }

  function fornecedorAtual() {
    var id = $("#fornecedor").value;
    return fornecedores().filter(function (f) { return f.id === id; })[0] || { nome: "" };
  }

  function limparFicha(f) { var c = JSON.parse(JSON.stringify(f)); delete c._imagem; return c; }

  function gerar() {
    var forn = fornecedorAtual();
    salvarLocal("gppt_fornecedor", $("#fornecedor").value);
    var estilo = Object.assign({}, forn.estilo || {}, { rotulosOrcado: $("#rotulosOrcado").checked });
    var fichas = fichasProntas().map(function (i) { return limparFicha(i.ficha); });
    var pres = GeradorPPT.gerarApresentacao(window.PptxGenJS, fichas, {
      estilo: estilo, fornecedorNome: forn.nome, incluirCapa: $("#incluirCapa").checked,
      capaTitulo: C.CAPA.titulo, capaSubtitulo: C.CAPA.subtitulo,
      periodo: $("#periodo").value.trim() || periodoPadrao(), layout: $("#layout").value
    });
    var nome = "Saude de Frota" + (forn.nome ? " - " + forn.nome : "") + " - " + (($("#periodo").value.trim() || periodoPadrao()).replace(/\//g, "-"));
    $("#btnGerar").disabled = true; $("#btnGerar").textContent = "Gerando…";
    pres.writeFile({ fileName: nome + ".pptx" }).catch(function (e) { alert("Erro ao gerar o PPT: " + e.message); })
      .then(function () { $("#btnGerar").textContent = "Gerar PPT"; atualizarBotoes(); });
  }

  function baixar(nome, texto) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: "application/json" })); a.download = nome;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function importarFichas(lista, nomeBase) {
    lista.forEach(function (f, k) {
      Extrator.validar(f);
      itens.push({ id: "p" + (++seq), nome: (nomeBase || "dados") + (lista.length > 1 ? " #" + (k + 1) : ""), status: "pronto", ficha: f, url: f._imagem || null });
    });
    renderMiniaturas(); renderFichas(); atualizarBotoes();
  }

  // ---------- Eventos ----------
  function iniciar() {
    montarSelects();
    $("#periodo").placeholder = periodoPadrao();
    $("#provedor").onchange = aplicarProvedor;

    var zona = $("#zona"), inp = $("#arquivos");
    zona.onclick = function () { inp.click(); };
    zona.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } };
    inp.onchange = function () { adicionarArquivos(inp.files); inp.value = ""; };
    ["dragenter", "dragover"].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add("ativa"); }); });
    ["dragleave", "drop"].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove("ativa"); }); });
    zona.addEventListener("drop", function (e) { adicionarArquivos(e.dataTransfer.files); });
    document.addEventListener("paste", function (e) {
      var fs = [];
      Array.prototype.forEach.call((e.clipboardData && e.clipboardData.items) || [], function (i) { if (i.kind === "file") { var f = i.getAsFile(); if (f) fs.push(f); } });
      if (fs.length) adicionarArquivos(fs);
    });

    $("#btnLer").onclick = lerTodos;
    $("#btnGerar").onclick = gerar;
    $("#btnExportar").onclick = function () {
      baixar("dados-prints.json", JSON.stringify(fichasProntas().map(function (i) { return limparFicha(i.ficha); }), null, 1));
    };
    $("#btnImportar").onclick = function () { $("#arqJson").click(); };
    $("#arqJson").onchange = function () {
      Array.prototype.forEach.call($("#arqJson").files, function (file) {
        file.text().then(function (t) {
          try { var d = JSON.parse(t); importarFichas(Array.isArray(d) ? d : [d], file.name.replace(/\.json$/i, "")); }
          catch (e) { alert("Arquivo inválido: " + file.name); }
        });
      });
      $("#arqJson").value = "";
    };
    $("#btnExemplo").onclick = function () {
      fetch("exemplos/exemplo.json").then(function (r) { return r.json(); })
        .then(function (d) { importarFichas(d, "exemplo"); })
        .catch(function () { alert("Não foi possível carregar o exemplo (abra a página por um servidor, ex.: GitHub Pages)."); });
    };
    $("#btnNovoFornecedor").onclick = function () {
      var nome = (prompt("Nome do fornecedor:") || "").trim();
      if (!nome) return;
      var extras = []; try { extras = JSON.parse(lerLocal("gppt_fornecedores") || "[]"); } catch (e) {}
      var id = nome.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-");
      extras.push({ id: id, nome: nome }); salvarLocal("gppt_fornecedores", JSON.stringify(extras));
      montarSelects(); $("#fornecedor").value = id;
    };
    $("#fornecedor").onchange = function () { salvarLocal("gppt_fornecedor", $("#fornecedor").value); };
    atualizarBotoes();
  }
  iniciar();
})();
