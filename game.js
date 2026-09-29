/* =========================================================
   House of Pizza — enter, order, dodge!
   Plain JS, no dependencies. Works on GitHub Pages as-is.
   ========================================================= */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);

  /* ---------------- Screens ---------------- */
  const screens = {
    outside: $('#screen-outside'),
    order: $('#screen-order'),
    game: $('#screen-game'),
    result: $('#screen-result'),
  };
  let currentScreen = 'outside';
  function show(name) {
    Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
    currentScreen = name;
  }

  /* ---------------- Sound (tiny Web Audio synth, no files needed) ---------------- */
  let actx = null;
  let muted = localStorage.getItem('hop-muted') === '1';
  const muteBtn = $('#mute');
  muteBtn.textContent = muted ? '🔇' : '🔊';

  function ensureAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }

  function tone(freq, dur = 0.1, type = 'sine', vol = 0.12, slide = 0) {
    if (muted || !actx) return;
    const t = actx.currentTime;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  const later = (fn, ms) => setTimeout(fn, ms);
  const sfx = {
    tap: () => tone(660, 0.06, 'triangle', 0.1),
    door: () => { tone(200, 0.35, 'sawtooth', 0.05, -80); later(() => tone(1320, 0.25, 'sine', 0.1), 250); later(() => tone(1760, 0.35, 'sine', 0.08), 380); },
    ding: () => { tone(1320, 0.3, 'sine', 0.14); later(() => tone(1760, 0.45, 'sine', 0.12), 120); },
    whoosh: () => tone(520, 0.1, 'triangle', 0.07, -320),
    throw: () => tone(300, 0.08, 'sine', 0.04, 200),
    hit: () => { tone(180, 0.3, 'square', 0.14, -120); tone(90, 0.35, 'sawtooth', 0.1, -40); },
    coin: () => { tone(988, 0.07, 'square', 0.07); later(() => tone(1319, 0.16, 'square', 0.07), 70); },
    beep: (hi) => tone(hi ? 880 : 440, 0.15, 'square', 0.07),
    win: () => [523, 659, 784, 1047].forEach((f, i) => later(() => tone(f, 0.28, 'triangle', 0.14), i * 120)),
    lose: () => [392, 330, 262].forEach((f, i) => later(() => tone(f, 0.32, 'sawtooth', 0.08), i * 180)),
  };

  function buzz(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
  }

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem('hop-muted', muted ? '1' : '0');
    muteBtn.textContent = muted ? '🔇' : '🔊';
    ensureAudio();
    sfx.tap();
  });

  /* =========================================================
     1. OUTSIDE — tap the door
     ========================================================= */
  let entering = false;
  function enterRestaurant() {
    if (entering) return;
    entering = true;
    ensureAudio();
    sfx.door();
    buzz(30);
    $('#building').classList.add('opening');
    later(() => screens.outside.classList.add('zoom'), 450);
    later(() => {
      show('order');
      later(() => {
        $('#building').classList.remove('opening');
        screens.outside.classList.remove('zoom');
        entering = false;
      }, 500);
    }, 1300);
  }
  $('#door').addEventListener('click', enterRestaurant);
  $('#leave').addEventListener('click', () => { sfx.tap(); show('outside'); });

  /* =========================================================
     2. ORDER — build your pizza
     ========================================================= */
  const MENU = {
    size: [
      { id: 'S',  label: 'Small',   sub: '10"', price: 9.99,  time: 20, scale: 0.7 },
      { id: 'M',  label: 'Medium',  sub: '12"', price: 12.99, time: 25, scale: 0.8 },
      { id: 'L',  label: 'Large',   sub: '14"', price: 15.99, time: 30, scale: 0.9 },
      { id: 'XL', label: 'X-Large', sub: '16"', price: 18.99, time: 35, scale: 1.0 },
    ],
    crust: [
      { id: 'thin',    label: 'Thin',    price: 0, time: -3 },
      { id: 'hand',    label: 'Classic', price: 0, time: 0 },
      { id: 'deep',    label: 'Deep',    price: 2, time: 5 },
      { id: 'stuffed', label: 'Stuffed', price: 3, time: 3 },
    ],
    toppings: [
      { id: 'pep',    label: 'Pepperoni', emoji: '' },
      { id: 'mush',   label: 'Mushrooms', emoji: '🍄' },
      { id: 'pepper', label: 'Peppers',   emoji: '🫑' },
      { id: 'onion',  label: 'Onions',    emoji: '🧅' },
      { id: 'olive',  label: 'Olives',    emoji: '🫒' },
      { id: 'bacon',  label: 'Bacon',     emoji: '🥓' },
      { id: 'pine',   label: 'Pineapple', emoji: '🍍' },
      { id: 'jala',   label: 'Jalapeño',  emoji: '🌶️' },
      { id: 'tomato', label: 'Tomato',    emoji: '🍅' },
      { id: 'basil',  label: 'Basil',     emoji: '🌿' },
    ],
  };
  const TOPPING_PRICE = 1.5;
  const TIP_DISCOUNT = 0.25;

  const order = { size: 'M', crust: 'hand', toppings: new Set(['pep']) };
  const find = (group, id) => MENU[group].find((i) => i.id === id);

  const priceOf = () =>
    find('size', order.size).price + find('crust', order.crust).price + order.toppings.size * TOPPING_PRICE;
  const bakeTimeOf = () =>
    Math.round(find('size', order.size).time + find('crust', order.crust).time + order.toppings.size * 1.5);

  function buildChips() {
    document.querySelectorAll('.chips').forEach((wrap) => {
      const group = wrap.dataset.group;
      wrap.innerHTML = '';
      MENU[group].forEach((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.id = item.id;
        let html = '';
        if (group === 'toppings') html += item.emoji ? `<span class="ic">${item.emoji}</span>` : '<span class="ic pep-ic"></span>';
        html += `<span>${item.label}</span>`;
        if (group === 'size') html += `<small>${item.sub}</small>`;
        if (group === 'crust') html += `<small>${item.price ? '+$' + item.price.toFixed(2) : 'free'}</small>`;
        b.innerHTML = html;
        b.addEventListener('click', () => {
          ensureAudio();
          sfx.tap();
          buzz(8);
          if (group === 'toppings') {
            if (order.toppings.has(item.id)) order.toppings.delete(item.id);
            else order.toppings.add(item.id);
          } else {
            order[group] = item.id;
          }
          refreshOrder();
        });
        wrap.appendChild(b);
      });
    });
  }

  function renderPreview() {
    const pz = $('#pizza');
    pz.style.setProperty('--scale', find('size', order.size).scale);
    pz.className = 'pizza crust-' + order.crust;
    pz.innerHTML = '';
    let ti = 0;
    MENU.toppings.forEach((t) => {
      if (!order.toppings.has(t.id)) return;
      const n = 5;
      for (let k = 0; k < n; k++) {
        const ang = ((k * 360) / n + ti * 29) * (Math.PI / 180);
        const r = 10 + ((k + ti) % 3) * 11;
        const el = document.createElement('span');
        el.className = 'top' + (t.emoji ? '' : ' pep');
        if (t.emoji) el.textContent = t.emoji;
        el.style.left = 50 + r * Math.cos(ang) + '%';
        el.style.top = 50 + r * Math.sin(ang) + '%';
        el.style.animationDelay = k * 30 + 'ms';
        pz.appendChild(el);
      }
      ti++;
    });
  }

  function refreshOrder() {
    document.querySelectorAll('.chips').forEach((wrap) => {
      const group = wrap.dataset.group;
      wrap.querySelectorAll('.chip').forEach((c) => {
        const on = group === 'toppings' ? order.toppings.has(c.dataset.id) : order[group] === c.dataset.id;
        c.classList.toggle('on', on);
      });
    });
    $('#total').textContent = priceOf().toFixed(2);
    $('#bake-time').textContent = bakeTimeOf();
    renderPreview();
  }

  $('#place-order').addEventListener('click', () => {
    ensureAudio();
    sfx.ding();
    buzz([20, 40, 20]);
    startGame();
  });

  /* =========================================================
     3. GAME — dodge the flying pizzas while your order bakes
     ========================================================= */
  const cvs = $('#game');
  const ctx = cvs.getContext('2d');
  const LANES = 3;
  const MAX_LIVES = 3;

  let W = 0, H = 0, DPR = 1, laneW = 0, unit = 0, hudBottom = 60, safeBottom = 0;
  let sprites = {};
  let G = null;
  let rafId = 0;
  let lastTs = 0;
  let paused = false;
  let cdTimer = 0;

  const laneX = (i) => laneW * (i + 0.5);
  const counterY = () => hudBottom + unit * 1.05;
  const playerY = () => H - safeBottom - unit * 0.95;
  const rand = (a, b) => a + Math.random() * (b - a);

  function makeSprite(emoji, size) {
    const c = document.createElement('canvas');
    const s = Math.ceil(size * 1.35 * DPR);
    c.width = c.height = s;
    const x = c.getContext('2d');
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `${Math.round(size * DPR)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    x.fillText(emoji, s / 2, s / 2 + size * DPR * 0.06);
    return c;
  }

  function buildSprites() {
    sprites = {
      pizza: makeSprite('🍕', unit),
      tip: makeSprite('💵', unit * 0.8),
      player: makeSprite('🏃', unit),
      ouch: makeSprite('😵', unit * 0.9),
      chef: makeSprite('👨‍🍳', unit * 1.05),
      party: makeSprite('🥳', unit * 0.95),
    };
  }

  function drawSprite(img, x, y, size, rot = 0, flip = false, sx = 1, sy = 1) {
    const s = size * 1.35;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(flip ? -sx : sx, sy);
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  function resize() {
    const r = screens.game.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    W = r.width;
    H = r.height;
    cvs.width = Math.round(W * DPR);
    cvs.height = Math.round(H * DPR);
    cvs.style.width = W + 'px';
    cvs.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    laneW = W / LANES;
    unit = Math.max(40, Math.min(laneW * 0.55, H * 0.1, 100));
    hudBottom = $('.hud').getBoundingClientRect().bottom - r.top;
    safeBottom = parseFloat(getComputedStyle(screens.game).paddingBottom) || 0;
    buildSprites();
    if (G) { G.px = laneX(G.lane); G.chefX = laneX(G.chefLane); }
  }
  window.addEventListener('resize', () => { if (currentScreen === 'game') resize(); });
  window.addEventListener('orientationchange', () => later(() => { if (currentScreen === 'game') resize(); }, 250));

  function newGame() {
    G = {
      t: 0,
      bake: bakeTimeOf(),
      lives: MAX_LIVES,
      score: 0,
      dodged: 0,
      tips: 0,
      lane: 1,
      px: laneX(1),
      face: 1,
      dash: 0,
      chefLane: 1,
      chefX: laneX(1),
      chefThrow: 0,
      items: [],
      particles: [],
      floats: [],
      spawnT: 0.8,
      tipT: rand(3, 5),
      lastSpawnT: -10,
      lastWasDouble: false,
      inv: 0,
      shake: 0,
      running: false,
      over: false,
      win: false,
    };
  }

  function updateHUD() {
    $('#lives').textContent = '❤️'.repeat(G.lives) + '🤍'.repeat(MAX_LIVES - G.lives);
    $('#score').textContent = G.score;
  }

  function updateBakeBar() {
    const p = Math.min(1, G.t / G.bake);
    $('#bake-fill').style.transform = `scaleX(${p})`;
    const left = Math.max(0, Math.ceil(G.bake - G.t));
    $('#bake-label').textContent = left > 0 ? `🔥 Baking… ${left}s` : '🍕 Ready!';
  }

  function startGame() {
    clearTimeout(cdTimer);
    show('game');
    requestAnimationFrame(() => {
      resize();
      newGame();
      paused = false;
      updateHUD();
      updateBakeBar();
      $('#tutorial').classList.remove('hide');
      countdown();
      if (!rafId) {
        lastTs = performance.now();
        rafId = requestAnimationFrame(loop);
      }
    });
  }

  function countdown() {
    const el = $('#countdown');
    const steps = ['3', '2', '1', 'DODGE!'];
    let i = 0;
    const tick = () => {
      if (i < steps.length) {
        el.textContent = steps[i];
        el.classList.remove('pop');
        void el.offsetWidth; // restart CSS animation
        el.classList.add('pop');
        sfx.beep(i === steps.length - 1);
        i++;
        cdTimer = setTimeout(tick, i === steps.length ? 500 : 650);
      } else {
        el.textContent = '';
        $('#tutorial').classList.add('hide');
        if (G) G.running = true;
      }
    };
    tick();
  }

  /* ---------------- Input ---------------- */
  function move(dir) {
    if (!G || !G.running || paused) return;
    const nl = Math.max(0, Math.min(LANES - 1, G.lane + dir));
    G.face = dir;
    if (nl === G.lane) { G.dash = 0.08; return; }
    G.lane = nl;
    G.dash = 0.16;
    sfx.whoosh();
    buzz(6);
  }

  cvs.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ensureAudio();
    if (!G) return;
    if (paused) { paused = false; lastTs = performance.now(); return; }
    const r = cvs.getBoundingClientRect();
    move(e.clientX - r.left < r.width / 2 ? -1 : 1);
  }, { passive: false });

  // Stop iOS long-press / double-tap zoom on the play field
  cvs.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (currentScreen === 'game') {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') move(-1);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') move(1);
      else if ((e.key === ' ' || e.key === 'p') && G && G.running) paused = !paused;
    } else if (currentScreen === 'outside' && (e.key === 'Enter' || e.key === ' ')) {
      enterRestaurant();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G && G.running) paused = true;
  });

  /* ---------------- Spawning ---------------- */
  function spawnPizzas(p) {
    const g = G;
    const sinceLast = g.t - g.lastSpawnT;
    const canDouble = !g.lastWasDouble && sinceLast > 0.6;
    const isDouble = canDouble && Math.random() < 0.12 + p * 0.4;

    let lanes;
    if (isDouble) {
      const free = Math.floor(Math.random() * LANES);
      lanes = [0, 1, 2].filter((l) => l !== free);
    } else {
      // Chef Tony likes to aim at you
      lanes = [Math.random() < 0.45 ? g.lane : Math.floor(Math.random() * LANES)];
    }

    lanes.forEach((l) => {
      g.items.push({
        type: 'pizza',
        lane: l,
        x: laneX(l),
        y: counterY() - unit * 0.2,
        rot: rand(0, Math.PI * 2),
        spin: rand(4, 9) * (Math.random() < 0.5 ? -1 : 1),
        speedMul: 1,
      });
    });

    g.chefLane = lanes[0];
    g.chefThrow = 0.25;
    g.lastSpawnT = g.t;
    g.lastWasDouble = isDouble;
    sfx.throw();
    return isDouble;
  }

  function spawnTip() {
    const l = Math.floor(Math.random() * LANES);
    G.items.push({
      type: 'tip', lane: l, x: laneX(l), y: counterY() - unit * 0.2,
      rot: 0, spin: 0, speedMul: 0.7, wob: rand(0, 6),
    });
  }

  /* ---------------- Effects ---------------- */
  function splat(x, y) {
    const colors = ['#d62828', '#f77f00', '#ffd166', '#9d0208'];
    for (let i = 0; i < 22; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(80, 320);
      G.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120,
        r: rand(3, 8), life: rand(0.5, 0.9), max: 0.9,
        color: colors[i % colors.length], g: 700,
      });
    }
  }

  function confetti() {
    const colors = ['#d62828', '#f6bd60', '#2d6a4f', '#ffffff', '#f77f00'];
    for (let i = 0; i < 90; i++) {
      G.particles.push({
        x: rand(0, W), y: rand(-H * 0.3, 0),
        vx: rand(-60, 60), vy: rand(80, 260),
        r: rand(3, 6), life: rand(1.5, 2.6), max: 2.6,
        color: colors[i % colors.length], g: 120, square: true, rot: rand(0, 6),
      });
    }
  }

  function addFloat(text, x, y, color) {
    G.floats.push({ text, x, y, color, life: 0.9 });
  }

  /* ---------------- Update ---------------- */
  function update(dt) {
    const g = G;

    // Particles & floating text keep animating even after the round ends
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const p = g.particles[i];
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.rot !== undefined) p.rot += dt * 8;
      if (p.life <= 0) g.particles.splice(i, 1);
    }
    for (let i = g.floats.length - 1; i >= 0; i--) {
      const f = g.floats[i];
      f.y -= 60 * dt;
      f.life -= dt;
      if (f.life <= 0) g.floats.splice(i, 1);
    }
    g.shake = Math.max(0, g.shake - dt);
    g.dash = Math.max(0, g.dash - dt);
    g.chefThrow = Math.max(0, g.chefThrow - dt);
    g.px += (laneX(g.lane) - g.px) * Math.min(1, dt * 20);
    g.chefX += (laneX(g.chefLane) - g.chefX) * Math.min(1, dt * 10);

    if (!g.running) return;

    g.t += dt;
    g.inv = Math.max(0, g.inv - dt);
    const p = Math.min(1, g.t / g.bake);

    // Spawning — gets faster as the pizza bakes
    g.spawnT -= dt;
    if (g.spawnT <= 0 && g.t < g.bake - 0.8) {
      const wasDouble = spawnPizzas(p);
      let next = Math.max(0.42, 1.15 - p * 0.7) * rand(0.85, 1.15);
      if (wasDouble) next = Math.max(next, 0.65);
      g.spawnT = next;
    }
    g.tipT -= dt;
    if (g.tipT <= 0) { spawnTip(); g.tipT = rand(3, 6); }

    const speed = H / (2.4 - 1.25 * p);
    const py = playerY();

    for (let i = g.items.length - 1; i >= 0; i--) {
      const it = g.items[i];
      it.y += speed * it.speedMul * dt;
      it.rot += it.spin * dt;

      const closeX = Math.abs(it.x - g.px) < laneW * 0.36;
      const closeY = Math.abs(it.y - py) < unit * 0.55;

      if (closeX && closeY) {
        if (it.type === 'tip') {
          g.tips++;
          g.score += 50;
          sfx.coin();
          buzz(10);
          addFloat('+50 💵', it.x, it.y - unit * 0.5, '#2d6a4f');
          g.items.splice(i, 1);
          updateHUD();
          continue;
        } else if (g.inv <= 0) {
          g.lives--;
          g.inv = 1.3;
          g.shake = 0.35;
          sfx.hit();
          buzz([70, 40, 70]);
          splat(it.x, py);
          addFloat('SPLAT!', g.px, py - unit, '#d62828');
          g.items.splice(i, 1);
          updateHUD();
          if (g.lives <= 0) { endGame(false); return; }
          continue;
        }
      }

      if (it.y > H + unit) {
        if (it.type === 'pizza') {
          g.dodged++;
          g.score += 10;
          updateHUD();
        }
        g.items.splice(i, 1);
      }
    }

    updateBakeBar();
    if (g.t >= g.bake) endGame(true);
  }

  function endGame(win) {
    const g = G;
    g.running = false;
    g.over = true;
    g.win = win;
    g.items = g.items.filter((it) => it.type !== 'pizza' || !win);
    if (win) {
      g.score += 500 + g.lives * 150;
      sfx.win();
      buzz([30, 50, 30, 50, 80]);
      confetti();
      addFloat('ORDER UP!', W / 2, H * 0.45, '#d62828');
    } else {
      sfx.lose();
    }
    updateHUD();
    later(showResult, win ? 1800 : 1300);
  }

  /* ---------------- Render ---------------- */
  function render() {
    if (!G) return;
    const g = G;
    ctx.save();
    if (g.shake > 0) {
      const m = g.shake * 20;
      ctx.translate(rand(-m, m), rand(-m, m));
    }

    // Scrolling checkered kitchen floor
    const tile = Math.max(32, laneW / 3);
    const scroll = g.t * H * 0.3;
    const off = scroll % (tile * 2);
    ctx.fillStyle = '#f3e3c3';
    ctx.fillRect(-30, -30, W + 60, H + 60);
    ctx.fillStyle = '#e6c998';
    for (let y = -tile * 2 + off, row = 0; y < H + tile; y += tile, row++) {
      for (let x = 0, c = 0; x < W; x += tile, c++) {
        if ((c + row) % 2 === 0) ctx.fillRect(x, y, tile + 0.5, tile + 0.5);
      }
    }

    // Lane dividers
    ctx.save();
    ctx.strokeStyle = 'rgba(120,60,20,.28)';
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 16]);
    ctx.lineDashOffset = -off;
    for (let i = 1; i < LANES; i++) {
      ctx.beginPath();
      ctx.moveTo(laneW * i, counterY());
      ctx.lineTo(laneW * i, H);
      ctx.stroke();
    }
    ctx.restore();

    // Counter / oven area at top
    const cy = counterY();
    const ovenGrad = ctx.createLinearGradient(0, 0, 0, cy);
    ovenGrad.addColorStop(0, '#3a1f12');
    ovenGrad.addColorStop(1, '#6b3a1f');
    ctx.fillStyle = ovenGrad;
    ctx.fillRect(-30, -30, W + 60, cy + 30);
    // oven mouth glow
    const glow = ctx.createRadialGradient(W / 2, cy - unit * 0.2, 5, W / 2, cy - unit * 0.2, W * 0.45);
    glow.addColorStop(0, `rgba(255,140,40,${0.45 + Math.sin(g.t * 6) * 0.08})`);
    glow.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, cy);
    // chef
    const bob = Math.sin(g.t * 8) * 3;
    const throwLift = g.chefThrow > 0 ? -8 : 0;
    drawSprite(sprites.chef, g.chefX, cy - unit * 0.55 + bob + throwLift, unit * 1.05);
    // counter edge
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(-30, cy - 10, W + 60, 10);
    ctx.fillStyle = '#fff';
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, cy - 10, 12, 10);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(-30, cy, W + 60, 6);

    // Falling items
    for (const it of g.items) {
      // lane shadow hint so players can read incoming pizzas
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.beginPath();
      ctx.ellipse(it.x, it.y + unit * 0.45, unit * 0.32, unit * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      if (it.type === 'pizza') {
        drawSprite(sprites.pizza, it.x, it.y, unit, it.rot);
      } else {
        drawSprite(sprites.tip, it.x + Math.sin(g.t * 5 + it.wob) * 6, it.y, unit * 0.8, Math.sin(g.t * 4 + it.wob) * 0.3);
      }
    }

    // Player
    const py = playerY();
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(g.px, py + unit * 0.5, unit * 0.38, unit * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    const blink = g.inv > 0 && Math.floor(g.inv * 14) % 2 === 0;
    if (!blink) {
      const stretch = g.dash > 0 ? 1 + g.dash * 1.6 : 1;
      const squash = g.dash > 0 ? 1 - g.dash * 0.9 : 1;
      const run = g.running ? Math.abs(Math.sin(g.t * 14)) * 4 : 0;
      let img = sprites.player;
      if (g.inv > 0.7) img = sprites.ouch;
      if (g.over && g.win) img = sprites.party;
      // 🏃 faces left by default; flip when heading right
      drawSprite(img, g.px, py - run, unit, 0, img === sprites.player && g.face > 0, stretch, squash);
    }

    // Particles
    for (const p of g.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      ctx.fillStyle = p.color;
      if (p.square) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Floating text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of g.floats) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = `900 ${Math.round(unit * 0.42)}px system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Pause overlay
    if (paused) {
      ctx.fillStyle = 'rgba(20,10,5,.65)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.round(unit * 0.5)}px system-ui, sans-serif`;
      ctx.fillText('⏸ Paused', W / 2, H / 2 - unit * 0.3);
      ctx.font = `600 ${Math.round(unit * 0.28)}px system-ui, sans-serif`;
      ctx.fillText('Tap to keep dodging', W / 2, H / 2 + unit * 0.35);
    }
  }

  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
    lastTs = ts;
    if (G && !paused) update(dt);
    render();
  }

  /* =========================================================
     4. RESULT
     ========================================================= */
  function showResult() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    const g = G;
    const size = find('size', order.size);
    const crust = find('crust', order.crust);

    const prevBest = +localStorage.getItem('hop-best') || 0;
    const best = Math.max(prevBest, g.score);
    localStorage.setItem('hop-best', best);

    $('#result-emoji').textContent = g.win ? '🍕' : '💥';
    $('#result-title').textContent = g.win ? 'Order Up!' : 'You Got Sauced!';
    $('#result-text').textContent = g.win
      ? `You dodged ${g.dodged} pizzas and your ${size.label.toLowerCase()} is hot and ready. Mangia!`
      : `Chef Tony's aim was too good. You lasted ${Math.floor(g.t)}s of a ${g.bake}s bake.`;

    const money = (n) => '$' + n.toFixed(2);
    const discount = Math.min(priceOf(), g.tips * TIP_DISCOUNT);
    const rows = [
      `<div class="head">🍕 HOUSE OF PIZZA 🍕<br>Order #${Math.floor(rand(1000, 9999))}</div>`,
      `<div class="row"><span>${size.label} ${size.sub}</span><span>${money(size.price)}</span></div>`,
      `<div class="row"><span>${crust.label} crust</span><span>${money(crust.price)}</span></div>`,
    ];
    MENU.toppings.forEach((t) => {
      if (order.toppings.has(t.id)) {
        rows.push(`<div class="row"><span>+ ${t.label}</span><span>${money(TOPPING_PRICE)}</span></div>`);
      }
    });
    if (discount > 0) {
      rows.push(`<div class="row disc"><span>Dodge discount 💵×${g.tips}</span><span>-${money(discount)}</span></div>`);
    }
    rows.push('<div class="sep"></div>');
    rows.push(`<div class="row tot"><span>TOTAL</span><span>${money(priceOf() - discount)}</span></div>`);
    rows.push(`<div class="row"><span>Status</span><span>${g.win ? '✅ Ready for pickup' : '🔥 Still in the oven'}</span></div>`);
    $('#receipt').innerHTML = rows.join('');

    $('#final-score').textContent = g.score;
    $('#best-score').textContent = best;
    $('#new-best').classList.toggle('show', g.score > prevBest && g.score > 0);
    $('#retry').textContent = g.win ? 'Dodge Again' : 'Try Again';

    show('result');
  }

  $('#retry').addEventListener('click', () => { ensureAudio(); sfx.tap(); startGame(); });
  $('#play-again').addEventListener('click', () => { ensureAudio(); sfx.tap(); show('order'); });

  /* ---------------- Boot ---------------- */
  buildChips();
  refreshOrder();
})();
