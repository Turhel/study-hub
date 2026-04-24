# Frontend Handoff: Offline-First Sync

## Objetivo

Este documento orienta a equipe de frontend sobre a futura camada de sincronizacao entre `SQLite local` e `Supabase/Postgres`, sem alterar o principio central do produto:

- o aluno precisa conseguir estudar offline
- a experiencia nao pode depender de internet em tempo real
- o app deve continuar de onde parou em dispositivos diferentes quando houver sincronizacao

O frontend nao deve tratar o Supabase como fonte primaria de funcionamento. A UI deve assumir que o sistema e `offline-first`.

## Modelo Conceitual

Arquitetura alvo:

- `Repositorio`: fonte de verdade da estrutura pedagogica versionada
- `SQLite local`: base operacional do dispositivo
- `Supabase/Postgres`: continuidade entre dispositivos
- `Sync engine`: envia e recebe mudancas sem bloquear uso

Regra principal para a UI:

- toda leitura operacional vem do backend local
- toda acao do usuario deve funcionar mesmo offline
- sincronizacao e uma capacidade auxiliar, nao pre-condicao de uso

## O Que O Frontend Precisa Assumir

1. O backend local continua sendo o ponto de integracao principal.
2. Uma acao concluida pelo usuario pode estar `salva localmente`, mas ainda `nao sincronizada`.
3. O estado de sync pode mudar durante a sessao sem interromper a interface.
4. Pode existir atraso entre o momento do estudo e a aparicao desse dado em outro dispositivo.
5. Em caso de falha de internet ou queda do remoto, a UX deve continuar normal para estudar.

## Estados De Sync Esperados

O frontend deve estar preparado para consumir algo nesse formato conceitual:

- `offline`
- `idle`
- `syncing`
- `has_pending_changes`
- `error`

Campos uteis esperados de uma futura API de status:

- `is_online`
- `sync_status`
- `pending_changes_count`
- `last_sync_at`
- `last_sync_error`
- `currently_syncing`

Exemplo conceitual:

```json
{
  "is_online": false,
  "sync_status": "has_pending_changes",
  "pending_changes_count": 6,
  "last_sync_at": "2026-04-24T10:15:00",
  "last_sync_error": null,
  "currently_syncing": false
}
```

## Comportamento De UX Recomendado

### 1. Estudo nunca bloqueado

Ao registrar questoes, sessoes de timer, revisoes ou progresso:

- nao bloquear a acao aguardando sincronizacao remota
- confirmar salvamento local imediatamente
- tratar sync como etapa posterior

Mensagens recomendadas:

- `Salvo no dispositivo`
- `Salvo e aguardando sincronizacao`
- `Sincronizado`

Evitar mensagens que passem a ideia de erro quando a acao ja foi salva localmente.

### 2. Indicador discreto, nao invasivo

O app nao deve virar painel de infraestrutura.

Preferencia:

- badge pequeno no shell do app
- estado resumido
- possibilidade de abrir detalhes se necessario

Estados visuais sugeridos:

- `Offline`
- `Sincronizando`
- `Pendencias`
- `Erro de sincronizacao`
- `Atualizado`

### 3. Erro remoto nao invalida estudo

Se o sync falhar:

- manter a acao do usuario como concluida localmente
- mostrar erro de sync como problema secundario
- oferecer tentativa posterior, nao retrabalho do estudo

Mensagem recomendada:

- `Seus dados estao salvos neste dispositivo. A sincronizacao sera tentada novamente quando a conexao voltar.`

### 4. Mostrar continuidade sem prometer instantaneidade

Quando houver sync bem-sucedido:

- mostrar que o progresso foi atualizado
- evitar promessa de tempo real absoluto

Mensagem recomendada:

- `Seus dados recentes ja podem aparecer em outro dispositivo.`

Evitar:

- `Atualizado em todos os dispositivos agora`

## Pontos Da UI Que Devem Considerar Sync

### Foco do dia

O frontend deve assumir que:

- o plano do dia vem do backend local
- ele pode ser recalculado apos chegada de dados remotos
- pode haver pequenas mudancas depois de um pull remoto

Implicacao:

- a tela deve lidar bem com refresh de dados sem parecer erro

### Registro de questoes

Depois de salvar:

- confirmar sucesso local
- opcionalmente mostrar estado `pendente de sincronizacao`

### Timer

Ao fechar sessao:

- considerar a sessao concluida localmente
- nao depender da disponibilidade do remoto para mostrar resumo

### Atividade recente

A timeline pode refletir:

- eventos criados localmente ainda nao sincronizados
- eventos que chegaram do remoto e foram materializados no SQLite local

Se houver suporte futuro, pode ser util sinalizar eventos locais pendentes com baixa enfase visual.

## Estados E Microcopy Sugeridos

Textos curtos:

- `Offline`
- `Online`
- `Sincronizando dados`
- `3 pendencias`
- `Atualizado ha pouco`
- `Erro ao sincronizar`

Textos explicativos:

- `O estudo continua funcionando normalmente offline.`
- `As alteracoes deste dispositivo serao enviadas quando houver conexao.`
- `Alguns dados ainda estao pendentes de sincronizacao.`
- `Nao foi possivel sincronizar agora, mas seu progresso local esta salvo.`

## O Que Nao Fazer No Frontend

- nao exigir internet para registrar estudo
- nao travar botao de salvar por causa de sync remoto
- nao tratar erro de sincronizacao como perda de dado local
- nao transformar o app em dashboard tecnico
- nao expor complexidade de conflito para o aluno, salvo se virar caso real e inevitavel

## Dados Que Podem Chegar Depois

O frontend deve estar preparado para futuras APIs relacionadas a:

- status de sincronizacao
- fila pendente local
- ultimo sync
- retry manual
- conflitos raros detectados pelo backend

Mesmo assim, a interface principal nao deve depender desses detalhes para funcionar.

## Direcao Visual

A linguagem deve continuar com cara de app de estudo:

- direta
- calma
- confiavel
- sem clima de alerta corporativo

O estado de sync deve transmitir:

- seguranca de que o dado foi salvo
- clareza sobre pendencias
- baixa friccao

## Resumo Executivo

Para a equipe de frontend:

- pensem em `salvo localmente primeiro`
- sincronizacao e um estado complementar
- o usuario precisa confiar que pode estudar offline
- mensagens e feedback devem reforcar continuidade, nao ansiedade

Se a API final ainda nao existir quando a interface for desenhada, podem trabalhar com um contrato simples de status de sync e com badge discreto no shell, sem depender da implementacao backend definitiva.
