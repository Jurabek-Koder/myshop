import React, { useCallback, useEffect, useState } from 'react';
import { TARGET_GUIDE_INTRO, TARGET_GUIDE_SECTIONS } from './targetGuideContent.js';

export default function TargetGuideView({ onNavigate }) {
  const [activeSection, setActiveSection] = useState(TARGET_GUIDE_SECTIONS[0]?.id || '');

  const scrollToSection = useCallback((sectionId) => {
    setActiveSection(sectionId);
    const el = document.getElementById(`target-guide-${sectionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    const sections = TARGET_GUIDE_SECTIONS.map((s) => document.getElementById(`target-guide-${s.id}`)).filter(Boolean);
    if (!sections.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) {
          setActiveSection(visible.target.id.replace('target-guide-', ''));
        }
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5] },
    );

    sections.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="target-guide-page">
      <header className="target-guide-hero">
        <div className="target-guide-hero-icon" aria-hidden>
          <i className="fas fa-book-open" />
        </div>
        <div>
          <h1>{TARGET_GUIDE_INTRO.title}</h1>
          <p>{TARGET_GUIDE_INTRO.subtitle}</p>
          <ul className="target-guide-hero-list">
            {TARGET_GUIDE_INTRO.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </header>

      <div className="target-guide-layout">
        <nav className="target-guide-toc" aria-label="Qo'llanma bo'limlari">
          <h2>Mundarija</h2>
          <ul>
            {TARGET_GUIDE_SECTIONS.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={activeSection === section.id ? 'active' : ''}
                  onClick={() => scrollToSection(section.id)}
                >
                  <i className={`fas ${section.icon}`} aria-hidden />
                  <span>{section.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="target-guide-sections">
          {TARGET_GUIDE_SECTIONS.map((section) => (
            <article
              key={section.id}
              id={`target-guide-${section.id}`}
              className="target-guide-section"
            >
              <div className="target-guide-section-head">
                <span className="target-guide-section-icon" aria-hidden>
                  <i className={`fas ${section.icon}`} />
                </span>
                <div>
                  <h2>{section.title}</h2>
                  <p className="target-guide-section-summary">{section.summary}</p>
                </div>
              </div>

              <div className="target-guide-section-body">
                <div className="target-guide-block">
                  <h3>
                    <i className="fas fa-project-diagram" aria-hidden />
                    Nima bilan bog&apos;langan
                  </h3>
                  <ul>
                    {section.related.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="target-guide-block">
                  <h3>
                    <i className="fas fa-play-circle" aria-hidden />
                    Qanday ishlaydi
                  </h3>
                  <ol>
                    {section.howItWorks.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>

              {Array.isArray(section.guides) && section.guides.length > 0 ? (
                <div className="target-guide-subguides">
                  {section.guides.map((guide) => (
                    <div key={guide.title} className="target-guide-subguide">
                      <h3 className="target-guide-subguide-title">
                        <i className={`fas ${guide.icon || 'fa-info-circle'}`} aria-hidden />
                        {guide.title}
                      </h3>
                      {guide.intro ? <p className="target-guide-subguide-intro">{guide.intro}</p> : null}
                      {Array.isArray(guide.items) && guide.items.length > 0 ? (
                        <ul className="target-guide-subguide-list">
                          {guide.items.map((item) => (
                            <li key={item.label}>
                              <strong>{item.label}</strong>
                              <span>{item.text}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {Array.isArray(guide.steps) && guide.steps.length > 0 ? (
                        <ol className="target-guide-subguide-steps">
                          {guide.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      ) : null}
                      {guide.note ? (
                        <p className="target-guide-subguide-note">
                          <i className="fas fa-lightbulb" aria-hidden />
                          {guide.note}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {section.viewKey && onNavigate ? (
                <button
                  type="button"
                  className="target-guide-goto-btn"
                  onClick={() => onNavigate(section.viewKey)}
                >
                  <i className="fas fa-external-link-alt" aria-hidden />
                  {section.title} bo&apos;limiga o&apos;tish
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
