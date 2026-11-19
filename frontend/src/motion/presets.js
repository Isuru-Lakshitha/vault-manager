/*
 * Shared Framer Motion presets so every animated surface in the app moves
 * with the same physics. CSS-side equivalents live in styles/motion.css.
 */

export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 },
  smooth: { type: 'spring', stiffness: 340, damping: 32 },
  gentle: { type: 'spring', stiffness: 220, damping: 28 },
  // Underdamped: overshoots and settles like a drop of liquid.
  liquid: { type: 'spring', stiffness: 420, damping: 22, mass: 0.9 },
};

export const ease = {
  outExpo: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
};

export const fadeRise = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: ease.outExpo } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16, ease: 'easeIn' } },
};

export const staggerContainer = (stagger = 0.045, delayChildren = 0.05) => ({
  initial: {},
  animate: { transition: { staggerChildren: stagger, delayChildren } },
});

export const listItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: spring.smooth },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.14 } },
};
