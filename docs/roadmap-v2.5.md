# Roadmap V2.5

**Status:** Homologado e pronto para implementação incremental  
**Foco:** Estudo Ativo (EAERE refinado), proteção cognitiva (faculdade/provas) e simulado regressivo de alta fidelidade.

## 1. Arquitetura de Modelos & Banco de Dados (Foundations)

### Modificações em `backend/app/models.py`

- [x] Aprimoramento do `BlockMastery`:
  - [x] Adicionar campo `eaere_stage` (`VARCHAR`): controla o estado atual do bloco (`E1`, `A1`, `E2`, `R1`, `R2`, `R3`, `R4`, `R5`, `R6`, `EX`).
  - [x] Adicionar campo `ex_moving_average` (`FLOAT`, opcional/nullable): guarda a média móvel das últimas 3 listas de exercício do looping `EX`.
  - [x] Adicionar campo `consecutive_failures` (`INTEGER`, default `0`): contador de erros seguidos nos estágios avançados (`R4` e `R5`) para gerenciar o congelamento ("vidas").

- [x] Tabela de Configurações Globais de Carga (`UserEnergySettings`):
  - [x] Criar modelo para persistir os estados de proteção de energia do usuário:
    - `mode_dia_leve` (`BOOLEAN`, default `False`)
    - `mode_provas_academicas` (`BOOLEAN`, default `False`)
    - `provas_activated_at` (`DATETIME`, nullable): para o gatilho do pop-up após 7 dias.
    - `current_daily_target_questions` (`INTEGER`, default `20`): teto dinâmico de questões do dia.

## 2. Motor Adaptativo de Carga Flutuante (Backend Services)

### Substituição total em `capacity_service.py` e `study_plan_service.py`

- [ ] Aposentadoria do modelo de minutos legado:
  - [ ] Remover referências a `daily_minutes` e cálculos lineares baseados em tempo de leitura de teoria.

- [ ] Implementação do teto adaptativo baseado em questões:
  - [ ] Ler o teto global do dia, iniciando em 20 questões.
  - [ ] Amortecedor pós-simulado: se houver um `MockExam` finalizado nas últimas 48h, reduzir o teto em 60% no Dia 1 e 30% no Dia 2.

- [ ] Distribuição de cotas por hierarquia estrita:
  - [ ] Aplicar a ordem: `E1 + E2` (prioridade máxima) -> revisões e satélites `RRs` -> looping `EX + AX`.
  - [ ] Impor tamanhos mínimos de amostra para evitar falsos positivos:
    - Mínimo de 10 questões por bloco inédito (`E1`/`E2`/`EX`).
    - Mínimo de 5 questões por bloco de revisão (`R2+`).
  - [ ] Mecanismo de represa: se a quantidade de blocos ativos estourar o teto do dia, ativar os novos na carga mínima e empurrar/reprimir revisões excedentes para a fila oculta.

### Algoritmo de Sobrecarga Progressiva Semanal

- [ ] Expansão de carga:
  - [ ] Se por 2 semanas seguidas o aproveitamento global for `>= 85%` sem acionamento do Modo Dia Leve, o teto diário sobe `+5` questões automaticamente até o limite saudável (platô de 35-45q).

- [ ] Recuo por fadiga crônica:
  - [ ] Se o Modo Dia Leve for usado repetidamente ou o aproveitamento cair de `75%`, encolher o teto diário em `5` questões na semana seguinte.

## 3. Esteira Refinada do Método EAERE & Revisões

### Ajustes em `mastery_service.py` e `review_service.py`

- [ ] Validação cruzada (`E1 -> E2`):
  - [ ] O estudante faz o `E1` (5 questões no escuro).
  - [ ] Independentemente da nota, ele obrigatoriamente vai para o `E2` (lote completo de validação).
  - [ ] Calcular a média aritmética combinada de `E1 + E2`.
  - [ ] Se `>= 85%`: o bloco é liberado e gera o gatilho da Revisão 1 (`R1`).
  - [ ] Se `< 85%`: o bloco ativa a tranca e joga o usuário na esteira infinita de recuperação `EX`.

- [ ] Tranca de saída do looping `EX`:
  - [ ] O usuário roda `EX1`, `EX2`, `EX3` combinados com o estudo ativo do `A1`.
  - [ ] O sistema calcula a média móvel apenas dos últimos 3 exercícios.
  - [ ] O bloco só é considerado aprovado e liberado para a esteira de revisões quando a média do trio atingir `>= 85%`.

### Mecânica de Revisões Avançadas e Satélites `RR`

- [ ] `R1`: o tribunal do erro:
  - [ ] Puxar exclusivamente as questões erradas no `E1`/`E2`/`EX` salvas via gaveta lateral para o aluno refazer.
  - [ ] Se o aluno gabaritou tudo antes, gerar o "`R1 Light`" com questões do banco global.
  - [ ] O resultado do `R1` dá o diagnóstico na tela, mas não bloqueia o usuário: ele decide se avança para o `R2` ou volta ao `EX` por conta própria.

