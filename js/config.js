/*
 * Configuração da ferramenta.
 * Para cadastrar um fornecedor novo, acrescente um item em FORNECEDORES
 * (ou use o botão "+ Fornecedor" na tela; esses ficam salvos só no seu navegador).
 *
 * "estilo" é opcional e sobrescreve o estilo padrão do modelo (ver ESTILO_PADRAO em gerador.js):
 *   estilo: { fonte: "Arial", cores: { primaria: "1F4E79" }, cabecalho: "Outra diretoria" }
 */
window.CONFIG = {
  FORNECEDORES: [
    { id: "caterpillar", nome: "Caterpillar" },
    { id: "epiroc", nome: "Epiroc" },
    { id: "komatsu", nome: "Komatsu" },
    { id: "xcmg", nome: "XCMG" },
    { id: "liebherr", nome: "Liebherr" },
    { id: "sandvik", nome: "Sandvik" }
  ],

  // Modelos do Claude usados para ler os prints (o primeiro é o padrão)
  MODELOS: [
    { id: "claude-sonnet-5-5", nome: "Claude Sonnet 5.5 (recomendado)" },
    { id: "claude-opus-5-5", nome: "Claude Opus 5.5 (mais preciso, mais caro)" },
    { id: "claude-haiku-5-5", nome: "Claude Haiku 5.5 (mais rápido)" }
  ],

  // Quantos prints são lidos ao mesmo tempo
  LEITURAS_SIMULTANEAS: 3,

  CAPA: {
    titulo: "Saúde de Frota",
    subtitulo: "Performance Equipamentos Mina"
  }
};
