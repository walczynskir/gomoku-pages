(function (root) {
  'use strict';

  const ids = list => new Set((Array.isArray(list) ? list : []).filter(id => typeof id === 'string'));

  function restoreProgress(saved) {
    const legacy = Array.isArray(saved);
    const finished = ids(legacy ? saved : saved?.finished);
    const wins = ids(saved?.wins);
    for (const id of wins) if (!finished.has(id)) wins.delete(id);
    const legacyCompleted = legacy ? finished.size : Number.isInteger(saved?.legacyCompleted)
      ? Math.min(finished.size, Math.max(0, saved.legacyCompleted)) : 0;
    return { finished, wins, legacyCompleted, unlockedThemes: ids(saved?.unlockedThemes) };
  }

  function rewardProgress(progress, { goal, metric, legacyGoal }) {
    const count = metric === 'wins' ? progress.wins.size : progress.finished.size;
    const carry = legacyGoal && progress.legacyCompleted
      ? Math.min(legacyGoal, progress.legacyCompleted + progress.wins.size) : 0;
    return { count: Math.min(goal, count), carry, unlocked: count >= goal || Boolean(carry && carry >= legacyGoal) };
  }

  function recordResult(progress, id, playerWon) {
    if (progress.finished.has(id)) return false;
    progress.finished.add(id);
    if (playerWon) progress.wins.add(id);
    return true;
  }

  function serializeProgress({ finished, wins, legacyCompleted, unlockedThemes }) {
    return { finished: [...finished], wins: [...wins], legacyCompleted, ...(unlockedThemes?.size ? { unlockedThemes: [...unlockedThemes] } : {}) };
  }

  const api = { restoreProgress, rewardProgress, recordResult, serializeProgress };
  if (typeof module !== 'undefined') module.exports = api;
  else root.FiveAchievements = api;
})(globalThis);
