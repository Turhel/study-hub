# AGENTS.md

## Projeto

Este repositório é um hub de estudos pessoal para ENEM/Medicina. O objetivo não é ser um ERP, nem um SaaS genérico, nem uma vitrine de abstrações. O objetivo é ajudar um único usuário a estudar melhor, com foco em priorização inteligente, baixa fricção e visual forte de app.

## Princípios do produto

1. O sistema deve orientar o estudo de forma pragmática.
2. O sistema deve respeitar pré-requisitos e trilha pedagógica.
3. O sistema não deve virar cronograma rígido com culpa embutida.
4. O sistema deve evitar burnout.
5. O sistema deve ter cara de app moderno, não de painel administrativo.
6. O sistema deve crescer por camadas simples e verificáveis.

## Stack atual

### Frontend

- Vite
- React
- TypeScript
- Tailwind
- Framer Motion quando fizer sentido
- React Router
- TanStack Query quando necessário

### Backend

- FastAPI
- Pydantic
- SQLite
- SQLModel ou SQLAlchemy, conforme já estiver no projeto

### Desktop

- Tauri apenas como shell desktop para experiências específicas, como o timer flutuante
- Não migrar o projeto inteiro para desktop

## Estrutura conceitual do sistema

O sistema tem alguns módulos principais:

1. Today / foco do dia
2. Trilha pedagógica por blocos
3. Registro de questões
4. Revisões
5. Timer flutuante
6. Sessões de timer
7. Flashcards no futuro
8. Redação no futuro

## Estado atual do projeto

### Já existe

- frontend React/Vite separado do backend FastAPI
- endpoint `/health`
- endpoint `/api/today`
- banco oficial do backend em `backend/data/study_hub.db`
- banco legado preservado em `legacy_streamlit/data/study_hub.db`
- importação da planilha de blocos/conteúdos para `subjects`, `blocks` e `block_subjects`
- lógica de desbloqueio por blocos
- starting points em `/api/today`
- timer inicial em React
- persistência mínima de sessões do timer no backend

### Regras já definidas e que não devem ser quebradas sem motivo

- blocos seguem uma trilha pedagógica por disciplina
- o primeiro bloco da disciplina fica disponível
- um bloco só fica disponível quando o anterior estiver aprovado
- blocos futuros ficam locked
- conteúdos de blocos locked não entram como “esquecidos”
- assuntos nunca vistos não devem ser tratados imediatamente como esquecidos
- a prioridade do dia deve respeitar:
  - revisões vencidas
  - blocos em risco
  - assuntos elegíveis sem contato
  - pontos de entrada reais da trilha

## Banco oficial

O banco oficial do backend é:
`backend/data/study_hub.db`

O código deve sempre usar caminho absoluto baseado em `__file__`.
Não usar caminho relativo frágil.

## Filosofia de priorização de estudo

O sistema NÃO deve usar cronograma fixo por semana como regra central.
O sistema deve usar:

1. elegibilidade pedagógica
2. peso estratégico da disciplina
3. importância histórica do conteúdo no ENEM
4. lacuna pessoal do usuário
5. centralidade de pré-requisito
6. tempo sem contato
7. fator de evasão ou aversão
8. limite adaptativo de carga para evitar burnout

## Disciplinas e prioridade estratégica inicial

Ordem inicial:

1. Matemática
2. Biologia
3. Química
4. Física
5. Linguagens
6. Humanas
7. Redação

Mas isso é apenas uma camada, não uma regra absoluta.
Linguagens não pode ser abandonada.
Redação não deve substituir estudo das objetivas.
Matemática e Redação têm maior alavanca estratégica, mas não podem monopolizar o sistema.

## Sobre “o que mais cai”

Dados de recorrência histórica são uma camada útil, não uma verdade absoluta.
Usar recorrência para ajudar a priorizar, sem ignorar:

- pré-requisito
- lacuna pessoal
- nível atual do usuário
- necessidade de manutenção mínima das outras áreas

## Sobre carga de estudo

O sistema deve evitar explosões de carga.
Não recomendar 100+ questões do nada.
A lógica deve ser gradual e adaptativa.

A ideia geral é:

- começar com carga segura
- aumentar só se execução e fadiga permitirem
- reduzir se houver sinais de excesso

## Sobre o timer flutuante

O timer é uma ferramenta de execução, não o centro do sistema inteiro.

### Objetivo do timer

- ajudar o aluno a regular tempo por questão
- permitir modo prova e modo livre
- registrar ritmo real
- registrar questões concluídas e puladas
- gerar feedback da sessão

### Modo prova

- usa tempo alvo por questão
- overtime deve ficar visualmente mais crítico

### Modo livre

- ainda mede tempo
- sem pressão visual agressiva
- foco em aprendizagem

### O timer deve ser

- compacto
- com cara de widget
- com tempo como elemento dominante
- simples
- sem aparência de formulário ou ERP

### O timer não deve

- virar dashboard
- tentar resolver OCR
- implementar múltiplos fluxos paralelos complexos
- puxar novas features sem necessidade

## Restrições fortes

Não faça nada disso sem pedido explícito:

- não adicionar autenticação
- não adicionar multiusuário
- não transformar em SaaS
- não criar APIs genéricas demais
- não criar abstrações “para o futuro” sem necessidade real
- não reescrever backend inteiro
- não reestruturar frontend inteiro
- não migrar tudo para Tauri
- não criar Docker/CI/CD/deploy nesta fase
- não inventar analytics avançado
- não criar visual de painel administrativo

## Estilo de implementação

- preferir solução simples e clara
- usar tipagem
- componentes pequenos
- funções pequenas
- evitar estado global desnecessário
- evitar refatoração ampla se o pedido for local
- preservar comportamento já funcional
- alterar apenas o necessário para a tarefa pedida

## Como responder em cada tarefa

Antes de codar:

1. verificar se há pull para realizar
2. mostrar checklist curta dos arquivos que serão alterados
3. resumir em 3 a 6 passos o plano
4. apontar uma possível ambiguidade, se houver

Durante a implementação:

- não sair do escopo
- não inventar feature extra
- não tocar em backend se a tarefa for só frontend
- não tocar em frontend principal se a tarefa for só timer
- não mudar regra de negócio sem necessidade explícita

No final:

1. listar arquivos alterados
2. dizer o que mudou
3. mostrar como validar
4. listar o que ainda ficou pendente
5. não dizer que algo foi validado se não foi realmente executado
6. versionar e commitar as alterações

## Regra de honestidade

Se algo não foi realmente testado, diga claramente.
Exemplo:

- “build ok”
- “endpoint testado ok”
- “Tauri não validado nesta máquina por falta de cargo”
  Não fingir validação.

## Regras específicas para tarefas difíceis

Se a tarefa for grande, ambígua ou tiver risco de sair do escopo:

- planeje primeiro
- não comece implementando tudo direto
- proponha menor entrega útil possível
- preserve o projeto atual

## Definição de sucesso

Uma boa entrega neste projeto:

- deixa o sistema mais útil para estudar
- não aumenta complexidade sem ganho real
- mantém a trilha pedagógica coerente
- melhora execução real do aluno
- não parece software corporativo
