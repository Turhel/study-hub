from __future__ import annotations

from datetime import date, timedelta

import streamlit as st
from sqlmodel import select

from src.db.models import Block, BlockMastery, QuestionAttempt, Review, Subject
from src.db.session import get_session


MOCK_ROWS = [
    ("Revisao", "Funcao afim", "Exemplo de revisao vencida"),
    ("Bloco em risco", "Estequiometria", "Exemplo de baixa taxa em faceis"),
    ("Sem contato", "Interpretacao de graficos", "Exemplo de assunto esquecido"),
]


def render() -> None:
    st.markdown(
        """
        <style>
        .section-panel {
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 8px;
            padding: 1rem;
            background: rgba(255, 255, 255, 0.03);
            margin-bottom: 1rem;
        }
        .priority-panel {
            border-left: 4px solid #4f8cff;
            border-radius: 8px;
            padding: 1rem;
            background: rgba(79, 140, 255, 0.10);
            margin: 1rem 0 1.25rem;
        }
        .muted-text {
            color: rgba(250, 250, 250, 0.72);
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.title("Hoje")
    st.caption("Um resumo direto do que merece atencao agora.")

    with get_session() as session:
        today = date.today()
        block_count = len(session.exec(select(Block)).all())
        subject_count = len(session.exec(select(Subject)).all())
        attempt_count = len(session.exec(select(QuestionAttempt)).all())
        reviews = session.exec(
            select(Review)
            .where(Review.status == "pendente")
            .where(Review.proxima_data <= today)
            .order_by(Review.proxima_data)
        ).all()
        risk_blocks = session.exec(
            select(BlockMastery)
            .where(BlockMastery.status == "em_risco")
            .order_by(BlockMastery.score_domino)
        ).all()
        subjects = session.exec(select(Subject).where(Subject.ativo == True)).all()  # noqa: E712
        cutoff = today - timedelta(days=21)
        forgotten = []

        for subject in subjects:
            last_attempt = session.exec(
                select(QuestionAttempt)
                .where(QuestionAttempt.subject_id == subject.id)
                .order_by(QuestionAttempt.data.desc())
            ).first()
            if last_attempt is None or last_attempt.data < cutoff:
                forgotten.append(subject)

        has_any_data = bool(
            block_count
            or subject_count
            or
            reviews
            or risk_blocks
            or forgotten
            or session.exec(select(QuestionAttempt)).first()
        )

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Blocos", block_count)
    col2.metric("Assuntos", subject_count)
    col3.metric("Revisoes vencidas", len(reviews))
    col4.metric("Sem contato", len(forgotten))

    st.subheader("Prioridade de hoje")
    if reviews:
        priority_text = "Comece pelas revisoes vencidas."
    elif risk_blocks:
        priority_text = "Faca questoes faceis do bloco em risco com menor score."
    elif forgotten:
        priority_text = f"Revise o assunto sem contato recente: {forgotten[0].assunto}."
    elif block_count or subject_count:
        priority_text = "Escolha um bloco cadastrado e registre as primeiras questoes para medir dominio."
    else:
        priority_text = "Importe a planilha para substituir os dados de exemplo por conteudos reais."

    st.markdown(
        f"<div class='priority-panel'>{priority_text}</div>",
        unsafe_allow_html=True,
    )

    left_col, right_col = st.columns(2)

    with left_col:
        st.markdown("<div class='section-panel'>", unsafe_allow_html=True)
        st.subheader("Revisoes vencidas")
        if reviews:
            for review in reviews:
                st.write(f"- Revisao #{review.id} vencida em {review.proxima_data}")
        else:
            st.markdown("<span class='muted-text'>Tudo em dia por aqui.</span>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with right_col:
        st.markdown("<div class='section-panel'>", unsafe_allow_html=True)
        st.subheader("Blocos em risco")
        if risk_blocks:
            with get_session() as session:
                for mastery in risk_blocks[:5]:
                    block = session.get(Block, mastery.block_id)
                    name = block.nome if block else f"Bloco {mastery.block_id}"
                    st.write(f"- {name}: score {mastery.score_domino:.0%}")
        else:
            st.markdown("<span class='muted-text'>Nenhum bloco em risco agora.</span>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)

    st.subheader("Assuntos sem contato recente")
    if forgotten:
        for subject in forgotten[:10]:
            st.write(f"- {subject.disciplina}: {subject.assunto}")
    else:
        st.write("Nenhum assunto atrasado por enquanto.")

    if not has_any_data:
        st.subheader("Dados de exemplo")
        for tipo, item, motivo in MOCK_ROWS:
            st.write(f"- {tipo}: {item} ({motivo})")
