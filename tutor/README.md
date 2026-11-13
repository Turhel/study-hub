# Tutor que dá para levar no notebook

Abre a pasta **study-hub** no VS Code e inicia uma conversa nova com o Codex. O `AGENTS.md` da raiz orienta o tutor; os arquivos desta pasta guardam o que precisa sobreviver à troca de máquina.

Pode começar assim:

> Retoma meu estudo pelo AGENTS.md e pelo tutor/estado.md. Me diz onde parei e vamos para a próxima lista.

Ou:

> Resolvi estas 18 questões. Vou mandar as erradas e os acertos inseguros, com a alternativa marcada e o gabarito. Analisa o que preciso estudar e registra a sessão.

## O que fica salvo

| Arquivo | Para quê |
| --- | --- |
| [Perfil](perfil.md) | Preferências que tu já explicou, sem precisar repetir |
| [Método](metodo.md) | Como resolver, corrigir e escolher o próximo estudo |
| [Estado](estado.md) | Onde paramos e qual é o próximo passo |
| [Dificuldades](dificuldades.csv) | Lacunas observadas, com evidência e acompanhamento |
| [Sessões](sessoes/README.md) | Histórico resumido do que foi realmente feito |
| [Redação](redacao/LEIA-ME.md) | Teus dois modelos e os cuidados na adaptação |
| [Materiais](materiais.md) | O que está no Git e o que depende da biblioteca externa |

## Trocar de máquina

1. Na máquina em que estudou, peça **“registra onde paramos e sincroniza no GitHub”**. O tutor deve mostrar o resultado do commit/push; salvar localmente não envia nada sozinho.
2. Na outra máquina, no GitHub Desktop, use **Fetch origin → Pull origin**, antes de iniciar a sessão. Se houver alterações locais, preserve-as e resolva a sincronização antes de misturar sessões.
3. Abra a raiz do `study-hub` no VS Code, inicie o Codex e use uma das mensagens acima.
4. Antes de sair, registre e sincronize novamente. Evite estudar e editar a mesma memória nas duas máquinas ao mesmo tempo.

O Git transporta os arquivos, não o histórico privado deste chat. O tutor não roda em segundo plano. Os PDFs locais podem ser lidos offline, mas conversar com o Codex normalmente exige conexão. PDFs externos do Telegram não vêm no clone.

[Como o Codex lê AGENTS.md — documentação oficial](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Teia visual no Obsidian

Abra a pasta [teia/](teia/) como cofre e comece por [00 Comece aqui](teia/00%20Comece%20aqui.md). O [guia do Obsidian](OBSIDIAN.md) explica o Canvas, o grafo e os limites dos diagnósticos. A primeira triagem é do ENEM 2026, aplicação regular, primeiro dia, branco 3, espanhol.
