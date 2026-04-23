# Roadmap Pedagogico

Este diretorio guarda a fonte humana editavel do roadmap pedagogico do projeto.

A regra principal desta camada e simples:

- roadmap = estrutura pedagogica real
- bloco = fase operacional do estudo

Ou seja:

- um conteudo pode aparecer em mais de um bloco
- um bloco pode conter partes de conteudos diferentes
- o desbloqueio pedagogico deve nascer do roadmap, nao do nome amplo do bloco

Nesta etapa, o roadmap ainda nao esta integrado ao motor do plano diario. Ele existe como infraestrutura de dados, leitura e importacao.

## Origem Humana e Fonte do Sistema

Hoje o repositorio usa CSV como fonte oficial do sistema:

- `nodes.csv`
- `edges.csv`
- `block_map.csv`
- `rules.csv`

A planilha versionada em `docs/enem_blocos_organizados.xlsx` deve ser usada como referencia operacional permanente para revisar cobertura de blocos, assuntos e conteudos. Os CSVs continuam sendo a fonte principal consumida pelo backend.

## Como Pensar a Modelagem

Nao use conteudos gigantes como unidade principal.

Evite:

- Matematica Basica
- Quimica Basica
- Interpretacao de Texto

Prefira unidades menores, como:

- soma e subtracao com inteiros
- multiplicacao e divisao com inteiros
- fracoes basicas
- comparacao entre fracoes e decimais
- razao
- proporcao
- porcentagem introdutoria
- regra de 3 simples

## Arquivos

### `nodes.csv`

Cada linha representa uma unidade de aprendizagem.

Colunas:

- `node_id`: identificador estavel e unico.
- `disciplina_estrategica`: agrupamento estrategico maior.
- `disciplina`: disciplina principal.
- `materia`: eixo interno da disciplina.
- `conteudo`: conteudo macro local.
- `subunidade`: recorte menor e realmente estudavel.
- `descricao_curta`: descricao curta do no.
- `tamanho_pedagogico`: `micro`, `pequeno`, `medio`, `grande` ou `continuo`.
- `expected_contacts_min`: minimo de contatos antes de pensar em avancar.
- `expected_contacts_target`: alvo pedagogico razoavel.
- `cadencia_base`: referencia simples como `1d`, `2d`, `3d`, `7d`.
- `frequencia_base`: `diaria`, `alta`, `media` ou `baixa`.
- `peso_recorrencia`: peso historico/recorrencia relativa.
- `peso_estrategico`: peso estrategico relativo.
- `tipo_no`: por exemplo `content`, `skill`, `block_entry` ou `continuous`.
- `free_mode`: se o no pode aparecer no modo livre.
- `ativo`: se o no ja esta ativo no roadmap.
- `observacoes`: observacoes humanas.

### `edges.csv`

Cada linha representa uma dependencia entre nos.

Colunas:

- `from_node_id`
- `to_node_id`
- `relation_type`
- `strength`
- `notes`

Valores validos de `relation_type`:

- `required`
- `recommended`
- `cross_required`
- `cross_support`

Forca sugerida:

- `1` = fraca
- `2` = media
- `3` = forte

### `block_map.csv`

Liga roadmap pedagogico com blocos operacionais.

Colunas:

- `disciplina`
- `block_number`
- `node_id`
- `role_in_block`
- `sequence_in_block`

Valores validos de `role_in_block`:

- `core`
- `review`
- `transition`
- `support`

### `rules.csv`

Guarda regras gerais do roadmap.

Colunas:

- `rule_key`
- `rule_value`
- `notes`

## Como Importar

Use o importador do backend:

```powershell
cd backend
@'
from app.db import init_db
from app.services.roadmap_import_service import import_roadmap_from_csv

init_db()
summary = import_roadmap_from_csv()
print(summary.model_dump_json(indent=2))
'@ | .\.venv\Scripts\python -
```

O importador:

- valida colunas obrigatorias
- acusa CSV malformado com mensagem clara
- cria ou atualiza nos por `node_id`
- cria ou atualiza edges por `from_node_id + to_node_id + relation_type`
- cria ou atualiza block map por `disciplina + block_number + node_id`
- cria ou atualiza rules por `rule_key`

