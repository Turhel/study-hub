# API Contracts

Contrato de integracao dos principais endpoints do backend usados pelo frontend.

Este documento descreve o comportamento atual do backend, sem alterar payloads nem impor uma camada nova de API. Ele foi escrito a partir das rotas, dos schemas atuais e do smoke check em `backend/app/db_tools/backend_smoke_check.py`.

## Regras Gerais

- Base URL local padrao: `http://127.0.0.1:8000`
- Todos os exemplos abaixo sao realistas, mas alguns campos variam conforme a base tenha ou nao dados
- O backend pode responder com SQLite local ou Postgres/Supabase, sem mudar o formato principal dos payloads documentados aqui
- Listas vazias e contadores zerados sao estados validos em varias rotas
- Para erros, algumas rotas usam `{"detail":{"code":"...","message":"..."}}`, enquanto outras mais antigas ainda podem usar `{"detail":"..."}` em validacoes simples

## GET `/health`

**Objetivo**

Confirmar que a API subiu e esta aceitando requests.

**Quando o frontend deve usar**

- no bootstrap inicial da aplicacao
- em verificacoes simples de disponibilidade
- como fallback para diagnostico rapido de backend fora do ar

**Exemplo de resposta**

```json
{
  "status": "ok"
}
```

**Campos importantes**

- `status`: string simples de health check

**Estados vazios esperados**

- nao se aplica; o contrato esperado e sempre `{"status":"ok"}`

**Erros comuns**

- `5xx` se o backend nao conseguir subir corretamente
- erro de rede se a API nao estiver acessivel

**Observacoes de integracao**

- esta rota nao informa nada sobre banco, capabilities ou dados carregados
- use `/api/system/capabilities` para leitura de ambiente/capacidades

## GET `/api/system/capabilities`

**Objetivo**

Expor perfil da maquina, tipo de banco em uso e flags relevantes para o frontend.

**Quando o frontend deve usar**

- no carregamento inicial do app
- para adaptar features dependentes de LLM
- para mostrar estado de ambiente, se necessario

**Exemplo de resposta**

```json
{
  "machine_profile": "notebook",
  "database": {
    "dialect": "postgresql",
    "using_remote_database": true
  },
  "llm": {
    "enabled": false,
    "provider": "lm_studio",
    "model": "google/gemma-4-e4b"
  },
  "features": {
    "essay_correction_enabled": false,
    "essay_study_enabled": false
  }
}
```

**Campos importantes**

- `machine_profile`: `desktop`, `notebook` ou `local`
- `database.dialect`: normalmente `sqlite` ou `postgresql`
- `database.using_remote_database`: indica se o backend esta usando banco remoto
- `llm.enabled`: flag principal de LLM
- `features.essay_correction_enabled`
- `features.essay_study_enabled`

**Estados vazios esperados**

- nao se aplica; o payload deve sempre trazer todos os grupos principais

**Erros comuns**

- `5xx` se houver falha geral de startup do backend

**Observacoes de integracao**

- o frontend deve tratar `llm.enabled=false` e `features.*=false` como bloqueio de UX para fluxos de redacao assistida
- o provider/model sao informativos; o frontend nao deve assumir conectividade local com LM Studio

## POST `/api/system/reset-study-data`

**Objetivo**

Executar um reset seguro dos dados de estudo, preservando a estrutura pedagogica do app.

**Exemplo de request**

```json
{
  "confirmation_text": "RESETAR ESTUDOS",
  "dry_run": true,
  "reset_preferences": false,
  "include_essays": false
}
```

**Exemplo de resposta**

```json
{
  "dry_run": true,
  "deleted_counts": {
    "question_attempts": 12,
    "reviews": 3,
    "study_events": 9,
    "daily_study_plan_items": 4,
    "daily_study_plan": 2,
    "timer_session_items": 8,
    "timer_sessions": 2,
    "mock_exams": 1,
    "essay_study_messages": 0,
    "essay_study_sessions": 0,
    "essay_corrections": 0,
    "essay_submissions": 0
  },
  "reset_counts": {
    "block_mastery": 2,
    "block_progress": 258,
    "subject_progress": 572,
    "study_capacity_rows": 1
  },
  "preserved_tables": [
    "subjects",
    "blocks",
    "block_subjects",
    "roadmap_nodes",
    "roadmap_edges",
    "roadmap_block_map",
    "roadmap_rules",
    "lesson_contents"
  ],
  "preferences_reset": false,
  "essays_deleted": false,
  "warnings": []
}
```

**Regras importantes**

- `confirmation_text` precisa ser exatamente `RESETAR ESTUDOS`
- `dry_run=true` nao apaga nada; apenas retorna o relatorio
- `dry_run=false` limpa dados de uso e ressincroniza a progressao minima
- estrutura pedagogica e preservada
- `reset_preferences=true` volta `study_capacity` para defaults seguros
- `include_essays=true` tambem apaga `essay_submissions`, `essay_corrections`, `essay_study_sessions` e `essay_study_messages`

**Erros comuns**

- `400`:

```json
{
  "detail": {
    "code": "invalid_confirmation_text",
    "message": "Digite exatamente RESETAR ESTUDOS para continuar."
  }
}
```

## GET `/api/study-plan/today`

**Objetivo**

Retornar o plano de estudo do dia, com foco atual, quantidade planejada de questoes e contexto de roadmap.

**Quando o frontend deve usar**

- na tela principal de foco do dia
- ao recarregar o estado do plano diario
- depois de acoes que alterem execucao de estudo e possam impactar o plano

**Exemplo de resposta**

