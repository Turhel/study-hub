from __future__ import annotations

from datetime import date

import streamlit as st
from sqlmodel import select

from src.db.models import Block, BlockSubject, QuestionAttempt, Subject
from src.db.session import get_session
from src.services.questions import register_question_attempt


CONFIDENCE_VALUES = {
    "baixa": 1,
    "media": 3,
    "alta": 5,
}


def render() -> None:
    st.title("Questoes")
    st.caption("Registre tentativas manuais para atualizar dominio e revisoes.")

    with get_session() as session:
        blocks = session.exec(select(Block).order_by(Block.disciplina, Block.ordem, Block.nome)).all()
        subjects = session.exec(
            select(Subject)
            .where(Subject.ativo == True)  # noqa: E712
            .order_by(Subject.disciplina, Subject.assunto, Subject.subassunto)
        ).all()
        links = session.exec(select(BlockSubject)).all()

    if not blocks or not subjects:
        st.warning("Importe a planilha antes de registrar questoes.")
        return

    disciplines = sorted({block.disciplina for block in blocks} | {subject.disciplina for subject in subjects})
    linked_subject_ids_by_block: dict[int, set[int]] = {}
    for link in links:
        linked_subject_ids_by_block.setdefault(link.block_id, set()).add(link.subject_id)

    with st.form("question_attempt_form", clear_on_submit=True):
        selected_date = st.date_input("Data", value=date.today())
        disciplina = st.selectbox("Disciplina", disciplines)

        filtered_blocks = [block for block in blocks if block.disciplina == disciplina]
        block_labels = {
            f"{block.nome}": block.id
            for block in filtered_blocks
            if block.id is not None
        }
        if not block_labels:
            st.warning("Nao ha blocos cadastrados para esta disciplina.")
            submitted = st.form_submit_button("Salvar tentativa", disabled=True)
            return

        selected_block_label = st.selectbox("Bloco", list(block_labels.keys()))
        selected_block_id = block_labels[selected_block_label]

        linked_subject_ids = linked_subject_ids_by_block.get(selected_block_id, set())
        filtered_subjects = [
            subject
            for subject in subjects
            if subject.disciplina == disciplina
            and subject.id is not None
            and (not linked_subject_ids or subject.id in linked_subject_ids)
        ]
        subject_labels = {
            f"{subject.assunto} - {subject.subassunto or 'geral'}": subject.id
            for subject in filtered_subjects
            if subject.id is not None
        }
        if not subject_labels:
            st.warning("Nao ha assuntos cadastrados para este bloco.")
            submitted = st.form_submit_button("Salvar tentativa", disabled=True)
            return

        selected_subject_label = st.selectbox("Assunto", list(subject_labels.keys()))

        source = st.text_input("Fonte", placeholder="ENEM, lista, simulado...")
        col1, col2, col3 = st.columns(3)
        dificuldade_banco = col1.selectbox("Dificuldade do banco", ["facil", "media", "dificil"])
        dificuldade_pessoal = col2.selectbox("Dificuldade pessoal", ["facil", "media", "dificil"])
        acertou_label = col3.radio("Acertou?", ["sim", "nao"], horizontal=True)

        col4, col5 = st.columns(2)
        tempo_segundos = col4.number_input("Tempo em segundos", min_value=0, value=0, step=10)
        confianca_label = col5.selectbox("Confianca", ["baixa", "media", "alta"])

        tipo_erro = st.text_input("Tipo de erro", placeholder="calculo, interpretacao, conteudo...")
        observacoes = st.text_area("Observacoes")
        submitted = st.form_submit_button("Salvar tentativa")

    if submitted:
        if not selected_block_id:
            st.error("Selecione bloco e assunto antes de salvar.")
            return

        attempt = QuestionAttempt(
            data=selected_date,
            source=source.strip() or None,
            disciplina=disciplina,
            block_id=selected_block_id,
            subject_id=subject_labels[selected_subject_label],
            dificuldade_banco=dificuldade_banco,
            dificuldade_pessoal=dificuldade_pessoal,
            acertou=acertou_label == "sim",
            tempo_segundos=tempo_segundos or None,
            confianca=CONFIDENCE_VALUES[confianca_label],
            tipo_erro=tipo_erro.strip() or None,
            observacoes=observacoes.strip() or None,
        )

        try:
            with get_session() as session:
                register_question_attempt(session, attempt)
            st.success("Tentativa registrada. Dominio e revisao atualizados.")
        except Exception as exc:
            st.error(f"Nao foi possivel salvar a tentativa: {exc}")
