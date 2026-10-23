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

  // Provedores de IA que leem os prints. Em cada um, o primeiro modelo é o padrão.
  PROVEDORES: [
    {
      id: "claude", nome: "Claude (Anthropic)",
      rotuloChave: "Chave da API do Claude", exemploChave: "sk-ant-api03-...",
      linkChave: "https://console.anthropic.com/settings/keys",
      modelos: [
        { id: "claude-sonnet-5-5", nome: "Claude Sonnet 5.5 (recomendado)" },
        { id: "claude-opus-5-5", nome: "Claude Opus 5.5 (mais preciso, mais caro)" },
        { id: "claude-haiku-5-5", nome: "Claude Haiku 5.5 (mais rápido)" }
      ]
    },
    {
      id: "openai", nome: "GPT (OpenAI)",
      rotuloChave: "Chave da API da OpenAI", exemploChave: "sk-proj-...",
      linkChave: "https://platform.openai.com/api-keys",
      modelos: [
        { id: "gpt-6.1-sol", nome: "GPT-6.1 Sol (recomendado)" },
        { id: "gpt-6-astra", nome: "GPT-6 Astra (mais preciso, mais caro)" },
        { id: "gpt-6-luna", nome: "GPT-6 Luna (mais rápido)" }
      ]
    }
  ],

  // Quantos prints são lidos ao mesmo tempo
  LEITURAS_SIMULTANEAS: 3,

  CAPA: {
    titulo: "Saúde de Frota",
    subtitulo: "Performance Equipamentos Mina"
  }
};
