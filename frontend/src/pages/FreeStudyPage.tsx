import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getFreeStudyCatalogByDiscipline, getFreeStudySubjectContext, getRecentActivity } from "../lib/api";
import type { ActivityItem, FreeStudyCatalogDiscipline, FreeStudyCatalogSubject } from "../lib/types";

type AreaOption = {
  id: "exatas" | "natureza" | "humanas" | "linguagens";
  label: string;
  description: string;
  disciplines: string[];
};

type SubjectOption = FreeStudyCatalogSubject & {
  subarea: string;
};

const STUDY_AREAS: AreaOption[] = [
  {
    id: "exatas",
    label: "Exatas",
    description: "Matematica e raciocinio quantitativo.",
    disciplines: ["Matemática"],
  },
  {
    id: "natureza",
    label: "Natureza",
    description: "Biologia, Quimica e Fisica.",
    disciplines: ["Biologia", "Química", "Física"],
  },
  {
    id: "humanas",
    label: "Humanas",
    description: "Historia, Geografia, Filosofia e Sociologia.",
    disciplines: ["História do Brasil", "História", "Geografia", "Filosofia/Sociologia", "Filosofia", "Sociologia"],
  },
  {
    id: "linguagens",
    label: "Linguagens",
    description: "Interpretacao, gramatica, literatura e lingua estrangeira.",
    disciplines: ["Interpretação de texto", "Gramática", "Literatura", "Inglês", "Espanhol", "Artes"],
  },
];

const QUESTION_LOADS = [5, 10, 20];
const SUBJECTS_PAGE_SIZE = 12;

