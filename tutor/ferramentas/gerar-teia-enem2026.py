"""Gera notas e um Canvas nativo do Obsidian com a triagem informada em 13/11.

Somente rascunho inicial: não substitui correção dialogada nem mede domínio.
Não sobrescreve notas existentes; para atualizar, edite os registros preservados.
"""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VAULT = ROOT / 'tutor' / 'teia'
SOURCE = 'https://guiadoestudante.abril.com.br/wp-content/uploads/sites/4/2026/11/Enem-2026-prova-branca-1-dia.pdf'
KEY_SOURCE = 'https://guiadoestudante.abril.com.br/enem/provas/gabarito-enem-2026-prova-branca-primeiro-dia-extraoficial/'
DATE = '2026-11-13'

# Página é a posição no PDF digitalizado (1-based), que difere da numeração
# impressa a partir de Humanas: PDF 19 corresponde à página impressa 20.
ROWS = [
 (1, 'ESP', 3, 'Identidade hispânica nas Américas', 'Identidade e diversidade cultural', 'Inferência e sentido global', 'Relacionar a presença histórica hispânica à pluralidade das Américas, distinguindo a tese da canção de um pedido de paz.', 'A', 'C', 'A marcada desloca a discussão para uma súplica pelo fim do conflito. A canção enfatiza presença histórica e pertencimento. Hipótese a verificar: seleção de alternativa por tema geral em vez do comando.'),
 (3, 'ESP', 4, 'O medo da liberdade', 'Narrativa e construção de sentidos', 'Inferência e sentido global', 'Perceber a reflexão humana sugerida pelo animal que permanece na jaula aberta; ir além da leitura literal da situação.', 'B', 'A', 'A marcada fala de maus-tratos a animais; o fechamento associa o medo à liberdade. Hipótese a verificar: leitura literal sem inferir a reflexão do microconto.'),
 (5, 'ESP', 4, 'Encadeamento no microconto Palabras parcas', 'Narrativa e construção de sentidos', 'Recursos linguísticos e seus efeitos', 'Reconstruir uma sequência narrativa apesar da escrita concentrada em palavras iniciadas por A; distinguir efeito formal de exaltação do personagem.', 'E', 'B', 'A marcada atribui exaltação aos adjetivos; o texto compõe uma sequência de ambição, agressão, captura e defesa. Hipótese: priorizar classes de palavras sem verificar o sentido da narrativa.'),
 (8, '', 5, 'Campanha contra a poluição plástica', 'Finalidade e argumentação', 'Finalidade e sustentação de argumentos', 'Identificar o que a campanha quer que o leitor faça, observando o convite à assinatura de uma petição.', '', 'B', ''),
 (10, '', 7, 'Mulheres em Menino de engenho', 'Relações de gênero e sociedade', 'Inferência e sentido global', 'Relacionar as condições das personagens femininas às relações de gênero apresentadas no trecho literário.', '', 'A', ''),
 (11, '', 7, 'Expressão estética em Menino de engenho', 'Narrativa e construção de sentidos', 'Recursos linguísticos e seus efeitos', 'Comparar descrição da paisagem, voz do narrador e linguagem do grupo para localizar o efeito estético; há divergência nas referências extraoficiais.', '', 'D', ''),
 (12, '', 7, 'Marcas regionais em Menino de engenho', 'Variação e usos sociais da língua', 'Recursos linguísticos e seus efeitos', 'Distinguir expressão regional de frase genérica, retomando o fragmento indicado nas alternativas.', '', 'D', ''),
 (17, '', 8, 'Cartelas de remédio na arte de Iris Helena', 'Arte contemporânea e representação', 'Leitura de imagem e de obra de arte', 'Relacionar suporte, transformação da função do objeto e proposta da obra; confrontar fotografia e comentário da artista.', '', 'B', ''),
 (19, '', 9, 'Função referencial em texto legal', 'Finalidade e argumentação', 'Finalidade e sustentação de argumentos', 'Observar o conteúdo informativo de um artigo que enumera fundamentos legais, distinguindo princípios de regras de conduta.', '', 'B', ''),
 (21, '', 9, 'Dilúvio, de Renina Katz', 'Arte contemporânea e representação', 'Leitura de imagem e de obra de arte', 'Relacionar texto de apresentação e elementos visuais da obra, distinguindo abstração, figuração e rótulos de movimentos.', '', 'C', ''),
 (22, '', 10, 'Poesia e linguagem de lei', 'Finalidade e argumentação', 'Recursos linguísticos e seus efeitos', 'Reconhecer a apropriação de um gênero legal como recurso de crítica à obrigatoriedade da literatura.', '', 'B', ''),
 (24, '', 10, 'Vocabulário e cultura paraense em Dona Onete', 'Identidade e diversidade cultural', 'Recursos linguísticos e seus efeitos', 'Relacionar palavras e referências locais à identidade cultural, sem reduzir a tarefa à memorização de definições.', '', 'A', ''),
 (27, '', 11, 'Metáfora da emergência na vida conectada', 'Narrativa e construção de sentidos', 'Inferência e sentido global', 'Explicar o efeito da metáfora no argumento sobre a conexão permanente, lendo o trecho no contexto.', '', 'A', ''),
 (28, '', 12, 'Descrição poética em Herbarium', 'Narrativa e construção de sentidos', 'Inferência e sentido global', 'Identificar como a narradora transforma sensorialmente o microcosmo da floresta; separar descrição poética de mera enumeração.', '', 'C', ''),
 (31, '', 13, 'Matabichar e variedades do português', 'Variação e usos sociais da língua', 'Recursos linguísticos e seus efeitos', 'Comparar texto literário e comentário linguístico para identificar uma marca lexical da variedade angolana.', '', 'E', ''),
 (32, '', 13, 'Evidências da desigualdade na ciência', 'Relações de gênero e sociedade', 'Finalidade e sustentação de argumentos', 'Encontrar a informação usada para sustentar a tese, distinguindo-a de uma meta institucional ou uma citação de contexto.', '', 'D', ''),
 (34, '', 14, 'Argumentação sobre racismo estrutural', 'Finalidade e argumentação', 'Finalidade e sustentação de argumentos', 'Identificar como o texto sustenta uma tese por meio do panorama social apresentado; evitar acrescentar comparação que não foi feita.', '', 'A', ''),
 (35, '', 14, 'Gênero gramatical e representação social', 'Variação e usos sociais da língua', 'Recursos linguísticos e seus efeitos', 'Relacionar o uso social do masculino e do feminino à representação de quem participa de um evento, considerando a ironia.', '', 'C', ''),
 (39, '', 15, 'Tecnologia e influência sobre decisões', 'Finalidade e argumentação', 'Inferência e sentido global', 'Identificar o fundamento da reflexão sobre televisão, dados e influência, sem trocar a tese por um detalhe do texto.', '', 'C', ''),
 (46, '', 20, 'Circulação internacional de coleções naturais', 'História, memória e poder', 'Comparação de fontes e contexto', 'Relacionar coleta por viajantes e museus europeus a redes de circulação de coleções, usando o trecho indicado.', '', 'C', ''),
 (47, '', 20, 'Diversidade natural e acervos coloniais', 'Sociedade e natureza', 'Comparação de fontes e contexto', 'Identificar a condição natural favorável à coleta de espécimes nos territórios colonizados e vinculá-la ao texto de apoio.', '', 'D', ''),
 (62, '', 23, 'Ética estoica e preparação para a perda', 'Ética e filosofia prática', 'Aplicação de conceitos filosóficos', 'Reconhecer a orientação prática da ética helenística no conselho de Epicteto; distinguir a ação da mera forma lógica do argumento.', '', 'C', ''),
 (65, '', 24, 'Gabinete de leitura e biblioteca no século XIX', 'História, memória e poder', 'Comparação de fontes e contexto', 'Comparar as funções descritas das duas instituições: empréstimo de livros versus sociabilidade e debate público.', '', 'A', ''),
 (67, '', 24, 'Erosão costeira em Atafona', 'Sociedade e natureza', 'Relações causais socioambientais', 'Reconstruir a cadeia desvio de água → menor vazão/transporte de sedimentos → avanço do mar, separando processo e agente intensificador.', '', 'A', ''),
 (70, '', 25, 'Tradições indígenas em dois contextos', 'Identidade e diversidade cultural', 'Comparação de fontes e contexto', 'Comparar os dois relatos e reconhecer a valorização de práticas originárias sem pressupor homogeneidade ou sincretismo.', '', 'B', ''),
 (71, '', 26, 'Irrigação e salinização do solo', 'Sociedade e natureza', 'Relações causais socioambientais', 'Relacionar irrigação, evaporação e acúmulo de sais ao ambiente semiárido; distinguir salinização de outros processos de degradação.', '', 'C', ''),
 (74, '', 27, 'Melhoramento genético e conflito moral', 'Ética e filosofia prática', 'Aplicação de conceitos filosóficos', 'Relacionar os dois textos ao pressuposto de que características humanas podem ser controladas, distinguindo possibilidade técnica de avaliação moral.', '', 'A', ''),
 (80, '', 28, 'Reservas e produção de terras-raras', 'Sociedade e natureza', 'Leitura de gráfico e unidades', 'Ler legenda, unidades e diferenças entre reservas e produção; relacionar potencial mineral à geopolítica sem concluir que reserva é produção atual.', '', 'E', ''),
 (83, '', 29, 'Brazil Railway e Guerra do Contestado', 'História, memória e poder', 'Comparação de fontes e contexto', 'Relacionar o discurso empresarial de progresso à modernização e aos impactos sobre comunidades locais no contexto do Contestado.', '', 'D', ''),
 (86, '', 30, 'Patrimonialismo e interesse coletivo', 'História, memória e poder', 'Aplicação de conceitos políticos', 'Aplicar o conceito de patrimonialismo à confusão entre público e privado e identificar sua consequência para o interesse coletivo.', '', 'D', ''),
]