```json
{
  "summary": {
    "total_questions": 26,
    "focus_count": 3
  },
  "items": [
    {
      "discipline": "Matemática",
      "strategic_discipline": "Matemática",
      "subarea": "Matemática",
      "block_id": 10,
      "block_name": "Bloco 1",
      "subject_id": 17,
      "subject_name": "Matemática Básica - As quatro operações",
      "planned_questions": 12,
      "completed_today": 0,
      "remaining_today": 12,
      "progress_ratio": 0.0,
      "execution_status": "nao_iniciado",
      "priority_score": 0.9,
      "primary_reason": "Ponto de entrada elegivel com alto peso estrategico.",
      "planned_mode": "aprendizado",
      "roadmap_node_id": "MATH_001",
      "roadmap_mapped": true,
      "roadmap_mapping_source": "override",
      "roadmap_mapping_confidence": 999.0,
      "roadmap_mapping_reason": "Mapeamento definido manualmente.",
      "roadmap_status": "entry",
      "roadmap_reason": "Ponto de entrada real da trilha."
    }
  ]
}
```

**Campos importantes**

- `summary.total_questions`
- `summary.focus_count`
- `items`
- em cada item:
  - `discipline`
  - `subject_id`
  - `planned_questions`
  - `completed_today`
  - `remaining_today`
  - `execution_status`
  - `roadmap_mapped`
  - `roadmap_status`

**Estados vazios esperados**

```json
{
  "summary": {
    "total_questions": 0,
    "focus_count": 0
  },
  "items": []
}
```

Isso pode acontecer se a base estiver vazia, se ainda nao houver plano diario gerado ou se nao houver foco elegivel no momento.

**Erros comuns**

- `5xx` em caso de falha interna ao montar o plano

**Observacoes de integracao**

- o frontend deve tolerar `items=[]`
- `roadmap_*` pode vir parcialmente nulo se algum item nao estiver mapeado
- `execution_status` hoje usa `nao_iniciado`, `em_andamento` ou `concluido`
- a carga do plano considera as preferencias atuais de `/api/study-guide/preferences`
- `summary.total_questions` sempre deve bater com a soma de `items[].planned_questions`
- `summary.focus_count` sempre deve bater com `items.length`; se `items=[]`, ambos os campos do summary devem ser `0`

## GET `/api/study-guide/preferences`

**Objetivo**

Retornar as preferencias de capacidade do guia de estudos usadas para limitar carga e quantidade de focos do plano diario.

**Exemplo de resposta**

```json
{
  "daily_minutes": 90,
  "intensity": "normal",
  "max_focus_count": 3,
  "max_questions": 35,
  "include_reviews": true,
  "include_new_content": true,
  "updated_at": "2026-04-24T22:59:57.062187"
}
```

**Campos importantes**

- `daily_minutes`: tempo disponivel pretendido, entre 15 e 360
- `intensity`: `leve`, `normal` ou `forte`
- `max_focus_count`: teto de focos novos no plano
- `max_questions`: teto de questoes sugeridas
- `include_reviews`: reserva parte da carga para revisoes quando ativo
- `include_new_content`: permite ou nao focos novos no plano diario

## PUT `/api/study-guide/preferences`

**Objetivo**

Atualizar as preferencias do guia de estudos. A atualizacao nao recalcula automaticamente o plano ja existente; para isso use `/api/study-plan/today/recalculate`.

**Exemplo de request**

```json
{
  "daily_minutes": 45,
  "intensity": "leve",
  "max_focus_count": 1,
  "max_questions": 10,
  "include_reviews": true,
  "include_new_content": true
}
```

**Exemplo de resposta**

```json
{
  "daily_minutes": 45,
  "intensity": "leve",
  "max_focus_count": 1,
  "max_questions": 10,
  "include_reviews": true,
  "include_new_content": true,
  "updated_at": "2026-04-24T22:59:57.062187"
}
```

**Observacoes de integracao**

- intensidade `leve` reduz a carga
- intensidade `forte` permite carga maior, ainda com teto conservador
- `daily_minutes` limita a estimativa de questoes por tempo
- `include_reviews=true` reserva carga para revisoes, mas nao transforma revisoes em focos novos

## POST `/api/study-plan/today/recalculate`

**Objetivo**

Substituir explicitamente o plano ativo do dia por um novo plano calculado com as preferencias atuais.

**Exemplo de resposta**

```json
{
  "replaced_plan_id": 5,
  "plan": {
    "summary": {
      "total_questions": 31,
      "focus_count": 3
    },
    "items": []
  }
}
```

**Observacoes de integracao**

- o plano ativo anterior do mesmo dia recebe status `replaced`
- planos antigos nao sao apagados
- o recalc registra evento `daily_plan_generated` com metadata `recalculated=true`, `total_questions` e `focus_count`
- se `include_new_content=false`, o recalc pode retornar plano vazio, sem criar foco novo

## GET `/api/stats/overview`

**Objetivo**

Retornar a visao geral de desempenho para a futura pagina de estatisticas.

**Exemplo de resposta**

```json
{
  "questions_today": 12,
  "questions_this_week": 36,
  "questions_this_month": 120,
  "accuracy_today": 0.75,
  "accuracy_this_week": 0.6667,
  "accuracy_this_month": 0.6417,
  "avg_time_correct_questions_seconds": 142.5,
  "studied_subjects_this_week": 4,
  "impacted_blocks_this_week": 3,
  "weak_disciplines": [],
  "strong_disciplines": [
    {
      "discipline": "Matematica",
      "strategic_discipline": "Matematica",
      "questions": 30,
      "accuracy": 0.8
    }
  ],
  "recent_activity_count": 8
}
```

