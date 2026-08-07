import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ClipboardList,
  GraduationCap,
  Play,
  School,
  Target,
} from "lucide-react";
import AuthParticles from "../components/AuthParticles/AuthParticles";
import { Panel } from "../components/dla";
import { cn } from "../lib/utils";

interface VideoCardProps {
  videoId: string;
  label: string;
}

const VideoCard: React.FC<VideoCardProps> = ({ videoId, label }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="relative aspect-video bg-muted">
        {isPlaying ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            title={`Demonstração ${label}`}
            allow="autoplay; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsPlaying(true)}
            aria-label={`Reproduzir vídeo de demonstração para ${label}`}
            className="group absolute inset-0"
          >
            <img
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
            <span className="absolute inset-0 grid place-items-center bg-foreground/25 transition-colors group-hover:bg-foreground/35">
              <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
                <Play className="size-6 fill-current" strokeWidth={1.5} />
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="border-t border-border px-4 py-3">
        <p className="rule-label">{label}</p>
      </div>
    </article>
  );
};

const InitialPage: React.FC = () => (
  <div className="min-h-dvh overflow-x-hidden bg-background font-sans text-foreground">
    {/* Top bar */}
    <header className="relative z-20 flex items-center justify-between border-b border-border/60 bg-surface/80 px-5 py-3.5 backdrop-blur-sm md:px-8">
      <Link to="/initial" className="font-display text-lg font-semibold tracking-tight text-primary">
        DLA
      </Link>
      <Link
        to="/login"
        className="rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors hover:border-secondary hover:text-foreground"
      >
        Entrar
      </Link>
    </header>

    {/* Hero */}
    <section
      className="relative flex min-h-[calc(100dvh-57px)] flex-col items-center justify-center overflow-hidden px-5 py-16 md:px-8"
      aria-labelledby="initial-hero-title"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--primary-soft)_0%,_transparent_55%),linear-gradient(180deg,_var(--background)_0%,_oklch(0.93_0.021_232_/_0.45)_40%,_var(--background)_100%)]"
        aria-hidden
      />
      <div className="auth-particles--muted pointer-events-none absolute inset-0 opacity-40">
        <AuthParticles />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <p className="rule-label landing-fade">Data Labelling App</p>
        <h1
          id="initial-hero-title"
          className="mt-4 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-[3.25rem] md:leading-[1.1] landing-fade landing-fade--d1"
        >
          Treine o olhar. Construa dados. Evolua a medicina.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg landing-fade landing-fade--d2">
          Plataforma educacional para patologia que une exercícios de classificação, detecção e
          segmentação com construção estruturada de datasets para IA.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 landing-fade landing-fade--d3">
          <Link
            to="/register"
            className="inline-flex min-w-[9.5rem] items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Criar Conta
          </Link>
          <Link
            to="/login"
            className="inline-flex min-w-[9.5rem] items-center justify-center rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-semibold transition-colors hover:border-secondary"
          >
            Entrar
          </Link>
        </div>
      </div>

      <div
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-muted-foreground landing-fade landing-fade--d4"
        aria-hidden
      >
        <ChevronDown className="size-6 animate-bounce" strokeWidth={1.5} />
      </div>
    </section>

    {/* Demos */}
    <section className="border-t border-border bg-surface px-5 py-16 md:px-8" aria-labelledby="initial-demos-title">
      <div className="mx-auto max-w-5xl">
        <p className="rule-label text-center">Demonstrações</p>
        <h2
          id="initial-demos-title"
          className="mt-2 text-center font-display text-2xl font-semibold tracking-tight"
        >
          Veja como funciona
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <VideoCard videoId="bHKXOzTPKxc" label="Professor" />
          <VideoCard videoId="e5o-7ewMxp8" label="Aluno" />
        </div>
      </div>
    </section>

    {/* How it works */}
    <section className="border-t border-border px-5 py-16 md:px-8" aria-labelledby="initial-content-title">
      <div className="mx-auto max-w-5xl space-y-12">
        <div>
          <p className="rule-label text-center">Plataforma</p>
          <h2
            id="initial-content-title"
            className="mt-2 text-center font-display text-2xl font-semibold tracking-tight"
          >
            Como funciona
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Target,
                title: "Treino de Observação",
                desc: "Exercícios com feedback automático, critérios objetivos (IoU, F1), prática assistida e livre.",
              },
              {
                icon: ClipboardList,
                title: "Rotulação Estruturada",
                desc: "Anotações em formato padrão (COCO, segmentação, classificação) para pipelines de ML.",
              },
              {
                icon: GraduationCap,
                title: "Ensino e Pesquisa",
                desc: "A mesma atividade que avalia o estudante gera dados para investigação.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-secondary"
              >
                <span className="grid size-9 place-items-center rounded-md bg-primary-soft text-primary">
                  <item.icon className="size-4" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 font-display text-sm font-semibold">{item.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="rule-label text-center">Público</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Panel title="Professores / Investigadores">
              <ul className="space-y-2 text-sm text-muted-foreground">
                {["Criar datasets", "Definir classes", "Montar exercícios", "Exportar dados para treino"].map(
                  (t) => (
                    <li key={t} className="flex items-center gap-2">
                      <School className="size-3.5 shrink-0 text-secondary" strokeWidth={1.75} />
                      {t}
                    </li>
                  ),
                )}
              </ul>
            </Panel>
            <Panel title="Estudantes">
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[
                  "Praticar com imagens reais",
                  "Receber feedback imediato",
                  "Contribuir para bases científicas",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <GraduationCap className="size-3.5 shrink-0 text-secondary" strokeWidth={1.75} />
                    {t}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-5"
          role="list"
        >
          {["Upload", "Datasets", "Rotulação", "Exercícios", "Export ML"].map((step, i, arr) => (
            <React.Fragment key={step}>
              <span
                role="listitem"
                className={cn(
                  "rounded-md border border-border px-3 py-1.5 text-xs font-semibold",
                  i === arr.length - 1 && "border-primary bg-primary-soft text-primary",
                )}
              >
                {step}
              </span>
              {i < arr.length - 1 && (
                <span className="text-muted-foreground" aria-hidden>
                  →
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>

    <footer className="border-t border-border px-5 py-6 text-center text-[11px] text-muted-foreground md:px-8">
      DLA — Data Labelling App · UNISINOS / RamosAI · {new Date().getFullYear()}
    </footer>
  </div>
);

export default InitialPage;
