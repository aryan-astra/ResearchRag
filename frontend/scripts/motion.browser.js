// Run with Playwright MCP browser_run_code_unsafe's filename argument against the local preview.
async (page) => {
  const errors = [];
  const onError = error => errors.push(error.message);
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  page.on("pageerror", onError);
  const results = [];
  try {
    for (const [width, height, theme, route] of [
      [1440, 1000, "light", "/"], [1440, 1000, "dark", "/sample-art"],
      [768, 900, "light", "/"], [375, 812, "dark", "/sample-art"],
    ]) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("http://127.0.0.1:8010/");
      await page.evaluate(theme => localStorage.setItem("rr-theme", theme), theme);
      await page.goto("http://127.0.0.1:8010" + route);
      await page.locator(".has-flight .journey-stage").waitFor();
      if (route === "/") await page.locator(".paper-tile, .library-first").first().waitFor();
      await page.waitForTimeout(500);
      const bounds = await page.locator(".pin-spacer").evaluate(el => ({
        start: el.getBoundingClientRect().top + scrollY - 100,
        range: parseFloat(el.style.paddingBottom), max: document.documentElement.scrollHeight - innerHeight,
      }));
      check(bounds.start + bounds.range <= bounds.max + 1, `${width}: final frame is unreachable`);
      for (const progress of [.12, .42, .61, .9, 1, .42]) {
        await page.evaluate(({ start, range, progress }) => scrollTo(0, start + range * progress), { ...bounds, progress });
        await page.waitForFunction(expected => {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".journey-progress span")).transform);
          return Math.abs(matrix.a - expected) < .004;
        }, progress);
        const state = await page.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
          const opacity = selector => [...document.querySelectorAll(selector)].map(el => +getComputedStyle(el).opacity);
          return {
            stage: rect(".journey-stage"), sheet: rect(".flying-sheet"), reading: rect(".journey-reading"), evidence: rect(".journey-evidence"),
            panels: opacity(".journey-panel"), words: opacity(".journey-word"), nodes: opacity(".journey-node"),
            fold: document.querySelector(".sheet-right").style.transform,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        check(!state.overflow, `${width}: horizontal overflow`);
        check(Math.abs(state.stage.top - 100) < 2, `${width}: stage did not pin`);
        if (progress === .61) check(state.fold.includes("rotateY"), `${width}: paper did not fold in flight`);
        if (progress === .42 || progress >= .9) {
          const first = progress === .42;
          const panel = first ? state.reading : state.evidence;
          check(state.panels[first ? 0 : 1] > .99, `${width}: missing reading stop`);
          check((first ? state.words : state.nodes).every(value => value > .99), `${width}: incomplete text reveal`);
          check(Math.abs(panel.x - state.sheet.x) < 4 && Math.abs(panel.y - state.sheet.y) < 4, `${width}: paper missed its text`);
          await page.screenshot({ path: `.playwright-mcp/journey-${width}-${theme}-${progress}.png` });
        }
      }
      check(await page.getByRole("button", { name: /pause artwork|play artwork/i }).count() === 0, "Pause control remains");
      if (route === "/sample-art") {
        for (let index = 0; index < 5; index++) {
          await page.locator(".art-option").nth(index).click();
          check(await page.locator(".art-option.is-selected").count() === 1, "Gallery selection failed");
          check(await page.locator(".art-corner .ascii-notation code").count() === 4, "Missing complete notation");
        }
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.locator(".pin-spacer").waitFor({ state: "detached" });
      check(await page.locator(".pin-spacer").count() === 0, "Reduced motion still pins");
      const staticState = await page.locator(".journey-panel").evaluateAll(els => els.map(el => ({
        opacity: +getComputedStyle(el).opacity, visibility: getComputedStyle(el).visibility, rect: el.getBoundingClientRect().toJSON(),
      })));
      check(staticState.every(el => el.opacity === 1 && el.visibility === "visible"), "Reduced motion hides reading content");
      const [a, b] = staticState.map(el => el.rect);
      check(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, "Static reading panels overlap");
      const before = await page.locator(".ascii-notation").first().innerHTML();
      await page.waitForTimeout(200);
      check(before === await page.locator(".ascii-notation").first().innerHTML(), "Reduced motion artwork still moves");
      results.push({ width, theme, route, phases: 6, reducedMotion: "pass" });
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("link", { name: "Paper library", exact: true }).click();
    check(await page.locator(".pin-spacer").count() === 0, "Pin spacer leaked after navigation");
    check(errors.length === 0, errors.join("; "));
    return results;
  } finally {
    page.off("pageerror", onError);
  }
}