**Observacoes de integracao**

- taxas de acerto usam `acertos / questoes`
- tempo medio considera apenas questoes corretas com tempo preenchido
- se nao houver dados, contadores retornam `0`, taxas retornam `0.0`, listas retornam `[]` e tempo medio retorna `null`
- `recent_activity_count` v1 conta tentativas recentes registradas nos ultimos 7 dias

## GET `/api/stats/disciplines`

**Objetivo**

Retornar estatisticas agregadas por disciplina, com disciplina estrategica normalizada quando possivel.

**Exemplo de resposta**

```json
[
  {
    "discipline": "Biologia",
    "strategic_discipline": "Natureza",
    "total_questions": 30,
    "correct_questions": 18,
    "accuracy": 0.6,
    "questions_this_week": 12,
    "questions_this_month": 30,
    "average_time_correct_questions_seconds": 150.0,
    "studied_subjects_count": 3,
    "weak_subjects_count": 1,
    "risk_blocks_count": 1
  }
]
```

**Estados vazios esperados**

```json
[]
```

## GET `/api/stats/discipline/{discipline}`

**Objetivo**

Retornar agregados da disciplina ou area estrategica, aceitando variacoes com e sem acento no path.

**Exemplo de resposta**

```json
{
  "discipline": "Matematica",
  "questions_this_week": 20,
  "questions_this_month": 20,
  "correct_count": 14,
  "incorrect_count": 6,
  "accuracy": 0.7,
  "avg_time_correct_questions_seconds": 130.0,
  "studied_subjects": 2,
  "weak_subjects": [],
  "strong_subjects": [],
  "review_due_count": 1,
  "blocks_in_progress": 1,
  "blocks_reviewable": 0
}
```

**Observacoes de integracao**

- assuntos fracos exigem pelo menos 3 tentativas e baixa taxa de acerto ou dominio baixo
- assuntos fortes exigem pelo menos 3 tentativas e acuracia >= 75%
- `review_due_count` considera revisoes vencidas da disciplina
- `blocks_in_progress` e `blocks_reviewable` usam `block_progress` quando houver; caso contrario, caem para `blocks.status`

## GET `/api/stats/heatmap?days=365`

## GET `/api/stats/heatmap?discipline=Matematica&days=365`

**Objetivo**

Retornar uma serie diaria pronta para heatmap visual, com todos os dias do intervalo, inclusive os dias vazios.

**Exemplo de resposta**

```json
{
  "discipline": "Matematica",
  "start_date": "2025-04-30",
  "end_date": "2026-04-29",
  "max_questions_in_day": 12,
  "total_questions": 84,
  "active_days": 18,
  "current_streak_days": 2,
  "longest_streak_days": 6,
  "days": [
    {
      "date": "2026-04-27",
      "weekday": 0,
      "questions_count": 2,
      "correct_count": 2,
      "accuracy": 1.0,
      "studied": true,
      "intensity_level": 2
    },
    {
      "date": "2026-04-28",
      "weekday": 1,
      "questions_count": 0,
      "correct_count": 0,
      "accuracy": 0.0,
      "studied": false,
      "intensity_level": 0
    }
  ]
}
```

**Observacoes de integracao**

- sempre retorna todos os dias do intervalo
- `studied=true` exige estudo real com `question_attempts`; `daily_plan_generated` sozinho nao conta
- `intensity_level` vai de `0` a `4`
- `weekday` usa o padrao do Python (`0=segunda`, `6=domingo`)

## GET `/api/stats/timeseries?group_by=week&days=180`

## GET `/api/stats/timeseries?discipline=Matematica&group_by=week&days=180`

**Objetivo**

Retornar uma serie temporal agregada por dia ou por semana para desenhar barras e linhas.

**Exemplo de resposta**

```json
{
  "discipline": "Matematica",
  "group_by": "week",
  "points": [
    {
      "period": "2026-W17",
      "start_date": "2026-04-20",
      "end_date": "2026-04-26",
      "questions_count": 4,
      "correct_count": 3,
      "accuracy": 0.75,
      "avg_time_correct_questions_seconds": 90.0,
      "active_days": 1
    }
  ]
}
```

**Observacoes de integracao**

- `group_by` v1 aceita `day` e `week`
- o backend retorna periodos vazios com `questions_count=0` para manter o grafico estavel
- `avg_time_correct_questions_seconds` considera apenas questoes corretas com tempo preenchido

## GET `/api/stats/discipline/{discipline}/subjects`

**Objetivo**

Retornar o breakdown por assunto da disciplina selecionada.

**Exemplo de resposta**

```json
{
  "discipline": "Matematica",
  "subjects": [
    {
      "subject_id": 17,
      "subject_name": "Matematica Basica - As quatro operacoes",
      "block_id": 10,
      "questions_count": 25,
      "correct_count": 18,
      "accuracy": 0.72,
      "avg_time_correct_questions_seconds": 103.0,
      "last_studied_at": "2026-04-29T00:00:00",
      "mastery_score": 0.65,
      "mastery_status": "em_andamento"
    }
  ]
}
```

**Observacoes de integracao**

- aceita disciplina com ou sem acento no path
- `mastery_score` vem de `block_mastery` quando houver
- `mastery_status` usa `subject_progress.status` como prioridade, com fallback para `block_mastery.status`
- a ordenacao v1 prioriza maior volume de questoes

## GET `/api/gamification/summary`

**Objetivo**

Retornar dados simples para Ofensiva e Maestria no navbar, sem criar sistema complexo de gamificacao.

**Exemplo de resposta**

