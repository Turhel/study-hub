# Mini RPG do Study Hub

## Status

**Futuro / backlog planejado**Este módulo **não é prioridade agora**.Ele só deve ser iniciado **depois** que as pendências centrais do projeto estiverem estáveis, especialmente:

- roadmap pedagógico
- progressão por blocos
- plano diário
- registro de questões
- correção e estudo de redação
- persistência confiável
- timer/Tauri estabilizado

---

## Objetivo

Adicionar ao Study Hub uma camada de **gamificação visual e temática**, com estética de mini RPG, para representar o progresso do aluno de forma mais clara, motivadora e memorável.

A proposta **não** é transformar o projeto em um jogo completo.
A proposta é usar linguagem e elementos de RPG como uma **camada de apresentação do progresso real**.

Em outras palavras:

- o **sistema pedagógico real** continua mandando
- o **mini RPG** representa esse progresso de forma visual e temática

---

## Princípio central

> O RPG é a pele do sistema, não o esqueleto.

A lógica pedagógica do projeto vem antes da gamificação.

O mini RPG deve:

- refletir progresso real
- representar dificuldades reais
- reforçar consistência
- tornar o estudo mais visual e envolvente

O mini RPG **não** deve:

- substituir a lógica pedagógica
- inventar progresso falso
- punir de forma humilhante
- atrapalhar a leitura dos dados reais
- virar distração principal do projeto

---

## Papel da gamificação

A gamificação terá função de:

1. **visualizar o progresso**
2. **dar identidade temática ao estudo**
3. **aumentar engajamento**
4. **mostrar regressão e urgência de forma intuitiva**
5. **transformar simulados, redações e blocos em eventos marcantes**

Ela **não** deve:

- esconder a informação real
- dificultar entendimento do estudo
- premiar grind vazio
- transformar o projeto em um jogo puro

---

## Mapeamento pedagógico -> RPG

### Estrutura geral

- **roadmap pedagógico** = mapa do mundo
- **disciplinas** = grandes regiões / biomas / reinos
- **matérias** = sub-regiões / facções / territórios
- **conteúdos** = inimigos / desafios / mecanismos
- **blocos** = capítulos / zonas operacionais / trilhas
- **simulados por área** = chefes
- **redação** = chefe técnico / santuário / torre
- **simuladão ENEM** = chefão
- **revisões** = missões de manutenção / contenção / reforço
- **conteúdos esquecidos** = regiões corrompidas / ameaças crescentes
- **melhora de desempenho** = vitória / purificação / avanço territorial

---

## Exemplo de fantasia visual

### Disciplinas como regiões

- **Matemática** -> ruínas, mecanismos, torres lógicas, estruturas antigas
- **Linguagens** -> biblioteca, teatro, cidade letrada, tribunal de sentidos
- **Natureza** -> laboratório, floresta, observatório, usina, campo experimental
- **Humanas** -> mapa político, império, ruínas históricas, centros urbanos
- **Redação** -> torre dos cinco selos / fortaleza argumentativa / câmara final

### Conteúdos como inimigos

- um conteúdo pode ser representado como:
  - monstro comum
  - elite
  - obstáculo
  - guardião
  - puzzle

### Simulados como batalhas

- simulado por área = boss fight
- simuladão ENEM = final boss / raid / grande batalha de avaliação
- redação = boss técnico com múltiplas camadas

---

## Princípios de design da gamificação

### 1. Fidelidade pedagógica

Toda representação visual deve ter base em:

- desempenho real
- progresso real
- revisão real
- dificuldade real
- consistência real

### 2. Legibilidade

O usuário deve sempre conseguir entender:

- o dado real
- o estado pedagógico
- o significado da representação visual

### 3. Motivação sem infantilização

O mini RPG deve ser:

- estiloso
- temático
- satisfatório

Mas sem:

- virar caricatura
- parecer app infantil
- trocar clareza por excesso de fantasia

### 4. Reversibilidade

Perder ou ir mal deve gerar:

- alerta
- tensão
- urgência
- necessidade de recuperação

Mas **não**:

- punição destrutiva
- sensação de fracasso irreversível
- desmotivação severa

---

## Sistemas planejados

## 1. Regiões do mundo