## Como Validar Sem Importar

Use o validador antes de importar quando estiver editando os CSVs:

```powershell
cd backend
.\.venv\Scripts\python -m app.services.roadmap_import_service --validate
```

O comando retorna JSON com:

- `is_valid`
- `errors_count`
- `warnings_count`
- `errors`
- `warnings`

Erros indicam que o roadmap nao deve ser importado ainda. Avisos indicam pontos suspeitos que podem ser intencionais, mas merecem revisao humana.

O validador nao altera os CSVs e nao tenta corrigir pedagogicamente o roadmap.

## Endpoints de Leitura

Depois de importar:

- `GET /api/roadmap/validation`
- `GET /api/roadmap/summary`
- `GET /api/roadmap/discipline/{discipline}/summary`
- `GET /api/roadmap/disciplines`
- `GET /api/roadmap/nodes/{discipline}`
- `GET /api/roadmap/edges/{discipline}`

A disciplina e normalizada de forma simples para comparar caixa e acentos.

### Validacoes Cobertas

`nodes.csv`:

- colunas obrigatorias
- `node_id` unico
- campos essenciais preenchidos
- `tamanho_pedagogico`, `tipo_no`, `free_mode` e `ativo` validos
- contatos esperados numericos e coerencia simples entre minimo/alvo

`edges.csv`:

- colunas obrigatorias
- referencias existentes em `nodes.csv`
- `relation_type` valido
- `strength` numerico entre 1 e 3
- auto-referencia
- arestas duplicadas

`block_map.csv`:

- colunas obrigatorias
- `node_id` existente
- `role_in_block` valido
- `block_number` e `sequence_in_block` positivos
- duplicidade de sequencia dentro do mesmo bloco/disciplina
- divergencia de disciplina entre `nodes.csv` e `block_map.csv`

`rules.csv`:

- colunas obrigatorias
- `rule_key` unico
- `rule_value` preenchido

Auditorias extras:

- nodes sem uso em `block_map.csv`
- nodes sem arestas de entrada ou saida
- ciclos em dependencias `required` e `cross_required`
- relacoes cruzadas suspeitas
- lacunas de blocos dentro da sequencia mapeada por disciplina

## Roadmap Atual de Matematica

O roadmap de Matematica agora foi expandido usando a planilha versionada como referencia operacional de cobertura:

- blocos continuam existindo
- mas o roadmap usa nos menores que o nome do bloco
- o mesmo no pode reaparecer como `review` ou `support`

Cobertura atual da disciplina:

1. matematica basica e proporcionalidade
2. algebra basica e sequencias
3. geometria plana e espacial
4. estatistica, contagem e probabilidade
5. funcoes e matematica financeira
6. trigonometria
7. matrizes, sistemas lineares e geometria analitica

Os pre requisitos em `edges.csv` foram escritos de forma conservadora:

- priorizam dependencias que realmente tendem a travar o aluno
- evitam ligar tudo com tudo
- mantem espaco para refinamento posterior

Refinamentos recentes em Matematica:

- `razao` e `proporcao` foram separados em nos diferentes
- `matematica financeira` foi quebrada em uma base inicial e um no mais pesado de juros compostos
- `as quatro operacoes` foram quebradas em soma/subtracao e multiplicacao/divisao
- `fundamentos de geometria plana` foram quebrados para separar base geometrica de poligonos
- `Tales` e `semelhanca de triangulos` agora aparecem como nos diferentes
- `estatistica geral` foi refinada em tendencia central e dispersao
- `analise combinatoria` e `probabilidade` ganharam um degrau inicial e outro mais estruturado
- `funcao afim` foi refinada em leitura de taxa e grafico da reta
- `funcao quadratica` foi refinada em raizes/fatoracao e vertice/concavidade
- `geometria espacial` ganhou uma camada mais aplicada de areas e volumes
- `trigonometria analitica` ganhou reducao ao ciclo e graficos trigonometricos como degraus proprios

Dependencias cruzadas iniciais:

- Matematica -> Fisica
- Matematica -> Quimica

Essas dependencias cruzadas ja foram aprofundadas em pontos onde o travamento matematico costuma ser real, por exemplo:

- analise dimensional
- movimento uniforme e MUV
- vetores e lancamento obliquo
- densidade e pressao
- Leis de Ohm
- grandezas quimicas
- estequiometria
- concentracao e diluicao
- gases
- nox e balanceamento

A ideia ainda nao e mapear Natureza inteira, mas sim registrar travamentos matematicos relevantes com granularidade suficiente para uso real.

## Roadmap Atual de Fisica

Fisica agora esta sendo refinada usando Matematica como referencia de granularidade.

Cobertura atual da disciplina:

1. analise dimensional e grandezas de entrada
2. cinematica completa, incluindo vetores e lancamentos
3. dinamica e energia mecanica
4. gravitacao e estatica
5. hidrostatica e hidrodinamica
6. termologia
7. ondulatoria e som
8. optica
9. eletrostatica, eletrodinamica e eletromagnetismo
10. fisica moderna

Decisoes de modelagem desta versao:

- a planilha `enem_blocos_organizados.xlsx` continua sendo a referencia operacional dos blocos
- o roadmap de Fisica foi quebrado em nos menores que os nomes amplos do bloco
- o `block_map.csv` reaproveita nos anteriores como `review` e `support` quando isso faz sentido
- as dependencias internas priorizam travamentos reais, nao uma teia maximalista
- as dependencias cruzadas com Matematica ficaram mais fortes em cinematica, fluidos, eletricidade, optica e ondulatoria

Refinamentos mais recentes em Fisica:

- `trabalho e energia` foi quebrado para separar o teorema trabalho-energia da conservacao da energia mecanica
- `hidrodinamica` foi quebrada para separar `vazao e continuidade` de `Bernoulli e hidrodinamica aplicada`
- `lentes e fisica da visao` foi quebrado em uma base de lentes delgadas e uma camada aplicada de visao
- `inducao eletromagnetica` ganhou um degrau proprio de `Lei de Faraday-Lenz`
- a malha de dependencias internas foi lapidada para suavizar a progressao entre cinematica, estatica, energia, optica e eletrodinamica
- entraram cruzamentos adicionais com leitura de graficos em Matematica e com gases/densidade em Quimica, sem forcar dependencia artificial

Leitura honesta do estado atual:

- Matematica continua sendo a referencia mais madura do roadmap
- Fisica ja saiu da semente minima e entrou numa versao bem mais estruturada
- ainda ha espaco para refinamentos futuros, mas a disciplina ja esta granular o suficiente para evolucao real

## Roadmap Atual de Quimica

Quimica agora tambem saiu da semente minima e passou a cobrir a trilha operacional principal da planilha versionada.

Cobertura atual da disciplina:

1. quimica basica
2. atomo e tabela periodica
3. ligacoes quimicas
4. funcoes inorganicas
5. estequiometria
6. solucoes
7. termoquimica e cinetica
8. equilibrio quimico
9. eletroquimica
10. propriedades coligativas
11. quimica organica
12. gases, radioatividade e quimica ambiental

Decisoes desta versao:

- a disciplina foi expandida mantendo blocos como unidade operacional, nao pedagogica
- os nos quantitativos mais dependentes de matematica receberam cruzamentos proprios
- entraram alguns cruzamentos com Fisica em termoquimica, gases e radioatividade, mas sem exagerar a malha
- a trilha organica foi modelada em degraus simples: cadeias, funcoes, propriedades, isomeria e reacoes

Leitura honesta do estado atual:

- Quimica agora esta em uma primeira versao robusta
- ainda nao esta tao lapidada quanto Matematica e Fisica
- o proximo ganho real viria de uma rodada especifica de refinamento fino so na disciplina

## Roadmap Atual de Biologia

Biologia entrou agora como a disciplina mais ampla do roadmap fora de Matematica, com uma primeira versao robusta baseada na planilha versionada.

Cobertura atual da disciplina:

1. introducao a biologia e bioquimica
2. biologia molecular e citologia
3. bioenergetica
4. nucleo e divisao celular
5. reproducao, embriologia e histologia
6. fisiologia animal
7. genetica
8. origem da vida e evolucao
9. taxonomia e microbiologia
10. botanica
11. zoologia
12. ecologia

