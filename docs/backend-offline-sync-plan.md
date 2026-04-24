# Backend Plan: Offline-First Sync

## Objetivo

Este documento descreve a implementacao recomendada para transformar o backend do `study-hub` em um backend `offline-first`, mantendo:

- `SQLite` como base operacional local
- `Supabase/Postgres` como continuidade entre dispositivos
- `repositorio` como fonte de verdade da estrutura pedagogica

O foco aqui e resiliencia real:

- estudar sem internet
- nao perder progresso por oscilacao de conexao
- conseguir retomar em outro dispositivo depois da sincronizacao

## Principio Arquitetural

O sistema nao deve depender do remoto para operar.

Regra central:

- toda escrita operacional entra primeiro no `SQLite`
- a interface e os servicos leem do `SQLite`
- a sincronizacao com `Supabase/Postgres` acontece depois

Logo:

- `Supabase` nao e banco primario de runtime
- `SQLite` nao e apenas fallback
- o app continua funcional mesmo com remoto indisponivel

## Estado Atual

Hoje o backend alterna entre:

- `SQLite`, quando nao existe `DATABASE_URL`
- `Postgres`, quando `DATABASE_URL` existe

Isso funciona para escolher um banco por runtime, mas ainda nao implementa operacao hibrida real.

Ja existe:

- inicializacao e escolha de banco em `backend/app/settings.py`
- engine e sessao central em `backend/app/db.py`
- bootstrap estrutural para Postgres em `backend/app/services/postgres_bootstrap_service.py`
- sync de uso do SQLite para Postgres em modo bootstrap
- estrutura versionada no repositorio via `docs/data_seed/*.csv` e `docs/roadmap/*.csv`

Ainda nao existe:

- dual-engine local/remoto durante runtime
- fila local de sincronizacao
- pull incremental do remoto para o local
- ids estaveis globais para merge entre dispositivos
- resolucao sistematica de conflitos

## Arquitetura Alvo

Camadas:

- `Repositorio`
- `SQLite local`
- `Supabase/Postgres remoto`
- `Sync services`

Responsabilidades:

### Repositorio

Fonte de verdade para:

- `subjects`
- `blocks`
- `block_subjects`
- `roadmap_nodes`
- `roadmap_edges`
- `roadmap_block_map`
- `roadmap_rules`

### SQLite local

Fonte operacional primaria para:

- registros de estudo
- progresso atual
- estado do dia
- fila de sync
- leitura da UI

### Supabase/Postgres remoto

Camada de continuidade entre dispositivos para:

- dados operacionais compartilhaveis
- historico consolidado
- retomada entre dispositivos

### Sync services

Responsavel por:

- registrar mudancas locais pendentes
- enviar mudancas ao remoto
- puxar mudancas remotas
- materializar no `SQLite`
- recalcular estados derivados

## Classificacao Das Tabelas

### Repo-only

Essas tabelas continuam versionadas no repositorio e sincronizadas para os bancos conforme necessidade:

- `subjects`
- `blocks`
- `block_subjects`
- `roadmap_nodes`
- `roadmap_edges`
- `roadmap_block_map`
- `roadmap_rules`

### Syncaveis e importantes para continuidade

- `question_attempts`
- `reviews`
- `study_events`
- `timer_sessions`
- `timer_session_items`
- `essay_submissions`
- `essay_corrections`
- `essay_study_sessions`
- `essay_study_messages`
- `block_progress`

### Derivadas, preferencialmente recalculadas localmente

- `block_mastery`
- `subject_progress`
- `daily_study_plan`
- `daily_study_plan_items`

### Local-first

- `study_capacity`

Observacao:

`study_capacity` deve comecar local para evitar que um dispositivo contamine o ritmo adaptativo do outro no MVP.

## Nova Infraestrutura Minima

## Novas tabelas locais

Sugestao inicial:

- `sync_queue`
- `sync_cursor`
- `sync_conflicts`
- `device_identity`

### sync_queue

Objetivo:

- guardar operacoes locais ainda nao enviadas ao remoto

Campos sugeridos:

- `id`
- `entity_type`
- `entity_sync_id`
- `operation`
- `payload_json`
- `payload_hash`
- `status`
- `retry_count`
- `last_error`
- `created_at`
- `updated_at`

Status sugeridos:

- `pending`
- `syncing`
- `synced`
- `error`

### sync_cursor

Objetivo:

- lembrar ate onde o dispositivo ja fez push/pull

Campos sugeridos:

- `id`
- `scope`
- `last_pulled_at`
- `last_pushed_at`

### sync_conflicts

Objetivo:

- registrar conflitos detectados pelo backend

Campos sugeridos:

- `id`
- `entity_type`
- `entity_sync_id`
- `local_payload_json`
- `remote_payload_json`
- `detected_at`
- `resolution_status`
- `notes`

### device_identity

Objetivo:

- dar identidade estavel ao dispositivo

Campos sugeridos:

- `device_id`
- `device_name`
- `created_at`

## Sync IDs

Para entidades sincronizaveis, o backend nao deve depender apenas de `id` autoincrement.

Precisamos adicionar um campo estavel global, por exemplo:

- `sync_id`

Formato sugerido:

- `UUID`

Tabelas prioritarias para receber `sync_id`:

- `question_attempts`
- `reviews`
- `study_events`
- `timer_sessions`
- `essay_submissions`
- `essay_corrections`
- `essay_study_sessions`
- `essay_study_messages`
- `block_progress`

Campos auxiliares recomendados:

- `updated_at`
- `updated_by_device`

## Servicos Novos Recomendados

Sugestao de modulos:

- `backend/app/services/sync_queue_service.py`
- `backend/app/services/sync_push_service.py`
- `backend/app/services/sync_pull_service.py`
- `backend/app/services/sync_status_service.py`
- `backend/app/services/sync_reconcile_service.py`

Responsabilidades:

### sync_queue_service

- registrar item pendente depois de cada escrita local syncavel
- atualizar status da fila
- buscar lotes prontos para push

### sync_push_service

- ler itens pendentes
- enviar ao remoto com idempotencia
- marcar sucesso ou erro

### sync_pull_service

- buscar alteracoes remotas mais novas
- aplicar no `SQLite`
- atualizar cursor

### sync_status_service

- expor status resumido para API e futuro uso no frontend

### sync_reconcile_service

- resolver conflitos simples
- registrar conflitos relevantes
- disparar recalc de estados derivados quando necessario

## Mudancas Em db.py E settings.py

### settings.py

Separar conceitos:

- `LOCAL_DATABASE_URL`
- `REMOTE_DATABASE_URL`
- `SYNC_ENABLED`

Comportamento sugerido:

- `LOCAL_DATABASE_URL` default para `backend/data/study_hub.db`
- `REMOTE_DATABASE_URL` opcional
- `SYNC_ENABLED=true` apenas quando remoto estiver configurado

### db.py

Em vez de um unico engine principal para tudo, separar:

- `local_engine`
- `remote_engine`

Manter leitura/escrita normal do app via sessao local.

Sugestao:

- `get_session()` continua retornando sessao local
- criar `get_remote_session()` apenas para os servicos de sync

Isso preserva o resto do backend com menos impacto.

## Estrategia De Escrita

Fluxo padrao para entidades syncaveis:

1. receber comando do usuario
2. gravar na tabela local
3. adicionar item na `sync_queue`
4. responder sucesso local
5. tentar sync depois

Importante:

- a resposta da API nao deve depender do remoto
- falha de rede nao deve desfazer salvamento local

## Estrategia De Leitura

Toda leitura funcional do produto deve continuar vindo do banco local:

- `today`
- `study-plan`
- `activity`
- `timer`
- `progression`

Se o pull remoto trouxer dados novos:

- materializar localmente
- recalcular derivados
- leituras seguintes ja passam a refletir o novo estado

## Estrategia De Sync Por Categoria

### Append-only

Mais simples e prioritario:

- `question_attempts`
- `study_events`
- `timer_sessions`
- `timer_session_items`
- `essay_*`

