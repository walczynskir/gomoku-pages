(function (root) {
  'use strict';
  const engine = typeof module !== 'undefined' ? require('./engine.js') : root.FiveEngine;
  const levels = Object.freeze(['easy', 'medium', 'hard']);
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const geometry = new Map();
  const weights = [0, 2, 12, 72, 900];
  const win = 100000;
  const opponent = mark => mark === 'X' ? 'O' : 'X';

  function getGeometry(size) {
    if (geometry.has(size)) return geometry.get(size);
    const inside = (row, col) => row >= 0 && col >= 0 && row < size && col < size;
    const center = (size - 1) / 2;
    const squares = Array.from({ length: size ** 2 }, (_, index) => {
      const row = Math.floor(index / size);
      const col = index % size;
      const windows = [];
      const nearby = [];
      for (const [dr, dc] of directions) {
        for (let offset = 0; offset < 5; offset++) {
          const r = row - offset * dr;
          const c = col - offset * dc;
          if (!inside(r, c) || !inside(r + 4 * dr, c + 4 * dc)) continue;
          windows.push(Array.from({ length: 5 }, (_, step) => (r + step * dr) * size + c + step * dc)
            .filter(cell => cell !== index));
        }
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if ((dr || dc) && inside(row + dr, col + dc)) nearby.push((row + dr) * size + col + dc);
        }
      }
      return { windows, nearby, center: -(Math.abs(row - center) + Math.abs(col - center)) };
    });
    geometry.set(size, squares);
    return squares;
  }

  function potential(cells, windows, mark) {
    let score = 0;
    let firstCompletion = -1;
    let fork = false;
    const other = opponent(mark);
    for (const window of windows) {
      let marks = 0;
      let gap = -1;
      let blocked = false;
      for (const index of window) {
        const value = cells[index];
        if (value === other) {
          blocked = true;
          break;
        }
        if (value === mark) marks++;
        else gap = index;
      }
      if (blocked) continue;
      if (marks === 4) return { score: win, wins: true };
      score += weights[marks];
      if (marks === 3) {
        if (firstCompletion !== -1 && firstCompletion !== gap) fork = true;
        firstCompletion = gap;
      }
    }
    return { score: score + (fork ? 4500 : 0), wins: false };
  }

  function rank(cells, squares, mark) {
    const candidates = [];
    const other = opponent(mark);
    for (const [index, square] of squares.entries()) {
      if (cells[index] || !square.nearby.some(cell => cells[cell])) continue;
      const attack = potential(cells, square.windows, mark);
      const defense = potential(cells, square.windows, other);
      candidates.push({ index, attack, defense, priority: attack.score + defense.score * 0.85 + square.center / 10 });
    }
    return candidates.sort((a, b) => b.priority - a.priority || a.index - b.index);
  }

  function tactical(candidates) {
    const victory = candidates.find(move => move.attack.wins);
    const blocks = candidates.filter(move => move.defense.wins);
    return { victory, blocks };
  }

  function search(cells, squares, mark, depth, ply, alpha, beta, sliding) {
    const moves = rank(cells, squares, mark);
    if (!moves.length) return 0;
    const { victory, blocks } = tactical(moves);
    if (victory) return win - ply;
    if (blocks.length > 1) return -win + ply + 1;
    if (!depth && !blocks.length) {
      const attack = Math.max(...moves.map(move => move.attack.score));
      const defense = Math.max(...moves.map(move => move.defense.score));
      return attack - defense;
    }

    let best = -Infinity;
    // At the horizon, continue a forced block once so a visible win is never ignored.
    for (const { index } of blocks.length ? blocks : moves.slice(0, depth >= 2 ? 6 : 4)) {
      const next = engine.advance(cells, Math.sqrt(cells.length), index, mark, sliding).cells;
      const score = depth
        ? -search(next, squares, opponent(mark), depth - 1, ply + 1, -beta, -alpha, sliding)
        : -horizon(next, squares, opponent(mark), ply + 1);
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }

  function horizon(cells, squares, mark, ply) {
    const moves = rank(cells, squares, mark);
    if (moves.some(move => move.attack.wins)) return win - ply;
    if (moves.filter(move => move.defense.wins).length > 1) return -win + ply + 1;
    return Math.max(0, ...moves.map(move => move.attack.score)) - Math.max(0, ...moves.map(move => move.defense.score));
  }

  function chooseMove(game, level = 'medium', random = Math.random) {
    if (game.result) return null;
    const cells = game.cells.slice();
    const { size, turn } = game;
    const squares = getGeometry(size);
    const ranked = rank(cells, squares, turn);
    if (!ranked.length) {
      const center = Math.floor(cells.length / 2);
      if (!cells[center]) return center;
      const empty = cells.indexOf('');
      return empty === -1 ? null : empty;
    }
    const { victory, blocks } = tactical(ranked);
    if (victory) return victory.index;
    if (blocks.length) return blocks[0].index;
    if (level === 'easy') {
      const moves = ranked.slice(0, 7);
      return moves[Math.floor(random() * moves.length)].index;
    }

    let best = ranked[0];
    let bestValue = -Infinity;
    const depth = level === 'hard' ? 3 : 1;
    for (const move of ranked.slice(0, level === 'hard' ? 10 : 7)) {
      const next = engine.advance(cells, size, move.index, turn, game.sliding).cells;
      const reply = -search(next, squares, opponent(turn), depth, 1, -Infinity, Infinity, game.sliding);
      // A small tie-break favors useful shapes without outweighing forced results.
      const value = reply + Math.min(move.priority, 5000) / 10000;
      if (value > bestValue) {
        best = move;
        bestValue = value;
      }
      if (reply >= win - 2) break;
    }
    return best.index;
  }

  const api = { levels, chooseMove };
  if (typeof module !== 'undefined') module.exports = api;
  else root.FiveComputer = api;
})(globalThis);