```json
{
  "streak": {
    "current_streak_days": 3,
    "longest_streak_days": 5,
    "studied_today": true,
    "active_weekdays": ["seg", "ter", "qua"],
    "last_study_date": "2026-04-24"
  },
  "mastery": {
    "total_mastery_stars": 12,
    "question_mastery_stars": 8,
    "review_mastery_stars": 3,
    "consistency_mastery_stars": 1,
    "mastered_subjects_count": 4,
    "top_mastery_subjects": [
      {
        "subject_id": 17,
        "subject_name": "Matematica Basica - As quatro operacoes",
        "discipline": "Matematica",
        "stars": 3,
        "question_accuracy": 0.92,
        "attempts_count": 24
      }
    ],
    "metadata": {
      "review_mastery_rule": "0 estrelas quando nao ha ultima_data/intervalo suficiente em reviews.",
      "consistency_mastery_rule": "1/2/3 estrelas com 3/7/14 dias distintos no mesmo subject."
    }
  }
}
```

**Observacoes de integracao**

- `daily_plan_generated` sozinho nao conta como estudo real para ofensiva
- ofensiva considera tentativas, revisoes realizadas, decisoes de bloco e eventos reais de estudo
- maestria v1 e calculada em memoria por subject; nao ha tabela nova, XP, moeda ou ranking global

## GET `/api/lessons/contents`

**Objetivo**

Listar conteudos de aula cadastrados para roadmap nodes e/ou subjects.

**Query params**

- `published_only`: boolean opcional; quando `true`, retorna apenas conteudos publicados

**Exemplo de resposta**

```json
[
  {
    "id": 1,
    "roadmap_node_id": "MATH_001",
    "subject_id": 17,
    "title": "Operacoes com inteiros",
    "body_markdown": "Resumo da aula...",
    "youtube_url": "https://www.youtube.com/watch?v=abc123",
    "extra_links": [
      {
        "label": "Lista de exercicios",
        "url": "https://example.com/lista"
      }
    ],
    "notes": "Aula base para matematica basica",
    "is_published": true,
    "created_at": "2026-04-25T09:10:00",
    "updated_at": "2026-04-25T09:10:00"
  }
]
```

**Estado vazio esperado**

```json
[]
```

## GET `/api/lessons/contents/{id}`

**Objetivo**

Retornar um conteudo de aula especifico.

**Erro comum**

- `404` com `{"detail":"Conteudo de aula nao encontrado."}`

## POST `/api/lessons/contents`

**Objetivo**

Criar conteudo de aula associado a pelo menos um `roadmap_node_id` ou `subject_id`.

**Exemplo de request**

```json
{
  "roadmap_node_id": "MATH_001",
  "subject_id": 17,
  "title": "Operacoes com inteiros",
  "body_markdown": "Resumo da aula...",
  "youtube_url": "https://www.youtube.com/watch?v=abc123",
  "extra_links": [
    {
      "label": "Lista de exercicios",
      "url": "https://example.com/lista"
    }
  ],
  "notes": "Aula base para matematica basica",
  "is_published": true
}
```

**Regras de validacao**

- `subject_id`, quando enviado, precisa existir em `subjects`
- `roadmap_node_id`, quando enviado, precisa existir em `roadmap_nodes`
- pelo menos um entre `roadmap_node_id` e `subject_id` deve ser enviado

## PUT `/api/lessons/contents/{id}`

**Objetivo**

Editar campos de um conteudo de aula existente. A validacao de referencias segue as mesmas regras do POST.

**Exemplo de request**

```json
{
  "title": "Operacoes com inteiros - versao revisada",
  "body_markdown": "Resumo revisado da aula...",
  "is_published": false
}
```

## DELETE `/api/lessons/contents/{id}`

**Objetivo**

Excluir um conteudo de aula.

**Resposta**

- `204 No Content`

## GET `/api/lessons/by-subject/{subject_id}`

**Objetivo**

Listar conteudos associados diretamente a um subject.

## GET `/api/lessons/by-roadmap-node/{node_id}`

**Objetivo**

Listar conteudos associados diretamente a um roadmap node.

## GET `/api/activity/recent`

**Objetivo**

Retornar o journal recente de atividade operacional do estudo.

**Quando o frontend deve usar**

- para timeline de atividade recente
- para blocos de historico rapido na home
- para feedback de acoes realizadas no dia ou recentemente

**Exemplo de resposta**

```json
[
  {
    "type": "daily_plan_generated",
    "created_at": "2026-04-24T09:12:52.196064",
    "title": "Plano diario gerado",
    "description": "Plano diario gerado com 26 questoes em 3 focos.",
    "discipline": null,
    "strategic_discipline": null,
    "subarea": null,
    "block_id": null,
    "subject_id": null,
    "metadata": {
      "plan_id": 5,
      "status": "active",
      "total_planned_questions": 26,
      "focus_count": 3
    }
  }
]
```

**Campos importantes**

- `type`: hoje pode ser `question_attempt_bulk`, `review_upsert`, `daily_plan_generated` ou `block_progress_decision`
- `created_at`
- `title`
- `description`
- `metadata`

**Estados vazios esperados**

```json
[]
```

Esse estado e valido quando ainda nao ha eventos recentes registrados.

**Erros comuns**

- `422` se `limit` vier fora do intervalo permitido
- `5xx` em falhas internas de consulta

**Observacoes de integracao**

- query param suportado: `?limit=30`, com minimo `1` e maximo `100`
- o frontend nao deve assumir que sempre existira `discipline`, `block_id` ou `subject_id`
- `metadata` varia por tipo de evento

## GET `/api/activity/today`

**Objetivo**