function flattenSubjects(discipline?: FreeStudyCatalogDiscipline | null): SubjectOption[] {
  if (!discipline) {
    return [];
  }

  return discipline.subareas.flatMap((subarea) =>
    subarea.subjects.map((subject) => ({
      ...subject,
      subarea: subarea.subarea,
    })),
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function recentStudyLabel(item: ActivityItem): string {
  const cleaned = item.description
    .replace(/^\d+\s+tentativas registradas em\s+/i, "")
    .replace(/\.$/, "")
    .trim();
  return cleaned || item.title;
}

function recentStudyLoad(item: ActivityItem): number {
  return asNumber(item.metadata.created_attempts);
}

function recentStudyAccuracy(item: ActivityItem): string {
  const total = recentStudyLoad(item);
  if (total <= 0) {
    return "--";
  }

  return `${Math.round((asNumber(item.metadata.correct_count) / total) * 100)}%`;
}

function areaIcon(areaId: AreaOption["id"]): string {
  if (areaId === "exatas") return "📐";
  if (areaId === "natureza") return "🧬";
  if (areaId === "humanas") return "📝";
  return "🔤";
}

export default function FreeStudyPage() {
  const navigate = useNavigate();
  const [selectedAreaId, setSelectedAreaId] = useState<AreaOption["id"] | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [subjectPage, setSubjectPage] = useState(0);
  const [questionCount, setQuestionCount] = useState(10);
  const [feedback, setFeedback] = useState<string | null>(null);

  const selectedArea = STUDY_AREAS.find((area) => area.id === selectedAreaId) ?? null;

  const catalogQuery = useQuery({
    queryKey: ["free-study-catalog", selectedDiscipline],
    queryFn: () => getFreeStudyCatalogByDiscipline(selectedDiscipline!),
    enabled: Boolean(selectedDiscipline),
    retry: false,
  });

  const discipline = catalogQuery.data?.disciplines[0] ?? null;
  const subjects = useMemo(() => flattenSubjects(discipline), [discipline]);
  const selectedSubject = subjects.find((subject) => subject.subject_id === selectedSubjectId) ?? null;
  const subjectPageCount = Math.max(1, Math.ceil(subjects.length / SUBJECTS_PAGE_SIZE));
  const pagedSubjects = subjects.slice(
    subjectPage * SUBJECTS_PAGE_SIZE,
    subjectPage * SUBJECTS_PAGE_SIZE + SUBJECTS_PAGE_SIZE,
  );

  const contextQuery = useQuery({
    queryKey: ["free-study-context", selectedSubjectId],
    queryFn: () => getFreeStudySubjectContext(selectedSubjectId!),
    enabled: Boolean(selectedSubjectId),
    retry: false,
  });

  const recentQuery = useQuery({
    queryKey: ["free-study-recent-activity"],
    queryFn: () => getRecentActivity(30),
    retry: false,
  });

  const recentFreeStudies = useMemo(
    () =>
      (recentQuery.data ?? [])
        .filter((item) => item.type === "question_attempt_bulk" && item.metadata.study_mode === "free")
        .slice(0, 5),
    [recentQuery.data],
  );

  function chooseArea(area: AreaOption) {
    setSelectedAreaId(area.id);
    setSelectedDiscipline(null);
    setSelectedSubjectId(null);
    setFeedback(null);
  }

  function chooseDiscipline(disciplineName: string) {
    setSelectedDiscipline(disciplineName);
    setSelectedSubjectId(null);
    setSubjectPage(0);
    setFeedback(null);
  }

  function startFreeTraining() {
    if (!selectedSubject) {
      setFeedback("Escolha um assunto antes de iniciar o treino livre.");
      return;
    }

    navigate("/timer", {
      state: {
        timerPreset: {
          discipline: contextQuery.data?.discipline ?? selectedDiscipline ?? "Treino livre",
          block: selectedSubject.block_name ?? "Treino livre",
          subject: selectedSubject.subject_name,
          questionCount,
          mode: "livre",
          questionSource: "external",
          blockId: selectedSubject.block_id,
          subjectId: selectedSubject.subject_id,
        },
      },
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-sky-300">Modo Livre</p>
          <h1 className="text-3xl font-black tracking-tight text-white">Treino livre em 3 cliques</h1>
          <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-400">
            Escolha area, disciplina e assunto. O treino entra no cronometro e alimenta sua proficiencia sem travar a
            esteira EAERE do dia.
          </p>
        </header>

        {feedback ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-100">
            <span>{feedback}</span>
            <button type="button" className="text-sky-300 hover:text-white" onClick={() => setFeedback(null)}>
              Fechar
            </button>
          </div>
        ) : null}

        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
          <div className="grid gap-3 md:grid-cols-4">
            {STUDY_AREAS.map((area) => {
              const active = selectedAreaId === area.id;
              return (
                <button
                  key={area.id}
                  type="button"
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-sky-400 bg-sky-500/15 text-white"
                      : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600 hover:bg-slate-900"
                  }`}
                  onClick={() => chooseArea(area)}
                >
                  <span className="text-xl">{areaIcon(area.id)}</span>
                  <strong className="mt-3 block text-lg font-black">{area.label}</strong>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-slate-400">{area.description}</span>
                </button>
              );
            })}
          </div>

          {selectedArea ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {selectedArea.disciplines.map((disciplineName) => {
                const active = selectedDiscipline === disciplineName;
                return (
                  <button
                    key={disciplineName}
                    type="button"
                    className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                      active
                        ? "border-sky-400 bg-sky-500 text-slate-950"
                        : "border-slate-700 bg-slate-950 text-slate-300 hover:border-sky-500/60"
                    }`}
                    onClick={() => chooseDiscipline(disciplineName)}
                  >
                    {disciplineName}
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        {selectedDiscipline && !selectedSubject ? (
          <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-sky-300">Assuntos</p>
                <h2 className="text-2xl font-black text-white">{selectedDiscipline}</h2>
              </div>
              {catalogQuery.isFetching ? (
                <span className="text-sm font-bold text-slate-400">Carregando sob demanda...</span>
              ) : null}
            </div>

            {catalogQuery.isError ? (
              <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
                Nao foi possivel carregar esta disciplina agora.
              </p>
            ) : null}

            {!catalogQuery.isFetching && !catalogQuery.isError && subjects.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-semibold text-slate-400">
                Nenhum assunto encontrado para esta disciplina.
              </p>
            ) : null}

            <div className="grid gap-2">
              {pagedSubjects.map((subject) => (
                <button
                  key={subject.subject_id}
                  type="button"
                  className="flex flex-col gap-1 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-left transition hover:border-sky-500/70 hover:bg-sky-500/10 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => setSelectedSubjectId(subject.subject_id)}
                >
                  <span>
                    <strong className="block text-sm font-black text-white">{subject.subject_name}</strong>
                    <span className="text-xs font-semibold text-slate-500">
                      {subject.subarea} / {subject.block_name ?? "Bloco livre"}
                    </span>
                  </span>
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Selecionar</span>
                </button>
              ))}
            </div>

            {subjects.length > SUBJECTS_PAGE_SIZE ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-bold text-slate-500">
                  Pagina {subjectPage + 1} de {subjectPageCount} · {subjects.length} assuntos
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-700 px-4 py-2 text-xs font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={subjectPage === 0}
                    onClick={() => setSubjectPage((page) => Math.max(0, page - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-700 px-4 py-2 text-xs font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={subjectPage + 1 >= subjectPageCount}
                    onClick={() => setSubjectPage((page) => Math.min(subjectPageCount - 1, page + 1))}
                  >
                    Proxima
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {selectedSubject ? (
          <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-sky-500/30 bg-slate-900 p-6 shadow-2xl shadow-sky-950/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-sky-300">Treino escolhido</p>
                <h2 className="mt-2 text-3xl font-black text-white">{selectedSubject.subject_name}</h2>
                <p className="mt-2 text-sm font-semibold text-slate-400">
                  {selectedDiscipline} / {selectedSubject.block_name ?? "Bloco livre"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-black text-slate-300 hover:border-sky-500 hover:text-white"
                onClick={() => setSelectedSubjectId(null)}
              >
                Trocar assunto
              </button>
            </div>

            {contextQuery.data?.warning_message ? (
              <p className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
                {contextQuery.data.warning_message}
              </p>
            ) : null}

            <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Carga rapida</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {QUESTION_LOADS.map((load) => (
                  <button
                    key={load}
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-lg font-black transition ${
                      questionCount === load
                        ? "border-sky-400 bg-sky-500 text-slate-950"
                        : "border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500/60"
                    }`}
                    onClick={() => setQuestionCount(load)}
                  >
                    {load}q
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="mt-4 w-full rounded-2xl bg-sky-500 px-5 py-4 text-base font-black text-slate-950 shadow-lg shadow-sky-950/30 transition hover:bg-sky-400"
                onClick={startFreeTraining}
              >
                ⚡ Iniciar Treino Livre
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-sky-300">Historico</p>
              <h2 className="text-xl font-black text-white">Treinos Livres Recentes</h2>
            </div>
            {recentQuery.isFetching ? <span className="text-xs font-bold text-slate-500">Atualizando...</span> : null}
          </div>

          {recentFreeStudies.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <div className="grid grid-cols-[0.7fr_1.6fr_0.6fr_0.8fr] bg-slate-950/80 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                <span>Data</span>
                <span>Disciplina - Assunto</span>
                <span>Carga</span>
                <span>Aproveitamento</span>
              </div>
              {recentFreeStudies.map((item) => (
                <div
                  key={`${item.created_at}-${item.description}`}
                  className="grid grid-cols-[0.7fr_1.6fr_0.6fr_0.8fr] border-t border-slate-800 px-4 py-3 text-sm font-semibold text-slate-300"
                >
                  <span>{formatDate(item.created_at)}</span>
                  <span className="text-white">{recentStudyLabel(item)}</span>
                  <span>{recentStudyLoad(item)}q</span>
                  <span>{recentStudyAccuracy(item)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-semibold text-slate-400">
              Nenhum treino livre recente. Quando voce concluir uma sessao livre, ela aparece aqui.
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
