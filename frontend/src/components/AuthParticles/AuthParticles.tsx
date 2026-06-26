import React from 'react';

const PARTICLE_COUNT = 56;
const FLOAT_CLASSES = ['auth-page__particle--float1', 'auth-page__particle--float2', 'auth-page__particle--float3', 'auth-page__particle--float4', 'auth-page__particle--float5'] as const;

/** Partículas com posições e animações variadas (seed fixo para evitar layout shift) */
function getParticles() {
  const particles: { left: number; top: number; size: number; delay: number; float: typeof FLOAT_CLASSES[number] }[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const seed = (i * 17 + 31) % 100;
    const seed2 = (i * 13 + 7) % 100;
    particles.push({
      left: (seed * 7 + (i % 11) * 9) % 100,
      top: (seed2 * 11 + (i % 9) * 3) % 100,
      size: 2 + (i % 3),
      delay: (i % 8) * 0.8,
      float: FLOAT_CLASSES[i % FLOAT_CLASSES.length],
    });
  }
  return particles;
}

const particles = getParticles();

const AuthParticles: React.FC = () => (
  <div className="auth-page__particles" aria-hidden="true">
    {particles.map((p, i) => (
      <div
        key={i}
        className={`auth-page__particle ${p.float}`}
        style={{
          left: `${p.left}%`,
          top: `${p.top}%`,
          width: p.size,
          height: p.size,
          animationDelay: `${p.delay}s`,
        }}
      />
    ))}
  </div>
);

export default AuthParticles;
