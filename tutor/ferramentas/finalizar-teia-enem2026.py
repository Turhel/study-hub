"""Acrescenta divergências entre correções e valida a teia inicial, sem IA."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V = ROOT / 'tutor/teia'
STRATEGY = 'https://vestibulares.estrategia.com/portal/noticias/gabarito-enem-2026-correcao-do-1o-dia-de-prova/'
FILADD = 'https://blog.filadd.com.br/gabarito-enem-2026/questao-24'

def main():
    canvas_file = V / 'Teia ENEM 2026.canvas'
    canvas = json.loads(canvas_file.read_text(encoding='utf-8'))
    # Preserva x e larguras do arquivo; reajusta blocos sem sobreposição.
    skill_nodes = {n['id']: n for n in canvas['nodes'] if re.fullmatch(r'h\d+', n['id'])}
    for sid, node in skill_nodes.items():
        new_y = (int(sid[1:]) // 3) * 1100
        delta = new_y - node['y']
        node['y'] = new_y
        for edge in canvas['edges']:
            if edge['fromNode'] == sid:
                next(n for n in canvas['nodes'] if n['id'] == edge['toNode'])['y'] += delta
    for n in canvas['nodes']:
        if n['id'] in ['leitura', 'contagem']: n['y'] = 3300
    canvas_file.write_text(json.dumps(canvas, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    data_file = V / 'dados/triagem.json'
    data = json.loads(data_file.read_text(encoding='utf-8'))
    alternatives = {11: [('Anglo/Guia', 'D'), ('Estratégia', 'C')], 21: [('Anglo/Guia', 'C'), ('Estratégia', 'B'), ('Filadd', 'D')], 47: [('Anglo/Guia', 'D'), ('Estratégia', 'C')]}
    for q in data['questions']:
        if q['number'] in alternatives:
            q['answerStatus'] = 'divergencia-extraoficial'
            q['answerReferences'] = [{'provider': name, 'answer': answer, 'url': FILADD if name == 'Filadd' else STRATEGY if name == 'Estratégia' else q['keySource']} for name, answer in alternatives[q['number']]]
            note = V / q['notePath']
            text = note.read_text(encoding='utf-8')
            if '## Divergência entre correções' not in text:
                rows = '\n'.join(f"| {a['provider']} | {a['answer']} | [fonte]({a['url']}) |" for a in q['answerReferences'])
                text += '\n## Divergência entre correções\n\n| Fonte extraoficial | Resposta publicada | Referência |\n| --- | --- | --- |\n' + rows + '\n\n**Sem veredito oficial nesta triagem.** Não confirmar o erro nem atribuir uma lacuna a partir de uma fonte isolada. O número foi conferido para o caderno branco 3.\n'
            note.write_text(text, encoding='utf-8')
        if q['number'] == 32:
            q['notes'].append('Na leitura do tutor, o dado de participação em STEM merece atenção como evidência da tese; a referência extraoficial D precisa de revisão fundamentada. Não substituir o gabarito por uma inferência sem conferir a resolução.') if not any('STEM merece' in n for n in q['notes']) else None
            note = V / q['notePath']
            text = note.read_text(encoding='utf-8')
            if '## Ponto de conferência' not in text:
                text += '\n## Ponto de conferência\n\nO texto apresenta a participação de mulheres em carreiras STEM como dado ligado à tese. A letra D publicada na referência consultada menciona uma meta da ONU. **Há um ponto de análise a conferir na resolução e no gabarito oficial**; não declarar a causa do erro do aluno com base nesta letra.\n'
            note.write_text(text, encoding='utf-8')
    data_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    source = V / '03 Evidencias/Gabaritos em conferencia.md'
    source.write_text(f'''---
tipo: evidencia
tags: [evidencia]
---

# Gabaritos em conferência

As referências consultadas são extraoficiais. Não usamos uma delas como resultado oficial nem como evidência de que o aluno desconhece um conceito.

| Questão branca | Anglo/Guia | Estratégia | Outra referência |
| --- | --- | --- | --- |
| [[02 Questoes/Linguagens/Q011|11]] | D | C | Não consolidar resultado |
| [[02 Questoes/Linguagens/Q021|21]] | C | B | Filadd: D |
| [[02 Questoes/Humanas/Q047|47]] | D | C | Não consolidar resultado |

[[02 Questoes/Linguagens/Q032|32]] também requer conferência fundamentada: a letra publicada e a evidência estatística apresentada no texto merecem revisão. Não se trata de afirmar aqui uma retificação oficial.

Referências lidas em 13/11/2026: [Estratégia]({STRATEGY}), [Filadd — Renina Katz, com correspondência entre cores]({FILADD}) e a referência Anglo ligada em cada questão.

[[03 Evidencias/Resultado provisorio]] · [[00 Comece aqui]]
''', encoding='utf-8')
    start = V / '00 Comece aqui.md'
    text = start.read_text(encoding='utf-8')
    if 'Gabaritos em conferencia' not in text:
        text = text.replace('## Três caminhos possíveis', '[[03 Evidencias/Gabaritos em conferencia|Divergências nos gabaritos: 11, 21 e 47; conferir também a 32]]\n\n## Três caminhos possíveis')
    start.write_text(text, encoding='utf-8')
    css = V / '.obsidian/snippets/estudo.css'
    css.write_text('.markdown-preview-view{--h1-color:#6cc8c3;--h2-color:#f2c66d}.canvas-node-container{border-radius:14px}.markdown-preview-view p{line-height:1.7}.canvas-node-content .metadata-container,.canvas-node-content .inline-title{display:none!important}\n', encoding='utf-8')
    # Integridade real: quantidade, IDs, destinos, vínculos e geometria.
    assert len(data['questions']) == 30
    assert len({q['id'] for q in data['questions']}) == 30
    ids = {n['id'] for n in canvas['nodes']}
    assert len(ids) == len(canvas['nodes'])
    for edge in canvas['edges']: assert edge['fromNode'] in ids and edge['toNode'] in ids
    for node in canvas['nodes']:
        if node['type'] == 'file': assert (V / node['file']).is_file(), node['file']
        elif node['type'] == 'text':
            for target in re.findall(r'\[\[([^\]|]+)(?:\|[^\]]*)?\]\]', node['text']):
                file = V / target
                assert file.is_file() or file.with_suffix('.md').is_file(), target
    for i, a in enumerate(canvas['nodes']):
        for b in canvas['nodes'][i+1:]:
            assert not (a['x'] < b['x']+b['width'] and a['x']+a['width'] > b['x'] and a['y'] < b['y']+b['height'] and a['y']+a['height'] > b['y']), (a['id'], b['id'])
    for note in V.rglob('*.md'):
        for target in re.findall(r'\[\[([^\]|]+)(?:\|[^\]]*)?\]\]', note.read_text(encoding='utf-8')):
            file = V / target
            assert file.is_file() or file.with_suffix('.md').is_file(), (note, target)
    print('OK: 30 questões; vínculos e cartões existentes; Canvas sem sobreposição; divergências preservadas.')

if __name__ == '__main__': main()
