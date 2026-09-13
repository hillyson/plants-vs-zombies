(function (root) {
  'use strict';
  const GRID = { x: 150, y: 80, cellWidth: 82, cellHeight: 98, rows: 5, cols: 9 };
  const PLANTS = [
    { id: 'SunFlower', name: '向日葵', cost: 50, cooldown: 5, hp: 300, role: '阳光生产', description: '每隔 15 秒生产 25 点阳光。先种两列，才能从容面对后面的战斗。', color: '#e5ad32' },
    { id: 'Peashooter', name: '豌豆射手', cost: 100, cooldown: 5, hp: 300, interval: 1.4, role: '基础攻击', description: '向所在行发射豌豆，每颗造成 20 点伤害。可靠的庭院守护者。', color: '#70a942' },
    { id: 'WallNut', name: '坚果墙', cost: 50, cooldown: 15, hp: 2400, role: '坚实防御', description: '拥有 2400 点生命，为后排的植物争取宝贵的输出时间。', color: '#bc8652' },
    { id: 'SnowPea', name: '寒冰射手', cost: 175, cooldown: 5, hp: 300, interval: 1.5, role: '冰冻减速', description: '冰豌豆造成 20 点伤害，并让僵尸移动和啃食速度降低 50%，持续 5 秒。', color: '#7eaeb8' },
    { id: 'Repeater', name: '双发射手', cost: 200, cooldown: 5, hp: 300, interval: 1.4, role: '双倍火力', description: '连续发射两颗豌豆，用双倍火力应对更难缠的僵尸。', color: '#468455' },
    { id: 'CherryBomb', name: '樱桃炸弹', cost: 150, cooldown: 25, hp: 300, role: '范围爆破', description: '种下 1 秒后爆炸，对周围 3×3 区域的僵尸造成 1800 点伤害。', color: '#c26754' },
    { id: 'DivineWaterShooter', name: '神水滴射手', cost: 1000, cooldown: 60, hp: 300, interval: 9.99, damage: 2100000000, piercing: true, sprite: 'assets/DivineWaterShooter.png', role: '神级穿透', description: '种植数量不限。每 9.99 秒发射一颗神水滴，沿本行无限穿透，每次命中造成 21 亿伤害。种下后可立即迎敌，保护好这位强力伙伴！', color: '#55bed5' }
  ];
  const ZOMBIES = { Zombie: { hp: 180, speed: 11 }, ConeheadZombie: { hp: 460, speed: 10 }, BucketheadZombie: { hp: 1000, speed: 9 }, Zomboss: { hp: 12000, speed: 0 } };
  class Game {
    constructor(level = 1, random = Math.random, { bossChallenge = false, mode = bossChallenge ? 'boss' : 'adventure' } = {}) {
      this.level = Math.max(1, Math.min(3, level)); this.random = random; this.status = 'ready'; this.time = 0; this.sun = 150;
      this.mode = ['adventure', 'free', 'boss'].includes(mode) ? mode : 'adventure';
      this.bossChallenge = this.mode === 'boss'; this.freePlay = this.mode === 'free'; this.bossDefeated = false;
      this.plants = []; this.zombies = []; this.projectiles = []; this.suns = []; this.events = []; this.cooldowns = {}; this.kills = 0; this.sequence = 0;
      this.mowers = Array.from({ length: 5 }, (_, row) => ({ id: this.id(), row, x: 110, status: 'ready' }));
      this.nextSky = 3; this.spawned = 0; this.wave = 0; this.autoCollectSun = true;
      this.schedule = [];
      if (this.bossChallenge) {
        this.schedule.push({ at: 3, row: 2, type: 'Zomboss', wave: 1 });
        return;
      }
      for (let wave = 0; wave < 3; wave++) {
        const count = 4 + wave * 2 + (this.level - 1) * 2;
        for (let n = 0; n < count; n++) {
          const type = (this.level > 1 && wave > 0 && n % 4 === 0) ? 'BucketheadZombie' : ((wave > 0 || this.level > 1) && n % 3 === 1 ? 'ConeheadZombie' : 'Zombie');
          this.schedule.push({ at: 18 + wave * 44 + n * 4.5, row: (n + wave * 2) % 5, type, wave: wave + 1 });
        }
      }
    }
    id() { return ++this.sequence; }
    emit(type, data = {}) { this.events.push({ type, ...data }); }
    drainEvents() { return this.events.splice(0); }
    center(row, col) { return { x: GRID.x + col * GRID.cellWidth + GRID.cellWidth / 2, y: GRID.y + row * GRID.cellHeight + GRID.cellHeight / 2 }; }
    start() { if (this.status === 'ready') { this.status = 'playing'; this.emit('start'); } }
    pause() { if (this.status === 'playing') this.status = 'paused'; }
    resume() { if (this.status === 'paused') this.status = 'playing'; }
    plant(type, row, col) {
      if (!['ready', 'playing'].includes(this.status)) return { ok: false, reason: '请先继续游戏' };
      if (this.mode === 'adventure' && this.status === 'ready') return { ok: false, reason: '请先开始冒险，再收集阳光、种植防守' };
      const def = PLANTS.find(p => p.id === type);
      if (!def || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= 5 || col < 0 || col >= 9) return { ok: false, reason: '请在草坪内种植' };
      if (this.plants.some(p => p.row === row && p.col === col)) return { ok: false, reason: '这里已经有植物啦' };
      if (def.limit && this.plants.filter(p => p.type === type).length >= def.limit) return { ok: false, reason: `${def.name}全场只能种植${def.limit}株` };
      if (this.status === 'playing') {
        if (this.sun < def.cost) return { ok: false, reason: '阳光不足，先收集一些阳光吧' };
        if ((this.cooldowns[type] || 0) > 0) return { ok: false, reason: '种子正在冷却，请稍等' };
        this.sun -= def.cost; this.cooldowns[type] = def.cooldown;
      }
      const p = { id: this.id(), type, row, col, ...this.center(row, col), hp: def.hp, maxHp: def.hp, age: 0, timer: type === 'SunFlower' ? 5 : 0.35, burst: 0 };
      this.plants.push(p); this.emit('plant', { plant: p }); return { ok: true };
    }
    shovel(row, col) {
      if (!['ready', 'playing'].includes(this.status)) return false;
      const p = this.plants.find(p => p.row === row && p.col === col);
      if (!p) return false;
      this.plants = this.plants.filter(a => a !== p); this.emit('shovel', { x: p.x, y: p.y }); return true;
    }
    addSun(x, y, fromSky = false) {
      this.suns.push({ id: this.id(), x, y: fromSky ? -30 : y - 25, targetY: y, age: 0, value: 25 });
    }
    collect(id) {
      if (!['ready', 'playing'].includes(this.status)) return false;
      const s = this.suns.find(s => s.id === id); if (!s) return false;
      this.sun += s.value; this.suns = this.suns.filter(a => a !== s); this.emit('collect', { x: s.x, y: s.y }); return true;
    }
    spawn(type, row, x = 1030) {
      const d = ZOMBIES[type]; const z = { id: this.id(), type, row, x, y: this.center(row, 0).y, hp: d.hp, maxHp: d.hp, speed: d.speed + (this.level - 1) * 1.4, slow: 0, bite: 0, attacking: false };
      if (type === 'Zomboss') {
        Object.assign(z, { isBoss: true, x: 945, row: 2, y: this.center(2, 0).y, speed: 0, summonTimer: 5, smashTimer: 10, summonCount: 0, mark: null, enraged: false });
        this.emit('boss-arrival');
      }
      this.zombies.push(z); return z;
    }
    canHitRow(zombie, row) { return zombie.isBoss ? Math.abs(zombie.row - row) <= 1 : zombie.row === row; }
    updateBoss(boss, dt) {
      if (!boss.enraged && boss.hp <= boss.maxHp / 2) {
        boss.enraged = true; boss.summonTimer = Math.min(boss.summonTimer, 3); this.emit('boss-enrage');
      }
      const elapsed = dt * (boss.slow > 0 ? 0.5 : 1);
      boss.summonTimer -= elapsed;
      if (boss.summonTimer <= 0) {
        const count = boss.enraged ? 3 : 2;
        for (let i = 0; i < count && this.zombies.length < 35; i++) {
          const n = boss.summonCount++;
          this.spawn(boss.enraged && n % 3 === 0 ? 'BucketheadZombie' : n % 2 ? 'ConeheadZombie' : 'Zombie', n % 5, 1000 + i * 25);
        }
        boss.summonTimer = boss.enraged ? 6 : 9; this.emit('boss-summon');
      }
      if (boss.mark) {
        boss.mark.remaining -= elapsed;
        if (boss.mark.remaining <= 0) {
          const { row, col, x, y } = boss.mark;
          const target = this.plants.find(p => p.row === row && p.col === col);
          if (target) target.hp -= 1800;
          this.emit('boss-smash', { x, y }); boss.mark = null;
        }
      } else {
        boss.smashTimer -= elapsed;
        if (boss.smashTimer <= 0) {
          const candidates = this.plants.filter(p => p.hp > 0);
          const target = candidates[Math.floor(this.random() * candidates.length)];
          if (target) { boss.mark = { row: target.row, col: target.col, x: target.x, y: target.y, remaining: 2 }; this.emit('boss-warning'); }
          boss.smashTimer = boss.enraged ? 7 : 12;
        }
      }
    }
    fire(p) {
      const def = PLANTS.find(d => d.id === p.type);
      this.projectiles.push({ id: this.id(), row: p.row, x: p.x + 26, y: p.y - 19, damage: def.damage || 20, ice: p.type === 'SnowPea', water: p.type === 'DivineWaterShooter', piercing: !!def.piercing, hitIds: [] });
    }
    step(dt) {
      if (!['ready', 'playing'].includes(this.status) || !Number.isFinite(dt) || dt <= 0) return;
      dt = Math.min(dt, 0.1);
      for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
      for (const s of this.suns) { s.age += dt; s.y = Math.min(s.targetY, s.y + dt * 55); }
      if (this.autoCollectSun) {
        for (const s of [...this.suns]) if (s.age >= 1) this.collect(s.id);
      }
      this.suns = this.suns.filter(s => s.age < 16);
      if (this.status === 'ready') return;
      for (const p of this.plants) {
        p.age += dt;
        if (p.type === 'SunFlower') { p.timer -= dt; if (p.timer <= 0) { this.addSun(p.x + 15, p.y + 15); p.timer += 15; } }
      }
      this.time += dt;
      if (this.time >= this.nextSky) { this.addSun(180 + this.random() * 680, 140 + this.random() * 350, true); this.nextSky = this.time + 7; }
      while (this.spawned < this.schedule.length && this.time >= this.schedule[this.spawned].at) {
        const s = this.schedule[this.spawned++]; this.spawn(s.type, s.row);
        if (s.wave !== this.wave) { this.wave = s.wave; if (!this.bossChallenge) this.emit('wave', { wave: s.wave }); }
      }
      for (const p of this.plants) {
        if (p.type === 'CherryBomb' && p.age >= 1) {
          for (const z of this.zombies) if (Math.abs(z.row - p.row) <= 1 && Math.abs(z.x - p.x) <= GRID.cellWidth * 1.65) z.hp -= 1800;
          p.hp = 0; this.emit('explode', { x: p.x, y: p.y });
        }
        const def = PLANTS.find(d => d.id === p.type);
        if (!def.interval || p.hp <= 0) continue;
        if (p.burst > 0) { p.burst -= dt; if (p.burst <= 0) this.fire(p); }
        p.timer -= dt;
        if (p.timer <= 0 && this.zombies.some(z => z.hp > 0 && this.canHitRow(z, p.row) && z.x > p.x - 20 && z.x < 1080)) {
          this.fire(p); if (p.type === 'Repeater') p.burst = 0.16; p.timer = def.interval;
        }
      }
      for (const b of this.projectiles) {
        const next = b.x + dt * (b.water ? 560 : 310);
        const targets = this.zombies.filter(z => z.hp > 0 && this.canHitRow(z, b.row) && z.x + 22 >= b.x && z.x - 22 <= next && !b.hitIds.includes(z.id)).sort((a, c) => a.x - c.x);
        for (const target of b.piercing ? targets : targets.slice(0, 1)) {
          target.hp -= b.damage; if (b.ice) target.slow = 5;
          b.hitIds.push(target.id); b.dead = !b.piercing;
          this.emit('hit', { x: target.x, y: b.y, ice: b.ice, water: b.water });
        }
        b.x = next;
      }
      this.projectiles = this.projectiles.filter(b => !b.dead && b.x < 1120);
      for (const z of this.zombies) {
        if (z.hp <= 0) continue;
        z.slow = Math.max(0, z.slow - dt); const rate = z.slow > 0 ? 0.5 : 1;
        if (z.isBoss) { this.updateBoss(z, dt); continue; }
        const target = this.plants.filter(p => p.hp > 0 && p.row === z.row && z.x - p.x < 46 && z.x - p.x > -28).sort((a, b) => b.x - a.x)[0];
        z.attacking = !!target;
        if (target) { z.bite -= dt * rate; if (z.bite <= 0) { target.hp -= 40; z.bite = 0.5; this.emit('bite'); } }
        else { z.x -= z.speed * rate * dt; z.bite = 0; }
        const mower = this.mowers[z.row];
        if (z.x < 122 && mower.status === 'ready') { mower.status = 'active'; this.emit('mower'); }
        if (z.x < 55 && mower.status === 'spent') { this.status = 'lost'; this.emit('lost'); return; }
      }
      for (const m of this.mowers) {
        if (m.status !== 'active') continue;
        const old = m.x; m.x += dt * 550;
        for (const z of this.zombies) if (!z.isBoss && z.row === m.row && z.x >= old - 65 && z.x <= m.x + 45) z.hp = 0;
        if (m.x > 1160) m.status = 'spent';
      }
      for (const z of this.zombies) if (z.hp <= 0) { this.kills++; if (z.isBoss) this.bossDefeated = true; this.emit('death', { x: z.x, y: z.y, row: z.row, boss: !!z.isBoss }); }
      this.zombies = this.zombies.filter(z => z.hp > 0);
      this.plants = this.plants.filter(p => p.hp > 0);
      if (this.spawned === this.schedule.length && this.zombies.length === 0) { this.status = 'won'; this.emit('won'); }
    }
  }
  const api = { Game, PLANTS, GRID, ZOMBIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PVZ = api;
})(typeof window !== 'undefined' ? window : globalThis);
