import { test, expect } from '@playwright/test';

// Desktop + mouse: icon rail that opens on hover/focus as an overlay; pin
// keeps it open in the layout. (Phones use the bottom tab bar instead.)
test('sidebar: icon rail opens on hover and focus, pin keeps it open', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'desktop-only navigation');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/test/browser/shell?page=dashboard');
  const sidebar = page.locator('aside.sidebar');
  const main = page.locator('.main-content-wrapper');
  const width = async (loc) => Math.round((await loc.boundingBox()).width);
  const left = async (loc) => Math.round((await loc.boundingBox()).x);

  // Playwright's mouse starts at (0, 0), inside the rail; Chromium on Linux
  // applies :hover there, so start with the pointer over the page instead.
  await page.mouse.move(800, 400);
  await expect.poll(() => width(sidebar)).toBe(68);
  expect(await left(main)).toBe(68);

  await sidebar.hover({ position: { x: 20, y: 200 } });
  await expect.poll(() => width(sidebar)).toBe(248);
  expect(await left(main), 'page does not move when the rail opens').toBe(68);

  await page.mouse.move(800, 400);
  await expect.poll(() => width(sidebar)).toBe(68);

  // Keyboard focus opens it; a mouse click leaves it free to close.
  for (let i = 0; i < 40 && !(await page.evaluate(() => !!document.activeElement?.closest('aside.sidebar'))); i++) {
    await page.keyboard.press('Tab');
  }
  await expect.poll(() => width(sidebar)).toBe(248);
  await page.mouse.click(800, 400);
  await expect.poll(() => width(sidebar)).toBe(68);
  // A mouse click on a rail item must not keep it open once the pointer leaves.
  await page.locator('.workspace-search').click({ position: { x: 14, y: 12 } });
  await page.mouse.move(800, 400);
  await expect.poll(() => width(sidebar), 'closes after a mouse click inside it').toBe(68);

  await page.getByRole('button', { name: 'Pin sidebar open' }).click({ force: true });
  await page.mouse.move(800, 400);
  await expect.poll(() => width(sidebar)).toBeGreaterThan(200);
  expect(await left(main)).toBeGreaterThan(200);
  await page.getByRole('button', { name: /Unpin sidebar/ }).click({ force: true });
  await page.mouse.move(800, 400);
  await expect.poll(() => width(sidebar)).toBe(68);
});
