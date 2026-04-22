# Study Hub

Monorepo local para um hub de estudos ENEM/Medicina.

Esta versão inicia a migração do MVP Streamlit para frontend e backend separados:

- `frontend/`: Vite + React + TypeScript + Tailwind CSS
- `backend/`: FastAPI + Pydantic + SQLModel + SQLite
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

Backend:

```text
http://localhost:8000
```

Endpoints:

```text
GET /health
GET /api/today
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

O banco oficial do backend é sempre:

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

## Legado

O MVP Streamlit foi movido para:

```text
legacy_streamlit/
```
