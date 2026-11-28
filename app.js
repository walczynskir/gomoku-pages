(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { sizes, create, play, restore } = FiveEngine;
  const { levels, chooseMove } = FiveComputer;
  const { restoreProgress, rewardProgress, recordResult, serializeProgress } = FiveAchievements;
  const { restoreResults, restoreSession, naturalOutcome, replacementOutcome } = FiveResults;
  const { languages, catalog, addLanguages } = DominoI18n;
  const keys = {
    game: 'piec-w-rzedzie-game-v1',
    prefs: 'piec-w-rzedzie-preferences-v1',
    achievements: 'piec-w-rzedzie-achievements-v1',
    results: 'piec-w-rzedzie-results-v1',
    profile: 'piec-w-rzedzie-profile-v1'
  };
  const basic = [
    ['sage', 'classic'], ['ink', 'Ink & paper'], ['studio', 'Studio'],
    ['forma', 'Forma'], ['energy', 'Energy'], ['tangerine', 'Tangerine'],
    ['porcelain', 'Porcelain'], ['ukraine', 'Ukraine']
  ];
  const featured = basic.slice(0, 4);
  const rewards = [
    ['orange-grove', 'orangeGrove', { goal: 3, metric: 'finished' }],
    ['copper', 'copperPatina', { goal: 5, metric: 'wins', legacyGoal: 3 }],
    ['night-sky', 'Night sky', { goal: 10, metric: 'wins', legacyGoal: 10 }]
  ].sort((a, b) => a[2].goal - b[2].goal);
  const paletteOf = id => id === 'orange-grove' ? 'tangerine' : id;
  const illustrated = id => rewards.some(([reward]) => reward === id);
  const themes = [...basic, ...rewards];
  const sameDeviceTouch = matchMedia('(any-pointer: coarse)');
  const board = $('board');
  const size = $('size');
  const difficulty = $('difficulty');
  const starterRule = $('starter-rule');
  const playerMarkSelect = $('player-mark');
  const otherMark = mark => mark === 'X' ? 'O' : 'X';
  const markColors = $('mark-colors');
  const theme = $('theme');
  const confirmMove = $('confirm-move');
  const undoButton = $('undo');
  const redoButton = $('redo');
  const historyControls = $('history-controls');

  const profileStorage = FiveProfileStorage.create(localStorage, keys);

  const storageErrors = new Set();

  function read(key) {
    try {
      const value = profileStorage.read(key);
      storageErrors.delete(key);
      $('storage-message').hidden = storageErrors.size === 0;
      return value;
    } catch {
      storageErrors.add(key);
      $('storage-message').hidden = false;
      return null;
    }
  }

  let preferencesSaveFailed = false;

  function save(key, value) {
    try {
      profileStorage.write(key, value);
      storageErrors.delete(key);
      $('storage-message').hidden = storageErrors.size === 0;
      if (key === 'prefs') { preferencesSaveFailed = false; renderSettings(); }
      return true;
    } catch {
      storageErrors.add(key);
      $('storage-message').hidden = false;
      if (key === 'prefs') { preferencesSaveFailed = true; renderSettings(); }
      return false;
    }
  }

  const savedPrefs = read('prefs');
  const savedAchievements = read('achievements');
  const achievements = restoreProgress(savedAchievements);
  const previousUnlocks = achievements.unlockedThemes.size;
  rememberUnlocked();
  if (Array.isArray(savedAchievements) || achievements.unlockedThemes.size !== previousUnlocks) save('achievements', serializeProgress(achievements));
  const available = entry => !entry[2] || achievements.unlockedThemes.has(entry[0]) || rewardProgress(achievements, entry[2]).unlocked;
  const validTheme = id => themes.some(entry => entry[0] === id && available(entry));
  const savedTheme = savedPrefs?.theme === 'contrast' ? savedPrefs.previousTheme : savedPrefs?.theme;
  const prefs = {
    language: languages.includes(savedPrefs?.language) ? savedPrefs.language : 'pl',
    theme: validTheme(savedTheme) ? savedTheme : 'sage',
    contrast: savedPrefs?.contrast === true || savedPrefs?.theme === 'contrast',
    size: sizes.includes(savedPrefs?.size) ? savedPrefs.size : sizes[0],
    playerMark: savedPrefs?.playerMark === 'O' ? 'O' : 'X',
    starterRule: savedPrefs?.starterRule === 'alternate' ? 'alternate' : 'loser',
    difficulty: levels.includes(savedPrefs?.difficulty) ? savedPrefs.difficulty : 'medium',
    large: savedPrefs?.large === true,
    markColors: savedPrefs?.markColors === true,
    history: savedPrefs?.history === true,
    sliding: savedPrefs?.sliding === true
  };
  const savedGame = read('game');
  const restored = restore(savedGame?.size, savedGame?.moves, savedGame?.starter, savedGame?.sliding, savedGame?.slidingMoves);
  const newId = () => globalThis.crypto.randomUUID?.() ??
    Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('-');
  let playerMark = restored ? (savedGame.playerMark === 'O' ? 'O' : 'X') : prefs.playerMark;
  let game = restored ?? create(prefs.size, playerMark, prefs.sliding);
  let gameId = restored && typeof savedGame.id === 'string' ? savedGame.id : newId();
  // Missing difficulty in older saves now resumes with the default computer opponent.
  let level = levels.includes(savedGame?.difficulty) && restored ? savedGame.difficulty : prefs.difficulty;
  const results = restoreResults(read('results'));
  let session = restoreSession(restored ? savedGame : null, game, playerMark, achievements, results, gameId);
  let restartGameId = null;
  const sideOf = mark => mark === playerMark ? 'player' : 'computer';
  let lastLoserSide = null;
  if (['player', 'computer'].includes(savedGame?.lastLoserSide)) {
    lastLoserSide = savedGame.lastLoserSide;
  } else if (['X', 'O'].includes(savedGame?.lastLoser)) {
    lastLoserSide = sideOf(savedGame.lastLoser);
  }
  // An older record only knows the latest loser, which may be this game's result.
  let previousLoserSide = Object.hasOwn(savedGame ?? {}, 'previousLoserSide')
    ? (['player', 'computer'].includes(savedGame.previousLoserSide) ? savedGame.previousLoserSide : null)
    : (game.line.length ? null : lastLoserSide);
  let future = [];
  let futureSliding = [];
  if (restored && Array.isArray(savedGame.future) && savedGame.future.length <= game.cells.length - game.moves.length) {
    const replayOptions = Array.isArray(savedGame.futureSliding) ? savedGame.futureSliding
      : savedGame.future.map(() => game.sliding);
    if (restore(game.size, [...game.moves, ...savedGame.future], game.starter, game.sliding,
      [...game.slidingMoves, ...replayOptions])) {
      future = savedGame.future;
      futureSliding = replayOptions;
    }
  }
  rememberLoser();
  let computerTimer = null;
  let computerWorker = null;
  const computerTurn = () => Boolean(level && game.turn !== playerMark && !game.result);

  let selected = null;
  let active = 0;
  let cells = [];

  function t(key, values = {}) {
    const row = FiveStrings[key] ?? catalog[key];
    return (row?.[languages.indexOf(prefs.language)] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
  }

  const backupSchema = {
    game: 'gomoku', languages,
    options: {
      size: value => sizes.includes(value), difficulty: value => levels.includes(value),
      starterRule: value => ['loser','alternate'].includes(value), playerMark: value => ['X','O'].includes(value),
      markColors: value => typeof value === 'boolean', history: value => typeof value === 'boolean', sliding: value => typeof value === 'boolean'
    }, validProgress: FiveProgressBackup.validProgress, readLegacy: FiveProgressBackup.readLegacy
  };
  let backupCandidate = null, backupRead = 0, backupMessage = null;
  const backupCopy = () => progressTransferStrings[prefs.language] ?? progressTransferStrings.en;
  const backupErrors = () => preferencesTransferStrings[prefs.language] ?? preferencesTransferStrings.en;
  const backupExtra = () => FiveBackupStrings[prefs.language] ?? FiveBackupStrings.en;
  const currentProgress = () => FiveProgressBackup.capture(results, achievements, achievements.unlockedThemes);
  function renderBackup() {
    const copy = backupCopy();
    $('backup-title').textContent = copy[0];
    $('backup-scope').textContent = copy[3];
    $('backup-export').textContent = copy[1];
    $('backup-import').textContent = copy[2];
    $('backup-status').textContent = backupMessage === 'success' ? copy[4] : backupMessage ? backupErrors()[backupMessage] : '';
  }
  function backupPlan(candidate) {
    const merged = FiveProgressBackup.merge(currentProgress(), candidate);
    const resolved = GamesChestPreferences.resolveTheme(candidate.preferences, prefs.theme,
      id => themes.some(entry => entry[0] === id), id => !FiveProgressBackup.rewardIds.includes(id) || merged.unlockedThemes.includes(id));
    return { merged, resolved };
  }
  function renderBackupConfirmation() {
    const copy = backupCopy(), extra = backupExtra(), { merged, resolved } = backupPlan(backupCandidate);
    const before = FiveProgressBackup.summary(currentProgress()), after = FiveProgressBackup.summary(merged);
    $('backup-confirm-title').textContent = copy[5];
    $('backup-confirm-scope').textContent = copy[6];
    $('backup-config').textContent = extra[4] + ': ' + extra[5] + '. ' +
      backupCandidate.preferences.language + ' · ' + (themes.find(entry => entry[0] === backupCandidate.preferences.theme)?.[1]
        ? t(themes.find(entry => entry[0] === backupCandidate.preferences.theme)[1]) : backupCandidate.preferences.theme) + ' · ' +
      backupCandidate.preferences.size + '×' + backupCandidate.preferences.size;
    $('backup-summary').textContent = copy[12] + ': ' +
      [[extra[0],'finished'],[copy[9],'wins'],[copy[10],'losses'],[extra[1],'draws'],[copy[11],'unlocked']]
        .map(([label,key]) => label + ' ' + before[key] + ' / ' + after[key]).join(' · ') + '. ' + extra[2] + ': ' + merged.conflicts;
    $('backup-note').textContent = extra[3];
    $('backup-theme-note').textContent = resolved.skipped ? backupErrors()[resolved.skipped === 'locked' ? 6 : 7] : '';
    $('backup-cancel').textContent = copy[7];
    $('backup-restore').textContent = copy[8];
  }
  $('backup-export').onclick = () => {
    try {
      const text = GamesChestBackup.stringify(prefs, currentProgress(), backupSchema);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      link.download = 'gomoku-backup.json';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    } catch { backupMessage = 13; renderBackup(); }
  };
  $('backup-import').onclick = () => $('backup-file').click();
  $('backup-file').onchange = async () => {
    const input = $('backup-file'), [file] = input.files; input.value = '';
    if (!file) return;
    const generation = ++backupRead;
    backupMessage = null; renderBackup(); $('backup-import').disabled = true;
    try {
      if (file.size > GamesChestBackup.maxBytes) throw Object.assign(Error('invalid'), { code: 'invalid' });
      let text; try { text = await file.text(); } catch { throw Object.assign(Error('read'), { code: 'read' }); }
      if (generation !== backupRead || !$('settings').open) return;
      const candidate = GamesChestBackup.parse(text, backupSchema);
      backupCandidate = candidate;
      renderBackupConfirmation();
      $('backup-error').hidden = true;
      stopComputer();
      $('backup-confirm').showModal();
    } catch (error) {
      if (generation === backupRead) {
        backupMessage = ({ game:9, version:10, read:11 })[error.code] ?? 8;
        renderBackup();
        $('backup-status').scrollIntoView({ block:'nearest' });
      }
    } finally { if (generation === backupRead) $('backup-import').disabled = false; }
  };
  $('backup-restore').onclick = () => {
    if (!backupCandidate) return;
    const { merged, resolved } = backupPlan(backupCandidate);
    const nextPrefs = { ...prefs, ...resolved.preferences };
    try {
      // One atomic write before memory changes; the active game key is untouched.
      profileStorage.commit(nextPrefs, merged);
    } catch {
      $('backup-error').textContent = backupErrors()[12]; $('backup-error').hidden = false;
      $('backup-error').scrollIntoView({ block:'nearest' }); return;
    }
    Object.assign(prefs, nextPrefs);
    for (const id of Object.keys(results)) delete results[id];
    Object.assign(results, merged.results);
    Object.assign(achievements, restoreProgress({ ...merged.achievements, unlockedThemes: merged.unlockedThemes }));
    preferencesSaveFailed = false;
    for (const key of ['prefs','results','achievements']) storageErrors.delete(key);
    $('storage-message').hidden = storageErrors.size === 0;
    backupMessage = 'success';
    $('backup-confirm').close('restored');
    applyPreferences();
  };
  $('backup-confirm').onclose = () => {
    if ($('backup-confirm').open) return;
    backupCandidate = null;
    if ($('settings').open) $('backup-import').focus();
    scheduleComputer();
  };

  function renderSettings() {
    const labels = settingsDialogStrings[prefs.language] ?? settingsDialogStrings.en;
    for (const element of $('settings').querySelectorAll('[data-setting]')) {
      element.textContent = labels[element.dataset.setting];
    }
    for (const button of $('settings').querySelectorAll('[data-option]')) {
      button.setAttribute('aria-label', labels.about + t(button.dataset.option));
    }
    const error = $('settings-save-error');
    const newlyFailed = preferencesSaveFailed && error.hidden;
    error.hidden = !preferencesSaveFailed;
    if (newlyFailed) $('settings').querySelector('.settings-body').scrollTop = 0;
  }

  function applyPreferences() {
    const root = document.documentElement;
    root.lang = prefs.language;
    root.dir = prefs.language === 'ar' ? 'rtl' : 'ltr';
    root.dataset.theme = paletteOf(prefs.theme);
    if (illustrated(prefs.theme)) root.dataset.illustration = prefs.theme;
    else delete root.dataset.illustration;
    root.toggleAttribute('data-high-contrast', prefs.contrast);
    root.toggleAttribute('data-mark-colors', prefs.markColors);
    root.dataset.textSize = prefs.large ? 'large' : 'normal';
    document.title = 'Gomoku — ' + t('title');
    $('game-name').textContent = document.title;
    $('contrast').setAttribute('aria-pressed', prefs.contrast);
    $('large').checked = prefs.large;
    $('language').value = prefs.language;
    size.value = prefs.size;
    difficulty.value = prefs.difficulty;
    starterRule.value = prefs.starterRule;
    playerMarkSelect.value = prefs.playerMark;
    markColors.checked = prefs.markColors;
    $('sliding').checked = prefs.sliding;
    $('show-history').checked = prefs.history;
    for (const element of document.querySelectorAll('[data-t]')) element.textContent = t(element.dataset.t);
    for (const element of document.querySelectorAll('[data-label]')) element.setAttribute('aria-label', t(element.dataset.label));
    const newGameLabel = prefs.language === 'pl' ? 'Nowa gra' : t('New game');
    $('new-game').querySelector('.toolbar-label').textContent = newGameLabel;
    $('new-game').setAttribute('aria-label', newGameLabel);
    renderSettings();
    renderBackup();
    renderThemeMenu();
    if ($('gallery').open) renderGallery();
    renderFullscreen();
    renderBoard();
  }

  const palettes = new Map();
  try {
    for (const rule of $('theme-palettes').sheet.cssRules) {
      const id = rule.selectorText?.match(/^:root\[data-theme="([a-z-]+)"\]$/)?.[1];
      if (id) palettes.set(id, rule.style.cssText);
    }
  } catch {
    // Some browsers block stylesheet inspection for file URLs. Serve dist over HTTP for previews.
  }

  function renderThemeMenu() {
    const options = featured.map(([id, label]) => new Option(t(label), id));
    const current = themes.find(([id]) => id === prefs.theme);
    if (!featured.includes(current)) {
      const active = new Option(t(current[1]), current[0]);
      // Show a selection from the gallery in the closed control without expanding the short list.
      active.hidden = true;
      options.push(active);
    }
    theme.replaceChildren(...options, new Option(t('more'), 'more'));
    theme.value = prefs.theme;
  }

  function createThumbnail(id) {
    const sample = [
      '.......',
      '..OX...',
      '..XXO..',
      '...O.X.'
    ];
    const thumbnail = document.createElement('span');
    thumbnail.className = 'theme-thumbnail';
    thumbnail.style.cssText = palettes.get(paletteOf(id)) ?? '';
    thumbnail.dataset.theme = paletteOf(id);
    if (illustrated(id)) thumbnail.dataset.illustration = id;
    thumbnail.setAttribute('aria-hidden', 'true');
    const grid = document.createElement('span');
    grid.className = 'board-grid';
    grid.style.setProperty('--size', sample[0].length);
    for (const mark of sample.join('')) {
      const cell = document.createElement('span');
      cell.className = 'cell';
      if (mark !== '.') {
        cell.dataset.mark = mark;
        cell.textContent = mark;
      }
      grid.append(cell);
    }
    thumbnail.append(grid);
    return thumbnail;
  }

  function renderGallery() {
    const renderTile = entry => {
      const [id, label, reward] = entry;
      const item = document.createElement('li');
      const button = document.createElement('button');
      const name = document.createElement('strong');
      const unlocked = available(entry);
      const active = prefs.theme === id;

      name.textContent = t(label);
      button.type = 'button';
      button.append(createThumbnail(id), name);
      button.setAttribute('aria-pressed', active);
      if (!unlocked) button.setAttribute('aria-disabled', 'true');
      if (active || reward) {
        const details = document.createElement('small');
        details.className = 'theme-details';
        const status = document.createElement('span');
        status.textContent = t(active ? 'activeTheme' : unlocked ? 'unlockedTheme' : 'lockedTheme');
        details.append(status);
        if (reward) {
          const { count, carry } = rewardProgress(achievements, reward);
          const progressText = document.createElement('span');
          progressText.textContent = t(reward.metric === 'wins' ? 'winProgress' : 'progress', { count, goal: reward.goal });
          const indicator = document.createElement('progress');
          indicator.max = reward.goal;
          indicator.value = count;
          indicator.setAttribute('aria-hidden', 'true');
          details.append(progressText, indicator);
          if (carry && count < reward.goal) {
            const previous = document.createElement('span');
            previous.textContent = carry >= reward.legacyGoal
              ? t('legacyUnlocked')
              : t('legacyProgress', { count: carry, goal: reward.legacyGoal });
            details.append(previous);
          }
        }
        button.append(details);
      }
      if (unlocked) {
        button.onclick = () => {
          $('gallery').close();
          chooseTheme(id);
          theme.focus();
        };
      }
      item.append(button);
      return item;
    };
    $('gallery-ordinary').replaceChildren(...basic.map(renderTile));
    $('gallery-rewards').replaceChildren(...rewards.map(renderTile));
  }

  function chooseTheme(id) {
    if (!validTheme(id)) return;
    prefs.theme = id;
    save('prefs', prefs);
    applyPreferences();
  }

  function setActive(index) {
    cells[active]?.button.setAttribute('tabindex', '-1');
    cells[index].button.tabIndex = 0;
    active = index;
  }

  function buildBoard() {
    board.style.setProperty('--size', game.size);
    cells = [];
    board.replaceChildren();
    for (let row = 0; row < game.size; row++) {
      const group = document.createElement('div');
      group.setAttribute('role', 'row');
      group.className = 'board-row';
      for (let column = 0; column < game.size; column++) {
        const index = cells.length;
        const square = document.createElement('div');
        const button = document.createElement('button');
        square.className = 'square';
        square.setAttribute('role', 'gridcell');
        button.type = 'button';
        button.className = 'cell';
        button.tabIndex = -1;
        button.onfocus = () => setActive(index);
        button.onclick = event => {
          if (event.pointerType === 'touch' || (event.detail && !event.pointerType && sameDeviceTouch.matches)) {
            select(index);
          } else {
            place(index);
          }
        };
        button.onkeydown = event => {
          const targets = {
            ArrowLeft: column > 0 ? index - 1 : index,
            ArrowRight: column < game.size - 1 ? index + 1 : index,
            ArrowUp: row > 0 ? index - game.size : index,
            ArrowDown: row < game.size - 1 ? index + game.size : index
          };
          if (!Object.hasOwn(targets, event.key)) return;
          event.preventDefault();
          cells[targets[event.key]].button.focus();
        };
        square.append(button);
        group.append(square);
        cells.push({ square, button });
      }
      board.append(group);
    }
    setActive(game.last ?? Math.floor(cells.length / 2));
  }

  function squareLabel(index) {
    return t('square', {
      row: Math.floor(index / game.size) + 1,
      column: index % game.size + 1,
      mark: game.cells[index] || t('empty')
    }) + (game.line.includes(index) ? '. ' + t('winning') : '');
  }

  function paintCell(button, index) {
    const mark = game.cells[index];
    button.textContent = mark;
    button.dataset.mark = mark;
    button.classList.toggle('selected', selected === index);
    button.classList.toggle('win', game.line.includes(index));
    button.classList.toggle('last', !game.line.length && game.last === index);
    button.setAttribute('aria-label', squareLabel(index));
    button.setAttribute('aria-disabled', Boolean(mark || game.result || computerTurn()));
  }

  function resultLabel() {
    if (game.result === 'draw') return t('draw');
    if (!level) return t(game.result ? 'win' : 'turn', { mark: game.result ?? game.turn });
    if (game.result) return t(game.result === playerMark ? 'playerWin' : 'computerWin');
    return t(computerTurn() ? 'thinking' : 'playerTurn', { mark: playerMark });
  }

  const currentStatistics = () => FiveProgressBackup.summary(currentProgress());
  const statisticsReset = createStatisticsReset('gomoku-statistics-baseline-v1', '#progress-dialog',
    currentStatistics, renderProgress);

  function renderProgress() {
    const next = rewards.find(entry => !available(entry));
    const reward = next && { name: t(next[1]), count: rewardProgress(achievements, next[2]).count,
      goal: next[2].goal, wins: next[2].metric === 'wins' };
    GamesChestProgressBar(prefs.language, statisticsReset.count('wins', achievements.wins.size), reward, () => {
      const totals = currentStatistics();
      const copy = backupCopy();
      return [[null, statisticsReset.count('finished', totals.finished)], [copy[9], statisticsReset.count('wins', totals.wins)], [copy[10], statisticsReset.count('losses', totals.losses)], [backupExtra()[1], statisticsReset.count('draws', totals.draws)]];
    });
  }

  function renderBoard() {
    board.setAttribute('aria-label', t('board', { size: game.size }));
    cells.forEach(({ button, square }, index) => {
      paintCell(button, index);
      square.setAttribute('aria-selected', selected === index);
    });
    $('turn-status').textContent = resultLabel();
    const touchHint = $('touch-move-hint');
    touchHint.hidden = selected !== null || Boolean(game.result) || computerTurn();
    touchHint.textContent = touchHint.hidden ? '' : t('touchSelectSquare');
    historyControls.hidden = !prefs.history;
    undoButton.disabled = undoFrom() < 0;
    redoButton.disabled = !future.length;
    fitToolbar();
    renderProgress();
    confirmMove.parentElement.classList.toggle('game-ended', Boolean(game.result));
    confirmMove.textContent = game.result
      ? $('new-game').getAttribute('aria-label')
      : t('place', { mark: level ? playerMark : game.turn });
    confirmMove.disabled = !game.result && (selected === null || computerTurn());
    $('selection').hidden = selected === null;
    $('selection').textContent = selected === null ? '' : squareLabel(selected);
  }

  function select(index) {
    if (game.result || computerTurn() || game.cells[index]) return;
    selected = index;
    renderBoard();
  }

  function rememberUnlocked() {
    for (const [id, , rule] of rewards) if (rewardProgress(achievements, rule).unlocked) achievements.unlockedThemes.add(id);
  }

  function recordFinished() {
    if (!session.outcome) return true;
    const outcome = results[gameId] ?? session.outcome;
    if (!Object.hasOwn(results, gameId)) {
      const updated = { ...results, [gameId]: outcome };
      if (!save('results', updated)) return false;
      results[gameId] = outcome;
    }
    // Replacements have a result, but completion rewards await a shared decision.
    if (outcome.reason !== 'replaced') {
      recordResult(achievements, gameId, outcome.outcome === 'win');
      rememberUnlocked();
      if (!save('achievements', serializeProgress(achievements))) return false;
    }
    return true;
  }

  function rememberLoser() {
    if (session.outcome?.outcome === 'win') lastLoserSide = 'computer';
    else if (session.outcome?.outcome === 'loss') lastLoserSide = 'player';
    else if (session.outcome?.outcome !== 'unknown') lastLoserSide = previousLoserSide;
  }

  function undoFrom() {
    if (!level) return game.moves.length - 1;
    // Each full turn begins with the player's move. Keep a computer opening on the board.
    for (let index = game.moves.length - 1; index >= 0; index--) {
      if ((index % 2 === 0 ? game.starter : otherMark(game.starter)) === playerMark) return index;
    }
    return -1;
  }

  function navigateHistory(undo) {
    if (!prefs.history) return;
    let next;
    if (undo) {
      const cut = undoFrom();
      if (cut < 0) return;
      next = restore(game.size, game.moves.slice(0, cut), game.starter, game.sliding, game.slidingMoves.slice(0, cut));
      future = [...game.moves.slice(cut), ...future];
      futureSliding = [...game.slidingMoves.slice(cut), ...futureSliding];
    } else {
      if (!future.length) return;
      const count = Math.min(future.length, level ? 2 : 1);
      next = restore(game.size, [...game.moves, ...future.slice(0, count)], game.starter, game.sliding,
        [...game.slidingMoves, ...futureSliding.slice(0, count)]);
      future = future.slice(count);
      futureSliding = futureSliding.slice(count);
    }
    stopComputer();
    updatePosition(next);
  }

  function gameSnapshot() {
    return {
      id: gameId, size: game.size, sliding: game.sliding, starter: game.starter, moves: game.moves,
      slidingMoves: game.slidingMoves, future, futureSliding, playerMark, lastLoserSide, previousLoserSide, difficulty: level,
      started: session.started, outcome: session.outcome
    };
  }

  function saveGame() {
    return save('game', gameSnapshot());
  }

  function stopComputer() {
    clearTimeout(computerTimer);
    computerTimer = null;
    computerWorker?.terminate();
    computerWorker = null;
  }

  function scheduleComputer() {
    if (!computerTurn() || computerTimer !== null || computerWorker || $('restart').open) return;
    computerTimer = setTimeout(() => {
      computerTimer = null;
      const position = game;
      const searchPosition = { ...position, sliding: prefs.sliding };
      const finish = move => {
        stopComputer();
        if (position !== game || !computerTurn()) return;
        const legal = Number.isInteger(move) && move >= 0 && move < game.cells.length && !game.cells[move];
        place(legal ? move : chooseMove(searchPosition, 'easy'), true);
      };
      try {
        const worker = new Worker('computer-worker.js?v=sliding-now-1');
        computerWorker = worker;
        worker.onmessage = event => { if (computerWorker === worker) finish(event.data); };
        const fallback = () => {
          if (computerWorker === worker) finish(chooseMove(searchPosition, level));
        };
        worker.onerror = event => {
          event.preventDefault();
          fallback();
        };
        worker.postMessage({ game: searchPosition, level });
        computerTimer = setTimeout(fallback, 5000);
      } catch {
        finish(chooseMove(searchPosition, level));
      }
    }, 180);
  }

  function place(index, byComputer = false) {
    if (computerTurn() !== byComputer) return;
    const next = play(game, index, prefs.sliding);
    if (!next) return;
    if (!byComputer) {
      future = [];
      futureSliding = [];
    }
    session.started = true;
    updatePosition(next);
  }

  function updatePosition(next) {
    game = next;
    session.outcome ??= naturalOutcome(game, playerMark);
    rememberLoser();
    if (game.shift?.some(Boolean) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const [dr, dc] = game.shift;
      const step = board.getBoundingClientRect().width / game.size;
      board.animate([
        { transform: 'translate(' + (-dc * step) + 'px,' + (-dr * step) + 'px)' },
        { transform: 'translate(0,0)' }
      ], { duration: 180, easing: 'ease-out' });
    }
    selected = null;
    if (saveGame()) recordFinished();
    renderBoard();
    const victory = Boolean(game.line.length && (!level || game.result === playerMark));
    GameVictory(victory, resultLabel());
    if (victory) {
      if (document.fullscreenElement) {
        document.fullscreenElement.append(document.querySelector('.shared-victory'));
      }
    }
    scheduleComputer();
  }

  function start() {
    stopComputer();
    session.outcome = replacementOutcome(session);
    rememberLoser();
    // Persist a recoverable outcome before replacing the current game. A retry uses the same ID.
    if (!saveGame() || !recordFinished()) {
      renderBoard();
      scheduleComputer();
      return;
    }
    const previousStarter = sideOf(game.starter);
    const playerStarts = prefs.starterRule === 'alternate'
      ? (session.started ? previousStarter === 'computer' : previousStarter === 'player')
      : lastLoserSide !== 'computer';
    const next = create(prefs.size, playerStarts ? prefs.playerMark : otherMark(prefs.playerMark), prefs.sliding);
    const nextId = newId();
    const snapshot = {
      id: nextId, size: next.size, sliding: next.sliding, starter: next.starter, moves: [],
      slidingMoves: [], future: [], futureSliding: [], playerMark: prefs.playerMark, lastLoserSide, previousLoserSide: lastLoserSide,
      difficulty: prefs.difficulty, started: false, outcome: null
    };
    if (!save('game', snapshot)) {
      renderBoard();
      scheduleComputer();
      return;
    }
    level = prefs.difficulty;
    previousLoserSide = lastLoserSide;
    future = [];
    futureSliding = [];
    playerMark = prefs.playerMark;
    game = next;
    gameId = nextId;
    session = { started: false, outcome: null };
    selected = null;
    GameVictory(false);
    buildBoard();
    renderBoard();
    scheduleComputer();
  }

  // Adapted from Garibaldka's accepted Games Chest toolbar.
  document.querySelector('#game-picker-button').addEventListener('game-picker-label-change', fitToolbar);
  function fitToolbar() {
    const toolbar = document.querySelector('.game-toolbar');
    toolbar.classList.remove('toolbar-compact', 'toolbar-icons', 'toolbar-new-icon', 'toolbar-picker-icon', 'toolbar-overflow');
    const style = getComputedStyle(toolbar);
    const available = toolbar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const required = () => Math.ceil($('new-game').getBoundingClientRect().width +
      toolbar.querySelector('.game-tools').getBoundingClientRect().width + 8);
    if (required() > available) toolbar.classList.add('toolbar-compact');
    if (required() > available) toolbar.classList.add('toolbar-icons');
    if (required() > available) toolbar.classList.add('toolbar-new-icon');
    if (required() > available) toolbar.classList.add('toolbar-picker-icon');
    if (required() > available) toolbar.classList.add('toolbar-overflow');
  }

  function renderFullscreen() {
    const active = $('game-area').classList.contains('game-fullscreen');
    const label = t(active ? 'Exit full screen' : 'Full screen');
    const button = $('fullscreen');
    button.setAttribute('aria-pressed', active);
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('.fullscreen-label').textContent = label;
    fitToolbar();
  }

  $('language').onchange = event => {
    prefs.language = event.target.value;
    save('prefs', prefs);
    applyPreferences();
  };
  $('large').onchange = event => {
    prefs.large = event.target.checked;
    save('prefs', prefs);
    applyPreferences();
  };
  $('contrast').onclick = () => {
    prefs.contrast = !prefs.contrast;
    save('prefs', prefs);
    applyPreferences();
  };
  theme.onchange = () => {
    if (theme.value === 'more') {
      theme.value = prefs.theme;
      renderGallery();
      $('gallery').showModal();
    } else {
      chooseTheme(theme.value);
    }
  };
  size.onchange = () => {
    prefs.size = Number(size.value);
    save('prefs', prefs);
  };
  difficulty.onchange = () => {
    prefs.difficulty = difficulty.value;
    save('prefs', prefs);
  };
  starterRule.onchange = () => {
    prefs.starterRule = starterRule.value;
    save('prefs', prefs);
  };
  playerMarkSelect.onchange = () => {
    prefs.playerMark = playerMarkSelect.value;
    save('prefs', prefs);
  };
  markColors.onchange = () => {
    prefs.markColors = markColors.checked;
    save('prefs', prefs);
    applyPreferences();
  };
  $('sliding').onchange = event => {
    prefs.sliding = event.target.checked;
    save('prefs', prefs);
    stopComputer();
    scheduleComputer();
  };
  $('show-history').onchange = event => {
    prefs.history = event.target.checked;
    save('prefs', prefs);
    renderBoard();
  };
  undoButton.onclick = () => navigateHistory(true);
  redoButton.onclick = () => navigateHistory(false);
  for (const option of ['size', 'difficulty', 'starter-rule', 'player-mark', 'mark-colors', 'show-history', 'sliding']) {
    const info = $(option + '-info');
    const description = $(option + '-description');
    info.onclick = () => {
      description.hidden = !description.hidden;
      info.setAttribute('aria-expanded', !description.hidden);
    };
  }
  $('settings-button').onclick = () => {
    renderSettings();
    $('settings').showModal();
  };
  $('settings').onclose = () => {
    backupRead++; $('backup-import').disabled = false; $('settings-button').focus();
  };
  $('settings-retry').onclick = () => {
    if (save('prefs', prefs)) {
      $('size').focus();
    }
  };
  $('help-button').onclick = () => $('help').showModal();
  function requestNewGame() {
    if (session.started && !game.result) {
      if ($('restart').open) return;
      restartGameId = gameId;
      stopComputer();
      $('restart-message').textContent = t(session.outcome ? 'restartRecorded' : 'restartLoss');
      $('restart').returnValue = '';
      $('restart').showModal();
    } else {
      start();
    }
  }
  $('new-game').onclick = requestNewGame;
  $('restart').onclose = () => {
    const confirmed = $('restart').returnValue === 'start';
    const expectedId = restartGameId;
    restartGameId = null;
    $('restart').returnValue = '';
    if (confirmed && expectedId === gameId) start();
    else scheduleComputer();
  };
  confirmMove.onclick = () => {
    if (game.result) requestNewGame();
    else place(selected);
  };
  const gameArea = $('game-area');
  const outsideGame = document.querySelectorAll('body > header, body > footer');
  function setFullscreen(active) {
    gameArea.classList.toggle('game-fullscreen', active);
    document.body.classList.toggle('game-expanded', active);
    for (const element of outsideGame) element.inert = active;
    renderFullscreen();
  }
  $('fullscreen').onclick = async () => {
    if (gameArea.classList.contains('game-fullscreen')) {
      if (document.fullscreenElement === gameArea) await document.exitFullscreen();
      setFullscreen(false);
      return;
    }
    setFullscreen(true);
    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) return;
    if (document.fullscreenEnabled && gameArea.requestFullscreen) {
      try { await gameArea.requestFullscreen(); } catch { /* Keep the expanded in-page layout. */ }
    }
  };
  document.addEventListener('fullscreenchange', () => {
    setFullscreen(document.fullscreenElement === gameArea);
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !document.fullscreenElement &&
        gameArea.classList.contains('game-fullscreen') && !document.querySelector('dialog[open]')) {
      setFullscreen(false);
      $('fullscreen').focus();
    }
  });
  document.querySelectorAll('main ~ dialog').forEach(dialog => $('game-area').append(dialog));
  new ResizeObserver(fitToolbar).observe(document.querySelector('.game-toolbar'));
  document.fonts.ready.then(fitToolbar);
  addLanguages($('language'));
  if (saveGame()) recordFinished();
  buildBoard();
  applyPreferences();
  scheduleComputer();
})();
