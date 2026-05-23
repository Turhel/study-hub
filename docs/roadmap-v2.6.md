# Roadmap V2.6

## Segurança básica dos endpoints

- [x] Proteger rotas `/api/*` com cabeçalho `X-API-Token`.
- [x] Ler o token do backend via `STUDY_HUB_SECRET_TOKEN`.
- [x] Enviar o token do frontend via `VITE_STUDY_HUB_SECRET_TOKEN`.
- [x] Manter bypass em testes automatizados para preservar a suíte local.

Observação: esta camada reduz acesso casual e robôs de indexação. Como o token do frontend fica público no bundle Vite, ela não substitui autenticação real.
