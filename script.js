"use strict";

(() => {
  // =====================================================================
  // 1. CONFIGURACIÓN
  // =====================================================================

  const WIDTH = 8;                 // el tablero es de WIDTH x WIDTH
  const SIZE = WIDTH * WIDTH;

  // Cada color es un número (0-5) que apunta a un nombre de esta lista.
  // Las imágenes se llaman así: red.png (normal), redH.png (rayas horizontales),
  // redV.png (rayas verticales). Si falta una imagen de rayas, se dibujan con CSS.
  const CANDY_NAMES = ["red", "green", "blue", "orange", "purple", "yellow"];
  const IMAGE_VERSION = 2; // súbelo si reemplazas imágenes con el mismo nombre
  const imagePath = (name) => `images/candies/${name}.png?v=${IMAGE_VERSION}`;
  const CANDY_IMAGES = CANDY_NAMES.map((name) => imagePath(name));
  const STRIPED_IMAGES = {
    stripedH: CANDY_NAMES.map((name) => imagePath(name + "H")),
    stripedV: CANDY_NAMES.map((name) => imagePath(name + "V")),
  };
  const BOMB_IMAGE = imagePath("explosive");
  const loadedImages = new Set(); // imágenes que sí existen (se llena al iniciar)

  // Tipos de caramelos especiales
  const STRIPED_H = "stripedH";    // rayado horizontal: borra su fila
  const STRIPED_V = "stripedV";    // rayado vertical: borra su columna
  const WRAPPED = "wrapped";       // envuelto: explota 3x3...
  const ARMED = "armed";           // ...queda "armado", cae y vuelve a explotar
  const BOMB = "bomb";             // bomba de color: borra todo un color

  const POINTS_PER_CANDY = 10;

  // ---------- Niveles ----------
  // Puntos que hace en promedio un jugador por movimiento, según cuántos colores hay.
  // Con menos colores salen más combinaciones y cascadas. Calibrado con un bot.
  const POINTS_PER_MOVE = { 5: 234, 6: 113 };
  const SAVE_KEY = "candyRush.progress.v1"; // dónde se guarda el progreso en el navegador
  // Qué tan exigente es el objetivo (fracción de lo que suele lograr un jugador)
  const DIFFICULTY = { start: 0.3, perLevel: 0.009, max: 0.72, hardBonus: 0.1, relaxDiscount: 0.08 };

  // Velocidad de las animaciones: 1 = rápido, 2 = el doble de lento, 1.5 = intermedio...
  const MOVE_SCALE = 2;       // movimientos: intercambio, caída y mezcla
  const REACTION_SCALE = 1.4; // reacciones: combinaciones y explosiones
  const TIME = {
    swap: 180 * MOVE_SCALE,        // intercambio de dos caramelos
    fallPerRow: 70 * MOVE_SCALE,   // tiempo de caída por cada fila
    fallMin: 160 * MOVE_SCALE,     // caída mínima
    appear: 300 * MOVE_SCALE,      // entrada del tablero al iniciar
    pop: 250 * REACTION_SCALE,     // caramelos que desaparecen por combinación
    boom: 350 * REACTION_SCALE,    // caramelos que desaparecen por un especial
    transform: 300 * REACTION_SCALE, // caramelos que se convierten en especiales
  };

  // =====================================================================
  // 2. ESTADO
  // =====================================================================

  // El "cerebro": 64 casillas. Cada una es null (vacía) o un caramelo:
  //   { color: 0-5, special: null }          caramelo normal
  //   { color: 2, special: "stripedH" }      rayado, envuelto o armado (tienen color)
  //   { color: null, special: "bomb" }       bomba de color (no tiene color)
  let grid = [];
  let els = [];         // el elemento HTML que se ve en cada casilla (mismo índice que grid)
  let score = 0;
  let busy = false;     // true mientras hay animaciones: bloquea nuevos movimientos
  let selected = null;  // casilla seleccionada con un toque (modo tocar-tocar)
  let ended = false;    // true cuando terminó el nivel: el tablero queda bloqueado
  let level = null;     // el nivel que se está jugando (lo crea generateLevel)
  let movesLeft = 0;
  let activeColors = [0, 1, 2, 3, 4, 5]; // colores que aparecen en este nivel
  let progress = null;  // progreso guardado: niveles desbloqueados, estrellas y récords

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board");
  const scoreEl = $("score");
  const scoreBoxEl = $("scoreBox");
  const levelEl = $("levelNum");
  const movesEl = $("moves");
  const movesBoxEl = $("movesBox");
  const targetEl = $("target");
  const goalFillEl = $("goalFill");
  const goalMarks = [$("goalMark1"), $("goalMark2"), $("goalMark3")];
  const messageEl = $("message");
  const restartBtn = $("restart");
  const resultEl = $("result");
  const resultTitleEl = $("resultTitle");
  const resultTextEl = $("resultText");
  const resultStars = [...document.querySelectorAll("#resultStars .star")];
  const finalScoreEl = $("finalScore");
  const bestScoreEl = $("bestScore");
  const primaryBtn = $("resultPrimary");
  const secondaryBtn = $("resultSecondary");
  const exitBtn = $("exitGame");

  // =====================================================================
  // 3. LÓGICA PURA (solo trabaja con datos, nunca toca la pantalla)
  // =====================================================================

  const rowOf = (i) => Math.floor(i / WIDTH);
  const colOf = (i) => i % WIDTH;
  const indexOf = (r, c) => r * WIDTH + c;
  // Color al azar entre los que usa el nivel (rand permite usar un azar "con semilla")
  const randomColor = (rand = Math.random) =>
    activeColors[Math.floor(rand() * activeColors.length)];
  const candy = (color, special = null) => ({ color, special });
  const isStriped = (cell) => cell && (cell.special === STRIPED_H || cell.special === STRIPED_V);
  const sameColor = (x, y) => x && y && x.color !== null && x.color === y.color;
  const allCells = () => [...Array(SIZE).keys()];

  function areAdjacent(a, b) {
    return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b)) === 1;
  }

  function swapIn(g, a, b) {
    [g[a], g[b]] = [g[b], g[a]];
  }

  // Busca líneas de 3 o más caramelos del mismo color, en filas y columnas por separado.
  // Devuelve cada línea (groups, con su dirección) y todas las casillas afectadas (cells).
  function findMatches(g) {
    const groups = [];

    const scanLine = (getIndex, dir) => {
      let run = [getIndex(0)];
      for (let k = 1; k <= WIDTH; k++) {
        const i = k < WIDTH ? getIndex(k) : null;
        if (i !== null && sameColor(g[i], g[run[0]])) {
          run.push(i);
        } else {
          if (run.length >= 3) groups.push({ cells: run, dir });
          if (i !== null) run = [i];
        }
      }
    };

    for (let r = 0; r < WIDTH; r++) scanLine((c) => indexOf(r, c), "h"); // filas
    for (let c = 0; c < WIDTH; c++) scanLine((r) => indexOf(r, c), "v"); // columnas

    return { groups, cells: new Set(groups.flatMap((grp) => grp.cells)) };
  }

  // ¿Queda algún movimiento válido?
  function hasPossibleMove(g) {
    if (g.some((cell) => cell && cell.special === BOMB)) return true; // la bomba siempre sirve
    const copy = g.slice();
    for (let i = 0; i < SIZE; i++) {
      const neighbors = [];
      if (colOf(i) < WIDTH - 1) neighbors.push(i + 1);
      if (rowOf(i) < WIDTH - 1) neighbors.push(i + WIDTH);
      for (const n of neighbors) {
        if (g[i].special && g[n].special) return true; // dos especiales juntos siempre sirven
        swapIn(copy, i, n);
        const works = findMatches(copy).groups.length > 0;
        swapIn(copy, i, n);
        if (works) return true;
      }
    }
    return false;
  }

  // Tablero inicial sin combinaciones y con al menos un movimiento posible
  function createGrid(rand = Math.random) {
    let g;
    do {
      g = new Array(SIZE);
      for (let i = 0; i < SIZE; i++) {
        const r = rowOf(i);
        const c = colOf(i);
        let color;
        do {
          color = randomColor(rand);
        } while (
          (c >= 2 && g[i - 1].color === color && g[i - 2].color === color) ||
          (r >= 2 && g[i - WIDTH].color === color && g[i - 2 * WIDTH].color === color)
        );
        g[i] = candy(color);
      }
    } while (!hasPossibleMove(g));
    return g;
  }

  // ---------- Áreas que afecta cada especial ----------

  const rowCells = (i) => allCells().filter((x) => rowOf(x) === rowOf(i));
  const colCells = (i) => allCells().filter((x) => colOf(x) === colOf(i));

  // Cuadrado alrededor de una casilla (radio 1 = 3x3, radio 2 = 5x5)
  function squareArea(center, radius) {
    return allCells().filter(
      (x) =>
        Math.abs(rowOf(x) - rowOf(center)) <= radius &&
        Math.abs(colOf(x) - colOf(center)) <= radius
    );
  }

  // Varias filas y columnas completas alrededor de una casilla (cruz gruesa)
  function crossArea(center, radius) {
    return allCells().filter(
      (x) =>
        Math.abs(rowOf(x) - rowOf(center)) <= radius ||
        Math.abs(colOf(x) - colOf(center)) <= radius
    );
  }

  const cellsOfColor = (g, color) => allCells().filter((i) => g[i] && g[i].color === color);

  function mostCommonColor(g, except = null) {
    const counts = new Array(CANDY_IMAGES.length).fill(0);
    g.forEach((cell) => {
      if (cell && cell.color !== null && cell.color !== except) counts[cell.color]++;
    });
    return counts.indexOf(Math.max(...counts));
  }

  // Calcula todo lo que se destruye a partir de unas casillas iniciales,
  // activando en cadena los especiales que sean alcanzados.
  //   activated: especiales que ya se usaron (no se vuelven a activar)
  //   protect:   casillas que no se pueden tocar (los especiales recién creados)
  // Devuelve: clear (casillas a borrar), armed (envueltos que explotarán otra vez)
  // y fired (especiales que se activaron, para dibujar sus efectos).
  function expandEffects(g, initial, activated = [], protect = []) {
    const clear = new Set();
    const armed = new Set();
    const fired = [];
    const done = new Set(activated);
    const safe = new Set(protect);
    const queue = [];

    const hit = (i) => {
      if (!g[i] || safe.has(i) || armed.has(i) || clear.has(i)) return;
      clear.add(i);
      queue.push(i);
    };

    initial.forEach(hit);

    while (queue.length) {
      const i = queue.shift();
      const cell = g[i];
      if (!cell.special || done.has(i)) continue;
      done.add(i);
      fired.push({ index: i, special: cell.special });

      switch (cell.special) {
        case STRIPED_H:
          rowCells(i).forEach(hit);
          break;
        case STRIPED_V:
          colCells(i).forEach(hit);
          break;
        case WRAPPED: // primera explosión: el envuelto sobrevive y queda armado
          clear.delete(i);
          armed.add(i);
          squareArea(i, 1).forEach(hit);
          break;
        case ARMED: // segunda explosión: ahora sí desaparece
          squareArea(i, 1).forEach(hit);
          break;
        case BOMB: // alcanzada por otro especial: borra el color más abundante
          cellsOfColor(g, mostCommonColor(g)).forEach(hit);
          break;
      }
    }
    return { clear, armed, fired };
  }

  // Decide qué especiales nacen de una ronda de combinaciones:
  //   L o T (una línea horizontal y una vertical que se cruzan) → envuelto
  //   5 o más en línea → bomba de color
  //   4 en línea → rayado
  // move = { a, b } si fue el jugador, o null si fue una cascada.
  function planSpecials(g, matches, move) {
    const plans = [];
    const usedGroups = new Set();
    const taken = new Set();
    const moved = move ? [move.a, move.b] : [];
    const canHost = (i) => g[i] && !g[i].special && !taken.has(i);
    const add = (i, cell) => {
      taken.add(i);
      plans.push({ index: i, cell });
    };
    const middle = (list) => list[Math.floor(list.length / 2)];

    const horizontals = matches.groups.filter((grp) => grp.dir === "h");
    const verticals = matches.groups.filter((grp) => grp.dir === "v");

    // L o T
    for (const h of horizontals) {
      for (const v of verticals) {
        if (usedGroups.has(h) || usedGroups.has(v)) continue;
        const cross = h.cells.find((i) => v.cells.includes(i));
        if (cross === undefined) continue;
        usedGroups.add(h);
        usedGroups.add(v);
        const spot = canHost(cross) ? cross : [...h.cells, ...v.cells].find(canHost);
        if (spot === undefined) continue;
        const longest = Math.max(h.cells.length, v.cells.length);
        add(spot, longest >= 5 ? candy(null, BOMB) : candy(g[cross].color, WRAPPED));
      }
    }

    // Líneas rectas de 4 o más
    for (const grp of matches.groups) {
      if (usedGroups.has(grp) || grp.cells.length < 4) continue;
      const spot =
        grp.cells.find((i) => moved.includes(i) && canHost(i)) ??
        middle(grp.cells.filter(canHost));
      if (spot === undefined) continue;
      if (grp.cells.length >= 5) {
        add(spot, candy(null, BOMB));
      } else {
        // la dirección de las rayas sigue la dirección en que el jugador deslizó;
        // en las cascadas es al azar
        let stripe;
        if (move) stripe = rowOf(move.a) === rowOf(move.b) ? STRIPED_H : STRIPED_V;
        else stripe = Math.random() < 0.5 ? STRIPED_H : STRIPED_V;
        add(spot, candy(g[grp.cells[0]].color, stripe));
      }
    }
    return plans;
  }

  // Mezcla los caramelos existentes hasta obtener un tablero jugable sin combinaciones
  function shuffled(g) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const copy = g.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        swapIn(copy, i, j);
      }
      if (!findMatches(copy).groups.length && hasPossibleMove(copy)) return copy;
    }
    return createGrid(); // muy improbable: si no se logra, tablero nuevo
  }

  // ---------- Generador de niveles ----------

  // Azar "con semilla": la misma semilla da siempre la misma secuencia de números.
  // Así el nivel 7 es siempre el mismo nivel 7.
  function seededRandom(seed) {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  const roundTo = (value, step) => Math.max(step, Math.round(value / step) * step);

  // Crea la configuración del nivel n: colores, movimientos, objetivo y estrellas.
  // La dificultad sube con el nivel en forma de "serrucho":
  // cada 5 niveles hay uno más difícil y después uno más relajado.
  function generateLevel(n) {
    const rand = seededRandom(n * 7919 + 17);

    const colorCount = n <= 4 ? 5 : 6; // los primeros niveles, con menos colores: más cascadas
    const order = [0, 1, 2, 3, 4, 5];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const colors = order.slice(0, colorCount).sort((a, b) => a - b);

    const hard = n % 5 === 0;             // niveles 5, 10, 15...: más difíciles
    const relaxed = n > 5 && n % 5 === 1; // niveles 6, 11, 16...: respiro
    const baseMoves = Math.max(18, 26 - Math.floor(n / 4));
    const moves = baseMoves + Math.floor(rand() * 3) - 1 + (relaxed ? 2 : 0);

    let demand = DIFFICULTY.start + DIFFICULTY.perLevel * (n - 1);
    demand = Math.min(demand, DIFFICULTY.max);
    if (hard) demand += DIFFICULTY.hardBonus;
    if (relaxed) demand -= DIFFICULTY.relaxDiscount;

    const target = roundTo(POINTS_PER_MOVE[colorCount] * moves * demand, 50);
    const stars = [target, roundTo(target * 1.35, 50), roundTo(target * 1.7, 50)];

    return { number: n, colors, moves, target, stars, hard, seed: n * 7919 + 17 };
  }

  // Estrellas ganadas con un puntaje (0 si no llegó al objetivo)
  function starsFor(points, lvl) {
    return lvl.stars.filter((s) => points >= s).length;
  }

  // Hace caer los caramelos y rellena los huecos de arriba.
  // Devuelve qué se movió (moves) y qué caramelos nuevos aparecieron (spawns)
  // para que la parte visual pueda animarlo.
  function applyGravity(g) {
    const moves = [];
    const spawns = [];
    for (let c = 0; c < WIDTH; c++) {
      let write = WIDTH - 1; // la fila más baja libre
      for (let r = WIDTH - 1; r >= 0; r--) {
        const i = indexOf(r, c);
        if (g[i] !== null) {
          if (r !== write) {
            const to = indexOf(write, c);
            g[to] = g[i];
            g[i] = null;
            moves.push({ from: i, to });
          }
          write--;
        }
      }
      const missing = write + 1; // cuántos caramelos nuevos necesita la columna
      for (let r = write; r >= 0; r--) {
        const to = indexOf(r, c);
        g[to] = candy(randomColor());
        spawns.push({ to, startRow: r - missing }); // empieza por encima del tablero
      }
    }
    return { moves, spawns };
  }

  // =====================================================================
  // 4. DIBUJO Y ANIMACIÓN (la pantalla solo refleja lo que dice el grid)
  // =====================================================================

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--pop-time", `${TIME.pop}ms`);
  rootStyle.setProperty("--boom-time", `${TIME.boom}ms`);
  rootStyle.setProperty("--appear-time", `${TIME.appear}ms`);
  rootStyle.setProperty("--born-time", `${TIME.transform}ms`);

  // Qué imagen corresponde a cada caramelo
  function imageFor(cell) {
    if (cell.special === BOMB) return BOMB_IMAGE;
    if (isStriped(cell)) {
      const striped = STRIPED_IMAGES[cell.special][cell.color];
      if (loadedImages.has(striped)) return striped;
    }
    return CANDY_IMAGES[cell.color];
  }

  // Pinta un caramelo: su imagen y, si es especial, su marca (envoltorio, brillo...)
  function setCell(el, cell) {
    const src = imageFor(cell);
    const img = `url("${src}")`;
    el.firstChild.style.backgroundImage = img;
    el.firstChild.style.setProperty("--img", img);
    el.dataset.special = cell.special || "";
    // si es rayado pero no hay imagen de rayas para ese color, las rayas se dibujan con CSS
    el.dataset.cssStripes = isStriped(cell) && src === CANDY_IMAGES[cell.color] ? "yes" : "";
  }

  // Aplica una animación de un solo uso y la quita al terminar
  function playOnce(el, className) {
    el.classList.remove(className);
    void el.offsetWidth; // reinicia la animación si ya la tenía
    el.classList.add(className);
    el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
  }

  function makeCandyEl(cell) {
    const el = document.createElement("div");
    el.className = "candy";
    const face = document.createElement("div");
    face.className = "face";
    el.appendChild(face);
    setCell(el, cell);
    boardEl.appendChild(el);
    return el;
  }

  // Coloca un elemento en la casilla indicada (row permite ponerlo fuera del tablero)
  function place(el, index, row = rowOf(index)) {
    el.style.setProperty("--x", colOf(index));
    el.style.setProperty("--y", row);
  }

  function setMotion(el, ms, ease = "ease") {
    el.style.setProperty("--dur", `${ms}ms`);
    el.style.setProperty("--ease", ease);
  }

  // Dibuja todo el tablero desde cero a partir del grid
  function render(effect) {
    boardEl.innerHTML = "";
    els = grid.map((cell, i) => {
      const el = makeCandyEl(cell);
      place(el, i);
      if (effect) playOnce(el, effect);
      return el;
    });
  }

  // Cambia una casilla por otro caramelo (por ejemplo, cuando nace un especial)
  function transformCell(i, cell) {
    grid[i] = cell;
    setCell(els[i], cell);
    playOnce(els[i], "born");
  }

  // Rayo que cruza la fila o columna de un rayado
  function showBeam(index, special) {
    const beam = document.createElement("div");
    beam.className = `beam ${special === STRIPED_H ? "beam-h" : "beam-v"}`;
    beam.style.setProperty("--x", colOf(index));
    beam.style.setProperty("--y", rowOf(index));
    boardEl.appendChild(beam);
    beam.addEventListener("animationend", () => beam.remove(), { once: true });
  }

  // Intercambia dos casillas en el grid y en la pantalla, con deslizamiento
  async function swapCells(a, b) {
    swapIn(grid, a, b);
    swapIn(els, a, b);
    for (const i of [a, b]) {
      setMotion(els[i], TIME.swap);
      place(els[i], i);
    }
    await wait(TIME.swap);
  }

  // Quita caramelos: los de una combinación "revientan" (pop),
  // los alcanzados por un especial "explotan" (boom)
  async function removeCells(cells, popCells) {
    let longest = 0;
    for (const i of cells) {
      const effect = popCells.has(i) ? "pop" : "boom";
      longest = Math.max(longest, effect === "pop" ? TIME.pop : TIME.boom);
      grid[i] = null;
      els[i].classList.remove("selected");
      els[i].classList.add(effect);
    }
    await wait(longest);
    for (const i of cells) {
      els[i].remove();
      els[i] = null;
    }
  }

  // Aplica en pantalla el resultado de expandEffects
  async function applyEffects({ clear, armed, fired }, popCells = new Set(), combo = 1) {
    for (const f of fired) {
      if (f.special === STRIPED_H || f.special === STRIPED_V) showBeam(f.index, f.special);
    }
    for (const i of armed) {
      grid[i] = candy(grid[i].color, ARMED);
      setCell(els[i], grid[i]);
    }
    if (!clear.size) return;
    addScore(clear.size * POINTS_PER_CANDY * combo, combo);
    await removeCells(clear, popCells);
  }

  // Si el tablero se queda sin combinaciones posibles, se mezcla (no es culpa del jugador)
  async function reshuffle() {
    showMessage("Sin movimientos: mezclando…");
    els.forEach((el) => el.classList.add("pop"));
    await wait(TIME.pop);
    grid = shuffled(grid);
    render("appear");
    await wait(TIME.appear);
  }

  // Aplica la gravedad en el grid y anima la caída real de los caramelos
  async function dropCandies() {
    const { moves, spawns } = applyGravity(grid);
    const animations = [];

    // Caramelos que ya estaban: cambian de casilla
    for (const { from, to } of moves) {
      const el = els[from];
      els[from] = null;
      els[to] = el;
      animations.push({ el, to, rows: rowOf(to) - rowOf(from) });
    }

    // Caramelos nuevos: se crean arriba del tablero, sin animación todavía
    for (const { to, startRow } of spawns) {
      const el = makeCandyEl(grid[to]);
      setMotion(el, 0);
      place(el, to, startRow);
      els[to] = el;
      animations.push({ el, to, rows: rowOf(to) - startRow });
    }

    if (!animations.length) return;
    await nextFrame(); // deja que el navegador pinte la posición inicial

    let longest = 0;
    for (const { el, to, rows } of animations) {
      const ms = Math.max(TIME.fallMin, rows * TIME.fallPerRow);
      longest = Math.max(longest, ms);
      setMotion(el, ms, "cubic-bezier(0.45, 0, 0.8, 1)");
      place(el, to);
    }
    await wait(longest);
  }


  // =====================================================================
  // 5. PUNTAJE Y MENSAJES
  // =====================================================================

  let messageTimer = null;

  function showMessage(text, ms = 1400) {
    messageEl.textContent = text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (messageEl.textContent = ""), ms);
  }

  const formatNumber = (n) => n.toLocaleString("es");

  function bump(el) {
    el.classList.remove("bump");
    void el.offsetWidth; // reinicia la animación
    el.classList.add("bump");
  }

  // Actualiza nivel, movimientos, puntaje y la barra del objetivo
  function updateHud() {
    levelEl.textContent = level.number;
    movesEl.textContent = movesLeft;
    movesBoxEl.classList.toggle("low", movesLeft <= 5);
    scoreEl.textContent = formatNumber(score);
    targetEl.textContent = formatNumber(level.target);
    const top = level.stars[2];
    goalFillEl.style.width = `${Math.min(100, (score / top) * 100)}%`;
    goalMarks.forEach((mark, i) => {
      mark.style.left = `${(level.stars[i] / top) * 100}%`;
      mark.classList.toggle("earned", score >= level.stars[i]);
    });
  }

  function addScore(points, combo = 1) {
    const before = starsFor(score, level);
    score += points;
    updateHud();
    bump(scoreBoxEl);
    const after = starsFor(score, level);
    if (after > before) {
      const texts = ["", "⭐ ¡Objetivo cumplido! Ve por más estrellas", "⭐⭐ ¡2 estrellas! Una más y ganas", "⭐⭐⭐ ¡3 estrellas!"];
      showMessage(texts[after], 2000);
    } else if (combo >= 2) {
      showMessage(`¡Combo x${combo}!`);
    }
  }

  // ---------- Fin del nivel ----------

  let onPrimary = null;   // qué hace cada botón del mensaje final (cambia si ganas o pierdes)
  let onSecondary = null;

  async function finishLevel() {
    ended = true;
    clearSelection();
    const stars = starsFor(score, level);
    const won = stars > 0;
    const record = saveResult(level.number, score, stars);

    await wait(700); // una pausa para que se vea cómo quedó el tablero

    resultTitleEl.textContent = won ? "¡Nivel superado!" : "Nivel fallido";
    let text;
    if (!won) text = `Te faltaron ${formatNumber(level.target - score)} puntos`;
    else if (stars === 3 && movesLeft > 0)
      text = `¡3 estrellas con ${movesLeft} movimiento${movesLeft === 1 ? "" : "s"} de sobra!`;
    else if (record.isNewBest && record.previousBest > 0) text = "¡Nuevo récord en este nivel!";
    else text = `Nivel ${level.number} completado`;
    resultTextEl.textContent = text;
    finalScoreEl.textContent = formatNumber(score);
    bestScoreEl.textContent = formatNumber(record.best);
    resultStars.forEach((star, i) => {
      star.classList.remove("earned");
      star.style.animationDelay = `${300 + i * 300}ms`;
      if (i < stars) star.classList.add("earned");
    });

    if (won) {
      primaryBtn.textContent = "Siguiente nivel";
      onPrimary = () => location.replace(`#nivel-${level.number + 1}`);
      secondaryBtn.textContent = "Repetir";
      secondaryBtn.hidden = false;
      onSecondary = () => startLevel(level.number);
    } else {
      primaryBtn.textContent = "Reintentar";
      onPrimary = () => startLevel(level.number);
      secondaryBtn.hidden = true;
      onSecondary = null;
    }

    resultEl.classList.toggle("won", won);
    resultEl.hidden = false;
    primaryBtn.focus();
  }

  function hideResult() {
    resultEl.hidden = true;
  }

  // =====================================================================
  // 6. REGLAS DE UN TURNO
  // =====================================================================

  // Resuelve una ronda de combinaciones: crea los especiales que correspondan,
  // activa los especiales que formaban parte de las líneas y hace caer todo.
  async function resolveMatches(matches, move, combo) {
    const plans = planSpecials(grid, matches, move);
    const newSpots = plans.map((p) => p.index);
    const matched = [...matches.cells].filter((i) => !newSpots.includes(i));

    const result = expandEffects(grid, matched, [], newSpots);
    for (const { index, cell } of plans) transformCell(index, cell);

    await applyEffects(result, matches.cells, combo);
    await dropCandies();
  }

  // Bomba de color intercambiada con otro caramelo
  async function bombSwap(bomb, other) {
    const target = grid[other];

    if (target.special === BOMB) {
      // bomba + bomba: limpia el tablero completo
      showMessage("¡Tablero limpio!");
      await applyEffects({ clear: new Set(allCells()), armed: new Set(), fired: [] });
    } else if (isStriped(target)) {
      // bomba + rayado: todos los de ese color se vuelven rayados y se activan
      const same = cellsOfColor(grid, target.color);
      for (const i of same) {
        transformCell(i, candy(target.color, Math.random() < 0.5 ? STRIPED_H : STRIPED_V));
      }
      await wait(TIME.transform);
      await applyEffects(expandEffects(grid, [bomb, ...same], [bomb]));
    } else if (target.special === WRAPPED) {
      // bomba + envuelto: borra ese color y después otro color más
      const color = target.color;
      await applyEffects(expandEffects(grid, [bomb, ...cellsOfColor(grid, color)], [bomb]));
      await dropCandies();
      const second = mostCommonColor(grid, color);
      await applyEffects(expandEffects(grid, cellsOfColor(grid, second)));
    } else {
      // bomba + caramelo normal: borra todos los de ese color
      await applyEffects(expandEffects(grid, [bomb, ...cellsOfColor(grid, target.color)], [bomb]));
    }
    await dropCandies();
  }

  // Dos especiales (rayados o envueltos) intercambiados entre sí
  async function specialCombo(a, b) {
    const stripes = [grid[a], grid[b]].filter(isStriped).length;

    if (stripes === 2) {
      // rayado + rayado: fila y columna completas
      showBeam(b, STRIPED_H);
      showBeam(b, STRIPED_V);
      await applyEffects(expandEffects(grid, [...rowCells(b), ...colCells(b)], [a, b]));
    } else if (stripes === 1) {
      // rayado + envuelto: 3 filas y 3 columnas
      for (const d of [-1, 0, 1]) {
        const r = rowOf(b) + d;
        const c = colOf(b) + d;
        if (r >= 0 && r < WIDTH) showBeam(indexOf(r, colOf(b)), STRIPED_H);
        if (c >= 0 && c < WIDTH) showBeam(indexOf(rowOf(b), c), STRIPED_V);
      }
      await applyEffects(expandEffects(grid, crossArea(b, 1), [a, b]));
    } else {
      // envuelto + envuelto: explosión de 5x5, dos veces
      await applyEffects(expandEffects(grid, squareArea(b, 2), [a, b]));
      await dropCandies();
      await applyEffects(expandEffects(grid, squareArea(b, 2)));
    }
    await dropCandies();
  }

  // Después de cada jugada: los envueltos armados explotan otra vez
  // y las cascadas se resuelven hasta que el tablero queda quieto
  async function settleBoard(combo) {
    while (true) {
      const armed = allCells().filter((i) => grid[i] && grid[i].special === ARMED);
      if (armed.length) {
        await applyEffects(expandEffects(grid, armed), new Set(), combo);
        await dropCandies();
        combo++;
        continue;
      }
      const matches = findMatches(grid);
      if (!matches.groups.length) break;
      await resolveMatches(matches, null, combo);
      combo++;
    }
  }

  function useMove() {
    movesLeft--;
    updateHud();
    bump(movesBoxEl);
  }

  async function playTurn(a, b) {
    if (busy || ended || a === null || b === null || !areAdjacent(a, b)) return;
    busy = true;
    clearSelection();

    try {
      await swapCells(a, b);
      const A = grid[a];
      const B = grid[b];

      if (A.special === BOMB || B.special === BOMB) {
        useMove();
        const bomb = B.special === BOMB ? b : a;
        await bombSwap(bomb, bomb === a ? b : a);
      } else if (A.special && B.special) {
        useMove();
        await specialCombo(a, b);
      } else {
        const matches = findMatches(grid);
        if (!matches.groups.length) {
          await swapCells(a, b); // no sirvió: los caramelos regresan (no gasta movimiento)
          return;
        }
        useMove();
        await resolveMatches(matches, { a, b }, 1);
      }

      await settleBoard(2);
      // el nivel termina al conseguir las 3 estrellas, o al acabarse los movimientos
      if (score >= level.stars[2] || movesLeft === 0) await finishLevel();
      else if (!hasPossibleMove(grid)) await reshuffle();
    } finally {
      busy = false;
    }
  }

  // =====================================================================
  // 7. ENTRADA DEL USUARIO (mouse, dedo y tocar-tocar)
  // =====================================================================

  function cellFromPoint(x, y) {
    const rect = boardEl.getBoundingClientRect();
    const size = rect.width / WIDTH;
    const c = Math.floor((x - rect.left) / size);
    const r = Math.floor((y - rect.top) / size);
    if (r < 0 || r >= WIDTH || c < 0 || c >= WIDTH) return null;
    return indexOf(r, c);
  }

  function neighborInDirection(i, dx, dy) {
    const r = rowOf(i);
    const c = colOf(i);
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0 && c < WIDTH - 1) return i + 1;
      if (dx < 0 && c > 0) return i - 1;
    } else {
      if (dy > 0 && r < WIDTH - 1) return i + WIDTH;
      if (dy < 0 && r > 0) return i - WIDTH;
    }
    return null;
  }

  function select(i) {
    clearSelection();
    selected = i;
    els[i].classList.add("selected");
  }

  function clearSelection() {
    if (selected !== null && els[selected]) els[selected].classList.remove("selected");
    selected = null;
  }

  function handleTap(i) {
    if (selected === null) select(i);
    else if (selected === i) clearSelection();
    else if (areAdjacent(selected, i)) playTurn(selected, i);
    else select(i);
  }

  // Deslizar: basta con arrastrar un poco en una dirección
  let drag = null;

  boardEl.addEventListener("pointerdown", (e) => {
    if (busy || ended) return;
    const index = cellFromPoint(e.clientX, e.clientY);
    if (index === null) return;
    drag = { index, x: e.clientX, y: e.clientY, swiped: false };
    boardEl.setPointerCapture(e.pointerId);
  });

  boardEl.addEventListener("pointermove", (e) => {
    if (!drag || drag.swiped) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const threshold = (boardEl.getBoundingClientRect().width / WIDTH) * 0.35;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    drag.swiped = true;
    playTurn(drag.index, neighborInDirection(drag.index, dx, dy));
  });

  boardEl.addEventListener("pointerup", () => {
    if (!drag) return;
    const { index, swiped } = drag;
    drag = null;
    if (!swiped && !busy && !ended) handleTap(index); // fue un toque, no un deslizamiento
  });

  boardEl.addEventListener("pointercancel", () => (drag = null));

  restartBtn.addEventListener("click", () => {
    if (!busy) startLevel(level.number);
  });

  primaryBtn.addEventListener("click", () => onPrimary && onPrimary());
  secondaryBtn.addEventListener("click", () => onSecondary && onSecondary());

  // "Mapa" (en el mensaje final) y "‹ Mapa" (arriba en el juego) vuelven al mapa
  exitBtn.addEventListener("click", () => goToMap());
  $("gameBack").addEventListener("click", () => goToMap());

  // =====================================================================
  // 8. INICIO
  // =====================================================================

  // Carga todas las imágenes antes de empezar y anota cuáles existen
  function preloadImages() {
    const sources = [
      ...CANDY_IMAGES,
      ...STRIPED_IMAGES.stripedH,
      ...STRIPED_IMAGES.stripedV,
      BOMB_IMAGE,
    ];
    return Promise.all(
      sources.map(
        (src) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              loadedImages.add(src);
              resolve();
            };
            img.onerror = resolve; // si no existe, se usará el respaldo
            img.src = src;
          })
      )
    );
  }

  // ---------- Progreso guardado en el navegador ----------
  //   unlocked: el nivel más alto desbloqueado
  //   current:  el último nivel que se jugó (se retoma al volver a abrir)
  //   levels:   por cada nivel, sus mejores estrellas y su récord
  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (saved && saved.unlocked >= 1) return { levels: {}, current: 1, ...saved };
    } catch (e) {
      // sin acceso al almacenamiento: se juega sin guardar
    }
    return { unlocked: 1, current: 1, levels: {} };
  }

  function saveProgress() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
    } catch (e) {
      // sin acceso al almacenamiento: no pasa nada, solo no se guarda
    }
  }

  // Guarda el resultado de un nivel y devuelve el récord
  function saveResult(n, points, stars) {
    const entry = progress.levels[n] || { stars: 0, best: 0 };
    const previousBest = entry.best;
    entry.best = Math.max(entry.best, points);
    entry.stars = Math.max(entry.stars, stars);
    progress.levels[n] = entry;
    if (stars > 0) progress.unlocked = Math.max(progress.unlocked, n + 1);
    saveProgress();
    return { best: entry.best, isNewBest: points > previousBest, previousBest };
  }

  // Espera a que termine la jugada en curso (por si el jugador sale a mitad de una cascada)
  async function whenIdle() {
    while (busy) await wait(50);
  }

  async function startLevel(n) {
    await whenIdle();
    hideResult();
    level = generateLevel(n);
    activeColors = level.colors;
    movesLeft = level.moves;
    score = 0;
    ended = false;
    selected = null;
    progress.current = n;
    saveProgress();

    grid = createGrid(seededRandom(level.seed)); // el tablero inicial es siempre el mismo
    render("appear");
    updateHud();
    showMessage(level.hard ? `🔥 ¡Nivel ${n} difícil!` : `¡Nivel ${n}! Llega a ${formatNumber(level.target)} puntos`, 3000);
  }

  // =====================================================================
  // 9. PANTALLAS: PORTADA, MAPA Y JUEGO
  // =====================================================================
  // Cada pantalla tiene su dirección, así el botón "atrás" del celular funciona:
  //   (vacío)    portada
  //   #mapa      mapa de niveles
  //   #nivel-12  jugando el nivel 12

  const screens = { home: $("home"), map: $("map"), game: $("game") };
  let currentScreen = null;
  let gameFrom = null;   // desde dónde se entró al juego ("map", "home" o null)
  let mapFromHome = false;

  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
    document.body.dataset.screen = name;
    currentScreen = name;
  }

  function goTo(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  // Volver al mapa desde el juego sin dejar pantallas repetidas en el historial
  function goToMap() {
    if (gameFrom === "map") history.back();
    else location.replace("#mapa");
  }

  function openLevel(n, from) {
    gameFrom = from;
    goTo(`#nivel-${n}`);
  }

  async function route() {
    hideLevelCard();
    const match = location.hash.match(/^#nivel-(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n < 1 || n > progress.unlocked) {
        location.replace("#mapa"); // nivel bloqueado: al mapa
        return;
      }
      const isNewEntry = currentScreen !== "game" || !level || level.number !== n;
      showScreen("game");
      if (isNewEntry) await startLevel(n);
      return;
    }
    hideResult();
    if (location.hash === "#mapa") {
      showScreen("map");
      renderMap();
    } else {
      showScreen("home");
      renderHome();
    }
  }

  const totalStars = () =>
    Object.values(progress.levels).reduce((sum, entry) => sum + (entry.stars || 0), 0);

  // ---------- Portada ----------

  function renderHome() {
    $("homeLevel").textContent = progress.unlocked;
    $("homeStars").textContent = totalStars();
  }

  // los caramelos que decoran el logo
  $("logoCandies").innerHTML = CANDY_IMAGES.map(
    (src, i) => `<span class="logo-candy" style="--i:${i}; background-image:url('${src}')"></span>`
  ).join("");

  $("homePlay").addEventListener("click", () => openLevel(progress.unlocked, "home"));
  $("homeMap").addEventListener("click", () => {
    mapFromHome = true;
    goTo("#mapa");
  });

  // ---------- Mapa de niveles ----------

  // Cada 20 niveles empieza una zona nueva, con su nombre y su color
  const ZONES = [
    { name: "Dulcería", color: "#ec407a" },
    { name: "Bosque de Chocolate", color: "#8d6e63" },
    { name: "Valle de Menta", color: "#26a69a" },
    { name: "Montaña de Caramelo", color: "#ffa000" },
    { name: "Nubes de Algodón", color: "#42a5f5" },
    { name: "Castillo de Gomitas", color: "#ab47bc" },
  ];
  const LEVELS_PER_ZONE = 20;

  function zoneOf(n) {
    const index = Math.floor((n - 1) / LEVELS_PER_ZONE);
    const zone = ZONES[index % ZONES.length];
    const round = Math.floor(index / ZONES.length);
    return { ...zone, name: round ? `${zone.name} ${round + 1}` : zone.name, first: index * LEVELS_PER_ZONE + 1 };
  }

  const mapScrollEl = $("mapScroll");
  const mapPathEl = $("mapPath");
  const STEP = 104;        // distancia vertical entre niveles (px)
  const MAP_PADDING = 110; // espacio arriba y abajo del camino

  const starIcons = (earned) =>
    [0, 1, 2].map((i) => `<span class="mini-star${i < earned ? " earned" : ""}"></span>`).join("");

  function renderMap() {
    const unlocked = progress.unlocked;
    const count = unlocked + 12; // los desbloqueados y algunos más por delante
    const height = MAP_PADDING * 2 + (count - 1) * STEP;
    mapPathEl.style.height = `${height}px`;

    // posición de cada nivel: el 1 abajo, subiendo en zigzag suave
    const pos = (n) => ({
      x: 50 + Math.sin(n * 0.9) * 28, // % del ancho
      y: height - MAP_PADDING - (n - 1) * STEP, // px desde arriba
    });

    // el camino: una curva que une todos los niveles
    let d = "";
    for (let n = 1; n <= count; n++) {
      const p = pos(n);
      if (n === 1) d += `M ${p.x} ${p.y}`;
      else {
        const q = pos(n - 1);
        const midY = (p.y + q.y) / 2;
        d += ` C ${q.x} ${midY} ${p.x} ${midY} ${p.x} ${p.y}`;
      }
    }
    let html = `<svg class="map-road" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${d}" class="road-base" vector-effect="non-scaling-stroke"/>
      <path d="${d}" class="road-dash" vector-effect="non-scaling-stroke"/>
    </svg>`;

    for (let n = 1; n <= count; n++) {
      const p = pos(n);
      const zone = zoneOf(n);
      if (n === zone.first) {
        html += `<div class="zone-label" style="top:${p.y + STEP * 0.55}px; --zone:${zone.color}">${zone.name}</div>`;
      }
      const info = progress.levels[n] || { stars: 0 };
      const locked = n > unlocked;
      const current = n === unlocked;
      const hard = generateLevel(n).hard;
      const classes = ["level-node", locked && "locked", current && "current", hard && "hard", info.stars && "done"]
        .filter(Boolean)
        .join(" ");
      html += `<button class="${classes}" data-level="${n}" style="left:${p.x}%; top:${p.y}px; --zone:${zone.color}"
        ${locked ? "disabled" : ""} aria-label="Nivel ${n}${locked ? " (bloqueado)" : ""}">
        <span class="node-number">${locked ? "🔒" : n}</span>
        ${hard && !locked ? '<span class="node-fire">🔥</span>' : ""}
        ${info.stars ? `<span class="node-stars">${starIcons(info.stars)}</span>` : ""}
        ${current ? '<span class="node-pin" aria-hidden="true">▼</span>' : ""}
      </button>`;
    }
    mapPathEl.innerHTML = html;
    $("mapStars").textContent = totalStars();

    // desplazarse hasta el nivel actual
    requestAnimationFrame(() => {
      mapScrollEl.scrollTop = pos(unlocked).y - mapScrollEl.clientHeight / 2;
    });
  }

  mapPathEl.addEventListener("click", (e) => {
    const node = e.target.closest(".level-node");
    if (node && !node.disabled) showLevelCard(Number(node.dataset.level));
  });

  $("mapBack").addEventListener("click", () => {
    if (mapFromHome) {
      mapFromHome = false;
      history.back();
    } else {
      location.replace("#");
    }
  });

  // ---------- Tarjeta del nivel (antes de jugar) ----------

  const levelCardEl = $("levelCard");
  let cardLevel = null;

  function showLevelCard(n) {
    const lvl = generateLevel(n);
    const info = progress.levels[n] || { stars: 0, best: 0 };
    cardLevel = n;
    $("cardTitle").textContent = `Nivel ${n}`;
    $("cardZone").textContent = lvl.hard ? `🔥 Nivel difícil · ${zoneOf(n).name}` : zoneOf(n).name;
    $("cardTarget").textContent = formatNumber(lvl.target);
    $("cardMoves").textContent = lvl.moves;
    $("cardBest").textContent = info.best ? formatNumber(info.best) : "—";
    document.querySelectorAll("#cardStars .star").forEach((star, i) => {
      star.classList.toggle("earned", i < info.stars);
    });
    levelCardEl.hidden = false;
    $("cardPlay").focus();
  }

  function hideLevelCard() {
    levelCardEl.hidden = true;
  }

  $("cardPlay").addEventListener("click", () => openLevel(cardLevel, "map"));
  $("cardClose").addEventListener("click", hideLevelCard);
  levelCardEl.addEventListener("click", (e) => {
    if (e.target === levelCardEl) hideLevelCard(); // tocar fuera de la tarjeta la cierra
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideLevelCard();
  });

  // ---------- Arranque ----------

  progress = loadProgress();
  window.addEventListener("hashchange", route);
  preloadImages().then(route);
})();
