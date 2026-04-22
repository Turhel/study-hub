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

## Endpoints de Leitura

Depois de importar:

- `GET /api/roadmap/disciplines`
- `GET /api/roadmap/nodes/{discipline}`
- `GET /api/roadmap/edges/{discipline}`

A disciplina e normalizada de forma simples para comparar caixa e acentos.

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

Leitura honesta do estado atual:

- Matematica ja esta perto de uma versao v1 estavel do roadmap
- ainda pode receber refinamentos pontuais no futuro
- mas ja esta granular o suficiente para servir como primeira espinha pedagogica forte do projeto
