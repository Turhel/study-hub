import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import { getToday } from "../lib/api";

export default function TodayPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["today"],
    queryFn: getToday,
  });

  if (isLoading) {
    return <main className="today-status">Carregando seu foco de hoje...</main>;
  }

  if (isError || !data) {
    return <main className="today-status">Nao foi possivel conectar ao backend.</main>;
  }

  return (
    <main className="today-page">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="today-reset-stage"
      >
        <p className="today-reset-kicker">TodayPage em reconstrucao</p>
        <h1 className="today-reset-title">Limpamos todos os cards para recomecar do zero.</h1>
        <p className="today-reset-copy">
          A base visual antiga saiu desta tela. No proximo passo, montamos o novo bloco por bloco.
        </p>
      </motion.section>
    </main>
  );
}
