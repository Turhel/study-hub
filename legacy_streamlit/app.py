from __future__ import annotations

from importlib import import_module

import streamlit as st

from src.db.init_db import init_db


PAGES = {
    "Hoje": "src.ui.pages.01_hoje",
    "Questoes": "src.ui.pages.02_questoes",
}


def main() -> None:
    st.set_page_config(
        page_title="Study Hub ENEM",
        page_icon="SH",
        layout="wide",
    )

    init_db()

    with st.sidebar:
        selected_page = st.radio("Navegacao", list(PAGES.keys()))

    page = import_module(PAGES[selected_page])
    page.render()


if __name__ == "__main__":
    main()
