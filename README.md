# Gerador de PPT de Frota

Ferramenta web para transformar prints do painel de BI de performance de frota em uma apresentação PowerPoint (.pptx) no padrão do relatório "Saúde de Frota".

O PPT sai com **gráficos e tabelas nativos do PowerPoint** (editáveis, com os dados embutidos), não com imagens coladas.

## Como usar

1. Escolha o **fornecedor** e informe a **chave da API do Claude** (https://console.anthropic.com).
2. **Arraste os prints** do BI para a área indicada (ou cole com Ctrl+V). Um print por indicador: DF e MTBF de cada frota.
3. Clique em **Ler prints**. Cada print é lido pelo Claude, que devolve título, gráfico, mapa de calor (valores e cores) e nota.
4. **Confira os dados** na tela. Dá para corrigir qualquer número e repintar células do mapa de calor com os pincéis de cor. Os pontos que merecem atenção aparecem em amarelo (ex.: tabela com barra de rolagem, gráfico divergente da linha Total).
5. Clique em **Gerar PPT** para baixar o arquivo.

O PPT é montado só com o que estiver nos prints recebidos. Prints da mesma frota são agrupados (DF antes de MTBF). Frotas com até 10 equipamentos ganham um slide com DF e MTBF juntos, como no modelo; frotas maiores ganham um slide por indicador, para a tabela caber legível. Isso pode ser trocado em **Layout dos slides**.

**Salvar dados (.json)** guarda o que foi lido e revisado. Depois, **Importar dados** recarrega esse arquivo sem gastar nova leitura.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie todos os arquivos desta pasta (incluindo `vendor/` e o arquivo `.nojekyll`).
2. No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Em um ou dois minutos a ferramenta fica disponível em `https://<seu-usuario>.github.io/<repositorio>/`.

Para rodar no próprio computador: `python -m http.server 8000` nesta pasta e abra `http://localhost:8000`.

## Chave da API e privacidade

- A página é estática: não existe servidor intermediário. A imagem vai direto do navegador para a API do Claude, usando a chave de quem está usando a ferramenta.
- A chave só fica salva se a pessoa marcar "lembrar neste navegador" (fica no `localStorage` daquele navegador, nunca no repositório).
- Se o repositório for público, qualquer pessoa pode abrir a página, mas sem uma chave própria ela não consegue ler prints. **Não coloque prints ou dados reais no repositório.** O botão "Carregar exemplo" usa dados fictícios (`exemplos/exemplo.json`).
- Se preferir não distribuir chaves pessoais, a alternativa é um pequeno proxy (por exemplo um Cloudflare Worker) que guarda a chave da empresa e repassa a chamada; basta trocar a URL em `js/extrator.js`.

Custo aproximado: cada print é uma chamada com uma imagem. O modelo pode ser escolhido na tela (Sonnet é o equilíbrio recomendado entre precisão e custo).

## Cadastrar fornecedores e ajustar o visual

- **Fornecedores:** edite `js/config.js` (lista `FORNECEDORES`) ou use o botão "+ Fornecedor" na tela (fica salvo só no navegador).
- **Visual por fornecedor:** cada fornecedor pode ter um `estilo`, que sobrescreve o padrão:
  ```js
  { id: "xcmg", nome: "XCMG", estilo: { cores: { primaria: "1F4E79" }, fonte: "Arial" } }
  ```
  As chaves possíveis estão em `ESTILO_PADRAO`, no início de `js/gerador.js` (cores do mapa de calor, fonte, cabeçalho, limite de linhas do slide combinado, rótulos curtos do eixo).
- **Fonte:** o padrão é "Vale Sans", a do modelo. Em computadores sem essa fonte o PowerPoint usa uma substituta; troque `fonte` para "Arial" se preferir.

## Estrutura

```
index.html          tela da ferramenta
js/config.js        fornecedores, modelos, textos da capa
js/extrator.js      leitura dos prints com a API do Claude (prompt + validação)
js/gerador.js       montagem do .pptx (roda no navegador e no Node)
js/app.js           interface: upload, revisão, geração
vendor/             PptxGenJS 4.0.1 (biblioteca que escreve o .pptx)
exemplos/           dados fictícios para teste
```

O formato de cada print lido ("ficha") está descrito no topo de `js/gerador.js`.

## Limitações conhecidas

- A leitura por imagem pode errar dígitos, principalmente em prints pequenos ou borrados. Prints em resolução maior (tela cheia, sem zoom reduzido) dão leituras melhores. Sempre confira a etapa 3.
- Linhas escondidas pela barra de rolagem da tabela do BI não aparecem no print, então não entram no PPT. A ferramenta avisa quando percebe a barra.
- A série "Últ. 12 M" do gráfico do BI não é reproduzida (o modelo não usa).