Retornar um resumo agregado da atividade do dia.

**Quando o frontend deve usar**

- em cards de resumo do dia
- para indicadores simples de progresso diario
- como base para microcopy do tipo “voce estudou X assuntos hoje”

**Exemplo de resposta**

```json
{
  "date": "2026-04-24",
  "question_attempts_registered": 0,
  "subjects_studied_today": 0,
  "blocks_impacted_today": 0,
  "reviews_generated_today": 0,
  "progression_decisions_today": 0,
  "studied_subject_ids": [],
  "impacted_block_ids": []
}
```

**Campos importantes**

- `date`
- `question_attempts_registered`
- `subjects_studied_today`
- `blocks_impacted_today`
- `reviews_generated_today`
- `progression_decisions_today`

**Estados vazios esperados**

- contadores em `0`
- listas vazias em `studied_subject_ids` e `impacted_block_ids`

Isso nao indica erro; pode simplesmente significar que ainda nao houve atividade no dia.

**Erros comuns**

- `5xx` em falhas internas de agregacao

**Observacoes de integracao**

- os ids retornados nas listas servem para correlacao, nao para renderizacao direta
- o frontend deve aceitar resumo zerado como estado normal

## GET `/api/roadmap/summary`

**Objetivo**

Retornar a visao consolidada do roadmap por disciplina.

**Quando o frontend deve usar**

- para telas de resumo do roadmap
- para diagnostico de carga estrutural
- para verificar se a estrutura principal foi carregada

**Exemplo de resposta**

```json
{
  "discipline_count": 11,
  "node_count": 414,
  "edge_count": 599,
  "block_count": 257,
  "disciplines": [
    {
      "discipline": "Matemática",
      "node_count": 58,
      "edge_count": 94,
      "subjects": [
        "Matemática Básica",
        "Aritmética"
      ],
      "blocks": [
        1,
        2,
        3
      ],
      "initial_nodes": []
    }
  ]
}
```

**Campos importantes**

- `discipline_count`
- `node_count`
- `edge_count`
- `block_count`
- `disciplines`

**Estados vazios esperados**

```json
{
  "discipline_count": 0,
  "node_count": 0,
  "edge_count": 0,
  "block_count": 0,
  "disciplines": []
}
```

Esse estado sugere que a estrutura do roadmap ainda nao foi carregada.

**Erros comuns**

- `5xx` se houver falha ao ler a estrutura de roadmap

**Observacoes de integracao**

- esta rota e estrutural; nao depende diretamente de atividade do usuario
- `initial_nodes` pode vir vazio dependendo da disciplina ou do criterio estrutural

## GET `/api/roadmap/validation`

**Objetivo**

Executar e retornar a validacao dos CSVs/versionamento do roadmap.

**Quando o frontend deve usar**

- raramente no produto final
- util para telas internas de diagnostico e verificacao de consistencia

**Exemplo de resposta**

```json
{
  "is_valid": true,
  "errors_count": 0,
  "warnings_count": 31,
  "errors": [],
  "warnings": [
    {
      "severity": "warning",
      "file": "roadmap_nodes.csv",
      "code": "roadmap_node_note",
      "message": "Linha com observacao estrutural.",
      "row": 12,
      "node_id": "MATH_001"
    }
  ]
}
```

**Campos importantes**

- `is_valid`
- `errors_count`
- `warnings_count`
- `errors`
- `warnings`

**Estados vazios esperados**

- `errors=[]` e `warnings=[]` sao validos
- `warnings_count>0` com `is_valid=true` tambem e valido

**Erros comuns**

- `5xx` se a leitura/validacao dos CSVs falhar de forma inesperada

**Observacoes de integracao**

- warnings nao significam necessariamente quebra de produto
- para UX comum, esta rota costuma ser secundaria

## GET `/api/roadmap/mapping/coverage`

**Objetivo**

Expor a cobertura do mapeamento entre `subjects` e roadmap nodes.

**Quando o frontend deve usar**

- em telas de auditoria de mapeamento
- para conferir integridade do relacionamento entre plano de estudo e roadmap

**Exemplo de resposta**

```json
{
  "total_subjects": 572,
  "mapped_subjects": 572,
  "override_mapped_subjects": 115,
  "heuristic_mapped_subjects": 457,
  "unmapped_subjects": 0,
  "ambiguous_subjects": 0,
  "coverage_percent": 100.0,
  "disciplines": [
    {
      "discipline": "Matemática",
      "total_subjects": 70,
      "mapped_subjects": 70,
      "override_mapped_subjects": 20,
      "heuristic_mapped_subjects": 50,
      "unmapped_subjects": 0,
      "ambiguous_subjects": 0,
      "coverage_percent": 100.0
    }
  ]
}
```

**Campos importantes**

- `total_subjects`
- `mapped_subjects`
- `coverage_percent`
- `unmapped_subjects`
- `ambiguous_subjects`

**Estados vazios esperados**

- se `total_subjects=0`, a cobertura pode vir `0.0`
- em base carregada, o esperado atual e cobertura alta; na base validada, `100%`

**Erros comuns**

- `5xx` em falhas de auditoria do mapping

**Observacoes de integracao**

- o frontend deve evitar assumir que `coverage_percent` sera sempre `100`
- um valor abaixo de `100` nao necessariamente quebra a API, mas pode justificar UX de alerta

## GET `/api/roadmap/mapping/gaps`

**Objetivo**

Listar lacunas de mapeamento: assuntos sem node, nodes sem assunto e casos ambiguos.

**Quando o frontend deve usar**

- em telas de auditoria
- para diagnostico quando coverage estiver baixa

**Exemplo de resposta**

