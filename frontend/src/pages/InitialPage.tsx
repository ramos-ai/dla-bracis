import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icons/Icons';
import AuthParticles from '../components/AuthParticles/AuthParticles';

interface VideoCardProps {
  videoId: string;
  label: string;
}

const VideoCard: React.FC<VideoCardProps> = ({ videoId, label }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="initial-demos__card">
      <div className="initial-demos__video-wrapper">
        {isPlaying ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            title={`Demonstração ${label}`}
            allow="autoplay; fullscreen"
            allowFullScreen
            className="initial-demos__iframe"
          />
        ) : (
          <button
            type="button"
            className="initial-demos__thumbnail"
            onClick={() => setIsPlaying(true)}
            aria-label={`Reproduzir vídeo de demonstração para ${label}`}
          >
            <img
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt=""
              loading="lazy"
            />
            <div className="initial-demos__play">
              <Icon name="play" size={32} />
            </div>
          </button>
        )}
      </div>
      <span className="initial-demos__label">{label}</span>
    </div>
  );
};

const InitialHero: React.FC = () => (
  <section className="initial-hero" aria-labelledby="initial-hero-title">
    <div className="initial-hero__particles">
      <AuthParticles />
    </div>
    <div className="initial-hero__content">
      <h1 id="initial-hero-title" className="initial-hero__title">
        Treine o olhar. Construa dados. Evolua a medicina.
      </h1>
      <p className="initial-hero__subtitle">
        Plataforma educacional para patologia que une exercícios de classificação, detecção e segmentação com construção estruturada de datasets para IA.
      </p>
      <div className="initial-hero__actions">
        <Link to="/register" className="btn btn--primary initial-hero__btn initial-hero__btn--primary">
          Criar Conta
        </Link>
        <Link to="/login" className="btn btn--secondary initial-hero__btn initial-hero__btn--secondary">
          Entrar
        </Link>
      </div>
    </div>
    <div className="initial-hero__scroll-hint" aria-hidden="true">
      <Icon name="chevronDown" size={28} className="initial-hero__scroll-hint-icon" />
    </div>
  </section>
);

const InitialDemos: React.FC = () => (
  <section className="initial-demos" aria-labelledby="initial-demos-title">
    <div className="initial-demos__inner">
      <h2 id="initial-demos-title" className="initial-demos__title">Veja como funciona</h2>
      <div className="initial-demos__grid">
        <VideoCard videoId="bHKXOzTPKxc" label="Professor" />
        <VideoCard videoId="e5o-7ewMxp8" label="Aluno" />
      </div>
    </div>
  </section>
);

const InitialContent: React.FC = () => (
  <section className="initial-content" aria-labelledby="initial-content-title">
    <div className="initial-content__inner">
      <h2 id="initial-content-title" className="initial-content__title">
        Como funciona
      </h2>
      <div className="initial-content__grid">
        <article className="initial-content__block">
          <div className="initial-content__icon-wrap">
            <Icon name="target" size={28} />
          </div>
          <h3 className="initial-content__block-title">Treino de Observação</h3>
          <p className="initial-content__block-desc">
            Exercícios com feedback automático, critérios objetivos (IoU, F1), prática assistida e livre.
          </p>
        </article>
        <article className="initial-content__block">
          <div className="initial-content__icon-wrap">
            <Icon name="clipboard" size={28} />
          </div>
          <h3 className="initial-content__block-title">Rotulação Estruturada</h3>
          <p className="initial-content__block-desc">
            Anotações em formato padrão (COCO, segmentação, classificação) para pipelines de ML.
          </p>
        </article>
        <article className="initial-content__block">
          <div className="initial-content__icon-wrap">
            <Icon name="graduation" size={28} />
          </div>
          <h3 className="initial-content__block-title">Ensino e Pesquisa</h3>
          <p className="initial-content__block-desc">
            A mesma atividade que avalia o estudante gera dados para investigação.
          </p>
        </article>
      </div>

      <h2 className="initial-content__title initial-content__title--sub">Público</h2>
      <div className="initial-content__audience">
        <article className="initial-content__card">
          <div className="initial-content__card-icon">
            <Icon name="school" size={32} />
          </div>
          <h3 className="initial-content__card-title">Professores / Investigadores</h3>
          <ul className="initial-content__list">
            <li>Criar datasets</li>
            <li>Definir classes</li>
            <li>Montar exercícios</li>
            <li>Exportar dados para treino</li>
          </ul>
        </article>
        <article className="initial-content__card">
          <div className="initial-content__card-icon">
            <Icon name="graduation" size={32} />
          </div>
          <h3 className="initial-content__card-title">Estudantes</h3>
          <ul className="initial-content__list">
            <li>Praticar com imagens reais</li>
            <li>Receber feedback imediato</li>
            <li>Contribuir para bases científicas</li>
          </ul>
        </article>
      </div>

      <div className="initial-content__flow" role="list">
        <span className="initial-content__flow-step" role="listitem">Upload</span>
        <span className="initial-content__flow-arrow" aria-hidden="true">→</span>
        <span className="initial-content__flow-step" role="listitem">Datasets</span>
        <span className="initial-content__flow-arrow" aria-hidden="true">→</span>
        <span className="initial-content__flow-step" role="listitem">Rotulação</span>
        <span className="initial-content__flow-arrow" aria-hidden="true">→</span>
        <span className="initial-content__flow-step" role="listitem">Exercícios</span>
        <span className="initial-content__flow-arrow" aria-hidden="true">→</span>
        <span className="initial-content__flow-step" role="listitem">Export ML</span>
      </div>
    </div>
  </section>
);

const InitialPage: React.FC = () => (
  <div className="initial-page">
    <InitialHero />
    <InitialDemos />
    <InitialContent />
  </div>
);

export default InitialPage;
