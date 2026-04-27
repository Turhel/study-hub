# AI Handoff

Este documento resume o estado atual do projeto para continuidade manual ou com OpenClaude. Ele nao cria uma regra nova de produto; e apenas um mapa seguro do que ja existe, como rodar e onde tomar cuidado.

## 1. Estado atual do projeto

- TodayPage existe no frontend e conversa com o backend de plano diario.
- Registro manual de questoes existe e alimenta question attempts, progresso, reviews, activity, stats e gamification.
- Activity/event journal existe para timeline recente e atividade do dia.
- Stats existem para overview, disciplinas e detalhe por disciplina.
- Gamification/ofensiva/maestria existe como agregacao simples de dados ja existentes.
- Aulas existem no backend com CRUD de `lesson_contents`, associado a subject e/ou roadmap node.
- Redacao UI existe no frontend e consulta capabilities antes de liberar IA.
- Supabase/Postgres remoto esta integrado pelo `DATABASE_URL`.
- SQLite continua como fallback local quando `DATABASE_URL` nao esta definido.
- Machine profiles/capabilities diferenciam PC local com LLM e notebook sem LLM local.
- No PC, LM Studio/Gemma usa endpoint OpenAI-compatible em `http://127.0.0.1:1234/v1`.
- No notebook, o fluxo esperado e LLM desligado e UI de redacao indisponivel de forma clara.

## 2. Como rodar backend

No PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Verificar capabilities:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/system/capabilities | ConvertTo-Json -Depth 10
```

Rodar smoke check com backend ligado:

```powershell
cd backend
python -m app.db_tools.backend_smoke_check --base-url http://127.0.0.1:8000
```

## 3. Como rodar frontend

No PowerShell:

```powershell
cd frontend
npm install
npm run typecheck
npm run build
npm run dev
```

URL local padrao:

```text
http://127.0.0.1:5173/
```

## 4. Banco

- `DATABASE_URL` fica em `backend/.env` quando o backend deve usar Supabase/Postgres.
- Sem `DATABASE_URL`, o backend usa SQLite local em `backend/data/study_hub.db`.
- Supabase/Postgres remoto ja foi validado, mas deve ser tratado como banco principal real.
- SQLite e melhor para validacoes locais, copias temporarias e testes controlados.
- Nao rodar seed, scripts destrutivos ou testes de escrita contra o Supabase principal sem confirmar explicitamente o destino.
- Nao colar `.env`, URL com senha, tokens ou chaves em chats/ferramentas externas.

## 5. Fluxos validados

- TodayPage -> Registrar questoes -> Activity/Stats/Gamification.
- Study plan diario com preferences/recalculate e coerencia entre `summary` e `items`.
- Modo Livre backend: catalogo, contexto e registro de questoes reaproveitando fluxo existente.
- Stats/gamification endpoints retornando payloads estaveis mesmo com poucos dados.
- Aulas backend: criar, buscar, editar e excluir em banco temporario/copia segura.
- Redacao UI com LLM off: rota abre, botao de correcao fica desabilitado e mensagem aparece.
- LM Studio offline/inacessivel -> backend retorna `503 lm_unavailable`.
- LM Studio online -> ainda pendente validar uma correcao completa estruturada com Gemma.

## 6. Pendencias reais

1. Validar parser/correcao real Gemma em `POST /api/essay/correct`.
2. Se passar, validar `/essay` com LLM on ate aparecer resposta completa na UI.
3. Criar Modo Livre no frontend.
4. Criar Timer web.
5. Criar Simulados.
6. Fazer polimento visual geral.

## 7. Redacao / Gemma

- Nao alterar prompts de redacao sem autorizacao explicita.
- Nao alterar conteudo dos arquivos de prompt como tentativa rapida de corrigir parser.
- O erro antigo em que LM Studio offline virava `lm_invalid_response` foi corrigido; indisponibilidade agora deve virar `lm_unavailable`.
- Pendencia possivel: parser aceitar secoes Markdown de competencias C1-C5 quando a resposta estiver completa, mas em formato textual estruturado.
- Nao aceitar texto solto como correcao valida nem inventar nota ausente.
- LM Studio precisa estar rodando em:

```text
http://127.0.0.1:1234/v1
```

- Modelo atual usado no PC:

```text
google/gemma-4-e4b
```

Comando util:

```powershell
lms server start --port 1234 --bind 127.0.0.1
Invoke-RestMethod http://127.0.0.1:1234/v1/models | ConvertTo-Json -Depth 10
```

## 8. OpenClaude

- Usar OpenClaude apenas para tarefas pequenas e bem delimitadas.
- Sempre pedir para verificar status/diff antes de editar.
- Sempre rodar `typecheck`, `build`, `compileall` e `pytest` quando a mudanca tocar frontend/backend.
- Nao colar `.env`, chaves, tokens ou URLs com senha.
- Nao usar links reais do YouTube em seeds/testes.
- Nao alterar prompts de redacao sem autorizacao explicita.
- Nao mexer em roadmap CSV sem pedido direto.
- Preferir banco temporario/copia local para validacoes com escrita.

## 9. Comandos uteis

Git:

```powershell
git status --short --branch
git log --oneline -15
git diff --stat
```

Backend:

```powershell
python -m compileall backend\app
$env:PYTHONPATH = "$(Get-Location)\backend"; python -m pytest .
cd backend
python -m app.db_tools.backend_smoke_check --base-url http://127.0.0.1:8000
```

Frontend:

```powershell
cd frontend
npm run typecheck
npm run build
npm run dev
```

Capabilities:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/system/capabilities | ConvertTo-Json -Depth 10
```

LM Studio:

```powershell
lms server status
lms server start --port 1234 --bind 127.0.0.1
lms server stop
Invoke-RestMethod http://127.0.0.1:1234/v1/models | ConvertTo-Json -Depth 10
```

## 10. Ultimo estado Git

Estado observado no inicio deste handoff:

```text
branch: main
working tree: limpo
```

Commits recentes observados:

```text
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
```
