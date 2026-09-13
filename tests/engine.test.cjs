const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../engine.js');
const advance = (g, seconds) => { for (let n = 0; n < Math.round(seconds * 20); n++) g.step(0.05); };
const battle = () => { const g = new Game(1, () => 0.5); g.start(); g.schedule = [{ at: 9999, type: 'Zombie', row: 0, wave: 1 }]; return g; };
test('planting validates funds, cooldown, occupied cells and coordinates without charging', () => {
  const g = battle(); assert.equal(g.plant('Peashooter', 0, 0).ok, true); assert.equal(g.sun, 50);
  assert.equal(g.plant('Peashooter', 0, 1).ok, false); assert.equal(g.plant('SunFlower', 0, 0).ok, false); assert.equal(g.plant('SunFlower', -1, 0).ok, false); assert.equal(g.plant('SunFlower', 0.2, 0).ok, false); assert.equal(g.sun, 50);
  assert.equal(g.plant('SunFlower', 1, 0).ok, true); assert.equal(g.plants.length, 2); assert.equal(g.sun, 0);
});
test('sunflowers produce collectible sun; collection is idempotent', () => {
  const g = battle(); g.nextSky = 9999; g.plant('SunFlower', 0, 0); advance(g, 5.1); assert.equal(g.suns.length, 1); const id = g.suns[0].id;
  assert.equal(g.collect(id), true); assert.equal(g.sun, 125); assert.equal(g.collect(id), false); assert.equal(g.sun, 125);
});
test('cooldowns expire and shoveling removes a plant without refund', () => {
  const g = battle(); g.nextSky = 9999; g.plant('SunFlower', 0, 0); assert.equal(g.plant('SunFlower', 0, 1).ok, false); advance(g, 5.1);
  assert.equal(g.plant('SunFlower', 0, 1).ok, true); assert.equal(g.shovel(0, 0), true); assert.equal(g.sun, 50); assert.equal(g.shovel(0, 0), false);
});
test('pause freezes clock, zombies, suns and cooldowns and rejects actions', () => {
  const g = battle(); g.plant('Peashooter', 0, 0); const z = g.spawn('Zombie', 1, 600); g.addSun(300, 200); g.pause(); const before = JSON.stringify(g); advance(g, 20); assert.equal(JSON.stringify(g), before); assert.equal(g.collect(g.suns[0].id), false); assert.equal(g.shovel(0, 0), false); assert.equal(g.plant('WallNut', 2, 2).ok, false); g.resume(); advance(g, 1); assert.ok(z.x < 600);
});
test('peas hit only their own lane and kill zombies', () => {
  const g = battle(); g.plant('Peashooter', 0, 0); const same = g.spawn('Zombie', 0, 530); const other = g.spawn('Zombie', 1, 530); advance(g, 15); assert.ok(!g.zombies.includes(same)); assert.equal(other.hp, 180); assert.equal(g.kills, 1);
});
test('ice peas deal damage and halve walking speed', () => {
  const g = battle(); g.sun = 1000; g.plant('SnowPea', 0, 0); const z = g.spawn('Zombie', 0, 430); advance(g, 1.5); assert.ok(z.slow > 0); assert.ok(z.hp < 180); const x = z.x; advance(g, 1); assert.ok(Math.abs((x - z.x) - 5.5) < 0.01);
});
test('repeater fires two separately colliding peas', () => {
  const g = battle(); g.sun = 200; g.plant('Repeater', 0, 0); const z = g.spawn('BucketheadZombie', 0, 400); advance(g, 1.3); assert.equal(z.hp, 960);
});
test('zombies stop to eat, destroy blockers and then move again', () => {
  const g = battle(); g.plant('SunFlower', 0, 0); const z = g.spawn('Zombie', 0, 220); advance(g, 1); assert.equal(z.x, 220); assert.ok(g.plants[0].hp < 300); advance(g, 5); assert.equal(g.plants.length, 0); assert.ok(z.x < 220);
});
test('cherry bomb damages only its 3 by 3 neighborhood and is consumed', () => {
  const g = battle(); g.plant('CherryBomb', 2, 4); const x = g.center(2, 4).x;
  g.spawn('BucketheadZombie', 2, x + 60); g.spawn('ConeheadZombie', 1, x + 60); const farRow = g.spawn('Zombie', 0, x); const farCol = g.spawn('Zombie', 2, x + 250);
  advance(g, 1.2); assert.equal(g.kills, 2); assert.equal(g.plants.length, 0); assert.equal(farRow.hp, 180); assert.equal(farCol.hp, 180);
});
test('lawnmower sweeps its lane once, and a subsequent breach loses', () => {
  const g = battle(); g.spawn('BucketheadZombie', 0, 120); g.spawn('BucketheadZombie', 0, 700); const other = g.spawn('Zombie', 1, 700); advance(g, 2.2); assert.equal(g.mowers[0].status, 'spent'); assert.equal(g.kills, 2); assert.equal(other.hp, 180);
  g.spawn('Zombie', 0, 54); advance(g, 0.1); assert.equal(g.status, 'lost');
});
test('victory waits for all scheduled zombies to be defeated', () => {
  const g = new Game(); g.schedule = [{ at: 0, type: 'Zombie', row: 0, wave: 1 }]; g.start(); advance(g, 0.1); assert.equal(g.status, 'playing'); assert.equal(g.spawned, 1); g.zombies[0].hp = 0; advance(g, 0.1); assert.equal(g.status, 'won'); assert.equal(g.kills, 1);
});
test('all 3 levels schedule three waves with increasing enemy numbers', () => {
  let previous = 0; for (let level = 1; level <= 3; level++) { const g = new Game(level); assert.ok(g.schedule.length > previous); previous = g.schedule.length; assert.deepEqual([...new Set(g.schedule.map(s => s.wave))], [1,2,3]); assert.ok(g.schedule.every((s, i) => !i || s.at >= g.schedule[i-1].at)); }
});
test('all three levels are winnable after free setup using normal battle economy', () => {
  for (let level = 1; level <= 3; level++) {
    const g = new Game(level, () => 0.5, { mode: 'free' });
    g.plant('SunFlower', 0, 0); advance(g, 5.25);
    for (const s of [...g.suns]) g.collect(s.id);
    g.plant('SunFlower', 1, 0); g.start();
    for (let tick = 0; tick < 6000 && g.status === 'playing'; tick++) {
      for (const s of [...g.suns]) g.collect(s.id);
      if (tick % 4 === 0) {
        for (const z of [...g.zombies].sort((a, b) => a.x - b.x)) {
          if (!g.plants.some(p => p.row === z.row && p.type === 'Peashooter')) g.plant('Peashooter', z.row, 2);
        }
        if (g.plants.filter(p => p.type === 'SunFlower').length < 5 && g.sun >= 100) {
          for (let row = 0; row < 5; row++) g.plant('SunFlower', row, 0);
        }
        if (g.plants.filter(p => p.type === 'Peashooter').length >= 5) {
          for (let row = 0; row < 5; row++) g.plant('Peashooter', row, 3);
        }
        if (g.sun >= 150) for (let row = 0; row < 5; row++) g.plant('WallNut', row, 5);
      }
      g.step(0.05); g.drainEvents();
    }
    assert.equal(g.status, 'won', `level ${level} should be winnable`);
    assert.equal(g.kills, g.schedule.length);
    assert.ok(g.sun >= 0);
  }
});
test('auto pickup collects sky and plant suns once after one second', () => {
  const g = new Game(); g.addSun(300, 200, true); g.addSun(400, 300);
  const ids = g.suns.map(s => s.id); advance(g, 0.9); assert.equal(g.sun, 150);
  advance(g, 0.2); assert.equal(g.sun, 200); assert.equal(g.suns.length, 0);
  ids.forEach(id => assert.equal(g.collect(id), false));
  advance(g, 2); assert.equal(g.sun, 200);
  assert.equal(g.drainEvents().filter(e => e.type === 'collect').length, 2);
});
test('manual pickup remains available and switching on picks up existing sun', () => {
  const g = new Game(); g.autoCollectSun = false; g.addSun(300, 200); g.addSun(400, 300);
  advance(g, 2); assert.equal(g.sun, 150); assert.equal(g.suns.length, 2);
  assert.equal(g.collect(g.suns[0].id), true); assert.equal(g.sun, 175);
  g.autoCollectSun = true; advance(g, 0.1); assert.equal(g.sun, 200); assert.equal(g.suns.length, 0);
});
test('automatic pickup respects pause and terminal game states', () => {
  for (const state of ['paused', 'won', 'lost']) {
    const g = new Game(); g.addSun(300, 200); advance(g, 0.9); g.status = state;
    advance(g, 2); assert.equal(g.sun, 150); assert.equal(g.suns.length, 1);
    if (state === 'paused') { g.resume(); advance(g, 0.2); assert.equal(g.sun, 175); }
  }
});
test('multiple divine water shooters can coexist while battle costs and cooldown remain', () => {
  const g = battle(); g.nextSky = 9999; g.sun = 2500;
  assert.equal(g.plant('DivineWaterShooter', 0, 0).ok, true); assert.equal(g.sun, 1500);
  assert.equal(g.plant('DivineWaterShooter', 1, 0).ok, false);
  advance(g, 60.1);
  assert.equal(g.plant('DivineWaterShooter', 1, 0).ok, true); assert.equal(g.sun, 500);
  assert.equal(g.plants.length, 2);
});
test('one divine water droplet pierces multiple zombies only in its own lane', () => {
  const g = battle(); g.sun = 1000; g.plant('DivineWaterShooter', 0, 0);
  for (const [type, x] of [['Zombie', 420], ['ConeheadZombie', 560], ['BucketheadZombie', 740]]) g.spawn(type, 0, x);
  const neighbor = g.spawn('BucketheadZombie', 1, 560);
  advance(g, 1.5); assert.equal(g.kills, 3); assert.equal(neighbor.hp, 1000);
  assert.equal(g.projectiles.length, 1); assert.equal(g.projectiles[0].water, true);
  advance(g, 1); assert.equal(g.projectiles.length, 0);
});
test('piercing water never damages a surviving target twice with the same droplet', () => {
  const g = battle(); g.sun = 1000; g.plant('DivineWaterShooter', 0, 0);
  const z = g.spawn('Zombie', 0, 400); z.hp = 5000000000;
  advance(g, 1.5); assert.equal(z.hp, 2900000000);
  advance(g, 7); assert.equal(z.hp, 2900000000);
  advance(g, 3); assert.equal(z.hp, 800000000);
});
test('ordinary peas still stop at the first target after piercing support', () => {
  const g = battle(); g.plant('Peashooter', 0, 0);
  const first = g.spawn('BucketheadZombie', 0, 400); const second = g.spawn('BucketheadZombie', 0, 402);
  advance(g, 1.3); assert.equal(first.hp, 980); assert.equal(second.hp, 1000); assert.equal(g.projectiles.length, 0);
});
test('preparation allows filling the entire lawn for free without cooldown', () => {
  const g = new Game(1, Math.random, { mode: 'free' }); g.sun = 0;
  for (let row = 0; row < 5; row++) for (let col = 0; col < 9; col++) assert.equal(g.plant('Repeater', row, col).ok, true);
  assert.equal(g.plants.length, 45); assert.equal(g.sun, 0); assert.deepEqual(g.cooldowns, {});
  assert.equal(g.plant('Repeater', 0, 0).ok, false); assert.equal(g.plant('Repeater', 5, 0).ok, false);
});
test('preparation waits indefinitely and only explicit start activates plants and waves', () => {
  const g = new Game(1, Math.random, { mode: 'free' }); g.plant('SunFlower', 0, 0); g.plant('CherryBomb', 1, 0);
  advance(g, 600);
  assert.equal(g.status, 'ready'); assert.equal(g.time, 0); assert.equal(g.spawned, 0); assert.equal(g.zombies.length, 0);
  assert.equal(g.suns.length, 0); assert.ok(g.plants.every(p => p.age === 0));
  const ids = g.plants.map(p => p.id); g.start();
  assert.deepEqual(g.plants.map(p => p.id), ids);
  advance(g, 0.5); assert.equal(g.plants.length, 2);
  advance(g, 0.6); assert.equal(g.plants.length, 1);
  advance(g, 17); assert.ok(g.zombies.length > 0);
});
test('starting restores normal costs and cooldowns without charging prepared plants', () => {
  const g = new Game(1, Math.random, { mode: 'free' }); g.plant('Peashooter', 0, 0); g.plant('Peashooter', 1, 0);
  g.start(); assert.equal(g.sun, 150); assert.equal(g.plants.length, 2);
  assert.equal(g.plant('Peashooter', 2, 0).ok, true); assert.equal(g.sun, 50);
  g.sun = 100; assert.equal(g.plant('Peashooter', 3, 0).ok, false);
  assert.equal(g.plant('Repeater', 3, 0).ok, false);
});
test('free preparation can fill all 45 cells with divine water shooters', () => {
  const g = new Game(1, Math.random, { mode: 'free' }); g.sun = 0;
  for (let row = 0; row < 5; row++) for (let col = 0; col < 9; col++) assert.equal(g.plant('DivineWaterShooter', row, col).ok, true);
  assert.equal(g.plants.length, 45); assert.equal(g.sun, 0); assert.deepEqual(g.cooldowns, {});
  g.start(); advance(g, 0.1); assert.equal(g.plants.length, 45);
});
const challenge = () => new Game(1, () => 0, { bossChallenge: true });
test('boss challenge waits for manual start, then spawns the stationary boss', () => {
  const g = challenge(); advance(g, 60); assert.equal(g.zombies.length, 0); assert.equal(g.time, 0);
  g.start(); advance(g, 2.9); assert.equal(g.status, 'playing'); assert.equal(g.zombies.length, 0);
  advance(g, 0.2); const boss = g.zombies.find(z => z.isBoss);
  assert.ok(boss); assert.equal(boss.hp, 12000); assert.equal(boss.x, 945);
  advance(g, 2); assert.equal(boss.x, 945);
});
test('boss takes fire from the middle three lanes but not the outside lanes', () => {
  const g = challenge();
  for (let row = 0; row < 5; row++) g.plant('Peashooter', row, 0);
  g.start(); advance(g, 7); const boss = g.zombies.find(z => z.isBoss);
  assert.ok(boss.hp < 12000); assert.deepEqual([...new Set(g.projectiles.map(p => p.row))].sort(), [1, 2, 3]);
  assert.equal(g.canHitRow(boss, 0), false); assert.equal(g.canHitRow(boss, 4), false);
});
test('boss summons reinforcements and enrages exactly once below half health', () => {
  const g = challenge(); g.start(); advance(g, 8.2);
  const boss = g.zombies.find(z => z.isBoss); assert.equal(g.zombies.filter(z => !z.isBoss).length, 2);
  boss.hp = 6000; advance(g, 0.1); assert.equal(boss.enraged, true);
  advance(g, 3.1); assert.equal(g.zombies.filter(z => !z.isBoss).length, 5);
  assert.equal(g.drainEvents().filter(e => e.type === 'boss-enrage').length, 1);
});
test('boss warns before a smash, pause freezes it, and impact damages the marked cell', () => {
  const g = challenge(); g.plant('WallNut', 0, 0); g.start(); advance(g, 13.2);
  const boss = g.zombies.find(z => z.isBoss); assert.ok(boss.mark); assert.equal(g.plants[0].hp, 2400);
  const remaining = boss.mark.remaining; g.pause(); advance(g, 5); assert.equal(boss.mark.remaining, remaining);
  g.resume(); advance(g, 2.1); assert.equal(boss.mark, null); assert.equal(g.plants[0].hp, 600);
});
test('boss defeat cancels future skills but victory waits for surviving reinforcements', () => {
  const g = challenge(); g.start(); advance(g, 8.2); const boss = g.zombies.find(z => z.isBoss); boss.hp = 0;
  advance(g, 0.1); assert.equal(g.bossDefeated, true); assert.equal(g.status, 'playing');
  const remaining = g.zombies.length; advance(g, 10); assert.equal(g.zombies.length, remaining);
  g.zombies.forEach(z => { z.hp = 0; }); advance(g, 0.1); assert.equal(g.status, 'won');
});
test('divine water shooter retains its full damage against the boss', () => {
  const g = challenge(); g.plant('DivineWaterShooter', 2, 0); g.start(); advance(g, 5);
  assert.equal(g.bossDefeated, true); assert.equal(g.status, 'won'); assert.equal(g.kills, 1);
});
test('boss challenge can still be lost when a summoned zombie breaches an exhausted lane', () => {
  const g = challenge(); g.start(); advance(g, 8.2);
  const z = g.zombies.find(z => !z.isBoss); z.x = 40; g.mowers[z.row].status = 'spent';
  advance(g, 0.1); assert.equal(g.status, 'lost');
});
test('adventure requires start and uses ordinary costs, cooldowns and automatic waves', () => {
  const g = new Game();
  assert.equal(g.plant('Peashooter', 0, 0).ok, false);
  assert.equal(g.plants.length, 0); assert.equal(g.sun, 150);
  advance(g, 100); assert.equal(g.time, 0);
  g.start(); assert.equal(g.plant('Peashooter', 0, 0).ok, true);
  assert.equal(g.sun, 50); g.sun = 150;
  assert.equal(g.plant('Peashooter', 1, 0).ok, false);
  advance(g, 18.1); assert.ok(g.spawned > 0); assert.ok(g.zombies.length > 0);
});
test('free mode uses normal waves after preparation and can reach victory', () => {
  const g = new Game(1, () => 0, { mode: 'free' });
  assert.deepEqual(g.schedule, new Game().schedule);
  for (let row = 0; row < 5; row++) assert.equal(g.plant('DivineWaterShooter', row, 0).ok, true);
  advance(g, 300); assert.equal(g.time, 0); assert.equal(g.spawned, 0);
  g.start(); g.sun = 0;
  assert.equal(g.plant('DivineWaterShooter', 0, 1).ok, false);
  advance(g, 18.1); assert.ok(g.spawned > 0);
  advance(g, 200); assert.equal(g.status, 'won'); assert.equal(g.kills, g.schedule.length);
});
test('explicit modes remain independent of legacy boss option and normal economy', () => {
  const normal = new Game(1, Math.random, { mode: 'adventure' }); normal.start();
  assert.equal(normal.plant('DivineWaterShooter', 0, 0).ok, false);
  const boss = new Game(1, Math.random, { mode: 'boss' }); assert.equal(boss.bossChallenge, true); assert.equal(boss.freePlay, false);
  const free = new Game(1, Math.random, { bossChallenge: true, mode: 'free' }); assert.equal(free.freePlay, true); assert.equal(free.bossChallenge, false);
});
