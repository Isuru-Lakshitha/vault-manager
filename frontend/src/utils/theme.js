export const applyAccent = (hex) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  const root = document.documentElement;
  root.style.setProperty('--cyan', hex);
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--cyan-glow', hex + '1a');
  root.style.setProperty('--border-cyan', hex + '40');
  root.style.setProperty('--accent-glow', hex + '40');
};