def save(relative, content):
    file = VAULT / relative
    if file.exists():
        raise FileExistsError(f'Não vou sobrescrever {file}; preserve suas edições.')
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(content, encoding='utf-8')

def dump(relative, value):
    save(relative, json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def qid(row): return f'Q{row[0]:03}' + ('-ESP' if row[1] else '')
def qfile(row): return f'02 Questoes/{"Linguagens" if row[0] <= 45 else "Humanas"}/{qid(row)}.md'
def link(path, label=None): return f'[[{path.removesuffix(".md")}' + (f'|{label}' if label else '') + ']]'

def text_cards(canvas, questions):
    """Cartões leves e clicáveis: evita propriedades ocupando os embeds curtos."""
    by_path = {q['notePath']: q for q in questions}
    for node in canvas['nodes']:
        file = node.pop('file', None)
        if not file: continue
        node['type'] = 'text'
        if file in by_path:
            q = by_path[file]
            extra = '\n\n**Texto não lido**' if q['reportedUnreadSharedText'] else ''
            if q.get('answerStatus') == 'divergencia-extraoficial': extra += '\n\n**Gabarito em disputa**'
            node['text'] = f"### {link(file, q['id'])}\n\n{q['title']}{extra}"
        elif file.startswith('01 Habilidades/'):
            name = Path(file).stem
            count = sum(q['skill'] == name for q in questions)
            node['text'] = f'## {link(file, name)}\n\n**{count} questões conectadas**\n\nExigência do enunciado; dificuldade ainda a verificar.'
        elif file == '00 Comece aqui.md':
            node['text'] = f'# Sua teia · ENEM 2026\n\n**19 questões de Linguagens + 11 de Humanas** · Branco 3 · Espanhol\n\nClique nos links para abrir as notas. As linhas ligam questões ao raciocínio exigido. **Conexão não é diagnóstico de dificuldade.**\n\n{link(file, "Comece aqui")} · {link("03 Evidencias/Gabaritos em conferencia", "Gabaritos em conferência")}'
        elif node['id'] == 'leitura':
            node['text'] = f'## {link(file, "Textos compartilhados não lidos")}\n\nVocê relatou não ter lido os blocos 9–13 e 46–50.\n\nNesta lista: **10, 11, 12, 46 e 47**.\n\nSeparar acesso ao texto de desconhecimento conceitual; causa ainda a investigar.'
        else:
            node['text'] = f'## {link(file, "Resultado provisório")}\n\nLista com **30 erros relatados**; não fechar os acertos por subtração. Estimativas e listagem ainda não coincidem.\n\nSó três alternativas marcadas foram recebidas. Não há nota TRI nem domínio medido aqui.'
    return canvas

def main():
    if (VAULT / '00 Comece aqui.md').exists():
        raise SystemExit('A teia já existe. O gerador inicial não sobrescreve registros.')
    questions = []
    for row in ROWS:
        n, language, page, title, concept, skill, reasoning, marked, key, hypothesis = row
        reported_unread = n in [10, 11, 12, 46, 47]
        notes = []
        if n in [10, 11, 12]: notes.append('O aluno declarou não ter lido o texto das questões 9–13. Isso não confirma lacuna em todos os conteúdos do bloco nem erro nas questões 9 e 13.')
        if n in [46, 47]: notes.append('O aluno declarou não ter lido o texto das questões 46–50. Isso não confirma erro nas questões 48–50 nem uma dificuldade conceitual em todas elas.')
        if n == 19: notes.append('O Anglo informa alteração do gabarito durante a correção. Revalidar com o oficial antes de consolidar o resultado.')
        if n == 21: notes.append('Checagem prioritária do gabarito: a leitura da obra e o enquadramento das alternativas merecem comparação com outra resolução e com o oficial. Não consolidar uma lacuna por este item isolado.')
        record = {'id': qid(row), 'exam': 'ENEM', 'year': 2026, 'application': 'regular', 'day': 1, 'booklet': 3, 'color': 'branco', 'language': language or None, 'area': 'Linguagens' if n <= 45 else 'Humanas', 'number': n, 'pdfPage': page, 'printedPage': page if page <= 18 else page + 1, 'title': title, 'concept': concept, 'skill': skill, 'skillIsOfficialCode': False, 'requiredReasoning': reasoning, 'marked': marked or None, 'referenceAnswer': key, 'answerStatus': 'extraoficial-nao-validado', 'reportedResult': 'erro-relatado-pelo-aluno', 'reportedUnreadSharedText': reported_unread, 'diagnosisStatus': 'hipotese-a-verificar' if hypothesis else 'informacao-insuficiente', 'hypothesis': hypothesis or None, 'reviewStatus': 'triagem-realizada-correcao-dialogada-pendente', 'notes': notes, 'source': SOURCE, 'keySource': KEY_SOURCE, 'notePath': qfile(row)}
        questions.append(record)
        content = f'''---
tipo: questao
prova: ENEM-2026-regular-D1-branco-3
numero: {n}
area: {record['area']}
resultado: erro-relatado
gabarito: extraoficial
diagnostico: {record['diagnosisStatus']}
revisao: pendente
tags: [questao, {record['area'].lower()}]
---

# {qid(row)} · {title}

{link('00 Comece aqui', 'Voltar ao mapa')} · {link('03 Evidencias/Resultado provisorio', 'Limites da contagem')}

## O que esta questão exige

{reasoning}

- Habilidade descrita pelo tutor, sem código oficial: {link('01 Habilidades/' + skill)}.
- Conteúdo relacionado: {link('04 Conceitos/' + concept)}.
- Fonte: [caderno digitalizado, PDF p. {page}; impressa p. {record['printedPage']}]({SOURCE}#page={page}).

## O que sabemos da sua tentativa

- Resultado: você incluiu este item na lista de erros, comparada a um gabarito extraoficial.
- Alternativa marcada: **{marked or 'não informada'}**.
- Referência Anglo/Guia do Estudante: **{key}**, ainda **extraoficial**; não sabemos se foi a mesma fonte que você consultou.
- Lacuna conceitual: **ainda não confirmada**.

{chr(10).join('- ' + note for note in notes)}
{link('03 Evidencias/Textos compartilhados nao lidos', 'Evidência de texto não lido') if reported_unread else ''}

## Próximo passo possível

{hypothesis if hypothesis else 'Rever o raciocínio decisivo e, se você quiser, a alternativa marcada ou uma nova tentativa. Sem a resposta marcada, não dá para atribuir o erro a um distrator específico.'}

Uma questão nova sobre o mesmo raciocínio pode verificar a aprendizagem depois da explicação. Essa verificação ainda não aconteceu.

## Referência do gabarito

[Anglo/Guia do Estudante — branco, primeiro dia, espanhol nas questões 1–5]({KEY_SOURCE}). A origem da imagem de prova é jornalística; não foi localizado um gabarito oficial nesta consulta. Não converter este registro em nota TRI ou em domínio/deficiência permanente.
'''
        save(qfile(row), content)

    skills = sorted({r[5] for r in ROWS})
    concepts = sorted({r[4] for r in ROWS})
    for folder, values, index in [('01 Habilidades', skills, 5), ('04 Conceitos', concepts, 4)]:
        for value in values:
            rows = [r for r in ROWS if r[index] == value]
            body = '\n'.join(f'- {link(qfile(r), qid(r) + " · " + r[3])}' for r in rows)
            save(f'{folder}/{value}.md', f'''---
tipo: {'habilidade' if index == 5 else 'conceito'}
status: exigencia-das-questoes
tags: [{'habilidade' if index == 5 else 'conceito'}]
---

# {value}

Este nó reúne **{len(rows)} questões relatadas como erradas** que exigem este raciocínio ou envolvem este conteúdo. A conexão foi feita pela leitura dos enunciados. **Não mede domínio, não confirma a causa dos erros e não mede a frequência do assunto no ENEM.**

## Questões ligadas

{body}

## Como usar

Abra uma questão e confira a evidência disponível. Uma explicação seguida de nova tentativa pode distinguir desconhecimento do conceito, aplicação, interpretação ou ausência de leitura. Não atribuir a mesma causa a todos os itens só porque se conectam neste grafo.

{link('00 Comece aqui', 'Voltar ao mapa')}
''')

    save('03 Evidencias/Textos compartilhados nao lidos.md', '''---
tipo: evidencia
tags: [evidencia]
---

# Textos compartilhados não lidos

**Evidência declarada pelo aluno:** não leu o texto das questões 9–13, de Linguagens, nem o das questões 46–50, de Humanas. Também informou que fez Linguagens por último. Isso não demonstra, por si só, cansaço como causa nem falta de conteúdo.

Questões desses blocos presentes na lista de erros: [[02 Questoes/Linguagens/Q010]], [[02 Questoes/Linguagens/Q011]], [[02 Questoes/Linguagens/Q012]], [[02 Questoes/Humanas/Q046]] e [[02 Questoes/Humanas/Q047]].

As demais questões desses blocos não foram listadas como erros. Não registrar que todas foram erradas ou que acertos não listados provam domínio.

**Próximo passo proposto, ainda não realizado:** retomar um dos textos com as respectivas questões sem pressão de tempo. Só depois comparar a nova tentativa. Isso ajuda a separar acesso ao texto e raciocínio conceitual.

[[01 Habilidades/Comparação de fontes e contexto]] · [[01 Habilidades/Inferência e sentido global]] · [[01 Habilidades/Recursos linguísticos e seus efeitos]]
''')
    save('03 Evidencias/Resultado provisorio.md', '''---
tipo: evidencia
tags: [evidencia]
---

# Resultado provisório

- Prova confirmada pelo aluno: ENEM 2026, aplicação regular, primeiro dia, caderno 3 branco, espanhol.
- Estimativa inicial declarada: aproximadamente 25 acertos em Linguagens e 33 em Humanas; o próprio aluno disse que não havia feito a conta com segurança.
- Lista recebida: **19 itens de Linguagens e 11 de Humanas**, 30 no total.
- Não fechar os acertos por subtração: falta confirmar se a lista é completa, se houve omissões e qual gabarito extraoficial foi usado. A estimativa inicial e a lista não fecham entre si.
- Alternativas marcadas conhecidas: espanhol Q1=A, Q3=B e Q5=E. As demais não foram informadas.
- Referência extraoficial consultada pelo tutor: Anglo/Guia do Estudante, sem substituir a fonte usada pelo aluno. O próprio Anglo assinala mudanças durante a correção nas questões 19 e 53.
- Gabarito oficial: pendente de confirmação. Não há cálculo de TRI ou nota nesta teia.

[[03 Evidencias/Textos compartilhados nao lidos]] · [[00 Comece aqui]]
''')
    save('00 Comece aqui.md', '''---
tipo: inicio
tags: [inicio]
---

# Sua teia de investigação · ENEM 2026

**30 questões relatadas: 19 de Linguagens e 11 de Humanas.** Cada questão se conecta ao conteúdo e ao raciocínio exigido. A teia mostra o que investigar; não é um radar de domínio.

## Abra o mapa

- [[Teia ENEM 2026.canvas|Canvas · visão organizada por habilidade]]
- Grafo: pressione **Ctrl+G**. Os nós são notas e as linhas são links entre elas.
- Use **Ctrl+O** e digite o número de uma questão, como Q080, para chegar direto a ela.
- Clique em um nó de habilidade para ver as questões relacionadas. Os nomes de habilidades são descrições do tutor, sem pretensão de códigos oficiais da matriz.

## Antes de interpretar os erros

[[03 Evidencias/Resultado provisorio|Contagem provisória e dados faltantes]]

[[03 Evidencias/Textos compartilhados nao lidos|Textos compartilhados que você não leu]]

Um nó com muitas conexões indica que esse raciocínio aparece em vários itens desta lista. **Não significa que seja sua maior dificuldade.** Só três alternativas marcadas foram recebidas, e ainda não houve correção dialogada nem nova tentativa.

## Três caminhos possíveis, quando você decidir retomar

1. Relê um dos textos compartilhados e refaz as questões ligadas a ele: ajuda a separar falta de leitura de conteúdo.
2. Retoma as três questões de espanhol com suas alternativas registradas: permite comparar a marcada com o sentido do texto.
3. Escolhe uma dupla conceitual, como erosão costeira/salinização ou ética estoica/bioética, para uma explicação e uma tentativa posterior.

Nada aqui é cronograma nem exercício dado como concluído. Não é necessário estudar todos os nós hoje.

## Registro e privacidade

Os arquivos são Markdown e JSON Canvas locais. Graph, Canvas, Backlinks, Search e Bookmarks são recursos nativos, sem assinatura ou plugin comunitário obrigatório. Não é necessário Obsidian Sync ou Publish.

Este repositório está público. Antes de enviar ao GitHub os registros individuais desta teia, precisamos definir se eles permanecerão locais ou serão publicados com autorização explícita. Não adicionar o PDF grande nem arquivos de sessão do aplicativo ao commit.
''')
    dump('dados/triagem.json', {'date': DATE, 'method': 'leitura visual de caderno digitalizado; triagem, não correção dialogada', 'source': SOURCE, 'referenceKey': KEY_SOURCE, 'officialKeyVerified': False, 'estimatedCorrectReported': {'linguagens': 25, 'humanas': 33, 'verified': False}, 'errorCountsReported': {'linguagens': 19, 'humanas': 11}, 'questions': questions})
    # Canvas com cartões agrupados e navegação para as notas reais.
    nodes, edges = [], []
    nodes.append({'id': 'inicio', 'type': 'file', 'file': '00 Comece aqui.md', 'x': 0, 'y': -400, 'width': 1550, 'height': 300, 'color': '6'})
    for i, skill in enumerate(skills):
        x, y = (i % 3) * 560, (i // 3) * 1100
        node = f'h{i}'
        members = [r for r in ROWS if r[5] == skill]
        nodes.append({'id': node, 'type': 'file', 'file': f'01 Habilidades/{skill}.md', 'x': x, 'y': y, 'width': 500, 'height': 200, 'color': '4' if any(r[0] > 45 for r in members) else '5'})
        edges.append({'id': f'root-{i}', 'fromNode': 'inicio', 'fromSide': 'bottom', 'toNode': node, 'toSide': 'top', 'label': 'exigência a investigar'})
        for j, row in enumerate(members):
            qnode = qid(row)
            nodes.append({'id': qnode, 'type': 'file', 'file': qfile(row), 'x': x + (j % 2) * 250, 'y': y + 240 + (j // 2) * 185, 'width': 235, 'height': 160, 'color': '5' if row[0] <= 45 else '4'})
            edges.append({'id': f'e-{qnode}', 'fromNode': node, 'fromSide': 'bottom', 'toNode': qnode, 'toSide': 'top'})
    nodes.append({'id': 'leitura', 'type': 'file', 'file': '03 Evidencias/Textos compartilhados nao lidos.md', 'x': 0, 'y': 3300, 'width': 780, 'height': 300, 'color': '2'})
    nodes.append({'id': 'contagem', 'type': 'file', 'file': '03 Evidencias/Resultado provisorio.md', 'x': 850, 'y': 3300, 'width': 780, 'height': 300, 'color': '2'})
    for n in [10, 11, 12, 46, 47]: edges.append({'id': f'nl-{n}', 'fromNode': 'leitura', 'fromSide': 'top', 'toNode': f'Q{n:03}', 'toSide': 'bottom', 'label': 'texto não lido', 'color': '2'})
    dump('Teia ENEM 2026.canvas', text_cards({'nodes': nodes, 'edges': edges}, questions))
    dump('.obsidian/core-plugins.json', ['file-explorer', 'global-search', 'switcher', 'graph', 'backlink', 'canvas', 'outgoing-link', 'tag-pane', 'properties', 'page-preview', 'command-palette', 'bookmarks', 'outline'])
    dump('.obsidian/appearance.json', {'theme': 'obsidian', 'accentColor': '#6cc8c3', 'baseFontSize': 18, 'enabledCssSnippets': ['estudo']})
    dump('.obsidian/app.json', {'attachmentFolderPath': '05 Anexos', 'showLineNumber': False, 'readableLineLength': True, 'newLinkFormat': 'shortest'})
    dump('.obsidian/graph.json', {'collapse-filter': False, 'search': '-path:dados', 'showTags': False, 'showAttachments': False, 'hideUnresolved': True, 'showOrphans': False, 'collapse-color-groups': False, 'colorGroups': [{'query': 'path:"02 Questoes/Linguagens"', 'color': {'a': 1, 'rgb': int('8e9bff', 16)}}, {'query': 'path:"02 Questoes/Humanas"', 'color': {'a': 1, 'rgb': int('6cc8c3', 16)}}, {'query': 'path:"01 Habilidades"', 'color': {'a': 1, 'rgb': int('f2c66d', 16)}}, {'query': 'path:"03 Evidencias"', 'color': {'a': 1, 'rgb': int('f29779', 16)}}, {'query': 'path:"04 Conceitos"', 'color': {'a': 1, 'rgb': int('dba9e7', 16)}}], 'nodeSizeMultiplier': 1.2, 'lineSizeMultiplier': 1, 'repelStrength': 12, 'centerStrength': 0.5, 'linkStrength': 0.8, 'linkDistance': 200})
    dump('.obsidian/bookmarks.json', {'items': [{'type': 'file', 'ctime': 1794567600000, 'path': '00 Comece aqui.md'}, {'type': 'file', 'ctime': 1794567600000, 'path': 'Teia ENEM 2026.canvas'}]})
    save('.obsidian/snippets/estudo.css', '.markdown-preview-view{--h1-color:#6cc8c3;--h2-color:#f2c66d}.canvas-node-container{border-radius:14px}.markdown-preview-view p{line-height:1.7}\n')
    print(f'Teia criada: {len(questions)} questões, {len(skills)} habilidades, {len(concepts)} conteúdos, {len(nodes)} cartões Canvas.')

if __name__ == '__main__':
    main()
