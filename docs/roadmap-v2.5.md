# Roadmap V2.5

**Status:** Homologado e pronto para implementacao incremental  
**Foco:** Estudo Ativo (EAERE refinado), protecao cognitiva (faculdade/provas) e simulado regressivo de alta fidelidade.

## 1. Arquitetura de Modelos & Banco de Dados (Foundations)

### Modificacoes em `backend/app/models.py`

- [x] Aprimoramento do `BlockMastery`:
  - [x] Adicionar campo `eaere_stage` (`VARCHAR`): controla o estado atual do bloco (`E1`, `A1`, `E2`, `R1`, `R2`, `R3`, `R4`, `R5`, `R6`, `EX`).
  - [x] Adicionar campo `ex_moving_average` (`FLOAT`, opcional/nullable): guarda a media movel das ultimas 3 listas de exercicio do looping `EX`.
  - [x] Adicionar campo `consecutive_failures` (`INTEGER`, default `0`): contador de erros seguidos nos estagios avancados (`R4` e `R5`) para gerenciar o congelamento ("vidas").

- [x] Tabela de Configuracoes Globais de Carga (`UserEnergySettings`):
  - [x] Criar modelo para persistir os estados de protecao de energia do usuario:
    - `mode_dia_leve` (`BOOLEAN`, default `False`)
    - `mode_provas_academicas` (`BOOLEAN`, default `False`)
    - `provas_activated_at` (`DATETIME`, nullable): para o gatilho do pop-up apos 7 dias.
    - `current_daily_target_questions` (`INTEGER`, default `20`): teto dinamico de questoes do dia.

## 2. Motor Adaptativo de Carga Flutuante (Backend Services)

### Substituicao total em `capacity_service.py` e `study_plan_service.py`

- [ ] Aposentadoria do modelo de minutos legado:
  - [ ] Remover referencias a `daily_minutes` e calculos lineares baseados em tempo de leitura de teoria.

- [x] Implementacao do teto adaptativo baseado em questoes:
  - [x] Ler o teto global do dia, iniciando em 20 questoes.
  - [x] Amortecedor pos-simulado: se houver um `MockExam` finalizado nas ultimas 48h, reduzir o teto em 60% no Dia 1 e 30% no Dia 2.

- [x] Distribuicao de cotas por hierarquia estrita:
  - [x] Aplicar a ordem: `E1 + E2` (prioridade maxima) -> revisoes e satelites `RRs` -> looping `EX + A1`.
  - [x] Impor tamanhos minimos de amostra para evitar falsos positivos:
    - Minimo de 10 questoes por bloco inedito (`E1`/`E2`/`EX`).
    - Minimo de 5 questoes por bloco de revisao (`R2+`).
  - [x] Mecanismo de represa: se a quantidade de blocos ativos estourar o teto do dia, ativar os novos na carga minima e empurrar/reprimir revisoes excedentes para a fila oculta.

### Algoritmo de Sobrecarga Progressiva Semanal

- [ ] Expansao de carga:
  - [ ] Se por 2 semanas seguidas o aproveitamento global for `>= 85%` sem acionamento do Modo Dia Leve, o teto diario sobe `+5` questoes automaticamente ate o limite saudavel (plato de 35-45q).

- [ ] Recuo por fadiga cronica:
  - [ ] Se o Modo Dia Leve for usado repetidamente ou o aproveitamento cair de `75%`, encolher o teto diario em `5` questoes na semana seguinte.

## 3. Esteira Refinada do Metodo EAERE & Revisoes

### Ajustes em `mastery_service.py` e `review_service.py`

- [ ] Validacao cruzada (`E1 -> E2`):
  - [ ] O estudante faz o `E1` (5 questoes no escuro).
  - [x] Independentemente da nota, ele obrigatoriamente vai para o `E2` (lote completo de validacao).
  - [x] Calcular a media aritmetica combinada de `E1 + E2`.
  - [x] Se `>= 85%`: o bloco e liberado e gera o gatilho da Revisao 1 (`R1`).
  - [x] Se `< 85%`: o bloco ativa a tranca e joga o usuario na esteira infinita de recuperacao `EX`.

- [ ] Tranca de saida do looping `EX`:
  - [ ] O usuario roda `EX1`, `EX2`, `EX3` combinados com o estudo ativo do `A1`.
  - [x] O sistema calcula a media movel apenas dos ultimos 3 exercicios.
  - [x] O bloco so e considerado aprovado e liberado para a esteira de revisoes quando a media do trio atingir `>= 85%`.

### Mecanica de Revisoes Avancadas e Satelites `RR`

- [ ] `R1`: o tribunal do erro:
  - [ ] Puxar exclusivamente as questoes erradas no `E1`/`E2`/`EX` salvas via gaveta lateral para o aluno refazer.
  - [ ] Se o aluno gabaritou tudo antes, gerar o "`R1 Light`" com questoes do banco global.
  - [ ] O resultado do `R1` da o diagnostico na tela, mas nao bloqueia o usuario: ele decide se avanca para o `R2` ou volta ao `EX` por conta propria.