Decisoes desta versao:

- a disciplina foi organizada em eixos amplos, mas com nos ja estudaveis
- a prioridade foi criar uma espinha pedagogica coerente antes de lapidar detalhes finos
- entraram cruzamentos pontuais com Quimica em bioquimica, metabolismo e ecologia
- entraram cruzamentos pontuais com Matematica em genetica e ecologia
- a primeira rodada de refinamento ja separou trechos mais pesados de fisiologia animal e zoologia dos cordados
- uma rodada adicional de refinamento ja separou melhor genetica mendeliana aplicada e a camada ecologica entre processos, dinamica e biomas
- outra rodada de refinamento ja separou melhor microbiologia e botanica entre entrada conceitual e partes mais aplicadas

Leitura honesta do estado atual:

- Biologia ja saiu do zero e entrou numa versao robusta de cobertura
- ainda esta longe do nivel de lapidacao fina de Matematica e Fisica
- o proximo ganho real viria de rodadas especificas de refinamento interno da disciplina

Refinamentos mais recentes em Quimica:

- `geometria hibridacao e polaridade` foi quebrado para separar geometria molecular de hibridacao/polaridade
- `cinetica` ganhou um degrau proprio de fatores que alteram a velocidade da reacao
- `propriedades coligativas` ganhou uma camada aplicada separada para osmose e variacoes de fase
- `propriedades fisicas e quimicas dos compostos organicos` foi quebrado para separar leitura fisica de reatividade organica
- a entrada de `acidos e bases` foi quebrada para separar conceitos fundamentais do estudo dos acidos
- `equilibrio ionico` foi refinado para separar ionizacao/dissociacao de `pH pOH e meio acido-base`
- `pilha` ganhou um degrau proprio de `potencial de pilha e ddp`
- `agua` ganhou uma camada aplicada separada para `tratamento e quimica da agua`
- `pilha` tambem passou a explicitar melhor a leitura de espontaneidade redox antes do degrau quantitativo de ddp
- `quimica ambiental` foi refinada para separar `poluentes e impactos ambientais` de `tratamento e quimica da agua`

Leitura honesta do estado atual:

- Matematica ja esta perto de uma versao v1 estavel do roadmap
- ainda pode receber refinamentos pontuais no futuro
- mas ja esta granular o suficiente para servir como primeira espinha pedagogica forte do projeto

## Roadmap Atual de Humanas

Humanas entrou como area estrategica com quatro disciplinas operacionais:

1. Geografia
2. Historia Geral
3. Historia do Brasil
4. Filosofia e Sociologia

Decisoes desta versao:

- a prioridade foi criar uma cobertura robusta e verificavel, sem tentar microfragmentar toda a area de uma vez
- Geografia foi organizada em cartografia, climatologia, geologia, hidrografia, demografia, espaco agrario-urbano, economia e geopolitica
- Historia Geral foi organizada em Antiguidade, Idade Media, Idade Moderna e Idade Contemporanea
- Historia do Brasil foi organizada em Colonia, Imperio e Republica
- Filosofia e Sociologia foi organizada em trilha filosofica e depois em trilha sociologica
- entraram alguns cruzamentos leves entre Historia, Geografia e Filosofia/Sociologia, sem transformar a malha em algo exagerado

Leitura honesta do estado atual:

- Humanas entra agora em uma primeira versao robusta de cobertura
- a estrutura ja e suficiente para servir como base pedagogica editavel do projeto
- ainda deve existir espaco para refinamentos finos futuros, principalmente em Geografia regional e em Filosofia/Sociologia contemporanea

Refinamentos mais recentes em Humanas:

- `Demografia` em Geografia foi suavizada para separar crescimento/transicao de estrutura etaria, indicadores e migracoes
- `Filosofia Antiga` foi suavizada para separar `Socrates e os Sofistas` de `Platao e Aristoteles`
- `Filosofia Moderna` foi refinada para separar `racionalismo`, `empirismo`, `Revolucao Cientifica` e `Iluminismo/contratualismo`
- a entrada de `Sociologia` foi refinada para separar `teoria da sociologia`, `sociologia do Brasil` e `educacao/socializacao`
- `Historia Geral` foi refinada para separar `Pre-historia` de `Antiguidade Oriental`, `Revolucao Francesa` de `Era Napoleonica`, e `Primeira Guerra` de `Revolucao Russa`
- `Historia do Brasil` foi refinada para separar `expansao territorial/mineracao` de `Periodo Pombalino`, `Era Vargas inicial` de `Estado Novo`, e `Ditadura Militar inicial` da fase final do regime
- `Geografia` foi refinada para separar `climas do Brasil` de `climogramas`, `estrutura interna` de `relevo do Brasil`, `biomas mundiais` de `dominios morfoclimaticos`, `industria/energia` de `transportes`, e `espacos mundiais` de `regionalizacao do Brasil`
- `Historia do Brasil` foi refinada de novo para separar `politica interna` de `economia/sociedade` no Segundo Reinado, `conflitos rurais` de `revoltas urbanas`, e `Dutra/Vargas/JK` de `Janio e Jango`
- `Historia Geral` foi refinada mais uma vez para separar `Renascimento` de `Reformas Religiosas`, `Revolucao Industrial` de `Independencia dos EUA`, e `Guerra de Secessao/unificacoes` de `Imperialismo`
- `Filosofia e Sociologia` foi refinada de novo para separar `Kant` de `Hegel e Marx`, `correntes contemporaneas iniciais` de `Nietzsche`, `Fenomenologia/Existencialismo` de `Arendt e Walter Benjamin`, e `Habermas/Foucault` de `Rawls/Jonas/Filosofia da Ciencia`
- `Linguagens` entrou com tres disciplinas operacionais: `Interpretacao de Texto`, `Gramatica` e `Literatura`
- a prioridade em Linguagens foi cobertura robusta da area com trilhas simples, sem tentar microfragmentar demais na primeira entrada
- entraram cruzamentos leves entre gramatica, interpretacao e literatura para reforcar leitura textual e leitura estetica

Leitura honesta desta rodada:

- Humanas continua em fase de lapidacao, mas ja deixou de ser so cobertura ampla
- o maior ganho mais recente veio em Historia Geral e Filosofia/Sociologia, reduzindo quase todo o restante dos nos largos de Humanas

## Roadmap Atual de Linguagens

Linguagens entrou como area estrategica com tres disciplinas operacionais:

1. Interpretacao de Texto
2. Gramatica
3. Literatura

Decisoes desta versao:

- a cobertura foi montada a partir da planilha versionada, respeitando os blocos operacionais
- Interpretacao de Texto foi organizada em comunicacao, linguagem verbal e nao verbal, generos, intertextualidade, coesao e leitura artistica
- Gramatica foi organizada em ortografia, morfologia, sintaxe e coesao textual
- Literatura foi organizada em leitura literaria, escolas literarias e trilha historica ate a contemporaneidade

Leitura honesta do estado atual:

- Linguagens entra agora em uma primeira versao robusta de cobertura
- ainda deve existir espaco para lapidacao fina futura, principalmente em Interpretacao de Texto e Literatura modernista
- a estrutura ja ficou boa o suficiente para servir como base pedagogica editavel do projeto

Refinamentos mais recentes em Linguagens:

- `Interpretacao de Texto` foi suavizada para separar `tema e inferencia local` de `inferencia global e efeitos de sentido`
- a trilha de interpretacao tambem passou a separar `tipos e generos` de `comparacao entre textos e textos de apoio`
- a camada final de leitura textual foi refinada para separar `mecanismos de coesao` de `coerencia e progressao argumentativa`
- `Gramatica` foi refinada para separar `substantivo/artigo/numeral` de `adjetivo e locucao adjetiva`
- a morfologia verbal foi suavizada para separar `flexoes/tempos/modos` de `vozes verbais e locucoes`
- `Regencia e crase` tambem foi quebrada para deixar `crase` como degrau proprio
- `Interpretacao de Texto` ganhou um degrau proprio de `leitura multimodal` com foco em infografico grafico tabela e mapa
- `Literatura` ganhou um fechamento contemporaneo mais suave, separando a entrada da prosa contemporanea de `temas e formas da prosa contemporanea` e da `poesia contemporanea`