```json
{
  "discipline": null,
  "unmapped_subjects": [],
  "roadmap_nodes_without_subject": [],
  "ambiguous_subjects": []
}
```

**Campos importantes**

- `discipline`
- `unmapped_subjects`
- `roadmap_nodes_without_subject`
- `ambiguous_subjects`

**Estados vazios esperados**

- todas as listas podem vir vazias
- isso e um estado positivo quando o mapeamento esta completo

**Erros comuns**

- `5xx` em falha de auditoria de gaps

**Observacoes de integracao**

- query param opcional: `?discipline=Matemática`
- quando a auditoria esta saudavel, vazio aqui nao significa “sem resposta”; significa “sem gaps detectados”

## GET `/api/block-progress/discipline/{discipline}`

**Objetivo**

Retornar o snapshot de progressao por disciplina, com bloco ativo, proximo bloco e estado de decisao.

**Quando o frontend deve usar**

- em telas de trilha pedagogica
- para mostrar se a disciplina esta pronta para avancar
- para renderizar CTA de decisao entre continuar, transicionar ou avancar

**Exemplo de resposta**

```json
{
  "discipline": "Matemática",
  "active_block": {
    "id": 1,
    "name": "Bloco 1",
    "status": "active"
  },
  "next_block": {
    "id": 2,
    "name": "Bloco 2",
    "status": "locked"
  },
  "reviewable_blocks": [],
  "saved_decision": null,
  "ready_to_advance": false,
  "message": "Ainda ha conteudos ativos no bloco atual."
}
```

**Campos importantes**

- `discipline`
- `active_block`
- `next_block`
- `reviewable_blocks`
- `saved_decision`
- `ready_to_advance`
- `message`

**Estados vazios esperados**

- `active_block=null` e `next_block=null` podem acontecer em disciplina sem dados compativeis
- `reviewable_blocks=[]` e estado valido

**Erros comuns**

- `404`:

```json
{
  "detail": {
    "code": "discipline_not_found",
    "message": "Disciplina nao encontrada: Matemática"
  }
}
```

**Observacoes de integracao**

- o path aceita nomes de disciplina, incluindo valores com acento
- o cliente deve URL-encode corretamente o path
- `message` e importante para UX; nao tratar apenas como campo secundario

## GET `/api/free-study/catalog`

**Objetivo**

Retornar o catalogo de conteudos estudaveis no Modo Livre, agrupado por disciplina e subarea, sem bloquear assuntos por roadmap.

**Quando o frontend deve usar**

- na entrada do Modo Livre
- para permitir busca/navegacao por conteudo fora do plano guiado
- antes de abrir o contexto detalhado de um subject

**Exemplo de resposta**

```json
{
  "disciplines": [
    {
      "discipline": "Matematica",
      "strategic_discipline": "Matematica",
      "subareas": [
        {
          "subarea": "Matematica Basica",
          "subjects": [
            {
              "subject_id": 17,
              "subject_name": "Matematica Basica - As quatro operacoes",
              "block_id": 10,
              "block_name": "Bloco 1",
              "roadmap_node_id": "MATH_001",
              "roadmap_mapped": true,
              "roadmap_status": "entry",
              "free_study_allowed": true,
              "warning_level": "none",
              "warning_message": null
            }
          ]
        }
      ]
    }
  ]
}
```

**Campos importantes**

- `disciplines`
- `subareas`
- `subjects[].subject_id`
- `subjects[].free_study_allowed`: sempre `true` no Modo Livre
- `subjects[].warning_level`: `none`, `low`, `medium` ou `high`

**Estados vazios esperados**

```json
{
  "disciplines": []
}
```

Isso pode acontecer em base sem subjects ativos.

**Observacoes de integracao**

- o Modo Livre avisa, mas nao bloqueia
- `roadmap_status` reflete o status do modo guiado quando houver mapeamento suficiente
- subjects sem mapeamento confiavel continuam aparecendo, com aviso pedagogico leve

## GET `/api/free-study/subjects/{subject_id}/context`

**Objetivo**

Retornar o contexto pedagogico de um subject no Modo Livre, incluindo pre-requisitos diretos e pendencias por tipo de relacao.

**Quando o frontend deve usar**

- ao abrir detalhes de um conteudo livre
- antes de registrar estudo livre se quiser mostrar aviso contextual

**Exemplo de resposta**

```json
{
  "subject_id": 44,
  "subject_name": "Geometria Espacial - Prismas",
  "discipline": "Matematica",
  "strategic_discipline": "Matematica",
  "subarea": "Geometria Espacial",
  "block_id": 22,
  "block_name": "Bloco 4",
  "roadmap_node_id": "MATH_088",
  "roadmap_mapped": true,
  "free_study_allowed": true,
  "guided_status": "blocked_required",
  "warning_level": "high",
  "warning_message": "Este conteudo pode ser estudado no modo livre, mas ainda possui pre-requisitos obrigatorios pendentes no roadmap.",
  "direct_prerequisites": [],
  "missing_required_nodes": [],
  "missing_cross_required_nodes": [],
  "missing_recommended_nodes": []
}
```

**Campos importantes**

- `free_study_allowed`: sempre `true`
- `guided_status`: status equivalente no modo guiado, ou `unmapped`
- `missing_required_nodes`
- `missing_cross_required_nodes`
- `missing_recommended_nodes`
- `warning_level` e `warning_message`

**Erros comuns**

- `404` se o subject nao existir ou estiver inativo:

```json
{
  "detail": "Assunto nao encontrado."
}
```

**Observacoes de integracao**

