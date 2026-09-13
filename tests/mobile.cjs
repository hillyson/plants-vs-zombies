const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.GAME_URL || 'http://localhost:5173/';

async function swipe(page, selector, axis, direction = -1) {
  const box = await page.locator(selector).boundingBox();
  const session = await page.context().newCDPSession(page);
  const start = { x: box.x + box.width * (axis === 'x' ? (direction < 0 ? .85 : .15) : .5), y: box.y + box.height * (axis === 'y' ? (direction < 0 ? .85 : .15) : .5) };
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= 12; step++) {
      const point = { ...start };
      point[axis] += direction * (axis === 'x' ? box.width : box.height) * .65 * step / 12;
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
      await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(350);
  } finally { await session.detach(); }
}
async function checkFits(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow');
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'all controls fit the phone height');
  for (const selector of ['#mobile-menu', '#shovel', '#pause', '#board-zoom', '#auto-collect']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `${selector} has a 44px touch target`);
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= (await page.evaluate(() => innerWidth)) + 1, `${selector} stays inside viewport`);
  }
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const errors = [];
  try {
    fs.mkdirSync('test-results', { recursive: true });
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${base}?test=1`);
    await p.locator('#mode-free').tap();
    await p.waitForTimeout(150);
    await checkFits(p);
    assert.equal(await p.locator('.site-header').isVisible(), false);
    const cell = await p.locator('.lawn-cell').first().boundingBox();
    assert.ok(cell.width >= 44 && cell.height >= 44, 'portrait enlarged lawn supports precise tapping');
    await p.locator('[data-row="0"][data-col="0"]').tap();
    assert.equal(await p.locator('.plant-entity').count(), 1);
    await swipe(p, '#scene-scroll', 'x');
    assert.ok(await p.evaluate(() => document.querySelector('#scene-scroll').scrollLeft > 50));
    assert.equal(await p.locator('.plant-entity').count(), 1, 'swiping a selected lawn never plants');
    assert.equal(await p.locator('.ghost').count(), 0, 'touch does not leave hover ghosts');
    await swipe(p, '#seed-cards', 'x');
    assert.equal(await p.locator('[data-type="SunFlower"]').getAttribute('aria-pressed'), 'true', 'scrolling cards does not select another plant');
    await p.locator('[data-type="DivineWaterShooter"]').tap();
    await p.locator('[data-row="4"][data-col="8"]').tap();
    await p.locator('[data-row="3"][data-col="8"]').tap();
    assert.equal(await p.locator('.divine-water-plant').count(), 2);
    await p.locator('#shovel').tap();
    await p.locator('[data-row="3"][data-col="8"]').tap();
    assert.equal(await p.locator('.divine-water-plant').count(), 1);
    assert.equal(await p.locator('#cancel-selection').isDisabled(), true);
    assert.match(await p.locator('#touch-selection').textContent(), /点卡片/);
    await p.locator('#board-zoom').tap();
    assert.equal(await p.locator('#board-zoom').getAttribute('aria-pressed'), 'true');
    assert.ok(await p.evaluate(() => document.querySelector('#scene-scroll').scrollWidth <= document.querySelector('#scene-scroll').clientWidth + 1));
    await p.locator('#board-zoom').tap();
    const overview = await p.locator('#overview-jump').boundingBox();
    await p.touchscreen.tap(overview.x + overview.width - 8, overview.y + 20);
    assert.ok(await p.evaluate(() => document.querySelector('#scene-scroll').scrollLeft > 100));
    await p.screenshot({ path: 'test-results/mobile-portrait-preparation.png' });
    await p.locator('#start').tap();
    await p.locator('#mobile-menu').tap();
    assert.equal(await p.evaluate(() => __pvz.game.status), 'paused');
    await p.locator('[data-menu-action="almanac"]').tap();
    assert.equal(await p.locator('.almanac-entry').count(), 7);
    assert.equal(await p.evaluate(() => __pvz.game.status), 'paused');
    await p.locator('#close-dialog').tap();
    assert.equal(await p.evaluate(() => __pvz.game.status), 'playing');
    await p.locator('#mobile-menu').tap();
    await p.locator('[data-menu-action="sound"]').tap();
    assert.equal(await p.locator('#sound').getAttribute('aria-pressed'), 'true');
    assert.equal(await p.evaluate(() => __pvz.game.status), 'playing');
    const ids = await p.evaluate(() => __pvz.game.plants.map(p => p.id));
    await p.setViewportSize({ width: 844, height: 390 });
    await p.waitForTimeout(250);
    await checkFits(p);
    assert.deepEqual(await p.evaluate(() => __pvz.game.plants.map(p => p.id)), ids, 'rotating preserves formation');
    const landscapeCell = await p.locator('.lawn-cell').first().boundingBox();
    assert.ok(landscapeCell.height >= 55, 'landscape dedicates height to all five lanes');
    await p.evaluate(() => { __pvz.game.sun = 1200; __pvz.render(); });
    await swipe(p, '#seed-cards', 'y');
    await p.locator('[data-type="DivineWaterShooter"]').tap();
    await p.locator('#pause').tap();
    assert.equal(await p.evaluate(() => __pvz.game.status), 'paused');
    await p.locator('#resume-game').tap();
    await p.screenshot({ path: 'test-results/mobile-landscape-battle.png' });
    await p.locator('#boss-challenge').tap();
    await p.locator('#start').tap();
    await p.evaluate(() => __pvz.advance(3.2));
    assert.equal(await p.locator('.boss-entity').count(), 1);
    assert.equal(await p.locator('#boss-health').isVisible(), true);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(200);
    await swipe(p, '#scene-scroll', 'x');
    const health = await p.locator('#boss-health').boundingBox();
    assert.ok(health.x >= 0 && health.x + health.width <= 390, 'boss health stays visible while panning');
    await p.locator('#fullscreen').tap();
    await p.waitForFunction(() => document.fullscreenElement);
    await p.locator('#mode-free').tap();
    await checkFits(p);
    await p.locator('#fullscreen').tap();
    await p.waitForFunction(() => !document.fullscreenElement);
    await p.close();
    for (const [width, height] of [[320,568], [360,640], [667,375], [932,430]]) {
      const small = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true });
      small.on('pageerror', e => errors.push(e.message));
      await small.goto(`${base}?test=1`);
      await small.locator('#mode-free').tap();
      await small.waitForTimeout(150);
      await checkFits(small);
      if (width > height) {
        const blocked = await small.locator('.lawn-cell').evaluateAll(cells => cells.filter(cell => {
          const rect = cell.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return hit !== cell && !cell.contains(hit);
        }).map(cell => cell.getAttribute('aria-label')));
        assert.deepEqual(blocked, [], 'preparation controls never cover landscape planting cells');
      }
      await small.locator('[data-row="4"][data-col="8"]').tap();
      assert.equal(await small.locator('.plant-entity').count(), 1);
      await small.screenshot({ path: `test-results/mobile-${width}x${height}.png` });
      await small.close();
    }
    assert.deepEqual(errors, []);
    console.log('PASS touch: native lawn/card swipes without misplanting, repeat planting, shovel, overview navigation, menu pause/resume, rotation, fullscreen, boss HUD and six phone sizes');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
