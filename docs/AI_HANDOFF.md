# AI Handoff Final

Este e o handoff curto para continuar o projeto manualmente ou com OpenClaude. Nao e uma especificacao nova, nem autorizacao para refatorar.

## Estado atual

- TodayPage funcionando ponta a ponta.
- Registro manual de questoes validado.
- Activity, stats e gamification atualizando a partir dos registros.
- Aulas v1 funcionando com criacao, edicao, leitura e exclusao.
- Redacao UI criada.
- Supabase/Postgres ativo via `DATABASE_URL`.
- SQLite fallback ativo quando `DATABASE_URL` nao esta definido.
- LM Studio/Gemma configurado no PC em `http://127.0.0.1:1234/v1`.
- Notebook sem LLM local deve operar com capabilities de LLM desligadas.
- OpenClaude pode ajudar no notebook, desde que em tarefas pequenas e verificadas.

## Fluxos validados

- TodayPage -> registrar questoes -> activity/stats/gamification.
- Aulas -> criar/editar/excluir em SQLite temporario.
- Redacao UI com LLM off.
- LM Studio offline -> `503 lm_unavailable`.
- LM Studio online -> ainda pendente correcao real por parser/formato.

## Pendencia imediata

- Validar/corrigir parser de redacao em `backend/app/services/essay_service.py`.
- Problema provavel: Gemma responde C1-C5 em Markdown, como `**C1:**` ou `### C1`.
- NAO alterar prompts.
- A correcao so e valida se C1-C5 forem extraidas com nota e comentario.
- Nao aceitar texto solto, nao inventar nota e nao preencher competencia ausente por chute.

## Proximos passos

1. Fechar correcao real Gemma em `POST /api/essay/correct`.
2. Validar `/essay` com LLM on no PC.
3. Criar Modo Livre no frontend.
4. Criar Timer web.
5. Criar Simulados.
6. Fazer polimento visual.

## Comandos uteis

Backend compile:

```powershell
python -m compileall backend\app
```

Pytest com `PYTHONPATH`:

```powershell
$env:PYTHONPATH = "$(Get-Location)\backend"; python -m pytest .
```

Backend smoke check:

```powershell
cd backend
python -m app.db_tools.backend_smoke_check --base-url http://127.0.0.1:8000
```

Frontend typecheck/build:

```powershell
cd frontend
npm run typecheck
npm run build
```

Frontend dev:

```powershell
cd frontend
npm run dev
```

Backend dev:

```powershell
cd backend
python -m uvicorn app.main:app --reload
```

Capabilities:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/system/capabilities | ConvertTo-Json -Depth 10
```

LM Studio:

```powershell
lms server status
lms server start --port 1234 --bind 127.0.0.1
Invoke-RestMethod http://127.0.0.1:1234/v1/models | ConvertTo-Json -Depth 10
```

Git:

```powershell
git status --short --branch
git log --oneline -20
```

## Cuidados

- Nao usar links reais de YouTube em seeds/testes.
- Nao colar `.env`, chaves, tokens ou URLs com senha em IA externa.
- Nao rodar seed/teste no Supabase principal.
- Manter prompts de redacao intactos.
- Matar Uvicorns antigos quando capabilities, banco ou profile parecerem incoerentes.
- Preferir SQLite temporario/copia local para qualquer validacao com escrita.

## Ultimo estado Git observado

Status no inicio desta atualizacao:

```text
## main...origin/main [ahead 1]
```

Ultimos commits listados:

```text
34a6f9d docs: add AI handoff guide
82bb222 Refresh dev logs after timer updates
9ff4a36 Merge branch 'main' of https://github.com/Turhel/study-hub
eba92d4 feat: register timer sessions against study focus
33c2ebe fix: refine timer difficulty suggestion logic
af9d468 feat: connect focus cards to guided timer flow
7b1e9d1 Update dev server logs
20e51db fix: apply guide changes before recalculating plan
0ce236a refactor: split primary and secondary nav
712b9b3 refactor: simplify navigation and today labels
43dcbb8 refactor: trim redundant today copy
a108d0c feat: improve recent activity readability
0636e23 feat: clarify today activity progress card
6eea8c8 feat: make today guide card more intuitive
117dd4b feat: clarify next study action across pages
14cadd8 Merge branch 'main' of https://github.com/Turhel/study-hub
1ecc3a9 feat: enhance section extraction with flexible markdown support
e42493e fix: stabilize local peer dev startup
01cc5f0 feat: auto-start peer dev server
7707c3c feat: clarify next steps across study pages
```