Cada disciplina estratégica vira uma região principal.

Cada região terá:

- estado atual
- nível de ameaça
- progresso
- áreas liberadas
- áreas corrompidas
- bosses disponíveis
- bosses derrotados

### Estados possíveis de uma região

- segura
- em progresso
- ameaçada
- corrompida parcialmente
- sob ataque
- dominada / limpa

---

## 2. Inimigos por conteúdo

Os conteúdos serão representados como inimigos ou desafios.

### Um conteúdo pode assumir papéis como:

- monstro básico
- monstro recorrente
- elite
- guardião de rota
- pré-requisito central
- puzzle mecânico

### Observação importante

Um conteúdo **não precisa ter apenas um monstro fixo**.
Melhor abordagem:

- **matéria** = facção / tipo de ameaça
- **conteúdo** = inimigo
- **microcompetência** = ataque, fraqueza ou mecânica do inimigo

---

## 3. Progresso e combate

O progresso do aluno impacta o “combate” de forma indireta.

### Melhor desempenho

Pode representar:

- dano causado ao inimigo
- redução de corrupção da área
- ganho de XP
- avanço territorial
- desbloqueio de áreas
- enfraquecimento do boss

### Queda de desempenho

Pode representar:

- dano sofrido
- aumento de ameaça
- região sob pressão
- reforço dos inimigos
- retorno de corrupção
- vulnerabilidade do jogador em determinada área

---

## 4. XP e progressão do jogador

O jogador pode ter:

- nível geral
- XP total
- títulos
- conquistas
- afinidades
- histórico de vitórias

### Fontes de XP

O XP **não** deve vir apenas de acerto bruto.

Ele deve considerar:

- execução do plano
- consistência
- melhora real
- revisão feita
- recuperação de matéria fraca
- superação de boss
- progresso de bloco
- conclusão de missões

### Tipos de XP

- **XP de execução**: estudou de fato
- **XP de domínio**: melhorou score real
- **XP de consistência**: manteve sequência
- **XP de recuperação**: voltou em conteúdo difícil e evoluiu
- **XP de boss**: simulados e redações

---

## 5. Bosses

### Bosses por área

Simulados por área podem virar chefes específicos:

- Matemática -> chefe de lógica / tempo / precisão
- Natureza -> chefe de resistência conceitual
- Linguagens/Humanas -> chefe de interpretação / leitura / contexto

### Boss de redação

A redação pode ser tratada como boss técnico de múltiplos núcleos.

Exemplo:

- C1 = armadura formal
- C2 = núcleo temático
- C3 = inteligência argumentativa
- C4 = cadeia de coesão
- C5 = golpe final / proposta de intervenção

### Chefão ENEM

O simulado completo do ENEM pode ser tratado como:

- final boss
- raid
- grande evento
- batalha de campanha

---

## 6. Penalidades e dano

### Regra geral

A penalidade deve ser **informativa e temática**, não destrutiva.

### O sistema pode representar:

- queda de rendimento = dano sofrido
- matéria negligenciada = aumento de ameaça
- revisão ignorada = corrupção da região
- simulado ruim = derrota para boss
- overtime excessivo = fadiga

### O sistema NÃO deve:

- apagar progresso importante
- reduzir nível do jogador de forma severa
- travar o estudo
- punir de modo frustrante demais

### Filosofia da penalidade

Perder não é humilhação.Perder é:

- diagnóstico
- telemetria
- gatilho de recuperação

---

## 7. Buffs e debuffs

### Buffs possíveis

- sequência de estudo consistente
- revisão em dia
- melhoria em conteúdo crítico
- bloco aprovado
- simulados com evolução
- redação em boa faixa

### Debuffs possíveis

- fadiga
- vulnerabilidade em pré-requisito
- excesso de overtime
- regressão em matéria-base
- acúmulo de revisões vencidas

---

## 8. Economia e recompensas

### Regra central

A economia deve ser principalmente:

- cosmética
- temática
- de prestígio
- de conforto visual

### A moeda do sistema pode servir para:

- skins
- temas visuais
- molduras
- mascotes
- títulos
- emblemas
- trilhas sonoras
- variações de ambiente
- pequenos elementos de personalização

### O que a economia NÃO deve fazer