Regra:

- inserir local com `sync_id`
- push idempotente
- pull por `updated_at`
- inserir local se ainda nao existir

### Estado editavel

- `reviews`
- `block_progress`

Regra MVP:

- comparar por `sync_id`
- usar `updated_at`
- aplicar `last_write_wins`
- registrar no `sync_conflicts` quando houver divergencia relevante

### Estado derivado

- `block_mastery`
- `subject_progress`
- `daily_study_plan*`

Regra:

- nao sincronizar como verdade primaria
- recalcular localmente a partir dos dados base

## Recalculo Local

Depois de push/pull de certos dados, o backend deve disparar recalculo local de:

- `block_mastery`
- `subject_progress`
- `daily_study_plan`

Fontes gatilho:

- `question_attempts`
- `reviews`
- `block_progress`

Beneficio:

- menos conflito
- menor acoplamento ao remoto
- coerencia pedagogica preservada por dispositivo

## APIs Futuras Recomendadas

Sem definir frontend agora, o backend pode expor algo como:

- `GET /api/sync/status`
- `POST /api/sync/push`
- `POST /api/sync/pull`
- `POST /api/sync/run`

Campos uteis no status:

- `is_online`
- `sync_enabled`
- `sync_status`
- `pending_changes_count`
- `last_sync_at`
- `last_sync_error`
- `currently_syncing`

## Ordem De Implementacao Recomendada

### Fase 1: Fundacao

- adicionar `LOCAL_DATABASE_URL` e `REMOTE_DATABASE_URL`
- separar engines local/remoto
- criar `device_identity`
- criar tabelas `sync_queue`, `sync_cursor`, `sync_conflicts`
- adicionar `sync_id` e `updated_at` nas entidades prioritarias

### Fase 2: Primeiro fluxo util

Sincronizar apenas:

- `question_attempts`
- `study_events`
- `reviews`
- `timer_sessions`
- `timer_session_items`

Objetivo:

- estudar offline
- subir historico quando houver internet
- retomar em outro dispositivo com o essencial

### Fase 3: Reconciliacao e recalc

- pull incremental
- merge simples
- recalc local de derivados
- endpoints de status

### Fase 4: Expansao

- `block_progress`
- `essay_*`
- politicas melhores de conflito

## Menor Entrega Util

Definicao:

- o usuario registra estudo offline normalmente
- as mudancas ficam salvas no `SQLite`
- quando a internet voltar, o backend sincroniza o essencial
- em outro dispositivo, o historico chega e o estado pedagogico local e recalculado

Se isso estiver funcionando, a base da continuidade entre dispositivos ja estara resolvida.

## Riscos E Cuidados

### 1. Tentar sincronizar estado derivado cedo demais

Risco:

- conflitos desnecessarios
- incoerencia silenciosa

Mitigacao:

- sincronizar primeiro eventos e registros brutos

### 2. Usar so IDs locais

Risco:

- merge fragil
- duplicacao

Mitigacao:

- `sync_id` global

### 3. Push/pull automatico agressivo

Risco:

- complexidade maior
- comportamento dificil de debugar

Mitigacao:

- comecar com sync manual ou periodico simples

### 4. Misturar capacidade adaptativa entre dispositivos

Risco:

- distorcer carga recomendada

Mitigacao:

- manter `study_capacity` local no MVP

## Criterios De Sucesso

Uma boa implementacao dessa camada deve garantir:

- estudo funcional sem internet
- nenhum registro perdido por falha do remoto
- retomada coerente em outro dispositivo apos sincronizacao
- trilha pedagogica preservada
- baixa complexidade inicial

## Decisoes Recomendadas

Para reduzir risco e sair do papel mais rapido:

- usar `SQLite` como runtime principal
- tratar `Supabase` como continuidade, nao dependencia
- sincronizar primeiro apenas dados base
- recalcular estados derivados localmente
- deixar `study_capacity` local no inicio

Esse caminho e o mais consistente com o produto atual e com o objetivo de estudar em qualquer contexto sem quebrar a experiencia.
