# Study Hub

Monorepo local para um hub de estudos ENEM/Medicina.

Esta versão inicia a migração do MVP Streamlit para frontend e backend separados:

- `frontend/`: Vite + React + TypeScript + Tailwind CSS
- `backend/`: FastAPI + Pydantic + SQLModel + SQLite/Postgres
- `legacy_streamlit/`: código Streamlit preservado para migração gradual

Não há autenticação, multiusuário, Docker, Ollama, correção de redação, flashcards ou dashboard completo nesta etapa.

## Documentação De Contratos

- contratos principais de API para consumo do frontend: `docs/api-contracts.md`
- handoff seguro para continuidade manual/OpenClaude: `docs/AI_HANDOFF.md`

## Rodar Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Por padrao, sem `DATABASE_URL`, o backend usa SQLite local em `backend/data/study_hub.db`.

### Modo faculdade/offline com SQLite local

1. Comente `DATABASE_URL` em `backend/.env`.
2. Simule o bootstrap estrutural:

```powershell
cd backend
python -m app.db_tools.bootstrap_sqlite_from_repo --dry-run
```

3. Aplique o bootstrap no SQLite local:

```powershell
python -m app.db_tools.bootstrap_sqlite_from_repo --apply
```

4. Suba o backend:

```powershell
python -m uvicorn app.main:app --reload
```

5. Valide os endpoints principais:

```powershell
curl http://127.0.0.1:8000/api/system/capabilities
curl http://127.0.0.1:8000/api/study-plan/today
```

O bootstrap offline usa apenas CSVs versionados em `docs/data_seed` e `docs/roadmap`, aborta se o banco ativo nao for SQLite e nao apaga dados existentes.

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

Depois de validar a conexao com Supabase/Postgres, voce pode carregar apenas os dados estruturais.

Esses dados agora ficam versionados no repositório em:

- `docs/data_seed/subjects.csv`
- `docs/data_seed/blocks.csv`
- `docs/data_seed/block_subjects.csv`
- `docs/roadmap/*.csv`

Ou seja:

- o repositório vira a fonte de verdade da estrutura pedagógica e operacional
- o Supabase/Postgres fica focado em dados operacionais
- o SQLite pode continuar como fallback/offline e também como fonte de sync de uso

Os dados estruturais carregados no Postgres são:

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

Se voce quiser atualizar os CSVs estruturais versionados a partir do SQLite local:

```powershell
python -m app.export_repo_seed
```

O bootstrap estrutural do Postgres usa os CSVs versionados do repositório como fonte principal. Portanto, ele continua funcionando mesmo que o SQLite local nao esteja disponivel.

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

### Migracao controlada de dados reais do SQLite para Postgres

Para migrar os dados reais de `backend/data/study_hub.db` para o Postgres configurado em `DATABASE_URL`, use o script dedicado de migracao controlada.

Antes de qualquer escrita remota, ele:

- valida que o destino nao e SQLite
- exige `--apply`
- exige `STUDY_HUB_ALLOW_REMOTE_MIGRATION=true`
- cria backup do SQLite local em `backend/backups/`