- pendencias `required` e `cross_required` geram aviso alto
- pendencias `recommended` e `cross_support` geram aviso medio
- o endpoint nao altera progresso nem dados reais

## POST `/api/question-attempts/bulk`

**Objetivo**

Registrar um lote resumido de questoes resolvidas para um mesmo assunto/bloco.

**Quando o frontend deve usar**

- em registro rapido de questoes
- ao concluir um bloco de exercicios homogêneo

**Exemplo de request**

```json
{
  "date": "2026-04-24",
  "discipline": "Matemática",
  "block_id": 10,
  "subject_id": 17,
  "source": "lista",
  "quantity": 12,
  "correct_count": 8,
  "difficulty_bank": "media",
  "difficulty_personal": "media",
  "elapsed_seconds": 1800,
  "confidence": "media",
  "error_type": "distracao",
  "notes": "Errei mais em divisibilidade.",
  "study_mode": "guided"
}
```

**Exemplo de resposta**

```json
{
  "created_attempts": 12,
  "block_id": 10,
  "subject_id": 17,
  "mastery_status": "em_progresso",
  "mastery_score": 0.67,
  "next_review_date": "2026-04-27",
  "impact_message": "Questoes registradas com impacto em progresso e revisao."
}
```

**Campos importantes**

- request:
  - `discipline`
  - `block_id`
  - `subject_id`
  - `quantity`
  - `correct_count`
  - `study_mode`: opcional; aceita `guided` ou `free`, default `guided`
- response:
  - `created_attempts`
  - `mastery_status`
  - `next_review_date`
  - `impact_message`

**Estados vazios esperados**

- `next_review_date` pode vir `null`
- `mastery_status` e `mastery_score` podem vir `null` em alguns cenarios

**Erros comuns**

- `400` com formato legado simples:

```json
{
  "detail": "Quantidade invalida para registro em lote."
}
```

**Observacoes de integracao**

- esta rota nao usa hoje o mesmo formato estruturado de erro das rotas mais novas
- o frontend deve tolerar `detail` como string aqui
- quando `study_mode="free"`, o evento registrado no journal recebe metadata com `study_mode`, `roadmap_node_id` e `warning_level`

## POST `/api/free-study/question-attempts/bulk`

**Objetivo**

Wrapper do Modo Livre para registrar questoes reaproveitando o mesmo fluxo de `/api/question-attempts/bulk`.

**Exemplo de request**

```json
{
  "date": "2026-04-24",
  "discipline": "Matematica",
  "block_id": 22,
  "subject_id": 44,
  "source": "lista livre",
  "quantity": 8,
  "correct_count": 5,
  "difficulty_bank": "media",
  "difficulty_personal": "media",
  "elapsed_seconds": 1200,
  "confidence": "media",
  "error_type": "conceito",
  "notes": "Estudo fora do plano guiado."
}
```

**Exemplo de metadata criada no journal**

```json
{
  "study_mode": "free",
  "roadmap_node_id": "MATH_088",
  "warning_level": "high",
  "created_attempts": 8,
  "correct_count": 5,
  "incorrect_count": 3
}
```

**Observacoes de integracao**

- o wrapper força `study_mode="free"` internamente
- mastery, review e activity seguem o mesmo servico existente de registro de tentativas
- o Modo Livre nao cria sistema paralelo de progresso

## POST `/api/block-progress/decision`

**Objetivo**

Persistir a decisao do usuario para um bloco pronto para transicao.

**Quando o frontend deve usar**

- quando o usuario escolhe continuar no bloco atual
- quando escolhe transicao mista
- quando escolhe avancar ao proximo bloco

**Exemplo de request**

```json
{
  "discipline": "Matemática",
  "block_id": 10,
  "user_decision": "advance_next"
}
```

**Exemplo de resposta**

```json
{
  "discipline": "Matemática",
  "block_id": 10,
  "saved_decision": "advance_next",
  "current_status": "ready_to_advance",
  "next_block_id": 11,
  "message": "Decisao salva com sucesso."
}
```

**Campos importantes**

- request:
  - `discipline`
  - `block_id`
  - `user_decision`
- response:
  - `saved_decision`
  - `current_status`
  - `next_block_id`
  - `message`

**Estados vazios esperados**

- `next_block_id` pode ser `null`

**Erros comuns**

- `400` ou `404`:

```json
{
  "detail": {
    "code": "block_decision_invalid",
    "message": "Bloco nao encontrado ou decisao invalida."
  }
}
```

**Observacoes de integracao**

- `user_decision` aceita hoje:
  - `continue_current`
  - `mixed_transition`
  - `advance_next`

## Endpoints De Redacao Dependentes De Capabilities

Esses endpoints existem, mas o frontend deve consultar `/api/system/capabilities` antes de expor ou acionar esses fluxos em maquinas sem LLM.

### POST `/api/essay/correct`

**Objetivo**

Executar correcao imediata sem persistir historico completo.

**Quando o frontend deve usar**

- em correcao pontual e descartavel

**Exemplo de erro com LLM desabilitado**

```json
{
  "detail": {
    "code": "llm_disabled",
    "message": "LLM desabilitado nesta maquina. Correcao de redacao indisponivel aqui. Use um profile com LLM habilitado, como o desktop principal."
  }
}
```

**Observacoes de integracao**

- pode responder `503` sem sequer tentar conectar ao provider

### POST `/api/essay/corrections`

**Objetivo**

Criar correcao persistida de redacao.

**Quando o frontend deve usar**

- em fluxos onde a correcao precisa ficar salva para consulta posterior

**Observacoes de integracao**

- depende de capabilities/LLM
- pode responder `400`, `502`, `503` ou `504`

