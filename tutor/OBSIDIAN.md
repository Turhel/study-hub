# Teia de estudo no Obsidian

O cofre deste projeto fica em **`tutor/teia/`**. Abra essa pasta em “Abrir pasta como cofre”. Assim, o grafo fica concentrado em questões, habilidades e conceitos, sem indexar todo o acervo de PDFs.

## Abrir e navegar

1. Abra `00 Comece aqui.md`.
2. Clique no link **Canvas · visão organizada por habilidade** para abrir `Teia ENEM 2026.canvas`.
3. Para o grafo de notas, use **Ctrl+G**; aproxime com a roda do mouse e clique nos nós.
4. Para uma questão específica, use **Ctrl+O** e procure, por exemplo, `Q080` ou `Q003-ESP`.
5. Os links ligam questões ao raciocínio exigido, ao conteúdo e às evidências disponíveis. As cores distinguem Linguagens, Humanas, habilidades, conceitos e evidências; não são notas de domínio.

## O que foi configurado

Plugins **nativos**: Graph, Canvas, Backlinks, Search, Quick Switcher, Tags, Properties, Bookmarks, Outline, Page Preview e Command Palette, além do explorador de arquivos. Esses recursos já acompanham o aplicativo; não é necessário baixar plugin comunitário para esta teia. Não foi habilitado serviço de IA, Sync ou Publish.

O formato é Markdown e [JSON Canvas](https://jsoncanvas.org/spec/1.0/). A configuração compartilhável fica em `.obsidian/`; abas abertas, posição da janela, cache e lixeira ficam fora do Git. Não foram configurados plugins de flashcards.

Instalação verificada no Windows: **Obsidian 1.15.1**, por `winget`, pacote `Obsidian.Obsidian`, fonte do fabricante e hash verificado pelo instalador. O controle de cliques da sessão ficou indisponível; o aluno abriu o cofre e habilitou o CLI. Pelo CLI oficial foram confirmados versão, cofre ativo, links da Q080, plugins nativos habilitados e ausência de plugins comunitários. Canvas e grafo foram abertos e capturados pelo próprio Obsidian; as capturas foram inspecionadas. Não foram capturados erros do aplicativo nessa verificação.

## Significado pedagógico

- “Erro relatado” significa que o aluno incluiu a questão na lista; não é uma retificação oficial do gabarito.
- “Exigência da questão” é o que o enunciado pede. Não demonstra sozinho a causa do erro.
- “Hipótese” precisa ser verificada. Não se marca lacuna como superada após ler uma explicação.
- Textos compartilhados não lidos ficam ligados a uma evidência própria. Não se atribui falta de conteúdo a todo o bloco.
- Gabaritos divergentes permanecem assinalados e não definem domínio.

Cada questão tem identificação completa, página do PDF, conteúdo, raciocínio necessário, resposta marcada quando informada, referência extraoficial e próximo passo. O JSON estruturado está em `teia/dados/triagem.json`.

## Atualizações e Git

O aluno autorizou em 13/11/2026 a publicação da teia e do resumo desta sessão no `study-hub` público. A autorização é específica para esse material de estudo, não para credenciais, conversas completas ou futuros anexos pessoais. Revise o que vai para cada commit.

O gerador `ferramentas/gerar-teia-enem2026.py` documenta a montagem inicial e se recusa a sobrescrever o cofre existente. **Não execute novamente para retomar os estudos.** Edite as notas preservando os registros anteriores e atualize o estado conforme o que realmente aconteceu. `ferramentas/finalizar-teia-enem2026.py` documenta a conferência inicial de divergências e valida links/posições; não é um sincronizador nem substitui revisões futuras.

O PDF digitalizado e as imagens de leitura ficaram em `.local/enem-2026/`, ignorado pelo Git. As notas contêm links para as fontes. Não se baixa a biblioteca toda para analisar esta lista.

## Fontes

- [Graph view, documentação oficial](https://obsidian.md/help/plugins/graph).
- [Canvas, documentação oficial](https://obsidian.md/help/plugins/canvas).
- [CLI, documentação oficial](https://obsidian.md/help/cli).
- [Download oficial](https://obsidian.md/download).
