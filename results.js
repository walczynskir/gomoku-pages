(function (root) {
  'use strict';

  function validOutcome(record) {
    return record && ['win', 'loss', 'draw', 'unknown'].includes(record.outcome) &&
      ['natural', 'replaced', 'legacy'].includes(record.reason);
  }

  function restoreResults(saved) {
    const results = Object.create(null);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return results;
    for (const [id, record] of Object.entries(saved)) {
      if (validOutcome(record)) results[id] = { outcome: record.outcome, reason: record.reason };
    }
    return results;
  }

  function naturalOutcome(game, playerMark) {
    if (!game.result) return null;
    return {
      outcome: game.result === 'draw' ? 'draw' : game.result === playerMark ? 'win' : 'loss',
      reason: 'natural'
    };
  }

  function restoreSession(saved, game, playerMark, achievements, results, id) {
    const outcome = results[id] ?? (validOutcome(saved?.outcome) ? saved.outcome : null) ??
      (achievements.finished.has(id)
        ? { outcome: achievements.wins.has(id) ? 'win' : 'unknown', reason: 'legacy' }
        : naturalOutcome(game, playerMark));
    const started = saved?.started === true || game.moves.length > 0 ||
      (Array.isArray(saved?.future) && saved.future.length > 0) || Boolean(outcome);
    return { started, outcome };
  }

  function replacementOutcome(session) {
    return session.outcome ?? (session.started ? { outcome: 'loss', reason: 'replaced' } : null);
  }

  const api = { restoreResults, restoreSession, naturalOutcome, replacementOutcome };
  if (typeof module !== 'undefined') module.exports = api;
  else root.FiveResults = api;
})(globalThis);