### POST `/api/essay/study-sessions`

**Objetivo**

Abrir sessao de estudo assistido baseada numa correcao existente.

**Quando o frontend deve usar**

- depois de uma correcao persistida

**Observacoes de integracao**

- depende de `features.essay_study_enabled=true`
- em maquina sem suporte, a API responde `503` com erro estruturado

### POST `/api/essay/study-sessions/{session_id}/messages`

**Objetivo**

Enviar uma nova mensagem para a sessao de estudo assistido.

**Quando o frontend deve usar**

- em chat de estudo sobre a redacao

**Observacoes de integracao**

- tambem depende de capabilities/LLM
- `404` e usado quando a sessao nao existe

## Simulados

### GET `/api/mock-exams`

**Objetivo**

Listar os simulados registrados manualmente, em ordem da data mais recente para a mais antiga.

**Campos principais**

- `id`
- `exam_date`
- `title`
- `area`
- `total_questions`
- `correct_count`
- `accuracy`
- `tri_score`
- `duration_minutes`
- `notes`
- `created_at`
- `updated_at`

### POST `/api/mock-exams`

**Objetivo**

Criar um simulado manual.

**Payload**

```json
{
  "exam_date": "2026-04-30",
  "title": "Simulado Natureza abril",
  "area": "Natureza",
  "total_questions": 45,
  "correct_count": 31,
  "tri_score": 672.5,
  "duration_minutes": 180,
  "notes": "Fui bem em Biologia, cai em Fisica."
}
```

**Regras**

- `total_questions` precisa ser maior que zero
- `correct_count` nao pode ser maior que `total_questions`
- `tri_score` e opcional
- a API nao calcula TRI real; apenas armazena a nota informada

### GET `/api/mock-exams/{id}`

**Objetivo**

Buscar um simulado especifico.

### PUT `/api/mock-exams/{id}`

**Objetivo**

Editar um simulado existente.

**Observacoes**

- aceita atualizacao parcial
- continua validando `correct_count <= total_questions`

### DELETE `/api/mock-exams/{id}`

**Objetivo**

Excluir um simulado.

### GET `/api/mock-exams/summary`

**Objetivo**

Entregar um resumo enxuto para cards e graficos simples da area de Simulados.

**Resposta esperada**

```json
{
  "total_exams": 3,
  "latest_exam_date": "2026-04-30",
  "last_three_average_tri": 671.2,
  "last_three_average_accuracy": 0.71,
  "best_tri_score": 701.0,
  "by_area": [
    {
      "area": "Natureza",
      "total_exams": 2,
      "latest_tri_score": 672.5,
      "best_tri_score": 672.5,
      "average_accuracy": 0.72
    }
  ],
  "recent": []
}
```

**Observacoes**

- `last_three_average_tri` usa os 3 simulados mais recentes com `tri_score` preenchido
- `last_three_average_accuracy` usa os 3 simulados mais recentes com total valido
- `best_tri_score` ignora `null`
- `recent` volta ordenado por `exam_date desc`


### GET `/api/mock-exams/{id}/questions`

**Objetivo**

Listar as questoes cadastradas para a execucao de um simulado.

### POST `/api/mock-exams/{id}/questions/generate-placeholders`

**Objetivo**

Gerar placeholders numericos 1..N para simulados externos.

**Payload**

```json
{
  "total_questions": 90,
  "areas": [
    { "area": "Matematica", "start": 1, "end": 45 },
    { "area": "Natureza", "start": 46, "end": 90 }
  ]
}
```

**Observacoes**

- nao duplica placeholders se o simulado ja tiver questoes
- usa `source_type = "external"`

### PUT `/api/mock-exams/{id}/questions/{question_id}`

**Objetivo**

Atualizar uma questao individual com resposta, gabarito, dificuldade e tempo.

**Payload exemplo**

```json
{
  "user_answer": "A",
  "correct_answer": "D",
  "skipped": false,
  "difficulty_percent": 12,
  "time_seconds": 95,
  "notes": "Duvida em interpretacao."
}
```

### POST `/api/mock-exams/{id}/start`

**Objetivo**

Marcar o simulado como `in_progress`.

### POST `/api/mock-exams/{id}/finish`

**Objetivo**

Finalizar o simulado e calcular o resumo de execucao.

**Observacoes**

- a nota geral por areas usa media, nao soma
- qualquer nota calculada internamente aparece como `estimated_tri_score` e deve ser lida como **Estimativa TRI**
- nao existe TRI oficial calculada pela API

### GET `/api/mock-exams/{id}/results`

**Objetivo**

Buscar o resultado consolidado do simulado, com agregados por area e gabarito detalhado.

**Campos principais**

- `official_tri_score`
- `estimated_tri_score`
- `overall_area_average_score`
- `by_area`
- `questions`

## Observacoes Finais De Integracao

- O smoke check atual cobre diretamente:
  - `GET /health`
  - `GET /api/system/capabilities`
  - `GET /api/roadmap/summary`
  - `GET /api/roadmap/validation`
  - `GET /api/roadmap/mapping/coverage`
  - `GET /api/study-guide/preferences`
  - `GET /api/study-plan/today`
  - `GET /api/free-study/catalog`
  - `GET /api/activity/recent`
  - `GET /api/activity/today`
  - `GET /api/roadmap/mapping/gaps`
  - `GET /api/block-progress/discipline/Matemática`
- Os contratos acima descrevem o comportamento atual; eles nao criam uma promessa nova de API fora do que o backend ja entrega
- Se o frontend encontrar listas vazias ou contadores zerados, isso nao deve ser tratado automaticamente como falha
