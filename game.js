document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const healthEl = document.getElementById('health');
  const overlayCard = overlay.querySelector('.overlay-card');

  const W = canvas.width, H = canvas.height;

  // Three visual realms that repeat as the player advances infinitely.
  const realms = [
    {
      name: 'Dragonstone',
      top: '#163d55',
      bottom: '#8b9a9d',
      accent: '#e8bd69',
      speed: 3.2,
      hazard: '♜'
    },
    {
      name: 'The Burning Coast',
      top: '#662e35',
      bottom: '#d47d4e',
      accent: '#ffd18a',
      speed: 4.4,
      hazard: '🔥'
    },
    {
      name: 'The Frozen North',
      top: '#172d50',
      bottom: '#8cb7ca',
      accent: '#d9f4ff',
      speed: 5.7,
      hazard: '❄'
    }
  ];

  let dragon, items, obstacles, particles, playerShots, enemyShots, boss;
  let upgrades, health, maxHealth, damage, moveSpeed, shotCooldown, fireInterval;
  let autoFire, shieldCharges, regenTimer, slashWarning;
  let score, level, lives, running, paused, gameOver;
  let lastTime, itemTimer, obstacleTimer, obstacleBurstTimer, best;
  let upgradeThreshold = 150;
  let bossThreshold = 1000;
  let pendingBoss = false;
  let queuedBosses = 0;
  let bossNumber = 0;
  let gameTime = 0;
  let totalCollisions = 0;
  const keys = {};

  try {
    best = Number(localStorage.getItem('dragonBest') || 0);
  } catch (_) {
    best = 0;
  }

  bestEl.textContent = best;

  // Start or restart the game.
  function resetGame() {
    dragon = {
      x: 105,
      y: H / 2 - 20,
      w: 48,
      h: 40,
      invincible: 0,
      multiShot: false
    };

    items = [];
    obstacles = [];
    particles = [];
    playerShots = [];
    enemyShots = [];
    boss = null;
    upgrades = [];
    health = maxHealth = 100;
    damage = 1;
    moveSpeed = 5;
    shotCooldown = 0;
    fireInterval = 260;
    autoFire = false;
    shieldCharges = 0;
    regenTimer = 0;
    slashWarning = 0;
    upgradeThreshold = 150;
    bossThreshold = 1000;
    pendingBoss = false;
    queuedBosses = 0;
    bossNumber = 0;
    gameTime = 0;

    score = 0;
    level = 1;
    lives = 3;
    totalCollisions = 0;
    if (window.difficultyAgent && typeof window.difficultyAgent.reset === 'function') {
      window.difficultyAgent.reset();
    }

    running = true;
    paused = false;
    gameOver = false;

    lastTime = performance.now();
    itemTimer = 0;
    obstacleTimer = 0;
    obstacleBurstTimer = 0;

    overlay.classList.add('hidden');
    pauseBtn.textContent = 'PAUSE';
    pauseBtn.disabled = false;
    startBtn.textContent = 'START GAME';

    updateHud();
    requestAnimationFrame(loop);
  }

  // Update the score, level, lives, and high score.
  function updateHud() {
    scoreEl.textContent = score;
    levelEl.textContent = `${level} — ${currentRealm().name}`;
    livesEl.textContent =
      `${'♥ '.repeat(lives).trim()}` +
      `${lives < 3 ? '♡ '.repeat(3 - lives).trim() : ''}`;
    if (healthEl) healthEl.textContent = `${Math.ceil(health)} / ${maxHealth}`;
    bestEl.textContent = best;
  }

  // Cycle through the three realms without limiting the level.
  function currentRealm() {
    return realms[(level - 1) % realms.length];
  }

  // Advance one level for every 100 points.
  function levelCheck() {
    const next = Math.floor(score / 100) + 1;

    if (next > level) {
      level = next;

      // Create a visual burst when the player reaches a new level.
      for (let i = 0; i < 30; i++) {
        particles.push({
          x: W * 0.55,
          y: H / 2,
          vx: (Math.random() - 0.5) * 7,
          vy: (Math.random() - 0.5) * 7,
          life: 50,
          color: currentRealm().accent
        });
      }
    }
  }

  function addScore(points) {
    score += points;
    const nextLevel = Math.floor(score / 100) + 1;
    if (nextLevel > level) {
      level = nextLevel;
      for (let i = 0; i < 30; i++) {
        particles.push({
          x: W * 0.55, y: H / 2,
          vx: (Math.random() - 0.5) * 7,
          vy: (Math.random() - 0.5) * 7,
          life: 50, color: currentRealm().accent
        });
      }
    }
    checkMilestones();
    updateHud();
  }

  function checkMilestones() {
    const upgradeDue = score >= upgradeThreshold && running && !gameOver;
    if (score >= bossThreshold) {
      bossThreshold += 1000;
      if (boss) queuedBosses++;
      else pendingBoss = true;
    }
    if (pendingBoss && !boss && !upgradeDue) {
      pendingBoss = false;
      startBoss();
    }
    if (upgradeDue) {
      upgradeThreshold += 150;
      showUpgradeChoice();
    }
  }

  const upgradePool = [
    { id: 'speed', name: 'Swift Wings', detail: 'Move 18% faster', apply: () => { moveSpeed *= 1.18; } },
    { id: 'damage', name: 'Dragonfire Core', detail: 'Deal 1.5× damage', apply: () => { damage *= 1.5; } },
    { id: 'health', name: 'Vitality', detail: '+30 max health and restore 30', apply: () => { maxHealth += 30; health = Math.min(maxHealth, health + 30); } },
    { id: 'auto', name: 'Flame Familiar', detail: 'Automatically fire at nearby threats', apply: () => { autoFire = true; } },
    { id: 'shield', name: 'Scale Shield', detail: 'Block the next 2 hits', apply: () => { shieldCharges += 2; } },
    { id: 'regen', name: 'Ancient Renewal', detail: 'Regenerate health over time', apply: () => { regenTimer = Math.max(regenTimer, 30000); } },
    { id: 'multishot', name: 'Twin Flame', detail: 'Fire 3 shots in a spread', apply: () => { dragon.multiShot = true; } },
    { id: 'rapid', name: 'Rapid Breath', detail: 'Fire attacks recharge 35% faster', apply: () => { fireInterval = Math.max(90, fireInterval * 0.65); } }
  ];

  function showUpgradeChoice() {
    if (!running || gameOver) return;
    paused = true;
    const choices = [...upgradePool].sort(() => Math.random() - 0.5).slice(0, 3);
    overlay.classList.remove('hidden');
    overlayTitle.textContent = 'Choose an upgrade';
    overlayText.textContent = `Milestone reached: ${score} points. Select one power for your dragon.`;
    const oldButton = overlayCard.querySelector('#startBtn');
    if (oldButton) oldButton.remove();
    const holder = document.createElement('div');
    holder.className = 'upgrade-options';
    choices.forEach(choice => {
      const button = document.createElement('button');
      button.className = 'upgrade-option';
      button.innerHTML = `<strong>${choice.name}</strong><span>${choice.detail}</span>`;
      button.addEventListener('click', () => {
        choice.apply();
        upgrades.push(choice.name);
        overlayCard.querySelector('.upgrade-options')?.remove();
        const continueBtn = overlayCard.querySelector('#startBtn');
        if (continueBtn) continueBtn.remove();
        if (pendingBoss && !boss) {
          pendingBoss = false;
          startBoss();
          updateHud();
          return;
        }
        paused = false;
        overlay.classList.add('hidden');
        pauseBtn.textContent = 'PAUSE';
        pauseBtn.disabled = false;
        startBtn.textContent = 'START GAME';
        updateHud();
        lastTime = performance.now();
        requestAnimationFrame(loop);
      }, { once: true });
      holder.appendChild(button);
    });
    overlayCard.appendChild(holder);
    pauseBtn.textContent = 'PAUSED';
    pauseBtn.disabled = true;
  }

  function startBoss() {
    bossNumber++;
    boss = {
      x: W - 125, y: H / 2 - 65, w: 155, h: 125,
      hp: 120 + bossNumber * 45,
      maxHp: 120 + bossNumber * 45,
      attackTimer: 700, slashTimer: 3600,
      phase: 0, hitFlash: 0
    };
    enemyShots = [];
    overlay.classList.remove('hidden');
    overlayTitle.textContent = `Dragon boss ${bossNumber}`;
    overlayText.textContent = 'An enemy dragon has entered the skies. Dodge its fire and strike back!';
    const old = overlayCard.querySelector('#startBtn');
    if (old) old.remove();
    const btn = document.createElement('button');
    btn.id = 'bossContinueBtn';
    btn.textContent = 'FACE THE BOSS';
    btn.addEventListener('click', () => {
      btn.remove();
      paused = false;
      overlay.classList.add('hidden');
      pauseBtn.textContent = 'PAUSE';
      pauseBtn.disabled = false;
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }, { once: true });
    overlayCard.appendChild(btn);
    paused = true;
    pauseBtn.textContent = 'PAUSED';
    pauseBtn.disabled = true;
  }
    function firePlayerShot() {
    const y = dragon.y + dragon.h / 2;
    const base = { x: dragon.x + dragon.w - 2, y, r: 7, vx: 8 + level * 0.12, damage: damage * 12 };
    if (dragon.multiShot) {
      [-0.18, 0, 0.18].forEach(angle => playerShots.push({ ...base, vy: Math.sin(angle) * 8 }));
    } else {
      playerShots.push({ ...base, vy: 0 });
    }
  }

  function damagePlayer(amount = 25) {
    if (dragon.invincible > 0) return;
    if (shieldCharges > 0) {
      shieldCharges--;
      dragon.invincible = 70;
      return;
    }
    health -= amount;
    totalCollisions++;
    dragon.invincible = 75;
    if (health <= 0) {
      lives--;
      health = lives > 0 ? Math.max(40, maxHealth * 0.6) : 0;
    }
    if (lives <= 0) {
      updateHud();
      endGame();
    } else {
      updateHud();
    }
    for (let i = 0; i < 14; i++) {
      particles.push({ x: dragon.x + 20, y: dragon.y + 20,
        vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
        life: 35, color: '#ff866e' });
    }
  }

  function drawBoss() {
    if (!boss) return;
    ctx.save();
    ctx.translate(boss.x + boss.w / 2, boss.y + boss.h / 2);
    ctx.scale(-1, 1);
    ctx.shadowColor = '#ff4b28';
    ctx.shadowBlur = boss.hitFlash > 0 ? 30 : 16;
    ctx.fillStyle = boss.hitFlash > 0 ? '#fff0cf' : '#32111c';
    ctx.strokeStyle = '#ff7548';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-65, -10); ctx.lineTo(-105, -62); ctx.lineTo(-87, -4);
    ctx.lineTo(-115, 28); ctx.lineTo(-55, 35); ctx.lineTo(35, 35);
    ctx.lineTo(100, 15); ctx.lineTo(70, -38); ctx.lineTo(54, 5);
    ctx.lineTo(15, -48); ctx.lineTo(5, -4); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a82d27';
    ctx.beginPath(); ctx.ellipse(8, 18, 57, 31, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcf75';
    ctx.beginPath(); ctx.arc(52, -5, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#250d15';
    ctx.fillRect(boss.x - 8, boss.y - 18, boss.w + 16, 9);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(boss.x - 8, boss.y - 18, (boss.w + 16) * Math.max(0, boss.hp / boss.maxHp), 9);
    ctx.fillStyle = '#fff1d9';
    ctx.font = '11px Inter,Arial';
    ctx.fillText(`BOSS ${Math.ceil(boss.hp)} / ${boss.maxHp}`, boss.x - 8, boss.y - 24);
  }

  // Create a collectible.
  function spawnItem() {
    items.push({
      x: W + 25,
      y: 35 + Math.random() * (H - 70),
      r: 13,
      spin: Math.random() * 6
    });
  }

  // Create an obstacle.
  function spawnObstacle() {
    obstacles.push({
      x: W + 30,
      y: 35 + Math.random() * (H - 70),
      r: 20,
phase: Math.random() * Math.PI * 2,
type: Math.random() < 0.5 ? 0 : 1
    });
  }

  // Check whether two rectangular areas collide.
  function hit(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  // Draw the current realm's background.
  function drawBackground() {
    const r = currentRealm();

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, r.top);
    grad.addColorStop(1, r.bottom);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Stars, embers, or snow.
    for (let i = 0; i < 55; i++) {
      const x = (i * 137 + 29) % W;
      const y = (i * 71 + 17) % H;

      ctx.globalAlpha = 0.18 + (i % 4) * 0.12;
      ctx.fillStyle = r.accent;

      ctx.beginPath();
      ctx.arc(x, y, i % 7 === 0 ? 2 : 1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Distant mountains.
    ctx.fillStyle = '#11152166';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.68);

    for (let x = 0; x <= W; x += 80) {
      ctx.lineTo(
        x,
        H * (0.48 + ((x / 80) % 3) * 0.06)
      );
    }

    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // Castle silhouettes.
    ctx.fillStyle = '#17141d88';

    for (let i = 0; i < 8; i++) {
      const x = i * 115 + 20;
      const base = H * 0.78;
      const h = 55 + (i % 3) * 25;

      ctx.fillRect(x, base - h, 28, h);
      ctx.fillRect(x - 7, base - h - 12, 42, 14);

      for (let k = 0; k < 3; k++) {
        ctx.fillRect(x + k * 11, base - h - 20, 5, 10);
      }
    }

    // Ground.
    ctx.fillStyle = '#120f19aa';
    ctx.fillRect(0, H - 26, W, 26);

    ctx.fillStyle = r.accent;
    ctx.font = '12px Georgia';
    ctx.fillText(r.name.toUpperCase(), 18, H - 9);
  }

  // Draw the dragon and evolve its appearance every five levels.
  function drawDragon() {
    const x = dragon.x;
    const y = dragon.y;

    ctx.save();

    ctx.translate(
      x + dragon.w / 2,
      y + dragon.h / 2
    );

    // Evolution increases at levels 6, 11, 16, 21, and so on.
    const evolution = Math.floor((level - 1) / 5);

    const trimColors = [
      '#e3b86b',
      '#ff8a45',
      '#c8b7ff',
      '#7de8ff',
      '#ff4f8b'
    ];

    const trim =
      trimColors[Math.min(evolution, trimColors.length - 1)];

    const glow = Math.min(24, 4 + evolution * 3);

    ctx.shadowColor = trim;
    ctx.shadowBlur = glow;

    // Evolved dragons have darker wings and stronger outlines.
    ctx.fillStyle = evolution >= 2 ? '#401526' : '#2a1118';
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.4 + Math.min(evolution * 0.2, 1.2);

    // Left wing.
    ctx.beginPath();
    ctx.moveTo(-7, -3);
    ctx.lineTo(-25, -26);
    ctx.lineTo(-21, -5);
    ctx.lineTo(-37, -14);
    ctx.lineTo(-26, 7);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right wing.
    ctx.beginPath();
    ctx.moveTo(2, -3);
    ctx.lineTo(20, -27);
    ctx.lineTo(18, -5);
    ctx.lineTo(34, -13);
    ctx.lineTo(25, 8);
    ctx.lineTo(5, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Body.
    ctx.fillStyle = '#2d6b55';
    ctx.beginPath();
    ctx.ellipse(0, 6, 20, 11, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Tail.
    ctx.strokeStyle = '#2d6b55';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-15, 9);
    ctx.quadraticCurveTo(-27, 20, -34, 11);
    ctx.stroke();

    // Head and neck.
    ctx.fillStyle = '#43896b';
    ctx.beginPath();
    ctx.moveTo(10, 5);
    ctx.lineTo(21, -3);
    ctx.lineTo(30, -2);
    ctx.lineTo(25, 5);
    ctx.lineTo(17, 9);
    ctx.closePath();
    ctx.fill();

    // Eye.
    ctx.fillStyle = '#f9d87a';
    ctx.beginPath();
    ctx.arc(24, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    // Horn changes color and grows with evolution.
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(18, -5);
    ctx.lineTo(20, -12 - Math.min(evolution, 4));
    ctx.lineTo(23, -5);
    ctx.fill();

    // Extra horns appear as the dragon evolves.
    if (evolution >= 1) {
      ctx.beginPath();
      ctx.moveTo(12, -6);
      ctx.lineTo(10, -12 - Math.min(evolution, 5));
      ctx.lineTo(16, -5);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-3, -3);
            ctx.lineTo(-7, -10 - Math.min(evolution, 5));
      ctx.lineTo(2, -3);
      ctx.fill();
    }

    // A glowing aura appears at level 11 and grows with later evolutions.
    if (evolution >= 2) {
      ctx.globalAlpha =
        0.18 + Math.min(evolution, 5) * 0.04;

      ctx.strokeStyle = trim;
      ctx.lineWidth = 2 + Math.min(evolution, 4);

      ctx.beginPath();
      ctx.ellipse(
        0,
        3,
        29 + Math.min(evolution, 5) * 2,
        22 + Math.min(evolution, 5),
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();

      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // Draw a collectible.
  function drawCoin(item) {
    ctx.save();

    ctx.translate(item.x, item.y);
    ctx.rotate(Math.sin(item.spin) * 0.2);

    ctx.shadowColor = '#ffdc75';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#f6c85e';
    ctx.strokeStyle = '#fff0ae';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(0, 0, item.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#9d6427';
    ctx.font = 'bold 17px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 0, 1);

    ctx.restore();
  }

  // Draw a glowing, animated fireball hazard.
  function drawObstacle(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    const pulse = 1 + Math.sin(gameTime * 0.012 + o.phase) * 0.12;
    ctx.scale(pulse, pulse);
    ctx.shadowColor = '#ff4b16';
    ctx.shadowBlur = 22;
    const flame = ctx.createRadialGradient(-5, -6, 2, 0, 0, o.r);
    flame.addColorStop(0, '#fff7bd');
    flame.addColorStop(0.25, '#ffd15a');
    flame.addColorStop(0.65, '#ff6b22');
    flame.addColorStop(1, '#a51e19');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.arc(0, 0, o.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff2ae';
    ctx.beginPath();
    ctx.ellipse(-4, 2, o.r * 0.28, o.r * 0.48, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw all game elements and display the speed multiplier.
  function draw() {
    drawBackground();

    items.forEach(drawCoin);
    obstacles.forEach(drawObstacle);
    playerShots.forEach(shot => {
      ctx.save(); ctx.shadowColor = '#ffbd55'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#fff0a0'; ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    enemyShots.forEach(shot => {
      ctx.save(); ctx.shadowColor = '#ff3c1f'; ctx.shadowBlur = 15;
      ctx.fillStyle = '#ff7a28'; ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    drawBoss();
    if (slashWarning > 0 && boss) {
      ctx.save();
      ctx.fillStyle = `rgba(255,55,35,${0.12 + 0.16 * Math.sin(gameTime * .03)})`;
      ctx.fillRect(0, boss.y + boss.h / 2 - 5, W, 10);
      ctx.fillStyle = '#ffd7a1';
      ctx.font = 'bold 15px Inter,Arial';
      ctx.textAlign = 'center';
      ctx.fillText('CLAW SLASH INCOMING — DODGE THE HORIZONTAL STRIKE!', W / 2, 48);
      ctx.restore();
    }
    drawDragon();

    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / 50);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 4, 4);
    });

    ctx.globalAlpha = 1;

    ctx.fillStyle = '#ffffffcc';
    ctx.font = '12px Inter,Arial';
    ctx.textAlign = 'right';

    // Keep the displayed speed multiplier consistent with actual speed.
    const multiplier = 1 + (level - 1) * 0.12;

    ctx.fillText(
      `SPEED ×${multiplier.toFixed(2)}  DMG ×${damage.toFixed(1)}`,
      W - 18,
      24
    );
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff1d9';
    ctx.font = '11px Inter,Arial';
    ctx.fillText(`UPGRADES ${upgrades.length}  SHIELDS ${shieldCharges}`, 18, 24);
  }

  // End the game when the player loses all lives.
  function endGame() {
    running = false;
    gameOver = true;
    pauseBtn.disabled = false;

    if (score > best) {
      best = score;

      try {
        localStorage.setItem('dragonBest', best);
      } catch (_) {}
    }

    updateHud();

    overlay.classList.remove('hidden');
    overlayCard.querySelector('.upgrade-options')?.remove();
    overlayCard.querySelector('#bossContinueBtn')?.remove();
    const restart = overlayCard.querySelector('#startBtn');
    if (restart) restart.textContent = 'PLAY AGAIN';
    else {
      const button = document.createElement('button');
      button.id = 'startBtn';
      button.textContent = 'PLAY AGAIN';
      button.addEventListener('click', () => {
        if (paused && !gameOver) {
          paused = false;
          overlay.classList.add('hidden');
          pauseBtn.textContent = 'PAUSE';
          pauseBtn.disabled = false;
          lastTime = performance.now();
          requestAnimationFrame(loop);
        } else {
          resetGame();
        }
      });
      overlayCard.appendChild(button);
    }

    overlayTitle.textContent = 'Your dragon has fallen';

    overlayText.textContent =
      `Final score: ${score}. You reached Level ${level}. ` +
      `Try again and beat your best score of ${best}.`;

    startBtn.textContent = 'PLAY AGAIN';
  }

  // Main game loop.
  function loop(now) {
    if (!running || paused) return;

    const dt = Math.min(
      (now - lastTime) / 16.67,
      2
    );

    lastTime = now;

    // Use one global base speed so realm changes never reset speed.
    // Speed increases by 12% per level, continuously and indefinitely.
    // Ask the AI agent to evaluate the current game state.
    const aiSettings = window.difficultyAgent.decide({
      score: score,
      level: level,
      lives: lives,
      collisions: totalCollisions
    });

    console.log(
      'AI Agent:',
      window.difficultyAgent.getStatus()
    );

    // Apply the AI's speed decision.
    const difficultyMultiplier = aiSettings.speedMultiplier;
    const speed = realms[0].speed * difficultyMultiplier;

    // Dragon movement.
    if (keys.ArrowUp || keys.w || keys.W) {
      dragon.y -= moveSpeed * dt;
    }

    if (keys.ArrowDown || keys.s || keys.S) {
      dragon.y += moveSpeed * dt;
    }

    // Keep the dragon inside the screen.
    dragon.y = Math.max(
      8,
      Math.min(H - dragon.h - 8, dragon.y)
    );

    dragon.invincible = Math.max(
      0,
      dragon.invincible - dt
    );

    gameTime += dt * 16.67;
    if ((keys[' '] || autoFire) && shotCooldown <= 0) {
      firePlayerShot();
      shotCooldown = fireInterval;
    }
    shotCooldown = Math.max(0, shotCooldown - dt * 16.67);
    if (regenTimer > 0) {
      regenTimer -= dt * 16.67;
      health = Math.min(maxHealth, health + 0.035 * dt);
    }
    if (boss) {
      boss.y = H / 2 - boss.h / 2 + Math.sin(gameTime * 0.0015) * 95;
      boss.attackTimer -= dt * 16.67;
      boss.slashTimer -= dt * 16.67;
      boss.hitFlash = Math.max(0, boss.hitFlash - dt * 16.67);
      if (boss.attackTimer <= 0) {
        const pattern = bossNumber % 3;
        const count = pattern === 0 ? 3 : pattern === 1 ? 5 : 7;
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) / 2) * (pattern === 2 ? 0.22 : 0.13);
          enemyShots.push({ x: boss.x, y: boss.y + boss.h / 2,
            vx: -5.2, vy: spread * 7, r: 10 });
        }
        boss.attackTimer = Math.max(850, 1550 - bossNumber * 55);
      }
      if (boss.slashTimer <= 0) {
        slashWarning = 70;
        boss.slashTimer = 4300;
      }
    }
    if (slashWarning > 0) {
      slashWarning -= dt * 16.67;
      if (slashWarning <= 0 && boss &&
          dragon.y < boss.y + boss.h + 25 && dragon.y + dragon.h > boss.y - 25) {
        damagePlayer(35);
      }
    }

    // Update spawn timers.
    itemTimer += dt * 16.67;
    obstacleTimer += dt * 16.67;
    obstacleBurstTimer += dt * 16.67;
    
    // Spawn collectibles and fireball obstacles.
    if (itemTimer >= 1900) {
      spawnItem();
      itemTimer = 0;
    }

    const obstacleDelay = Math.max(420, 1250 - level * 24);

    if (obstacleTimer >= obstacleDelay) {
      spawnObstacle();
      obstacleTimer = 0;
    }

    // Occasional fireball bursts increase the challenge.
    if (obstacleBurstTimer >= 8500) {
      for (let i = 0; i < Math.min(3, 1 + Math.floor(level / 5)); i++) {
        spawnObstacle();
        const o = obstacles[obstacles.length - 1];
        o.y = 45 + Math.random() * (H - 90);
      }
      obstacleBurstTimer = 0;
    }

    // Move collectibles.
    items.forEach(item => {
      item.x -= speed * dt;
      item.spin += 0.08 * dt;
    });

    // Move fireballs.
    obstacles.forEach(o => {
      o.x -= (speed + 1.5 + level * 0.12) * dt;
      o.y += Math.sin(gameTime * 0.003 + (o.phase || 0)) * 0.45 * dt;
    });

    // Move player attacks.
    playerShots.forEach(shot => {
      shot.x += shot.vx * dt;
      shot.y += (shot.vy || 0) * dt;
    });

    // Move enemy attacks.
    enemyShots.forEach(shot => {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
    });

    // Collect items.
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];

      if (
        dragon.x < item.x + item.r &&
        dragon.x + dragon.w > item.x - item.r &&
        dragon.y < item.y + item.r &&
        dragon.y + dragon.h > item.y - item.r
      ) {
        items.splice(i, 1);
        addScore(25);

        for (let j = 0; j < 12; j++) {
          particles.push({
            x: item.x,
            y: item.y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 35,
            color: '#ffd36b'
          });
        }
      } else if (item.x < -30) {
        items.splice(i, 1);
      }
    }

    // Collision between a circular fireball and the player.
    function circleHitsDragon(circle) {
      const closestX = Math.max(
        dragon.x,
        Math.min(circle.x, dragon.x + dragon.w)
      );

      const closestY = Math.max(
        dragon.y,
        Math.min(circle.y, dragon.y + dragon.h)
      );

      const dx = circle.x - closestX;
      const dy = circle.y - closestY;

      return dx * dx + dy * dy < circle.r * circle.r;
    }

    // Fireball collisions.
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];

      if (circleHitsDragon(o)) {
        obstacles.splice(i, 1);
        damagePlayer(25);
        if (!running) break;
      } else if (o.x < -40) {
        obstacles.splice(i, 1);
      }
    }

    // Player attacks can destroy incoming fireballs.
    for (let i = playerShots.length - 1; i >= 0; i--) {
      const shot = playerShots[i];

      if (shot.x > W + 30 || shot.y < -30 || shot.y > H + 30) {
        playerShots.splice(i, 1);
        continue;
      }

      let destroyed = false;

      for (let j = obstacles.length - 1; j >= 0; j--) {
        const o = obstacles[j];
        const dx = shot.x - o.x;
        const dy = shot.y - o.y;

        if (dx * dx + dy * dy < (shot.r + o.r) ** 2) {
          obstacles.splice(j, 1);
          playerShots.splice(i, 1);
          addScore(10);
          destroyed = true;
          break;
        }
      }

      if (destroyed) continue;
    }

    // Player attacks damage the boss.
    if (boss) {
      for (let i = playerShots.length - 1; i >= 0; i--) {
        const shot = playerShots[i];

        if (
          shot.x + shot.r > boss.x &&
          shot.x - shot.r < boss.x + boss.w &&
          shot.y + shot.r > boss.y &&
          shot.y - shot.r < boss.y + boss.h
        ) {
          boss.hp -= shot.damage;
          boss.hitFlash = 100;
          playerShots.splice(i, 1);

          // Sparks on boss impact.
          for (let j = 0; j < 5; j++) {
            particles.push({
              x: shot.x,
              y: shot.y,
              vx: (Math.random() - 0.5) * 5,
              vy: (Math.random() - 0.5) * 5,
              life: 25,
              color: '#ff9b52'
            });
          }

          // Boss defeated.
          if (boss.hp <= 0) {
            const defeatedBoss = boss;
            boss = null;
            enemyShots = [];
            slashWarning = 0;

            for (let j = 0; j < 55; j++) {
              particles.push({
                x: defeatedBoss.x + defeatedBoss.w / 2,
                y: defeatedBoss.y + defeatedBoss.h / 2,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.5) * 12,
                life: 55,
                color: ['#ffb347', '#ff5638', '#fff0a0'][j % 3]
              });
            }

            // Prepare the next boss if one was queued.
            if (queuedBosses > 0) {
              queuedBosses--;
              pendingBoss = true;
            }

            addScore(300);

            if (running && !paused && pendingBoss) {
              pendingBoss = false;
              startBoss();
            }
          }

          break;
        }
      }
    }

    // Enemy fireball collisions.
    for (let i = enemyShots.length - 1; i >= 0; i--) {
      const shot = enemyShots[i];

      if (circleHitsDragon(shot)) {
        enemyShots.splice(i, 1);
        damagePlayer(20);
        if (!running) break;
      } else if (
        shot.x < -40 ||
        shot.y < -40 ||
        shot.y > H + 40
      ) {
        enemyShots.splice(i, 1);
      }
    }

    // Update particle effects.
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= dt;

      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }

    // Stop updating if the game has ended.
    if (!running) {
      draw();
      return;
    }

    // Render the completed frame.
    draw();

    requestAnimationFrame(loop);
  }

  // Keyboard controls.
  window.addEventListener('keydown', event => {
    const key = event.key;

    if (
      ['ArrowUp', 'ArrowDown', ' ', 'ArrowLeft', 'ArrowRight']
        .includes(key)
    ) {
      event.preventDefault();
    }

    keys[key] = true;

    if (
      key === 'Escape' &&
      running &&
      !gameOver &&
      !overlay.classList.contains('hidden')
    ) {
      return;
    }

    if (key.toLowerCase() === 'p' && running && !gameOver) {
      togglePause();
    }
  });

  window.addEventListener('keyup', event => {
    keys[event.key] = false;
  });

  // Pause and resume.
  function togglePause() {
    if (!running || gameOver) return;

    paused = !paused;

    if (paused) {
      overlay.classList.remove('hidden');
      overlayTitle.textContent = 'Game paused';
      overlayText.textContent = 'Take a moment. Your dragon awaits.';
      pauseBtn.textContent = 'RESUME';

      const existing = overlayCard.querySelector('#startBtn');
      if (existing) existing.textContent = 'RESUME';
    } else {
      overlay.classList.add('hidden');
      pauseBtn.textContent = 'PAUSE';
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  }

  pauseBtn.addEventListener('click', () => {
    togglePause();
  });

  // Start or restart.
  startBtn.addEventListener('click', () => {
    if (gameOver || !running) {
      resetGame();
    } else if (paused) {
      paused = false;
      overlay.classList.add('hidden');
      pauseBtn.textContent = 'PAUSE';
      pauseBtn.disabled = false;
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  });

  // Initial game screen.
  running = false;
  paused = false;
  gameOver = false;

  score = 0;
  level = 1;
  lives = 3;
  health = 100;
  maxHealth = 100;

  updateHud();

  overlay.classList.remove('hidden');
  overlayTitle.textContent = 'Rise of the Dragon';
  overlayText.textContent =
    'Fly through the realms, collect ancient power, defeat rival dragons, and evolve into the ultimate dragon.';

  startBtn.textContent = 'START GAME';
  pauseBtn.textContent = 'PAUSE';
  pauseBtn.disabled = true;

});
