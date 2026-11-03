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

  let dragon, items, obstacles, particles;
  let score, level, lives, running, paused, gameOver;
let lastTime, itemTimer, obstacleTimer, obstacleBurstTimer, best;
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
      invincible: 0
    };

    items = [];
    obstacles = [];
    particles = [];

    score = 0;
    level = 1;
    lives = 3;
    totalCollisions = 0;

    running = true;
    paused = false;
    gameOver = false;

    lastTime = performance.now();
    itemTimer = 0;
    obstacleTimer = 0;
    obstacleBurstTimer = 0;

    overlay.classList.add('hidden');
    pauseBtn.textContent = 'PAUSE';
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

  // Draw an obstacle.
  function drawObstacle(o) {
    ctx.save();
    ctx.translate(o.x, o.y);

    if (o.type === 0) {
      ctx.fillStyle = '#27202b';
      ctx.strokeStyle = '#e88b63';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(0, -19);
      ctx.lineTo(17, -8);
      ctx.lineTo(14, 12);
      ctx.lineTo(0, 20);
      ctx.lineTo(-14, 12);
      ctx.lineTo(-17, -8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffb66f';
      ctx.font = '20px Georgia';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✹', 0, 0);
    } else {
      ctx.fillStyle = '#34212b';
      ctx.strokeStyle = '#f5d6a1';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(-18, 15);
      ctx.lineTo(-10, -14);
      ctx.lineTo(0, -20);
      ctx.lineTo(10, -14);
      ctx.lineTo(18, 15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f5d6a1';
      ctx.font = '20px Georgia';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 1);
    }

    ctx.restore();
  }

  // Draw all game elements and display the speed multiplier.
  function draw() {
    drawBackground();

    items.forEach(drawCoin);
    obstacles.forEach(drawObstacle);

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
      `SPEED ×${multiplier.toFixed(2)}`,
      W - 18,
      24
    );

    ctx.textAlign = 'left';
  }

  // End the game when the player loses all lives.
  function endGame() {
    running = false;
    gameOver = true;

    if (score > best) {
      best = score;

      try {
        localStorage.setItem('dragonBest', best);
      } catch (_) {}
    }

    updateHud();

    overlay.classList.remove('hidden');

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
      dragon.y -= 5 * dt;
    }

    if (keys.ArrowDown || keys.s || keys.S) {
      dragon.y += 5 * dt;
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

    // Update spawn timers.
    itemTimer += dt * 16.67;
    obstacleTimer += dt * 16.67;
    obstacleBurstTimer += dt * 16.67;

    // Collectibles become more frequent, with a minimum interval.
    const itemSpawnInterval = Math.max(
      620,
      1450 - (level - 1) * 35
    );

    // Normal obstacle spawns become more frequent as levels increase.
    // AI-controlled obstacle frequency.
const baseObstacleInterval = Math.max(
  540,
  1900 - (level - 1) * 45
);

// Higher AI multipliers mean obstacles appear more frequently.
const obstacleSpawnInterval = Math.max(
  350,
  baseObstacleInterval / aiSettings.obstacleMultiplier
);

    if (itemTimer > itemSpawnInterval) {
      spawnItem();
      itemTimer = 0;
    }

    if (obstacleTimer > obstacleSpawnInterval) {
      spawnObstacle();
      obstacleTimer = 0;
    }

    // Every five levels, add an extra obstacle periodically.
    // The interval gets shorter at later milestones, but never below 2200 ms.
    const obstacleMilestone = Math.floor((level - 1) / 5);

    const extraObstacleInterval = Math.max(
      2200,
      5200 - obstacleMilestone * 350
    );

    if (level >= 5 && obstacleBurstTimer > extraObstacleInterval) {
      spawnObstacle();
      obstacleBurstTimer = 0;
    }

    // Move collectibles and detect collection.
    items = items.filter(item => {
      item.x -= speed * dt;
      item.spin += 0.08 * dt;

      if (
        hit(
          {
            x: dragon.x,
            y: dragon.y,
            w: dragon.w,
            h: dragon.h
          },
          {
            x: item.x - item.r,
            y: item.y - item.r,
            w: item.r * 2,
            h: item.r * 2
          }
        )
      ) {
        score += 10;

        levelCheck();
        updateHud();

        // Collection particles.
        for (let i = 0; i < 8; i++) {
          particles.push({
            x: item.x,
            y: item.y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: 28,
            color: '#ffdf79'
          });
        }

        // There is no score-based victory limit.
        return false;
      }

      return item.x > -30;
    });

    // Move obstacles and detect collisions.
    obstacles = obstacles.filter(o => {
      o.x -= (
        speed +
        0.5 +
        (level - 1) * 0.12
      ) * dt;

      if (
        dragon.invincible <= 0 &&
        hit(
          {
            x: dragon.x + 6,
            y: dragon.y + 5,
            w: dragon.w - 12,
            h: dragon.h - 10
          },
          {
            x: o.x - o.r,
            y: o.y - o.r,
            w: o.r * 2,
            h: o.r * 2
          }
        )
      ) {
        lives--;
        totalCollisions++;

        // Brief invincibility after a collision.
        dragon.invincible = 95;

        updateHud();

        // Collision particles.
        for (let i = 0; i < 14; i++) {
          particles.push({
            x: dragon.x + 20,
            y: dragon.y + 20,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 35,
            color: '#ff866e'
          });
        }

        if (lives <= 0) {
          draw();
          endGame();
        }

        return false;
      }

      return o.x > -40;
    });

    // Update particle positions.
    particles = particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;

      return p.life > 0;
    });

    draw();

    // Continue indefinitely until the player loses all lives or pauses.
    if (running && !paused) {
      requestAnimationFrame(loop);
    }
  }

  // Start or restart the game.
  startBtn.addEventListener('click', resetGame);

  // Pause and resume.
  pauseBtn.addEventListener('click', () => {
    if (!running || gameOver) return;

    paused = !paused;

    if (paused) {
      pauseBtn.textContent = 'RESUME';

      overlay.classList.remove('hidden');
      overlayTitle.textContent = 'Game paused';
      overlayText.textContent =
        'Take a breath, dragon rider. Resume when you are ready.';

      startBtn.textContent = 'RESUME';
    } else {
      overlay.classList.add('hidden');
      pauseBtn.textContent = 'PAUSE';

      lastTime = performance.now();

      requestAnimationFrame(loop);
    }
  });

  // Keyboard controls.
  document.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
    }

    keys[e.key] = true;
  });

  document.addEventListener('keyup', e => {
    keys[e.key] = false;
  });

  // Draw the initial screen.
  drawBackground();

  // Draw the dragon only after initializing its starting state.
  dragon = {
    x: 105,
    y: H / 2 - 20,
    w: 48,
    h: 40,
    invincible: 0
  };

  drawDragon();
});