- [ ] Esteira espacada e satelites `RR` (`R2` ate `R6+`):
  - [ ] Toda revisao avancada (`R2`, `R3`, `R4`, `R5`, `R6`...) gera listas de 7 questoes (metade da carga normal).
  - [x] Gatilho `RR`: qualquer erro cometido em uma revisao gera um micro-satelite `RR` no dia seguinte (`RR2`, `RR3`, `RR4`...) contendo apenas as questoes que falharam para auditoria imediata em 24 horas.

- [ ] Elasticidade da memoria de longo prazo:
  - [ ] Se o aproveitamento no `R6` e `R7` for soberano (`>= 85%`), o intervalo para o proximo estagio ganha bonus de `1.5x` (ex: pula de 60 para 90 dias).
  - [ ] Esse intervalo elastico so pode ser encurtado novamente quando o edital de conteudos novos for 100% esgotado.

## 4. Modulo de Simulado V2.5 (Modo Maratona)

### Reformulacao completa de `MockExamRunPage.tsx`

- [ ] Cronometro regressivo unificado:
  - [ ] Bloquear o tempo crescente antigo.
  - [ ] Fixar tempo regressivo rigido baseado em 3 minutos por questao escolhida.
  - [ ] Estouro compulsorio: zerando o tempo, a prova fecha instantaneamente e computa apenas o que foi preenchido.

- [ ] Interface limpa de lancamento cego:
  - [ ] Exibir apenas o relogio regressivo, os botoes `[A] [B] [C] [D] [E]` e o botao `[Pular Questao]`.
  - [ ] Zero feedback de acerto/erro durante a execucao.
  - [ ] Gaveta lateral do Question Maker bloqueada.

- [ ] Pausa humana controlada:
  - [ ] Botao `[Pausar Prova]` congela o relogio e ajusta o timestamp final proporcionalmente ao retomar.

- [ ] Regra da questao pulada:
  - [ ] Itens pulados ou deixados em branco por estouro de tempo ganham a flag `skipped` no banco.
  - [ ] Computar como erro por falta de conviccao/chute, limpando falsos positivos na proficiencia.

- [ ] Gabarito externo consolidado:
  - [ ] Permitir ao usuario rodar a prova no papel/PDF e lancar as respostas corretas de uma vez no final antes de gerar a nota.

### Sistema de Seguranca Antifechamento (Fallback de Inicializacao)

- [ ] Persistencia de estado por clique:
  - [ ] Cada clique de alternativa salva o progresso imediatamente no banco de dados local.

- [ ] Ancora por hora do sistema:
  - [ ] O calculo do tempo restante baseia-se na hora real do sistema operacional.
  - [ ] Se fechar o navegador, o tempo continua correndo.

- [ ] Interceptador de pagina inicial:
  - [ ] Se o app for reaberto e houver um simulado ativo, o acesso a TodayPage e totalmente bloqueado por um pop-up prioritario forcando o retorno a tela de prova (`[VOLTAR PARA A TELA DO SIMULADO]`).

## 5. Interface do Painel de Controle de Energia (UX)

### Modificacoes em `TodayPage.tsx` e `SettingsPage.tsx`

- [ ] Modo Dia Leve visual:
  - [ ] Se ativado nas configuracoes, o Guia congela o edital (`E1`/`E2`), exibe apenas `RRs` e revisoes criticas.
  - [ ] Plotar badge de telemetria brilhante no topo da tela: `[MODO DIA LEVE ATIVO]` com classes `dark:*` explicitas para alto contraste.

- [ ] Modo Provas Academicas (pop-up nao poluente):
  - [ ] Se o toggle de provas academicas estiver ligado, pausar 100% o avanco do edital para nao acumular bola de neve.
  - [ ] Gatilho temporizado: apos 7 dias corridos com o modo ativado, injetar um pop-up de confirmacao logo na inicializacao perguntando se o usuario deseja desativar o modo de protecao para retomar o edital.

- [ ] Feedback do pos-prova (curva de fadiga):
  - [ ] Na tela final de resultados do simulado, renderizar grafico de linha mapeando o tempo medio de reacao (`Tmu`) ao longo do avanco das questoes para diagnosticar visualmente a perda de resistencia cognitiva (endurance).

## 6. Suite de Testes e Validacao de Regressao

### Comandos obrigatorios de build pos-alteracoes

- [x] Rodar compilacao do backend Python:

```powershell
python -m compileall backend\app
```

- [x] Executar os 65 cenarios de testes do Pytest garantindo estabilidade matematica:

```powershell
$env:PYTHONPATH='backend'; .\backend\.venv\Scripts\python.exe -m pytest backend/tests/
```

- [ ] Validar a integridade das tipagens do TypeScript e compilacao React:

```powershell
npm --prefix frontend run typecheck
npm --prefix frontend run build
```
