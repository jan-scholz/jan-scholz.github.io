(() => {
  /* === DOM References === */
  const $ = id => document.getElementById(id);
  const body = document.body;

  const gameFlag       = $('game-flag');
  const gameFlagWrap   = $('game-flag-wrap');
  const gamePrompt     = $('game-prompt');
  const hudScore       = $('hud-score');
  const hudGuesses     = $('hud-guesses');
  const progressFill   = $('progress-fill');
  const feedbackBar    = $('feedback-bar');
  const feedbackText   = $('feedback-text');
  const btnNext        = $('btn-next');
  const countryPanel   = $('country-panel');
  const infoFlag       = $('info-flag');
  const infoName       = $('info-name');
  const infoCapital    = $('info-capital');
  const infoArea       = $('info-area');
  const infoPop        = $('info-pop');
  const infoPeak       = $('info-peak');
  const infoNeighbours = $('info-neighbours');
  const inputFeedback  = $('input-feedback');
  const guessInput     = $('guess-input');
  const settingsTitle  = $('settings-title');
  const valRounds      = $('val-rounds');
  const valGuesses     = $('val-guesses');
  const chkAuto        = $('chk-auto');

  /* === Constants === */
  const MODE_LABELS = {
    'find': 'Find the Country',
    'name-country': 'Name the Country',
    'name-capital': 'Name the Capital',
  };

  /* === Game State === */
  const gameState = {
    mode: null,
    phase: 'idle',
    screen: 'select',
    totalRounds: 10,
    maxGuesses: 3,
    autoAdvance: false,
    roundOrder: [],
    currentRound: 0,
    score: 0,
    skipped: 0,
    guessesLeft: 0,
    targetId: null,
    advanceTimer: null,
  };

  /* === State Transitions === */
  function setPhase(phase) {
    gameState.phase = phase;
    body.dataset.phase = phase;
  }

  function setMode(mode) {
    gameState.mode = mode;
    body.dataset.mode = mode;
  }

  function setScreen(screen) {
    gameState.screen = screen;
    if (screen) {
      body.dataset.screen = screen;
    } else {
      delete body.dataset.screen;
    }
  }

  /* === Data === */
  let countriesData = {};
  let aliasesData = {};
  let geoFeatures = [];
  let smallTargetFeatures = [];

  /* === D3 Globals === */
  let projection, pathGenerator, zoom, g;

  /* === Utility Functions === */
  function featureId(d) { return String(d.id).padStart(3, '0'); }

  function normalize(str) {
    return str.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function flagUrl(iso_a2) {
    return `https://flagcdn.com/w160/${iso_a2}.png`;
  }

  function formatNumber(n) {
    return n.toLocaleString();
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function clearAdvanceTimer() {
    if (gameState.advanceTimer) {
      clearTimeout(gameState.advanceTimer);
      gameState.advanceTimer = null;
    }
  }

  function clearMapClasses() {
    d3.selectAll('.country')
      .classed('highlighted', false)
      .classed('target', false)
      .classed('wrong-guess', false);
  }

  function highlightTarget(id) {
    d3.selectAll('.country').classed('target', false);
    d3.select(`.country[data-id="${id}"]`).classed('target', true);
  }

  function fillCountryInfo(id) {
    const c = countriesData[id];
    if (!c) return;
    infoFlag.src = flagUrl(c.iso_a2);
    infoFlag.alt = c.name + ' flag';
    infoName.textContent = c.name;
    infoCapital.textContent = c.capital;
    infoArea.textContent = formatNumber(c.area_km2) + ' km\u00B2';
    infoPop.textContent = formatNumber(c.population);
    infoPeak.textContent = c.highest_point.name + ' (' + formatNumber(c.highest_point.elevation_m) + ' m)';
    infoNeighbours.textContent = c.neighbour_count;
  }

  function zoomToCountry(id, duration = 750) {
    const feature = geoFeatures.find(f => featureId(f) === id);
    if (!feature) return;
    const [[x0, y0], [x1, y1]] = pathGenerator.bounds(feature);
    const svgWidth = window.innerWidth;
    const svgHeight = window.innerHeight;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const x = (x0 + x1) / 2;
    const y = (y0 + y1) / 2;
    const scale = Math.min(8, 0.9 / Math.max(dx / svgWidth, dy / svgHeight));
    const tx = svgWidth / 2 - scale * x;
    const ty = svgHeight / 2 - scale * y;

    d3.select('#map').transition().duration(duration)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function resetZoom(duration = 300) {
    d3.select('#map').transition().duration(duration)
      .call(zoom.transform, d3.zoomIdentity);
  }

  /* === Data Loading === */
  async function loadData() {
    const [topology, countries, aliases, smallTargets] = await Promise.all([
      d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'),
      d3.json('countries.json'),
      d3.json('aliases.json'),
      d3.json('small_targets.json').catch(() => ({ type: 'FeatureCollection', features: [] })),
    ]);

    countriesData = countries;
    aliasesData = aliases;
    geoFeatures = topojson.feature(topology, topology.objects.countries).features;
    smallTargetFeatures = smallTargets.features;

    initMap();
  }

  /* === D3 Map Setup === */
  function initMap() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select('#map')
      .attr('width', width)
      .attr('height', height);

    g = d3.select('#map-group');

    projection = d3.geoNaturalEarth1()
      .scale(width / 6.3)
      .translate([width / 2, height / 2]);

    pathGenerator = d3.geoPath().projection(projection);

    g.selectAll('path')
      .data(geoFeatures)
      .join('path')
      .attr('class', 'country')
      .attr('d', pathGenerator)
      .attr('data-id', d => featureId(d))
      .on('click', onCountryClick)
      .on('mouseenter', onCountryEnter)
      .on('mouseleave', onCountryLeave);

    // Render enlarged click targets for small countries
    const smallG = d3.select('#small-targets');
    smallG.selectAll('path')
      .data(smallTargetFeatures)
      .join('path')
      .attr('d', pathGenerator)
      .attr('data-id', d => d.properties.id)
      .on('click', function(event, d) {
        const id = d.properties.id;
        if (gameState.mode === 'find' && gameState.phase === 'playing') {
          handleFindClick(id, this);
        }
      });

    zoom = d3.zoom()
      .scaleExtent([1, 24])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        smallG.attr('transform', event.transform);
        document.documentElement.style.setProperty('--zoom-k', event.transform.k);
      });

    svg.call(zoom);

    // Click on empty SVG area to dismiss explore panel
    svg.on('click', (event) => {
      if (event.target.tagName !== 'path' && gameState.mode === 'explore') {
        d3.selectAll('.country').classed('highlighted', false);
        countryPanel.classList.remove('visible');
        lastTappedId = null;
      }
    });

    wireEvents();
  }

  /* === Explore Mode === */
  let lastTappedId = null;

  function onCountryEnter(event, d) {
    if (gameState.mode !== 'explore') return;
    const id = featureId(d);
    if (!countriesData[id]) return;
    d3.select(this).classed('highlighted', true);
    fillCountryInfo(id);
    countryPanel.classList.add('visible');
  }

  function onCountryLeave(event, d) {
    if (gameState.mode !== 'explore') return;
    d3.select(this).classed('highlighted', false);
    countryPanel.classList.remove('visible');
  }

  function handleExploreClick(id, pathEl) {
    if (lastTappedId === id) {
      d3.selectAll('.country').classed('highlighted', false);
      countryPanel.classList.remove('visible');
      lastTappedId = null;
    } else {
      d3.selectAll('.country').classed('highlighted', false);
      d3.select(pathEl).classed('highlighted', true);
      fillCountryInfo(id);
      countryPanel.classList.add('visible');
      lastTappedId = id;
    }
  }

  function startExplore() {
    setMode('explore');
    setPhase('idle');
    setScreen(null);
    lastTappedId = null;
  }

  /* === Country Click Handler === */
  function onCountryClick(event, d) {
    const id = featureId(d);

    if (gameState.mode === 'explore') {
      if (!countriesData[id]) return;
      handleExploreClick(id, this);
    } else if (gameState.mode === 'find' && gameState.phase === 'playing') {
      handleFindClick(id, this);
    }
  }

  /* === Find the Country === */
  function handleFindClick(id, pathEl) {
    if (id === gameState.targetId) {
      gameState.score++;
      showFeedback(true);
    } else {
      gameState.guessesLeft--;
      hudGuesses.textContent = gameState.guessesLeft;
      d3.select(pathEl).classed('wrong-guess', true);
      setTimeout(() => d3.select(pathEl).classed('wrong-guess', false), 600);

      if (gameState.guessesLeft <= 0) {
        showFeedback(false);
      }
    }
  }

  /* === Text Input Submission === */
  function handleSubmit() {
    const raw = guessInput.value;
    if (!raw.trim()) return;

    const input = normalize(raw);
    const id = gameState.targetId;
    const c = countriesData[id];
    let correct = false;

    if (gameState.mode === 'name-country') {
      correct = (aliasesData[input] === id);
    } else if (gameState.mode === 'name-capital') {
      correct = (normalize(c.capital) === input);
    }

    if (correct) {
      gameState.score++;
      showFeedback(true);
    } else {
      gameState.guessesLeft--;
      hudGuesses.textContent = gameState.guessesLeft;
      if (gameState.guessesLeft <= 0) {
        showFeedback(false);
      } else {
        inputFeedback.textContent = `Wrong \u2014 ${gameState.guessesLeft} guess${gameState.guessesLeft !== 1 ? 'es' : ''} left`;
        guessInput.value = '';
        guessInput.focus();
      }
    }
  }

  /* === Settings === */
  function openSettings(mode) {
    gameState.mode = mode;
    settingsTitle.textContent = MODE_LABELS[mode];
    valRounds.textContent = gameState.totalRounds;
    valGuesses.textContent = gameState.maxGuesses;
    chkAuto.checked = gameState.autoAdvance;
    setScreen('settings');
  }

  /* === Game Flow === */
  function startGame() {
    gameState.totalRounds = parseInt(valRounds.textContent);
    gameState.maxGuesses = parseInt(valGuesses.textContent);
    gameState.autoAdvance = chkAuto.checked;

    const validIds = Object.keys(countriesData).filter(id =>
      geoFeatures.some(f => featureId(f) === id)
    );
    shuffleArray(validIds);
    gameState.roundOrder = validIds.slice(0, gameState.totalRounds);
    gameState.currentRound = 0;
    gameState.score = 0;
    gameState.skipped = 0;

    setMode(gameState.mode);
    setScreen(null);
    startRound();
  }

  function startRound() {
    clearMapClasses();
    clearAdvanceTimer();

    const id = gameState.roundOrder[gameState.currentRound];
    gameState.targetId = id;
    gameState.guessesLeft = gameState.maxGuesses;

    const c = countriesData[id];

    gameFlag.src = flagUrl(c.iso_a2);
    gameFlag.alt = c.name + ' flag';
    gamePrompt.textContent = c.name;
    hudScore.textContent = gameState.score;
    hudGuesses.textContent = gameState.guessesLeft;
    progressFill.style.width = ((gameState.currentRound) / gameState.totalRounds * 100) + '%';

    guessInput.value = '';
    inputFeedback.textContent = '';
    feedbackBar.classList.remove('feedback-bar--correct', 'feedback-bar--wrong');

    setPhase('playing');

    if (gameState.mode === 'name-country' || gameState.mode === 'name-capital') {
      highlightTarget(id);
      zoomToCountry(id);
      guessInput.placeholder = gameState.mode === 'name-country'
        ? 'Name the country\u2026'
        : 'Name the capital\u2026';
      setTimeout(() => guessInput.focus(), 800);
    }
  }

  function showFeedback(correct) {
    const id = gameState.targetId;
    const c = countriesData[id];

    let answer;
    if (gameState.mode === 'name-capital') {
      answer = c.capital;
    } else {
      answer = c.name;
    }

    if (correct) {
      feedbackText.textContent = 'Correct!';
      feedbackBar.classList.add('feedback-bar--correct');
      feedbackBar.classList.remove('feedback-bar--wrong');
    } else {
      feedbackText.textContent = `Out of guesses: It was ${answer}`;
      feedbackBar.classList.add('feedback-bar--wrong');
      feedbackBar.classList.remove('feedback-bar--correct');
    }

    btnNext.style.display = gameState.autoAdvance ? 'none' : '';
    fillCountryInfo(id);
    highlightTarget(id);
    zoomToCountry(id);
    hudScore.textContent = gameState.score;

    setPhase('feedback');

    if (gameState.autoAdvance) {
      gameState.advanceTimer = setTimeout(advanceRound, 1800);
    } else {
      setTimeout(() => btnNext.focus(), 100);
    }
  }

  function advanceRound() {
    clearAdvanceTimer();
    gameState.currentRound++;
    if (gameState.currentRound >= gameState.totalRounds) {
      showStats();
    } else {
      startRound();
    }
  }

  function skipRound() {
    gameState.skipped++;
    advanceRound();
  }

  function quitGame() {
    clearAdvanceTimer();
    if (gameState.mode === 'explore') {
      returnToMenu();
      return;
    }
    showStats();
  }

  function showStats() {
    clearAdvanceTimer();
    clearMapClasses();

    let roundsPlayed;
    if (gameState.currentRound >= gameState.totalRounds) {
      roundsPlayed = gameState.totalRounds;
    } else {
      roundsPlayed = gameState.currentRound + 1;
    }

    $('stat-rounds').textContent = roundsPlayed;
    $('stat-correct').textContent = gameState.score;
    $('stat-skipped').textContent = gameState.skipped;
    const pct = roundsPlayed > 0 ? Math.round((gameState.score / roundsPlayed) * 100) : 0;
    $('stat-score').textContent = pct + '%';

    setPhase('idle');
    setScreen('stats');
    resetZoom();
  }

  function returnToMenu() {
    clearAdvanceTimer();
    clearMapClasses();
    countryPanel.classList.remove('visible');
    lastTappedId = null;
    setPhase('idle');
    setScreen('select');
    resetZoom();
  }

  /* === Event Wiring === */
  function wireEvents() {
    // Mode selection
    document.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.dataset.modeChoice;
        if (mode === 'explore') {
          startExplore();
        } else {
          openSettings(mode);
        }
      });
    });

    // Stepper buttons
    document.querySelectorAll('.stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const setting = btn.dataset.setting;
        const dir = parseInt(btn.dataset.dir);
        const valEl = setting === 'rounds' ? valRounds : valGuesses;
        const min = 1;
        const max = setting === 'rounds' ? 50 : 10;
        let val = parseInt(valEl.textContent) + dir;
        val = Math.max(min, Math.min(max, val));
        valEl.textContent = val;
      });
    });

    // Settings buttons
    $('btn-back-settings').addEventListener('click', () => setScreen('select'));
    $('btn-start').addEventListener('click', startGame);

    // Game buttons
    $('btn-skip').addEventListener('click', skipRound);
    $('btn-quit').addEventListener('click', quitGame);
    $('btn-next').addEventListener('click', advanceRound);
    $('btn-menu').addEventListener('click', returnToMenu);

    // Text input
    $('btn-submit').addEventListener('click', handleSubmit);
    guessInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });

    // Stats screen
    $('btn-back-menu').addEventListener('click', returnToMenu);
  }

  /* === Init === */
  setPhase('idle');
  setScreen('select');
  loadData().catch(err => console.error('Failed to load data:', err));
})();
