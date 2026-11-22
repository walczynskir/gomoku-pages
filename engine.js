(function (root) {
  'use strict';
  const sizes = Object.freeze([15, 13]);
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  function create(size = sizes[0], starter = 'X', sliding = false) {
    if (!sizes.includes(size)) throw new RangeError('Unsupported board size');
    if (starter !== 'X' && starter !== 'O') throw new RangeError('Unsupported starter');
    return { size, starter, sliding: sliding === true, last: null, shift: [0, 0], cells: Array(size * size).fill(''), moves: [], slidingMoves: [], turn: starter, line: [], result: null };
  }

  function winningLine(cells, size, index, mark) {
    const row = Math.floor(index / size);
    const column = index % size;
    for (const [dr, dc] of directions) {
      const line = [index];
      for (const sign of [-1, 1]) {
        let r = row + sign * dr;
        let c = column + sign * dc;
        while (r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c] === mark) {
          if (sign === -1) line.unshift(r * size + c);
          else line.push(r * size + c);
          r += sign * dr;
          c += sign * dc;
        }
      }
      if (line.length >= 5) return line;
    }
    return [];
  }

  function play(game, index, sliding = game.sliding) {
    if (game.result || !Number.isInteger(index) || index < 0 || index >= game.cells.length || game.cells[index]) return null;
    const position = advance(game.cells, game.size, index, game.turn, sliding);
    const moves = [...game.moves, index];
    const line = winningLine(position.cells, game.size, position.last, game.turn);
    const result = line.length ? game.turn : moves.length === position.cells.length ? 'draw' : null;
    const slidingMoves = [...game.slidingMoves, sliding === true];
    return { ...game, ...position, moves, slidingMoves, line, result, turn: game.turn === 'X' ? 'O' : 'X' };
  }

  function advance(source, size, index, mark, sliding) {
    let cells = source.slice();
    cells[index] = mark;
    let dr = 0, dc = 0;
    const row = Math.floor(index / size), col = index % size;
    if (sliding) {
      if (row === 0 && cells.slice(-size).every(value => !value)) dr = 1;
      if (row === size - 1 && cells.slice(0, size).every(value => !value)) dr = -1;
      if (col === 0 && cells.every((value, i) => i % size !== size - 1 || !value)) dc = 1;
      if (col === size - 1 && cells.every((value, i) => i % size !== 0 || !value)) dc = -1;
      if (dr || dc) {
        const moved = Array(cells.length).fill('');
        cells.forEach((value, i) => { if (value) moved[i + dr * size + dc] = value; });
        cells = moved;
      }
    }
    return { cells, last: index + dr * size + dc, shift: [dr, dc] };
  }

  function restore(size, moves, starter = 'X', sliding = false, slidingMoves) {
    if (!sizes.includes(size) || !Array.isArray(moves) || moves.length > size * size) return null;
    if (starter !== 'X' && starter !== 'O') return null;
    if (slidingMoves !== undefined && (!Array.isArray(slidingMoves) || slidingMoves.length !== moves.length
        || !slidingMoves.every(value => typeof value === 'boolean'))) return null;
    let game = create(size, starter, sliding);
    for (const [move, index] of moves.entries()) {
      game = play(game, index, slidingMoves?.[move]);
      if (!game) return null;
    }
    return game;
  }

  const api = { sizes, create, play, restore, advance };
  if (typeof module !== 'undefined') module.exports = api;
  else root.FiveEngine = api;
})(globalThis);