Dry-run:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.db_tools.migrate_sqlite_to_postgres --dry-run
```

Apply real:

```powershell
$env:STUDY_HUB_ALLOW_REMOTE_MIGRATION='true'
python -m app.db_tools.migrate_sqlite_to_postgres --apply
```

Apply real com limpeza explicita do destino:

```powershell
$env:STUDY_HUB_ALLOW_REMOTE_MIGRATION='true'
python -m app.db_tools.migrate_sqlite_to_postgres --apply --reset-target
```

Regras importantes:

- sem `--apply`, o script nao escreve no Postgres
- sem `STUDY_HUB_ALLOW_REMOTE_MIGRATION=true`, o script aborta
- sem `--reset-target`, o script nao apaga dados existentes
- `schema_version` nao e copiada do SQLite
- nao commitar `.env` nem credenciais reais
- o backup local do SQLite nao substitui o banco original

O relatorio do script mostra:

- banco origem
- banco destino com senha mascarada
- tabelas detectadas
- tabelas ignoradas
- contagens antes e depois
- tabelas migradas
- checks de schema criticos no destino

### Sync estrutural automatico no startup

Quando o backend estiver rodando com `DATABASE_URL` Postgres, o default agora e:

- sincronizar automaticamente a estrutura versionada do repositório no startup

Isso inclui:

- `docs/data_seed/*.csv`
- `docs/roadmap/*.csv`

Entao, no fluxo normal com Supabase:

- o backend sobe
- garante schema/migrations
- sincroniza a estrutura versionada do projeto no Postgres

Se quiser desligar esse comportamento:

```text
STUDY_HUB_AUTO_SYNC_STRUCTURAL_ON_STARTUP=false
```

### Fluxo recomendado para usar Postgres como banco principal

1. definir `DATABASE_URL` no `backend/.env`
2. garantir que as seeds estruturais do repositório estejam atualizadas, se necessario:

```powershell
python -m app.export_repo_seed
```

3. para trazer tambem os dados de uso do SQLite local:

```powershell
python -m app.bootstrap_postgres --include-usage
```

4. subir o backend normalmente:

```powershell
python -m uvicorn app.main:app --reload
```

5. validar:

```powershell
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/roadmap/summary
curl http://127.0.0.1:8000/api/study-plan/today
curl http://127.0.0.1:8000/api/activity/recent
```

### Smoke check HTTP dos endpoints principais

Com o backend rodando:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.db_tools.backend_smoke_check --base-url http://127.0.0.1:8000
```

Saida JSON:

```powershell
python -m app.db_tools.backend_smoke_check --base-url http://127.0.0.1:8000 --json
```

O smoke check valida contrato minimo de endpoints como:

- `/health`
- `/api/system/capabilities`
- `/api/roadmap/summary`
- `/api/roadmap/validation`
- `/api/roadmap/mapping/coverage`
- `/api/study-guide/preferences`
- `/api/study-plan/today`
- `/api/stats/overview`
- `/api/stats/disciplines`
- `/api/stats/discipline/Matematica`
- `/api/gamification/summary`
- `/api/lessons/contents`
- `/api/free-study/catalog`
- `/api/activity/recent`
- `/api/activity/today`

Tambem tenta verificar:

- `/api/roadmap/mapping/gaps`
- `/api/block-progress/discipline/Matemática`

Interpretacao:

- `OK`: endpoint respondeu com payload coerente
- `WARN`: endpoint respondeu, mas com situacao que merece atencao, como lista vazia
- `ERROR`: status inesperado ou contrato minimo quebrado

### Seed demo controlado para frontend/dev

Existe uma ferramenta opcional para popular um dataset demo previsivel sem depender do estado real do banco.

Ela foi feita para ajudar telas como:

- plano diario
- activity recent
- activity today
- block progress
- tentativas de questoes
- revisao pendente

Regras importantes:

- por padrao, use `--dry-run`
- para gravar de verdade, use `--apply`
- a aplicacao tambem exige `STUDY_HUB_ALLOW_DEMO_SEED=true`
- o script nao apaga dados existentes
- o script tenta evitar duplicacao detectando o marker `DEMO_SEED_FRONTEND_DEV`

Dry-run:

```powershell
cd backend
python -m app.db_tools.seed_demo_data --dry-run
```

Apply:

```powershell
$env:STUDY_HUB_ALLOW_DEMO_SEED='true'
python -m app.db_tools.seed_demo_data --apply
```

Observacoes:

- se ja houver um plano ativo do dia, o plano demo pode virar o mais recente e passar a aparecer em `/api/study-plan/today`
- o script nao sobrescreve nem limpa dados reais automaticamente
- para validacao segura, prefira apontar `DATABASE_URL` para uma copia local de SQLite ou um banco de dev separado

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
GET /api/study-guide/preferences
PUT /api/study-guide/preferences
POST /api/study-plan/today/recalculate
GET /api/stats/overview
GET /api/stats/disciplines
GET /api/stats/discipline/{discipline}
GET /api/gamification/summary
GET /api/lessons/contents
POST /api/lessons/contents
PUT /api/lessons/contents/{id}
DELETE /api/lessons/contents/{id}
GET /api/lessons/by-subject/{subject_id}
GET /api/lessons/by-roadmap-node/{node_id}
GET /api/free-study/catalog
GET /api/free-study/subjects/{subject_id}/context
```

## LLM Local Com LM Studio

O backend agora estah preparado para usar provider local configuravel, com padrao:

- provider: `lm_studio`
- model: `gemma-4-e4b`

Agora tambem suporta perfil de maquina e capabilities diferentes por dispositivo, mesmo usando o mesmo `DATABASE_URL`.

Crie `backend/.env` a partir de `backend/.env.example`:

```text
STUDY_HUB_MACHINE_PROFILE=desktop
STUDY_HUB_LLM_ENABLED=true
STUDY_HUB_ESSAY_CORRECTION_ENABLED=true
STUDY_HUB_ESSAY_STUDY_ENABLED=true
STUDY_HUB_LLM_PROVIDER=lm_studio
STUDY_HUB_LLM_MODEL=gemma-4-e4b
STUDY_HUB_LLM_BASE_URL=http://127.0.0.1:1234/v1
STUDY_HUB_LLM_TIMEOUT_SECONDS=30
```

### Exemplo de perfil do notebook

Mesmo usando o mesmo `DATABASE_URL` do desktop principal:

```text
DATABASE_URL=postgresql+psycopg://postgres:SUASENHA@db.seu-projeto.supabase.co:5432/postgres
STUDY_HUB_MACHINE_PROFILE=notebook
STUDY_HUB_LLM_ENABLED=false
STUDY_HUB_ESSAY_CORRECTION_ENABLED=false
STUDY_HUB_ESSAY_STUDY_ENABLED=false
STUDY_HUB_LLM_PROVIDER=lm_studio
STUDY_HUB_LLM_MODEL=gemma-4-e4b
```

Efeito:

- notebook usa o mesmo banco remoto
- backend continua funcional
- rotas de correcao e estudo de redacao sao recusadas antes de qualquer tentativa de conectar ao LM Studio

### Exemplo de perfil do desktop principal

```text
DATABASE_URL=postgresql+psycopg://postgres:SUASENHA@db.seu-projeto.supabase.co:5432/postgres
STUDY_HUB_MACHINE_PROFILE=desktop
STUDY_HUB_LLM_ENABLED=true
STUDY_HUB_ESSAY_CORRECTION_ENABLED=true
STUDY_HUB_ESSAY_STUDY_ENABLED=true
STUDY_HUB_LLM_PROVIDER=lm_studio
STUDY_HUB_LLM_MODEL=gemma-4-e4b
STUDY_HUB_LLM_BASE_URL=http://127.0.0.1:1234/v1
```

### Endpoint de capabilities

O backend agora expõe:

```text
GET /api/system/capabilities
```

Exemplo de resposta:

```json
{
  "machine_profile": "notebook",
  "database": {
    "dialect": "postgres",
    "using_remote_database": true
  },
  "llm": {
    "enabled": false,
    "provider": "lm_studio",
    "model": "gemma-4-e4b"
  },
  "features": {
    "essay_correction_enabled": false,
    "essay_study_enabled": false
  }
}
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
