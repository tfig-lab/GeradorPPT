/*
 * Leitura dos prints do BI com IA de visão: Claude (Anthropic) ou GPT (OpenAI).
 * Cada imagem vira uma "ficha" JSON no formato esperado por gerador.js.
 */
(function (root) {
  "use strict";

  var PROMPT = [
    "Você recebe um print (captura de tela) de um painel de BI de performance de frota de equipamentos de mina.",
    "O print normalmente tem: um título (ex.: \"Performance - Frota 794AC Serra Norte - 26 equipamentos.\"),",
    "um gráfico de um indicador (DF = Disponibilidade Física em %, ou MTBF em horas, ou outro), uma caixa \"Nota:\"",
    "e uma tabela \"MAPA DE CALOR\" com uma linha por equipamento (Tag, Horimetro, meses, 12M, YTD) e uma linha Total.",
    "",
    "Extraia TUDO o que estiver visível e responda SOMENTE com um objeto JSON válido (sem markdown, sem comentários), neste formato:",
    "{",
    "  \"titulo\": \"texto exato do título\",",
    "  \"cabecalho\": \"texto pequeno acima do título, se houver\",",
    "  \"frota\": \"modelo da frota, ex.: 794AC\",",
    "  \"local\": \"local, ex.: Serra Norte\",",
    "  \"qtd_equipamentos\": 26,",
    "  \"indicador\": \"DF\" ou \"MTBF\" ou outro nome curto,",
    "  \"indicador_titulo\": \"título do gráfico exatamente como aparece, ex.: Disponibilidade Física (%)\",",
    "  \"unidade\": \"%\" ou \"h\" ou \"\",",
    "  \"grafico\": {",
    "    \"anos\":   [{\"rotulo\": \"2024\", \"valor\": 86}, {\"rotulo\": \"2025\", \"valor\": 86}],",
    "    \"meses\":  [{\"rotulo\": \"Nov/25\", \"realizado\": 86, \"orcado\": 84}, ...um item por mês do eixo...],",
    "    \"resumo\": [{\"rotulo\": \"YTD 26\", \"valor\": 83, \"tipo\": \"realizado\"}, {\"rotulo\": \"Acum. 12M\", \"valor\": 84, \"tipo\": \"realizado\"},",
    "               {\"rotulo\": \"ORC\", \"valor\": 86, \"tipo\": \"orcado\"}, {\"rotulo\": \"RT\", \"valor\": 86, \"tipo\": \"rt\"}]",
    "  },",
    "  \"tabela\": {",
    "    \"colunas\": [\"Nov/25\", \"Dez/25\", ..., \"12M\", \"YTD\"],",
    "    \"linhas\": [",
    "      {\"tag\": \"CM5701\", \"horimetro\": 31851, \"valores\": [66, 88, 100, null, ...], \"cores\": [\"r\", \"g\", \"g\", null, ...]},",
    "      ...,",
    "      {\"tag\": \"Total\", \"horimetro\": 31851, \"valores\": [...], \"cores\": [...]}",
    "    ]",
    "  },",
    "  \"nota\": {\"itens\": [\"cada tópico da nota, sem o traço inicial; use **texto** para o que estiver em negrito\"],",
    "           \"destaque\": \"linha final de resumo, ex.: 2026: 1ºT: 87,42% | 2ºT: 86,61% | 3ºT: 79,34% | 4ºT: 73,42%\"},",
    "  \"fontes\": \"texto após 'Fontes:'\",",
    "  \"avisos\": [\"qualquer coisa que você não conseguiu ler com segurança\"]",
    "}",
    "",
    "Regras:",
    "- Números sem símbolo: 86% vira 86; \"31,851\" no horímetro é 31851 (vírgula = separador de milhar). Decimais com vírgula (\"87,42\") só aparecem em textos.",
    "- Em \"valores\", use null para célula vazia/em branco. Leia cada célula da tabela com cuidado, linha por linha, coluna por coluna.",
    "- \"valores\" e \"cores\" têm exatamente o mesmo tamanho de \"colunas\".",
    "- \"cores\" segue a legenda do mapa de calor: \"r\" = vermelho/salmão (< 95% do orçado), \"y\" = amarelo (entre 95% e 100%),",
    "  \"g\" = verde/verde-água (≥ 100%), \"w\" = branco (não identificado) e null quando a célula está vazia.",
    "- Linha Total: inclua como última linha, com tag \"Total\".",
    "- Se a tabela tiver barra de rolagem ou linhas cortadas, extraia só as visíveis e registre em \"avisos\" quais parecem faltar.",
    "- Gráfico: \"anos\" são as barras antes dos meses; \"meses\" são os pontos mensais (realizado = linha/área do realizado; orcado = linha do orçado);",
    "  \"resumo\" são as barras depois dos meses (YTD, acumulado 12M, ORC, RT). Ignore a série \"Últ. 12 M\".",
    "  Se o rótulo de algum mês realizado não aparecer no gráfico, use o valor do mesmo mês na linha Total da tabela.",
    "- Não invente valores. Se algo estiver ilegível, use null e explique em \"avisos\"."
  ].join("\n");

  function lerArquivoBase64(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result)); };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  // Reduz imagens muito grandes (a API aceita até ~5 MB por imagem)
  function prepararImagem(file) {
    return lerArquivoBase64(file).then(function (dataUrl) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () {
          var maxLado = 2400;
          var grande = dataUrl.length > 4.5e6 || Math.max(img.width, img.height) > maxLado;
          if (!grande) {
            res({ mediaType: dataUrl.slice(5, dataUrl.indexOf(";")), data: dataUrl.split(",")[1], largura: img.width, altura: img.height });
            return;
          }
          var esc = Math.min(1, maxLado / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          var u = c.toDataURL("image/png");
          res({ mediaType: "image/png", data: u.split(",")[1], largura: c.width, altura: c.height });
        };
        img.src = dataUrl;
      });
    });
  }

  function extrairJSON(texto) {
    var t = String(texto).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    var i = t.indexOf("{"), j = t.lastIndexOf("}");
    if (i < 0 || j < 0) throw new Error("A resposta não trouxe JSON.");
    return JSON.parse(t.slice(i, j + 1));
  }

  // Confere a ficha e acrescenta avisos (não altera valores)
  function validar(f, img) {
    f.avisos = Array.isArray(f.avisos) ? f.avisos : [];
    f.grafico = f.grafico || { anos: [], meses: [], resumo: [] };
    f.tabela = f.tabela || { colunas: [], linhas: [] };
    f.nota = f.nota || { itens: [], destaque: "" };
    var cols = f.tabela.colunas || [];
    (f.tabela.linhas || []).forEach(function (l) {
      l.valores = l.valores || [];
      l.cores = l.cores || [];
      if (l.valores.length !== cols.length) f.avisos.push("Linha " + l.tag + ": " + l.valores.length + " valores para " + cols.length + " colunas.");
      while (l.valores.length < cols.length) l.valores.push(null);
      while (l.cores.length < l.valores.length) l.cores.push(null);
      l.cores = l.cores.map(function (c, i) {
        if (l.valores[i] === null || l.valores[i] === undefined) return null;
        c = String(c || "").toLowerCase();
        return "rygw".indexOf(c) >= 0 && c ? c : "w";
      });
    });
    // mês do gráfico x linha Total
    var total = (f.tabela.linhas || []).filter(function (l) { return /^total$/i.test(String(l.tag).trim()); })[0];
    if (!total) f.avisos.push("A linha Total não foi encontrada na tabela.");
    else {
      (f.grafico.meses || []).forEach(function (m) {
        var i = cols.indexOf(m.rotulo);
        if (i >= 0 && m.realizado !== null && total.valores[i] !== null && Math.abs(Number(m.realizado) - Number(total.valores[i])) > 1) {
          f.avisos.push("Gráfico x tabela divergem em " + m.rotulo + ": " + m.realizado + " no gráfico, " + total.valores[i] + " no Total.");
        }
      });
    }
    if (img) f._imagem = img;
    return f;
  }

  function respostaJSON(r) {
    return r.text().then(function (t) {
      var j; try { j = JSON.parse(t); } catch (e) { j = null; }
      if (!r.ok) {
        var msg = (j && j.error && (j.error.message || j.error.type)) || ("HTTP " + r.status);
        var err = new Error(msg); err.status = r.status; throw err;
      }
      if (!j) throw new Error("Resposta inválida da API.");
      return j;
    });
  }

  // ---- Claude (Anthropic) ----
  function chamarClaude(img, opc) {
    var corpo = {
      model: opc.modelo,
      max_tokens: 16000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } },
          { type: "text", text: PROMPT }
        ]
      }]
    };
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opc.chave,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(corpo)
    }).then(respostaJSON).then(function (j) {
      return {
        texto: (j.content || []).filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join(""),
        cortado: j.stop_reason === "max_tokens"
      };
    });
  }

  // ---- GPT (OpenAI) ----
  function chamarOpenAI(img, opc) {
    var corpo = {
      model: opc.modelo,
      // modelos de raciocínio contam o raciocínio neste limite, por isso a folga
      max_completion_tokens: 32000,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: "data:" + img.mediaType + ";base64," + img.data, detail: "high" } }
        ]
      }]
    };
    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + opc.chave
      },
      body: JSON.stringify(corpo)
    }).then(respostaJSON).then(function (j) {
      var ch = (j.choices || [])[0] || {};
      var conteudo = ch.message && ch.message.content;
      if (Array.isArray(conteudo)) conteudo = conteudo.map(function (c) { return c.text || ""; }).join("");
      if (ch.message && ch.message.refusal) throw new Error("O modelo recusou a leitura: " + ch.message.refusal);
      return { texto: conteudo || "", cortado: ch.finish_reason === "length" };
    });
  }

  var PROVEDORES = { claude: chamarClaude, openai: chamarOpenAI };

  /**
   * Lê um print.
   * @param opc { provedor: "claude" | "openai", chave, modelo }
   */
  function lerPrint(file, opc) {
    var chamar = PROVEDORES[opc.provedor || "claude"];
    if (!chamar) return Promise.reject(new Error("Provedor desconhecido: " + opc.provedor));
    return prepararImagem(file).then(function (img) {
      return chamar(img, opc).then(function (res) {
        var f;
        try { f = extrairJSON(res.texto); }
        catch (e) {
          throw new Error(res.cortado ? "Resposta cortada por tamanho antes de terminar o JSON." : "Não foi possível interpretar a resposta (JSON).");
        }
        if (res.cortado) (f.avisos = f.avisos || []).push("Resposta cortada por tamanho: confira as últimas linhas.");
        return validar(f, "data:" + img.mediaType + ";base64," + img.data);
      });
    });
  }

  root.Extrator = { lerPrint: lerPrint, validar: validar, PROMPT: PROMPT };
})(window);
