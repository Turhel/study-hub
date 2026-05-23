# Roadmap V2.6

## Blindagem basica dos endpoints

- [x] Proteger rotas `/api/*` com cabecalho `X-API-Key`.
- [x] Ler o token do backend via `API_SECURITY_TOKEN`.
- [x] Enviar o token do frontend via `VITE_API_SECURITY_TOKEN`.
- [x] Liberar `/health`, `/docs`, `/openapi.json` e preflight `OPTIONS`.
- [x] Manter bypass em testes automatizados para preservar a suite local.

Observacao: esta camada reduz acesso casual e robos de indexacao. Como o token do frontend fica publico no bundle Vite, ela nao substitui autenticacao real.
