
class DifficultyAgent {
  constructor() {
    this.difficulty = 1;
    this.performance = 0;

    this.previousScore = 0;
    this.previousLevel = 1;
    this.previousCollisions = 0;

    this.settings = {
      speedMultiplier: 1,
      obstacleMultiplier: 1,
      message: 'AI Agent: Monitoring player'
    };
  }

  // Observe the player's current performance.
  observe(gameState) {
    const { score, level, lives, collisions } = gameState;

    const scoreGain = Math.max(0, score - this.previousScore);
    const levelGain = Math.max(0, level - this.previousLevel);
    const newCollisions = Math.max(
      0,
      collisions - this.previousCollisions
    );

    // Reward progress and successful advancement.
    this.performance += scoreGain * 0.02;
    this.performance += levelGain * 2;

    // Penalize only newly occurring collisions.
    this.performance -= newCollisions * 3;

    this.performance = Math.max(
      0,
      Math.min(100, this.performance)
    );

    this.previousScore = score;
    this.previousLevel = level;
    this.previousCollisions = collisions;

    return {
      score,
      level,
      lives,
      performance: this.performance
    };
  }

  // Decide how difficult the game should become.
  decide(gameState) {
    const player = this.observe(gameState);

    // Difficulty continuously increases with level.
    const levelDifficulty =
      1 + (player.level - 1) * 0.08;

    // Strong performance increases the challenge.
    const performanceBonus =
      player.performance * 0.003;

    // Temporarily ease the challenge when health is critical.
    const survivalAdjustment =
      player.lives <= 1 ? 0.75 :
      player.lives === 2 ? 0.90 :
      1;

    this.difficulty = Math.max(
      1,
      (levelDifficulty + performanceBonus) *
      survivalAdjustment
    );

    this.settings.speedMultiplier = this.difficulty;

    this.settings.obstacleMultiplier = Math.min(
      2.5,
      1 +
      (player.level - 1) * 0.04 +
      player.performance * 0.002
    );

    if (player.lives <= 1) {
      this.settings.message =
        'AI Agent: Critical health — adjusting challenge';
    } else if (player.performance >= 40) {
      this.settings.message =
        'AI Agent: Strong performance — increasing challenge';
    } else {
      this.settings.message =
        'AI Agent: Evaluating player progress';
    }

    return this.settings;
  }

  // Return the agent's current status.
  getStatus() {
    return {
      difficulty: this.difficulty,
      performance: this.performance,
      message: this.settings.message
    };
  }
}

// Make the agent available to game.js.
window.difficultyAgent = new DifficultyAgent();