- [ ] Esteira espaçada e satélites `RR` (`R2` até `R6+`):
  - [ ] Toda revisão avançada (`R2`, `R3`, `R4`, `R5`, `R6`...) gera listas de 7 questões (metade da carga normal).
  - [ ] Gatilho `RR`: qualquer erro cometido em uma revisão gera um micro-satélite `RR` no dia seguinte (`RR2`, `RR3`, `RR4`...) contendo apenas as questões que falharam para auditoria imediata em 24 horas.

- [ ] Elasticidade da memória de longo prazo:
  - [ ] Se o aproveitamento no `R6` e `R7` for soberano (`>= 85%`), o intervalo para o próximo estágio ganha bônus de `1.5x` (ex: pula de 60 para 90 dias).
  - [ ] Esse intervalo elástico só pode ser encurtado novamente quando o edital de conteúdos novos for 100% esgotado.

## 4. Módulo de Simulado V2.5 (Modo Maratona)

### Reformulação completa de `MockExamRunPage.tsx`

- [ ] Cronômetro regressivo unificado:
  - [ ] Bloquear o tempo crescente antigo.
  - [ ] Fixar tempo regressivo rígido baseado em 3 minutos por questão escolhida.
  - [ ] Estouro compulsório: zerando o tempo, a prova fecha instantaneamente e computa apenas o que foi preenchido.

- [ ] Interface limpa de lançamento cego:
  - [ ] Exibir apenas o relógio regressivo, os botões `[A] [B] [C] [D] [E]` e o botão `[Pular Questão]`.
  - [ ] Zero feedback de acerto/erro durante a execução.
  - [ ] Gaveta lateral do Question Maker bloqueada.

- [ ] Pausa humana controlada:
  - [ ] Botão `[Pausar Prova]` congela o relógio e ajusta o timestamp final proporcionalmente ao retomar.

- [ ] Regra da questão pulada:
  - [ ] Itens pulados ou deixados em branco por estouro de tempo ganham a flag `skipped` no banco.
  - [ ] Computar como erro por falta de convicção/chute, limpando falsos positivos na proficiência.

- [ ] Gabarito externo consolidado:
  - [ ] Permitir ao usuário rodar a prova no papel/PDF e lançar as respostas corretas de uma vez no final antes de gerar a nota.

### Sistema de Segurança Antifechamento (Fallback de Inicialização)

- [ ] Persistência de estado por clique:
  - [ ] Cada clique de alternativa salva o progresso imediatamente no banco de dados local.

- [ ] Âncora por hora do sistema:
  - [ ] O cálculo do tempo restante baseia-se na hora real do sistema operacional.
  - [ ] Se fechar o navegador, o tempo continua correndo.

- [ ] Interceptador de página inicial:
  - [ ] Se o app for reaberto e houver um simulado ativo, o acesso à TodayPage é totalmente bloqueado por um pop-up prioritário forçando o retorno à tela de prova (`[🏃‍♂️ VOLTAR PARA A TELA DO SIMULADO]`).

## 5. Interface do Painel de Controle de Energia (UX)

### Modificações em `TodayPage.tsx` e `SettingsPage.tsx`

- [ ] Modo Dia Leve visual:
  - [ ] Se ativado nas configurações, o Guia congela o edital (`E1`/`E2`), exibe apenas `RRs` e revisões críticas.
  - [ ] Plotar badge de telemetria brilhante no topo da tela: `[⚡ MODO DIA LEVE ATIVO]` com classes `dark:*` explícitas para alto contraste.

- [ ] Modo Provas Acadêmicas (pop-up não poluente):
  - [ ] Se o toggle de provas acadêmicas estiver ligado, pausar 100% o avanço do edital para não acumular bola de neve.
  - [ ] Gatilho temporizado: após 7 dias corridos com o modo ativado, injetar um pop-up de confirmação logo na inicialização perguntando se o usuário deseja desativar o modo de proteção para retomar o edital.

- [ ] Feedback do pós-prova (curva de fadiga):
  - [ ] Na tela final de resultados do simulado, renderizar gráfico de linha mapeando o tempo médio de reação (`Tμ`) ao longo do avanço das questões para diagnosticar visualmente a perda de resistência cognitiva (endurance).

## 6. Suíte de Testes e Validação de Regressão

### Comandos obrigatórios de build pós-alterações

- [ ] Rodar compilação do backend Python:

```powershell
python -m compileall backend\app
```

- [ ] Executar os 65 cenários de testes do Pytest garantindo estabilidade matemática:

```powershell
$env:PYTHONPATH='backend'; .\backend\.venv\Scripts\python.exe -m pytest backend/tests/
```

- [ ] Validar a integridade das tipagens do TypeScript e compilação React:

```powershell
npm --prefix frontend run typecheck
npm --prefix frontend run build
```