- comprar aprovação de bloco
- comprar avanço pedagógico
- apagar erro
- gerar XP falso
- burlar revisão
- distorcer o aprendizado

---

## 9. Missões

### Tipos possíveis

- missão diária
- missão de revisão
- missão de reforço
- missão de resgate de área corrompida
- missão de preparação para boss
- missão de consolidação
- missão de progressão

### Exemplo

- "Derrote 12 inimigos da trilha principal de Matemática"
- "Contenha a corrupção em Linguagens revisando interpretação"
- "Prepare-se para o chefe de Natureza"

---

## 10. Modo guiado e modo livre

### Modo guiado

Respeita:

- trilha pedagógica
- pré-requisitos
- bloco ativo
- plano diário
- progressão do usuário

### Modo livre

Tudo pode ser acessado, mas o sistema avisa:

- conteúdo fora da trilha
- pré-requisito não concluído
- alto risco de travamento

Na camada RPG:

- modo guiado = missão principal
- modo livre = exploração opcional

---

## Relação com os dados reais do projeto

A gamificação deve consumir dados reais do sistema:

- roadmap pedagógico
- blocos ativos / revisáveis / transição
- plano diário
- registros de questões
- revisões
- simulados
- redações
- progresso por bloco
- tempos / overtime
- feedback pós-registro
- sessões de estudo

O mini RPG **não deve** ter progresso separado da lógica principal.

---

## Não objetivos

Este módulo **não** pretende:

- transformar o projeto em game completo
- substituir a interface principal por fantasia
- esconder nomes pedagógicos
- criar mecânicas competitivas tóxicas
- criar pay-to-win
- gerar progresso artificial
- infantilizar o estudo

---

## Regras de implementação

### 1. A gamificação só entra depois das pendências centrais

Este módulo só deve ser iniciado quando o núcleo do projeto estiver maduro.

### 2. Implementação em fases

Nada de tentar fazer:

- mapa do mundo
- bosses
- economia
- inventário
- skins
- tudo de uma vez

### 3. Primeiro a lógica, depois os assets

Antes de comprar asset:

- validar sistemas
- validar semântica
- validar impacto
- validar se a camada realmente ajuda

### 4. Toda camada visual deve corresponder a dado real

Sem “efeito bonito” sem base pedagógica.

---

## Roadmap futuro do mini RPG

## Fase 1 — Gamificação mínima

Objetivo: provar a lógica sem exagero visual

Entradas:

- progresso por disciplina
- progresso por bloco
- revisões
- simulados
- redação

Entregas:

- XP
- nível
- estado das regiões
- bosses por área
- mensagens temáticas simples
- barras de ameaça / progresso

---

## Fase 2 — Camada visual leve

Objetivo: tornar a leitura mais temática

Entregas:

- cards temáticos
- estados das regiões
- bosses com HP visual
- progressão do jogador
- pequenos elementos visuais temáticos

---

## Fase 3 — Recompensas e personalização

Objetivo: aumentar engajamento sem distorcer o estudo

Entregas:

- moeda cosmética
- skins
- molduras
- títulos
- mascotes
- personalização visual

---

## Fase 4 — Expansão opcional

Objetivo: aprofundar a fantasia sem comprometer a clareza

Possíveis entregas:

- lore leve
- mapa visual maior
- coleções
- itens cosméticos especiais
- eventos sazonais internos do app

---

## Requisitos antes de iniciar este módulo

Antes do mini RPG começar, o projeto deve ter como mínimo:

- roadmap pedagógico utilizável
- progressão por blocos estável
- plano diário funcionando bem
- registro de questões confiável
- feedback pós-registro consolidado
- simulados minimamente estruturados
- redação minimamente estruturada
- backend e banco estáveis

---

## Nota final

O mini RPG deve ser tratado como uma **camada temática de progresso**, não como um desvio do objetivo principal.

Ele será bem-sucedido se:

- tornar o progresso mais visual
- aumentar a motivação
- melhorar retenção e acompanhamento
- continuar fiel ao sistema pedagógico real

Ele fracassará se:

- virar distração
- mascarar dados importantes
- criar progresso falso
- punir demais
- competir com o estudo em vez de reforçá-lo
