# Study Hub

Monorepo local para um hub de estudos ENEM/Medicina.

Esta versão inicia a migração do MVP Streamlit para frontend e backend separados:

- `frontend/`: Vite + React + TypeScript + Tailwind CSS
- `backend/`: FastAPI + Pydantic + SQLModel + SQLite/Postgres
- `legacy_streamlit/`: código Streamlit preservado para migração gradual

Não há autenticação, multiusuário, Docker, Ollama, correção de redação, flashcards ou dashboard completo nesta etapa.

## Rodar Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Por padrao, sem `DATABASE_URL`, o backend usa SQLite local em `backend/data/study_hub.db`.

## Banco De Dados: SQLite Ou Postgres

O backend agora suporta os dois modos:

- sem `DATABASE_URL`: SQLite local
- com `DATABASE_URL=postgresql+psycopg://...`: Postgres

O fluxo de schema continua o mesmo:

- `init_db()`
- `SQLModel.metadata.create_all(...)`
- `run_migrations(engine)`

### Exemplo `.env` com SQLite

```text
STUDY_HUB_DB_ECHO=false
```

Sem `DATABASE_URL`, o backend usa:

```text
backend/data/study_hub.db
```

### Exemplo `.env` com Supabase/Postgres

```text
DATABASE_URL=postgresql+psycopg://postgres:SUASENHA@db.seu-projeto.supabase.co:5432/postgres
STUDY_HUB_DB_ECHO=false
```

Estado atual desta integracao:

- o backend pode operar normalmente em SQLite ou Postgres
- o Postgres/Supabase ja foi validado com schema, leitura e escrita reais
- existe bootstrap estrutural e de uso a partir do SQLite local
- o SQLite continua existindo como fallback de desenvolvimento e como fonte de bootstrap
- ainda nao ha integracao com auth/storage do Supabase

### Carga estrutural inicial no Postgres

Depois de validar a conexao com Supabase/Postgres, voce pode carregar apenas os dados estruturais:

- `subjects`
- `blocks`
- `block_subjects`
- `roadmap_nodes`
- `roadmap_edges`
- `roadmap_block_map`
- `roadmap_rules`

Sem migrar ainda os dados de uso, como:

- `question_attempts`
- `reviews`
- `study_events`
- `daily_study_plan`
- `timer_sessions`

Com `DATABASE_URL` apontando para o Postgres remoto:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.bootstrap_postgres
```

Se quiser informar outro SQLite de origem:

```powershell
python -m app.bootstrap_postgres --source-sqlite "D:\.dev\.repo\study-hub\backend\data\study_hub.db"
```

Esse passo preserva os IDs de `subjects`, `blocks` e `block_subjects`, para manter o mapeamento do roadmap consistente no Postgres.

### Sincronizar tambem os dados de uso

Quando quiser levar para o Postgres o que ja existe no SQLite local em:

- `block_progress`
- `subject_progress`
- `study_capacity`
- `daily_study_plan`
- `daily_study_plan_items`
- `essay_submissions`
- `essay_corrections`
- `essay_study_sessions`
- `essay_study_messages`

use:

```powershell
python -m app.bootstrap_postgres --include-usage
```

Se a estrutura ja estiver carregada e voce quiser sincronizar apenas uso:

```powershell
python -m app.bootstrap_postgres --usage-only
```

O sync de uso:

- preserva os IDs quando isso faz sentido
- faz merge por chave de negocio em `block_progress`, `subject_progress` e `block_mastery`
- nao apaga dados existentes no Postgres

### Fluxo recomendado para usar Postgres como banco principal

1. definir `DATABASE_URL` no `backend/.env`
2. rodar:

```powershell
python -m app.bootstrap_postgres --include-usage
```

3. subir o backend normalmente:

```powershell
python -m uvicorn app.main:app --reload
```

4. validar:

```powershell
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/roadmap/summary
curl http://127.0.0.1:8000/api/study-plan/today
curl http://127.0.0.1:8000/api/activity/recent
```

Com `DATABASE_URL` presente, o backend passa a operar sobre o Postgres remoto. O SQLite continua disponivel apenas como fallback/dev e como fonte de bootstrap.

Backend:

```text
http://localhost:8000
```

Endpoints:

```text
GET /health
GET /api/today
GET /api/roadmap/validation
GET /api/roadmap/summary
GET /api/roadmap/discipline/{discipline}/summary
```

## LLM Local Com LM Studio

O backend agora estah preparado para usar provider local configuravel, com padrao:

- provider: `lm_studio`
- model: `gemma-4-e4b`

Crie `backend/.env` a partir de `backend/.env.example`:

```text
STUDY_HUB_LLM_PROVIDER=lm_studio
STUDY_HUB_LLM_MODEL=gemma-4-e4b
STUDY_HUB_LLM_BASE_URL=http://127.0.0.1:1234/v1
STUDY_HUB_LLM_TIMEOUT_SECONDS=30
```

No LM Studio:

1. carregue o modelo `Gemma 4 E4B`
2. ative o servidor local OpenAI-compatible
3. confirme a URL base, normalmente `http://127.0.0.1:1234/v1`

Exemplo simples de teste no backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -c "from app.llm.tasks import EssayScorePayload, essay_score; r = essay_score(EssayScorePayload(essay_text='Texto curto de teste sobre educacao no Brasil.')); print(r.model_dump_json(indent=2))"
```

Outro teste com questao por texto:

```powershell
python -c "from app.llm.tasks import QuestionExplainTextPayload, question_explain_text; r = question_explain_text(QuestionExplainTextPayload(question_text='Se a funcao f(x)=2x+1, qual eh f(3)?', student_answer='6')); print(r.output_text)"
```

## Rodar Frontend

Em outro terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Se precisar apontar para outro backend, crie `frontend/.env`:

```text
VITE_API_BASE_URL=http://localhost:8000
```

## Dados Do Today

Sem `DATABASE_URL`, o banco local oficial do backend é:

```text
backend/data/study_hub.db
```

O endpoint `GET /api/today` consulta esse SQLite e retorna:

- contagem de blocos
- contagem de assuntos
- revisões vencidas
- blocos em risco
- assuntos sem contato recente
- prioridade simples do dia

Se o banco estiver vazio, o endpoint retorna contagens `0` e listas vazias com segurança.

## Inicializar E Importar Dados No Backend

Inicializar o banco:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -c "from app.db import init_db, DB_PATH; init_db(); print(DB_PATH)"
```

Importar a planilha:

```powershell
python -m app.import_study_plan "c:\Users\thull\Downloads\enem_blocos_organizados.xlsx"
```

Reaproveitar o banco legado, sem apagar o original:

```powershell
Copy-Item ..\legacy_streamlit\data\study_hub.db .\data\study_hub.db -Force
```

Verificar contagens:

```powershell
python -c "import sqlite3; c=sqlite3.connect('data/study_hub.db'); print('blocks', c.execute('select count(*) from blocks').fetchone()[0]); print('subjects', c.execute('select count(*) from subjects').fetchone()[0])"
```

Validar os CSVs do roadmap sem importar:

```powershell
python -m app.services.roadmap_import_service --validate
```

## Legado

O MVP Streamlit foi movido para:

```text
legacy_streamlit/
```
