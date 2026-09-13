(() => {
  'use strict';
  const { Game, PLANTS, GRID } = window.PVZ;
  const $ = id => document.getElementById(id);
  let game = new Game();
  let adventureLevel = 1;
  const modes = { adventure: '冒险模式', free: '自由模式', boss: '僵王挑战' };
  let selected = 'SunFlower';
  const mobileLayout = matchMedia('(max-width: 720px), (max-width: 1024px) and (pointer: coarse)');
  let overviewMode = false;
  let viewScale = 1;
  let soundEnabled = false;
  let autoCollectSun = true;
  try { autoCollectSun = localStorage.getItem('pvz-auto-collect-sun') !== 'false'; } catch { /* Keep the default when storage is unavailable. */ }
  game.autoCollectSun = autoCollectSun;
  let resumeOnClose = false;
  let dialogKind = '';
  let lastFrame = performance.now();
  let toastUntil = 0;
  let bestLevel = 0;
  try { bestLevel = Math.min(3, Math.max(0, Number(localStorage.getItem('pvz-best-level')) || 0)); } catch { /* Storage is optional in local-file mode. */ }
  const entities = new Map();
  const effects = new Set();
  const audioPools = new Map();
  const music = new Audio('assets/Loonboon.mp3'); music.loop = true; music.volume = 0.16;
  const plantSrc = type => PLANTS.find(p => p.id === type)?.sprite || `assets/${type === 'SunFlower' ? 'SunFlower-single' : type}.gif`;
  function play(name, volume = 0.35) {
    if (!soundEnabled) return;
    let pool = audioPools.get(name);
    if (!pool) { pool = Array.from({ length: 3 }, () => new Audio(`assets/${name}.mp3`)); audioPools.set(name, pool); }
    const audio = pool.find(a => a.paused || a.ended);
    if (audio) { audio.volume = volume; audio.currentTime = 0; audio.play().catch(() => {}); }
  }
  function updateMusic() {
    if (soundEnabled && game.status === 'playing' && !$('dialog').open) music.play().catch(() => {});
    else music.pause();
  }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); toastUntil = performance.now() + 2200; }
  function select(type) {
    if (!['ready', 'playing'].includes(game.status) || $('dialog').open) return;
    selected = selected === type ? null : type;
    play('buttonclick', 0.2); updateSelection();
  }
  function updateSelection() {
    document.querySelectorAll('.seed-card').forEach(b => { const on = b.dataset.type === selected; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', String(on)); });
    $('shovel').classList.toggle('selected', selected === 'shovel'); $('shovel').setAttribute('aria-pressed', String(selected === 'shovel'));
    $('scene').classList.toggle('has-selection', !!selected);
    $('touch-selection').textContent = selected === 'shovel' ? '点植物铲除' : selected ? `已选${PLANTS.find(p => p.id === selected).name}` : '点卡片选择植物';
    $('cancel-selection').disabled = !selected;
    document.querySelectorAll('.ghost').forEach(g => g.remove());
  }
  PLANTS.forEach((p, index) => {
    const b = document.createElement('button'); b.className = 'seed-card'; b.dataset.type = p.id;
    b.title = `${p.name} · ${p.cost} 阳光 · ${p.role}（${index + 1}）`; b.setAttribute('aria-label', `${p.name}，${p.cost}阳光，快捷键${index + 1}`);
    b.innerHTML = `<span class="seed-hotkey">${index + 1}</span><span class="seed-name">${p.name}</span><span class="plant-art"><img src="${plantSrc(p.id)}" alt="" draggable="false"></span><span class="seed-cost">${p.cost}</span><span class="cooldown-cover" style="transform:scaleY(0)"></span><span class="cooldown-text"></span>`;
    b.addEventListener('click', () => select(p.id)); $('seed-cards').append(b);
  });
  for (let row = 0; row < GRID.rows; row++) for (let col = 0; col < GRID.cols; col++) {
    const cell = document.createElement('button'); cell.className = 'lawn-cell'; cell.dataset.row = row; cell.dataset.col = col;
    cell.setAttribute('aria-label', `第${row + 1}行第${col + 1}列，空地`);
    cell.addEventListener('click', () => {
      if (!selected) { toast('先选择一张植物卡片，再点击草坪'); return; }
      if (selected === 'shovel') { if (game.shovel(row, col)) { play('plant_water'); selected = null; updateSelection(); } else toast('这里没有需要铲除的植物'); }
      else { const result = game.plant(selected, row, col); if (!result.ok) toast(result.reason); }
      render();
    });
    cell.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse') return;
      if (selected && selected !== 'shovel' && !game.plants.some(p => p.row === row && p.col === col)) {
        const ghost = document.createElement('img'); ghost.src = plantSrc(selected); ghost.className = 'ghost'; ghost.alt = ''; cell.append(ghost);
      }
    });
    cell.addEventListener('pointerleave', () => cell.replaceChildren()); $('lawn-grid').append(cell);
  }
  function entity(key, className, create) {
    let el = entities.get(key);
    if (!el) { el = document.createElement(className === 'sun-entity' ? 'button' : 'div'); el.className = `entity ${className}`; create(el); $('entity-layer').append(el); entities.set(key, el); }
    return el;
  }
  function position(el, x, y, z) { el.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`; el.style.zIndex = z; }
  function effect(className, x, y, duration, content = '') {
    const el = document.createElement('div'); el.className = `effect ${className}`; el.style.left = `${x}px`; el.style.top = `${y}px`; el.innerHTML = content;
    $('entity-layer').append(el); const item = { el, until: performance.now() + duration }; effects.add(item);
  }
  function handleEvents() {
    for (const e of game.drainEvents()) {
      switch (e.type) {
        case 'plant': play('plant_water'); break;
        case 'collect': play('points'); effect('collect-effect', e.x - 10, e.y - 20, 850, '+25'); break;
        case 'start': play('readysetplant'); updateMusic(); break;
        case 'wave': {
          $('wave-alert').textContent = e.wave === 1 ? '僵尸来了！' : e.wave === 3 ? '最后一波！守住你的小院！' : '一大波僵尸正在接近！';
          $('wave-alert').classList.remove('visible'); void $('wave-alert').offsetWidth; $('wave-alert').classList.add('visible'); play('groan3', 0.35); break;
        }
        case 'hit': effect(e.water ? 'water-hit-effect' : 'hit-effect', e.x - (e.water ? 25 : 10), e.y - (e.water ? 25 : 10), e.water ? 450 : 240); break;
        case 'bite': if (Math.random() < 0.16) play('chomp', 0.16); break;
        case 'mower': play('lawnmower', 0.4); break;
        case 'death':
          if (e.boss) { effect('explode-effect', e.x - 105, e.y - 120, 900, '<img src="assets/explosion.gif" alt="">'); play('cherrybomb', 0.5); }
          else effect('death-effect', e.x - 83, e.y - 107, 900, '<img src="assets/ZombieDie.gif" alt="">');
          break;
        case 'boss-arrival':
        case 'boss-enrage':
          $('wave-alert').textContent = e.type === 'boss-arrival' ? '僵王来袭！守住你的小院！' : '僵王暴走！小心砸击！';
          $('wave-alert').classList.remove('visible'); void $('wave-alert').offsetWidth; $('wave-alert').classList.add('visible'); play('groan3', 0.5); break;
        case 'boss-summon': play('groan3', 0.2); break;
        case 'boss-warning': toast('僵王正在瞄准红色格子！'); break;
        case 'boss-smash': effect('boss-impact', e.x - 48, e.y - 48, 700); play('cherrybomb', 0.35); break;
        case 'explode': effect('explode-effect', e.x - 105, e.y - 120, 700, '<img src="assets/explosion.gif" alt="">'); play('cherrybomb', 0.5); break;
        case 'won':
          if (game.mode === 'adventure') { bestLevel = Math.max(bestLevel, game.level); try { localStorage.setItem('pvz-best-level', String(bestLevel)); } catch { /* Optional persistence. */ } }
          play('winmusic', 0.5); showResult(true); break;
        case 'lost': play('losemusic', 0.5); showResult(false); break;
      }
    }
  }
  function render() {
    handleEvents();
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === game.mode)));
    $('mode-description').textContent = `${{ adventure: '经典关卡', free: '先布局，再开打', boss: '挑战机甲僵王' }[game.mode]} · 切换模式会重新布阵`;
    $('ready-title').textContent = game.freePlay ? '先布置好你的小院' : game.bossChallenge ? '先布阵，再挑战僵王' : '准备开始冒险';
    $('ready-description').textContent = game.freePlay ? '先免费种植、无冷却地布阵，种好后开始迎战三波僵尸。' : game.bossChallenge ? '准备阶段免费布阵；中间三行可以攻击僵王。' : '开战后收集阳光并种植，所有植物消耗阳光并有冷却。';
    $('start').firstChild.nodeValue = `${game.mode === 'adventure' ? '开始冒险' : '开始迎战'} `;
    $('auto-collect').setAttribute('aria-pressed', String(autoCollectSun));
    $('auto-collect').textContent = autoCollectSun ? '自动拾取' : '手动拾取';
    $('auto-collect').title = autoCollectSun ? '阳光出现 1 秒后自动拾取，点击关闭' : '手动点击拾取阳光，点击开启自动拾取';
    $('sun-count').textContent = game.sun;
    $('kill-count').textContent = game.kills;
    const boss = game.zombies.find(z => z.isBoss);
    $('level-name').textContent = game.freePlay ? '自由模式 · 布阵迎战' : game.bossChallenge ? '僵王挑战 · 机甲来袭' : `冒险模式 · 第 ${game.level} 关`;
    $('level-caption').textContent = game.freePlay ? '先布局 · 再迎战三波僵尸' : game.bossChallenge ? '中间三行可以攻击僵王' : ['宁静的白天', '不速之客', '守护最后的防线'][game.level - 1];
    $('wave-label').textContent = game.status === 'ready' ? '准备阶段' : game.bossChallenge ? (game.bossDefeated ? '清理援兵' : '僵王决战') : `第 ${Math.max(1, game.wave)} / 3 波`;
    $('progress-fill').style.width = `${game.bossChallenge ? (game.bossDefeated ? 100 : boss ? (1 - boss.hp / boss.maxHp) * 100 : 0) : game.spawned / game.schedule.length * 100}%`;
    $('boss-health').hidden = !game.bossChallenge || game.status === 'ready';
    $('boss-health').classList.toggle('enraged', !!boss?.enraged);
    $('boss-health-title').textContent = game.bossDefeated ? '僵王已击败 · 清理剩余援兵' : boss?.enraged ? '机甲僵王 · 暴走' : '机甲僵王';
    $('boss-health-value').textContent = boss ? `${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}` : game.bossDefeated ? '0 / 12000' : '即将登场';
    $('boss-health-fill').style.width = `${boss ? Math.max(0, boss.hp / boss.maxHp) * 100 : game.bossDefeated ? 0 : 100}%`;
    $('scene-status').textContent = { ready: game.mode === 'adventure' ? '等待开始冒险' : '准备种植', playing: '守护进行中', paused: '已暂停', won: '庭院守护成功', lost: '下次一定守住' }[game.status];
    $('ready-banner').hidden = game.status !== 'ready';
    $('ready-banner').style.display = game.status === 'ready' ? '' : 'none';
    document.querySelector('.game-shell').classList.toggle('preparing', game.status === 'ready');
    $('pause').textContent = game.status === 'paused' ? '▷' : 'Ⅱ';
    for (const def of PLANTS) {
      const b = document.querySelector(`[data-type="${def.id}"]`); const ready = game.status === 'ready' && game.mode !== 'adventure';
      const remaining = ready ? 0 : game.cooldowns[def.id] || 0;
      const insufficient = !ready && game.sun < def.cost;
      b.querySelector('.seed-cost').textContent = ready ? '免费' : def.cost;
      b.title = `${def.name} · ${ready ? '免费种植，无需冷却' : `${def.cost} 阳光`} · ${def.role}`;
      b.classList.toggle('unaffordable', insufficient); b.querySelector('.cooldown-cover').style.transform = `scaleY(${remaining / def.cooldown})`;
      b.querySelector('.cooldown-text').textContent = remaining > 0 ? Math.ceil(remaining) : '';
      b.setAttribute('aria-disabled', String(insufficient || remaining > 0 || (game.mode === 'adventure' && game.status === 'ready') || !['ready', 'playing'].includes(game.status)));
    }
    const alive = new Set();
    for (const p of game.plants) {
      const key = `p${p.id}`; alive.add(key);
      const el = entity(key, `plant-entity new${p.type === 'DivineWaterShooter' ? ' divine-water-plant' : ''}`, el => { el.innerHTML = `<img src="${plantSrc(p.type)}" alt="${PLANTS.find(d => d.id === p.type).name}"><span class="plant-health"><i></i></span>`; });
      position(el, p.x - 39, p.y - 43, p.row * 100 + 10); const health = el.querySelector('.plant-health'); health.classList.toggle('full', p.hp === p.maxHp); health.firstChild.style.width = `${p.hp / p.maxHp * 100}%`;
    }
    for (const z of game.zombies) {
      const key = `z${z.id}`; alive.add(key);
      if (z.isBoss) {
        const el = entity(key, 'boss-entity', el => { el.innerHTML = '<img alt="驾驶机甲的僵王博士">'; });
        const src = `assets/Zomboss-${z.mark ? 'attack' : 'idle'}.gif`;
        if (el.firstChild.getAttribute('src') !== src) el.firstChild.src = src;
        el.classList.toggle('enraged', z.enraged); position(el, z.x - 125, z.y - 185, 550);
        if (z.mark) {
          const markKey = `mark${z.id}`; alive.add(markKey);
          const mark = entity(markKey, 'boss-target', el => { el.innerHTML = '<span>砸击</span>'; });
          position(mark, z.mark.x - GRID.cellWidth / 2, z.mark.y - GRID.cellHeight / 2, 700);
        }
        continue;
      }
      const el = entity(key, 'zombie-entity', el => { el.innerHTML = '<img alt="僵尸"><span class="zombie-health"><i></i></span>'; });
      const src = `assets/${z.type}${z.attacking ? 'Attack' : ''}.gif`; const img = el.firstChild; if (img.getAttribute('src') !== src) img.src = src;
      position(el, z.x - 83, z.y - 107, z.row * 100 + 20); el.classList.toggle('frozen', z.slow > 0);
      const health = el.querySelector('.zombie-health'); health.classList.toggle('full', z.hp === z.maxHp); health.firstChild.style.width = `${Math.max(0, z.hp / z.maxHp * 100)}%`;
    }
    for (const b of game.projectiles) {
      const key = `b${b.id}`; alive.add(key); const el = entity(key, `pea${b.water ? ' water' : b.ice ? ' ice' : ''}`, () => {}); position(el, b.x - 9, b.y - 9, b.row * 100 + 30);
    }
    for (const s of game.suns) {
      const key = `s${s.id}`; alive.add(key);
      const el = entity(key, 'sun-entity', el => { el.innerHTML = '<img src="assets/sun.gif" alt="">'; el.setAttribute('aria-label', '收集25阳光'); el.addEventListener('click', event => { event.stopPropagation(); game.collect(s.id); render(); }); });
      position(el, s.x - 37, s.y - 37, 900); el.style.opacity = s.age > 13 ? '0.55' : '1';
    }
    for (const m of game.mowers) {
      if (m.status === 'spent') continue;
      const key = `m${m.id}`; alive.add(key); const el = entity(key, 'mower-entity', el => { el.innerHTML = '<img src="assets/mower.png" alt="割草机" width="75" height="61">'; }); position(el, m.x - 40, GRID.y + m.row * GRID.cellHeight + 20, m.row * 100 + 25);
    }
    for (const [key, el] of entities) if (!alive.has(key)) { el.remove(); entities.delete(key); }
    for (const cell of $('lawn-grid').children) {
      const plant = game.plants.find(p => p.row === Number(cell.dataset.row) && p.col === Number(cell.dataset.col));
      const name = plant ? PLANTS.find(p => p.id === plant.type).name : '空地';
      cell.setAttribute('aria-label', `第${Number(cell.dataset.row) + 1}行第${Number(cell.dataset.col) + 1}列，${name}`);
    }
    drawOverview();
  }
  function drawOverview() {
    if ($('mobile-overview').hidden) return;
    const canvas = $('overview-map'); const ctx = canvas.getContext('2d');
    const x = worldX => (worldX - 65) / 1035 * canvas.width;
    ctx.fillStyle = '#315c34'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < 5; row++) {
      ctx.fillStyle = row % 2 ? '#497842' : '#406f3c';
      ctx.fillRect(x(GRID.x), row * 17 + 2, x(GRID.x + 738) - x(GRID.x), 16);
    }
    ctx.fillStyle = '#e4ef9c';
    for (const p of game.plants) ctx.fillRect(x(p.x) - 3, p.row * 17 + 7, 6, 7);
    ctx.fillStyle = '#ffae76';
    for (const z of game.zombies) ctx.fillRect(x(z.x) - 3, z.row * 17 + 5, z.isBoss ? 10 : 6, 10);
    const scroll = $('scene-scroll');
    const left = scroll.scrollLeft / viewScale / 1035 * canvas.width;
    const width = scroll.clientWidth / viewScale / 1035 * canvas.width;
    ctx.strokeStyle = '#fff4b7'; ctx.lineWidth = 3;
    ctx.strokeRect(left + 1.5, 1.5, Math.min(width - 3, canvas.width - left - 3), canvas.height - 3);
  }
  function resize() {
    const viewport = $('scene-viewport');
    const stage = $('scene-stage'); const scroll = $('scene-scroll');
    const mobile = mobileLayout.matches;
    const scale = mobile
      ? (overviewMode ? Math.min(viewport.clientWidth / 1035, viewport.clientHeight / 535) : Math.min(0.75, viewport.clientHeight / 535))
      : document.fullscreenElement ? Math.min(viewport.clientWidth / 1100, viewport.clientHeight / 600) : viewport.clientWidth / 1100;
    viewScale = scale;
    stage.style.width = `${Math.max(viewport.clientWidth, (mobile ? 1035 : 1100) * scale)}px`;
    stage.style.height = `${viewport.clientHeight}px`;
    $('scene').style.transform = `scale(${scale})`;
    $('scene').style.left = `${mobile ? Math.max(0, (viewport.clientWidth - 1035 * scale) / 2) - 65 * scale : (viewport.clientWidth - 1100 * scale) / 2}px`;
    $('scene').style.top = `${mobile ? Math.max(0, (viewport.clientHeight - 535 * scale) / 2) - 65 * scale : Math.max(0, (viewport.clientHeight - 600 * scale) / 2)}px`;
    // Keep the overview's height reserved in portrait to avoid resize feedback loops.
    $('mobile-overview').hidden = !mobile || matchMedia('(orientation: landscape)').matches || overviewMode;
    if (!mobile || overviewMode) scroll.scrollLeft = 0;
    $('board-zoom').textContent = overviewMode ? '放大' : '全景';
    $('board-zoom').setAttribute('aria-pressed', String(overviewMode));
    $('board-zoom').setAttribute('aria-label', overviewMode ? '放大草坪方便种植' : '查看整个草坪全景');
    drawOverview();
  }
  new ResizeObserver(resize).observe($('scene-viewport'));
  mobileLayout.addEventListener('change', resize);
  window.addEventListener('resize', resize);
  $('scene-scroll').addEventListener('scroll', drawOverview, { passive: true });
  $('overview-jump').onclick = event => {
    const rect = $('overview-map').getBoundingClientRect();
    const ratio = event.detail === 0 ? 0.5 : Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    $('scene-scroll').scrollLeft = ratio * 1035 * viewScale - $('scene-scroll').clientWidth / 2;
  };
  $('board-zoom').onclick = () => { overviewMode = !overviewMode; resize(); };
  $('cancel-selection').onclick = () => { selected = null; updateSelection(); };
  function reset(level = game.level, mode = game.mode) {
    closeDialog(false); game = new Game(level, Math.random, { mode }); game.autoCollectSun = autoCollectSun; selected = 'SunFlower';
    if (game.mode === 'adventure') adventureLevel = game.level;
    for (const el of entities.values()) el.remove(); entities.clear();
    for (const e of effects) e.el.remove(); effects.clear();
    $('wave-alert').classList.remove('visible'); $('toast').classList.remove('visible');
    music.pause(); music.currentTime = 0; updateSelection(); render();
    $('scene-scroll').scrollLeft = 0;
  }
  function showDialog(kind, html) {
    if ($('dialog').open) closeDialog(false);
    resumeOnClose = game.status === 'playing'; if (resumeOnClose) game.pause(); dialogKind = kind;
    if (['pause', 'result'].includes(kind)) html += `<div class="dialog-mode-switch"><p>切换模式，重新布阵</p><div class="mode-switch" role="group" aria-label="切换游戏模式">${Object.entries(modes).map(([mode, label]) => `<button class="mode-option" data-mode="${mode}">${label}</button>`).join('')}</div></div>`;
    $('dialog-content').innerHTML = html; $('dialog').showModal(); updateMusic(); render();
  }
  function closeDialog(resume = true) {
    if ($('dialog').open) $('dialog').close();
    if (resume && resumeOnClose) game.resume(); resumeOnClose = false; dialogKind = ''; updateMusic();
  }
  function togglePause() {
    if ($('dialog').open) { if (dialogKind === 'pause') closeDialog(); return; }
    if (game.status === 'ready') { toast(game.mode === 'adventure' ? '点击“开始冒险”后，就能种植防守' : '现在可免费布阵，种好植物后点击“开始迎战”'); return; }
    if (game.status !== 'playing') return;
    showDialog('pause', '<div class="result"><div class="dialog-eyebrow">TAKE A LITTLE BREAK</div><h2>小院歇一会儿</h2><p>你的植物正在等你回来。</p><button class="dialog-button" id="resume-game">继续守护 →</button><div class="shortcut-row">也可以按 <kbd>空格</kbd> 继续游戏</div></div>');
    $('resume-game').onclick = () => closeDialog();
  }
  function showResult(won) {
    updateMusic();
    const nextLevel = won && game.mode === 'adventure' && game.level < 3;
    showDialog('result', `<div class="result"><img class="result-icon" src="assets/${won ? 'SunFlower-single' : 'Zombie'}.gif" alt=""><div class="dialog-eyebrow">${won ? 'A LITTLE VICTORY FOR YOUR GARDEN' : 'EVERY GARDENER STARTS SOMEWHERE'}</div><h2>${won ? (game.bossChallenge ? '僵王已击败，小院守住了！' : game.freePlay ? '自由模式守护成功！' : game.level === 3 ? '完美守护，三关通关！' : '干得漂亮，小院安全了！') : '僵尸闯进了你的小院…'}</h2><p>${won ? '阳光、伙伴，还有一点点好策略。' : '试试多种向日葵，并让每一行都有射手保护。'}</p><div class="result-stats"><div><strong>${game.kills}</strong>击退僵尸</div><div><strong>${Math.floor(game.time / 60)}:${String(Math.floor(game.time % 60)).padStart(2, '0')}</strong>守护时长</div><div><strong>${game.mowers.filter(m => m.status === 'ready').length}</strong>剩余割草机</div></div><button class="dialog-button" id="next-game">${nextLevel ? '前往下一关 →' : '再守护一次 ↻'}</button><button class="dialog-button secondary" id="result-home">回到第一关</button></div>`);
    $('next-game').onclick = () => reset(nextLevel ? game.level + 1 : game.level);
    $('result-home').onclick = () => reset(1, 'adventure');
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-mode]');
    if (!button || !Object.hasOwn(modes, button.dataset.mode)) return;
    const mode = button.dataset.mode;
    if (game.mode === mode) { closeDialog(); return; }
    reset(mode === 'adventure' ? adventureLevel : 1, mode);
  });
  $('start').onclick = () => { game.start(); render(); };
  $('mobile-menu').onclick = () => {
    showDialog('menu', `<h2>庭院菜单</h2><div class="mobile-menu-grid">${[
      ['adventure', '选择关卡'], ['almanac', '植物图鉴'], ['help', '玩法指南'],
      ['sound', soundEnabled ? '关闭声音' : '开启声音'], ['fullscreen', '切换全屏'],
      ['restart', '重新开始'], ['credits', '关于游戏']
    ].map(([id, label]) => `<button class="dialog-button" data-menu-action="${id}">${label}</button>`).join('')}</div><p class="mobile-menu-hint">点卡片，再点草坪种植。左右滑动草坪查看防线，点缩略图快速定位；“全景”可看完整战场。横屏操作面积更大。切换模式会重新开始本局。</p><p class="developer-credit">游戏由乐一 Louis开发</p>`);
  };
  $('dialog-content').addEventListener('click', event => {
    const action = event.target.closest('[data-menu-action]');
    if (!action) return;
    closeDialog(); $(action.dataset.menuAction).click();
  });
  $('shovel').onclick = () => select('shovel');
  $('auto-collect').onclick = () => {
    autoCollectSun = !autoCollectSun; game.autoCollectSun = autoCollectSun;
    try { localStorage.setItem('pvz-auto-collect-sun', String(autoCollectSun)); } catch { /* The toggle still works without persistence. */ }
    play('buttonclick', 0.2); render();
  };
  $('pause').onclick = togglePause;
  $('close-dialog').onclick = () => closeDialog();
  $('dialog').addEventListener('cancel', e => { e.preventDefault(); closeDialog(); });
  $('dialog').addEventListener('click', e => { if (e.target === $('dialog')) { const r = $('dialog').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } });
  $('sound').onclick = () => {
    soundEnabled = !soundEnabled; $('sound').setAttribute('aria-pressed', String(soundEnabled)); $('sound').setAttribute('aria-label', soundEnabled ? '关闭声音' : '开启声音'); $('sound-label').textContent = soundEnabled ? '声音已开启' : '声音已关闭'; $('sound-icon').textContent = soundEnabled ? '♫' : '♪'; play('buttonclick'); updateMusic();
  };
  $('fullscreen').onclick = async () => {
    const shell = document.querySelector('.game-shell');
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (shell.requestFullscreen) await shell.requestFullscreen(); else toast('当前浏览器不支持全屏，可以横屏游玩'); } catch { toast('暂时无法进入全屏，可以使用浏览器全屏模式'); }
  };
  $('restart').onclick = () => {
    if (game.status === 'ready' && !game.plants.length) { toast(game.mode === 'adventure' ? '点击“开始冒险”进入游戏' : '小院已准备好，选择植物开始吧'); return; }
    showDialog('restart', '<div class="dialog-eyebrow">A FRESH START</div><h2>重新布置你的防线？</h2><p>本关将从准备阶段重新开始，已通关的记录会保留。</p><button class="dialog-button" id="confirm-restart">重新开始</button><button class="dialog-button secondary" id="cancel-restart">继续当前游戏</button>');
    $('confirm-restart').onclick = () => reset(); $('cancel-restart').onclick = () => closeDialog();
  };
  $('almanac').onclick = () => showDialog('almanac', `<div class="dialog-eyebrow">MEET YOUR GARDEN CREW</div><h2>小小植物，大有本领。</h2><p>认识你的七位庭院伙伴，搭配出自己的防守阵容。</p><div class="almanac-grid">${PLANTS.map(p => `<article class="almanac-entry"><img src="${plantSrc(p.id)}" alt="${p.name}"><div><h3>${p.name}</h3><small>${p.role} · ☀ ${p.cost} · 冷却 ${p.cooldown} 秒</small><p>${p.description}</p></div></article>`).join('')}</div>`);
  $('help').onclick = () => showDialog('help', '<div class="dialog-eyebrow">THE ART OF KEEPING ZOMBIES OUT</div><h2>欢迎来到你的小院。</h2><p>游戏上方可以直接切换冒险模式、自由模式和僵王挑战，切换后重新布阵。冒险模式击退三波僵尸；自由模式先免费布局，开战后迎战三波僵尸；僵王挑战需要击败僵王并清理援兵。</p><ol class="instructions"><li><strong>准备防线：</strong>冒险模式开始后按阳光费用与冷却种植；自由模式和僵王挑战可先免费、无冷却地布满草坪，神水滴射手也不限数量。</li><li><strong>收集阳光：</strong>阳光出现 1 秒后默认自动拾取，每颗增加 25 点。点击阳光储备下方的开关可切换手动拾取。向日葵也会产出阳光。</li><li><strong>开始迎战：</strong>点击开始按钮后，僵尸波次和植物计时才会启动。三个模式开战后补种都需要阳光，并有冷却；自由模式的免费布阵只在开战前生效。</li><li><strong>巧妙搭配：</strong>坚果挡在前面，寒冰减速，樱桃炸弹清理 3×3 区域。</li><li><strong>最后防线：</strong>每行割草机只能使用一次。用过后务必补上防线！</li></ol><div class="shortcut-row"><kbd>1–7</kbd> 选择植物 <kbd>S</kbd> 铲子 <kbd>空格</kbd> 暂停 / 继续 <kbd>Esc</kbd> 取消选择<br>手机支持点选种植，横屏可以看得更清楚。切换标签页会自动暂停。</div>');
  $('adventure').onclick = () => {
    showDialog('levels', `<div class="dialog-eyebrow">ONE GARDEN. THREE ADVENTURES.</div><h2>今天，也要守好小院。</h2><p>已通关 ${bestLevel} / 3 关。切换关卡将重新开始该关。</p>${[1, 2, 3].map(n => `<button class="dialog-button${n === game.level ? '' : ' secondary'}" data-level="${n}" ${n > bestLevel + 1 ? 'disabled' : ''}>${n > bestLevel + 1 ? '🔒 ' : ''}第 ${n} 关${n <= bestLevel ? ' ✓' : ''}</button>`).join('')}`);
    $('dialog-content').querySelectorAll('[data-level]').forEach(b => { b.onclick = () => reset(Number(b.dataset.level), 'adventure'); });
  };
  $('credits').onclick = () => showDialog('credits', '<div class="dialog-eyebrow">MADE FOR A LITTLE NOSTALGIA</div><h2>关于这个小院</h2><p>这是一个植物大战僵尸的非官方网页同人作品。采用独立编写的游戏引擎，还原经典白天庭院的核心玩法，包含冒险模式、自由模式、僵王挑战与七种植物。</p><p>角色、场景与音频素材来自 <a href="https://github.com/jiangnangame/New-Plants-vs-Zombies-JavaScript" target="_blank" rel="noopener noreferrer">JiangNanGame 的网页同人项目 ↗</a>；原作及相关素材权利归 PopCap / EA 等相应权利人所有。详细来源见项目 ASSETS.md。</p><p>所有运行素材保存在本地。无需账号，无需下载客户端，打开就能玩。</p>');
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Space') { if ($('dialog').open && dialogKind !== 'pause') return; e.preventDefault(); togglePause(); return; }
    if ($('dialog').open) return;
    if (/^[1-9]$/.test(e.key) && PLANTS[Number(e.key) - 1]) { e.preventDefault(); select(PLANTS[Number(e.key) - 1].id); }
    if (e.key.toLowerCase() === 's') { e.preventDefault(); select('shovel'); }
    if (e.key === 'Escape') { selected = null; updateSelection(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.status === 'playing') togglePause(); lastFrame = performance.now(); });
  $('scene').addEventListener('contextmenu', e => { e.preventDefault(); selected = null; updateSelection(); });
  function loop(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05); lastFrame = now;
    if (!$('dialog').open && !document.hidden) game.step(dt);
    render();
    if (now > toastUntil) $('toast').classList.remove('visible');
    for (const effect of effects) if (now > effect.until) { effect.el.remove(); effects.delete(effect); }
    requestAnimationFrame(loop);
  }
  // Explicitly opt-in test hook; normal URLs expose no mutable game state.
  if (new URLSearchParams(location.search).has('test')) window.__pvz = { get game() { return game; }, reset, render, advance(seconds) { for (let t = 0; t < seconds; t += 0.05) game.step(0.05); render(); } };
  updateSelection(); resize(); render(); requestAnimationFrame(loop);
})();
