# Study Hub ENEM

MVP local em Python para um hub de estudos pessoal focado em ENEM/Medicina.

Esta etapa mantém apenas:

- banco SQLite local
- modelos mínimos do domínio
- regras mínimas de domínio por bloco
- uma tela Streamlit: `Hoje`

Não usa Django, PocketBase, autenticação, API externa, Ollama, correção de redação ou sistema multiusuário.

## Instalacao

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Inicializar Banco

```powershell
python -m src.db.init_db
```

O banco será criado em `data/study_hub.db`.

## Importar Planilha

Formato esperado:

- arquivo `.xlsx`
- preferencialmente uma aba chamada `conteudos_por_bloco`
- colunas essenciais: `disciplina` e `assunto`
- coluna recomendada: `bloco`
- colunas opcionais: `conteudo`, `subassunto`, `ordem`, `competencia`, `habilidade`, `prioridade_enem`

O importador aceita variações simples de nome, como `conteúdo` para `subassunto`.

Exemplo:

```powershell
python -m src.db.import_study_plan "c:\Users\thull\Downloads\enem_blocos_organizados.xlsx"
```

O script exibe as abas encontradas, a aba usada, as colunas mapeadas e um resumo do que entrou no banco.

## Abrir Streamlit

```powershell
python -m streamlit run app.py
```

Endereço padrão:

```text
http://localhost:8501
```

## Estrutura Mantida

```text
study-hub/
  app.py
  requirements.txt
  README.md
  data/
    study_hub.db
  src/
    core/
      rules.py
    db/
      models.py
      session.py
      init_db.py
      import_study_plan.py
    ui/
      pages/
        01_hoje.py
```
