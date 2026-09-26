"use strict";

(() => {
  // =====================================================================
  // 1. CONFIGURACIÓN
  // =====================================================================

  const WIDTH = 8;                 // el tablero es de WIDTH x WIDTH
  const SIZE = WIDTH * WIDTH;
  const EMPTY = -1;                // casilla vacía
  const EXPLOSIVE = 9;             // caramelo explosivo

  // Cada número del tablero corresponde a una imagen de esta lista
  const CANDY_IMAGES = [
    "images/candies/red.png",      // 0
    "images/candies/green.png",    // 1
    "images/candies/blue.png",     // 2
    "images/candies/orange.png",   // 3
    "images/candies/purple.png",   // 4
    "images/candies/yellow.png",   // 5
  ];
  const EXPLOSIVE_IMAGE = "images/candies/explosive.png";

  const POINTS_PER_CANDY = 10;

  // Velocidad de las animaciones: 1 = rápido, 2 = el doble de lento, 1.5 = intermedio...
  const MOVE_SCALE = 2;       // movimientos: intercambio, caída y mezcla
  const REACTION_SCALE = 1.4; // reacciones: combinaciones y explosiones
  const TIME = {
    swap: 180 * MOVE_SCALE,        // intercambio de dos caramelos
    fallPerRow: 70 * MOVE_SCALE,   // tiempo de caída por cada fila
    fallMin: 160 * MOVE_SCALE,     // caída mínima
    shuffle: 300 * MOVE_SCALE,     // mezcla del tablero
    pop: 250 * REACTION_SCALE,     // caramelos que desaparecen por combinación
    boom: 350 * REACTION_SCALE,    // caramelos que desaparecen por explosión
  };

  // =====================================================================
  // 2. ESTADO
  // =====================================================================

  let grid = [];        // el "cerebro": 64 números (tipo de caramelo por casilla)
  let els = [];         // el elemento HTML que se ve en cada casilla (mismo índice que grid)
  let score = 0;
  let busy = false;     // true mientras hay animaciones: bloquea nuevos movimientos
  let selected = null;  // casilla seleccionada con un toque (modo tocar-tocar)

  const boardEl = document.getElementById("board");
  const scoreEl = document.getElementById("score");
  const scoreBoxEl = document.getElementById("scoreBox");
  const messageEl = document.getElementById("message");
  const restartBtn = document.getElementById("restart");

  // =====================================================================
  // 3. LÓGICA PURA (solo trabaja con números, nunca toca la pantalla)
  // =====================================================================

  const rowOf = (i) => Math.floor(i / WIDTH);
  const colOf = (i) => i % WIDTH;
  const indexOf = (r, c) => r * WIDTH + c;
  const randomType = () => Math.floor(Math.random() * CANDY_IMAGES.length);
  const isCandy = (t) => t >= 0 && t < CANDY_IMAGES.length; // normal, no explosivo ni vacío

  function areAdjacent(a, b) {
    return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b)) === 1;
  }

  function swapIn(g, a, b) {
    [g[a], g[b]] = [g[b], g[a]];
  }

  // Busca líneas de 3 o más caramelos iguales, en filas y en columnas por separado.
  // Devuelve cada línea encontrada (groups) y todas las casillas afectadas (cells).
  function findMatches(g) {
    const groups = [];

    const scanLine = (getIndex) => {
      let run = [getIndex(0)];
      for (let k = 1; k <= WIDTH; k++) {
        const i = k < WIDTH ? getIndex(k) : null;
        if (i !== null && g[i] === g[run[0]]) {
          run.push(i);
        } else {
          if (run.length >= 3 && isCandy(g[run[0]])) groups.push(run);
          if (i !== null) run = [i];
        }
      }
    };

    for (let r = 0; r < WIDTH; r++) scanLine((c) => indexOf(r, c)); // filas
    for (let c = 0; c < WIDTH; c++) scanLine((r) => indexOf(r, c)); // columnas

    return { groups, cells: new Set(groups.flat()) };
  }

  // ¿Queda algún movimiento que genere una combinación?
  function hasPossibleMove(g) {
    if (g.includes(EXPLOSIVE)) return true; // un explosivo siempre se puede usar
    const copy = g.slice();
    for (let i = 0; i < SIZE; i++) {
      const neighbors = [];
      if (colOf(i) < WIDTH - 1) neighbors.push(i + 1);
      if (rowOf(i) < WIDTH - 1) neighbors.push(i + WIDTH);
      for (const n of neighbors) {
        swapIn(copy, i, n);
        const works = findMatches(copy).groups.length > 0;
        swapIn(copy, i, n);
        if (works) return true;
      }
    }
    return false;
  }

  // Tablero inicial sin combinaciones y con al menos un movimiento posible
  function createGrid() {
    let g;
    do {
      g = new Array(SIZE);
      for (let i = 0; i < SIZE; i++) {
        const r = rowOf(i);
        const c = colOf(i);
        let t;
        do {
          t = randomType();
        } while (
          (c >= 2 && g[i - 1] === t && g[i - 2] === t) ||
          (r >= 2 && g[i - WIDTH] === t && g[i - 2 * WIDTH] === t)
        );
        g[i] = t;
      }
    } while (!hasPossibleMove(g));
    return g;
  }

  // Casillas dentro del radio de una explosión (radio 1 = 3x3, radio 2 = 5x5)
  function explosionArea(center, radius) {
    const cells = [];
    const r0 = rowOf(center);
    const c0 = colOf(center);
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r >= 0 && r < WIDTH && c >= 0 && c < WIDTH) cells.push(indexOf(r, c));
      }
    }
    return cells;
  }

  // Calcula todas las casillas que se destruyen, incluyendo reacciones en cadena:
  // si la explosión alcanza otro explosivo, ese también explota (una sola vez).
  function collectExplosion(g, start, alreadyDetonated = []) {
    const cleared = new Set();
    const detonated = new Set(alreadyDetonated);
    const queue = [...start];
    while (queue.length) {
      const { index, radius } = queue.shift();
      if (detonated.has(index)) continue;
      detonated.add(index);
      for (const i of explosionArea(index, radius)) {
        cleared.add(i);
        if (g[i] === EXPLOSIVE && !detonated.has(i)) queue.push({ index: i, radius: 1 });
      }
    }
    return cleared;
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
        if (g[i] !== EMPTY) {
          if (r !== write) {
            const to = indexOf(write, c);
            g[to] = g[i];
            g[i] = EMPTY;
            moves.push({ from: i, to });
          }
          write--;
        }
      }
      const missing = write + 1; // cuántos caramelos nuevos necesita la columna
      for (let r = write; r >= 0; r--) {
        const to = indexOf(r, c);
        g[to] = randomType();
        spawns.push({ to, startRow: r - missing }); // empieza por encima del tablero
      }
    }
    return { moves, spawns };
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

  // =====================================================================
  // 4. DIBUJO Y ANIMACIÓN (la pantalla solo refleja lo que dice el grid)
  // =====================================================================

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  document.documentElement.style.setProperty("--pop-time", `${TIME.pop}ms`);
  document.documentElement.style.setProperty("--boom-time", `${TIME.boom}ms`);
  document.documentElement.style.setProperty("--appear-time", `${TIME.shuffle}ms`);

  function imageFor(type) {
    return type === EXPLOSIVE ? EXPLOSIVE_IMAGE : CANDY_IMAGES[type];
  }

  function setType(el, type) {
    el.classList.toggle("explosive", type === EXPLOSIVE);
    el.firstChild.style.backgroundImage = `url("${imageFor(type)}")`;
  }

  function makeCandyEl(type) {
    const el = document.createElement("div");
    el.className = "candy";
    const face = document.createElement("div");
    face.className = "face";
    el.appendChild(face);
    setType(el, type);
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
    els = grid.map((type, i) => {
      const el = makeCandyEl(type);
      place(el, i);
      if (effect) {
        el.classList.add(effect);
        // al terminar la entrada se quita la clase, para que no tape otras animaciones
        el.addEventListener("animationend", () => el.classList.remove(effect), { once: true });
      }
      return el;
    });
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

  // Quita caramelos: los marca vacíos en el grid y los anima antes de borrarlos
  async function removeCells(cells, effect) {
    for (const i of cells) {
      grid[i] = EMPTY;
      els[i].classList.remove("selected");
      els[i].classList.add(effect);
    }
    await wait(effect === "boom" ? TIME.boom : TIME.pop);
    for (const i of cells) {
      els[i].remove();
      els[i] = null;
    }
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

  async function reshuffle() {
    showMessage("Sin movimientos: mezclando…");
    els.forEach((el) => el.classList.add("pop"));
    await wait(TIME.pop);
    grid = shuffled(grid);
    render("appear");
    await wait(TIME.shuffle);
  }

  // =====================================================================
  // 5. PUNTAJE Y MENSAJES
  // =====================================================================

  let messageTimer = null;

  function showMessage(text) {
    messageEl.textContent = text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (messageEl.textContent = ""), 1400);
  }

  function addScore(points, combo = 1) {
    score += points;
    scoreEl.textContent = score;
    scoreBoxEl.classList.remove("bump");
    void scoreBoxEl.offsetWidth; // reinicia la animación
    scoreBoxEl.classList.add("bump");
    if (combo >= 2) showMessage(`¡Combo x${combo}!`);
  }

  // =====================================================================
  // 6. REGLAS DE UN TURNO
  // =====================================================================

  // Explosión de uno o dos explosivos
  async function detonate(start, alreadyDetonated = []) {
    const cells = collectExplosion(grid, start, alreadyDetonated);
    addScore(cells.size * POINTS_PER_CANDY);
    await removeCells(cells, "boom");
    await dropCandies();
  }

  // Resuelve una ronda de combinaciones.
  // Una línea de 4 o más deja un explosivo: en la casilla que movió el jugador,
  // o en el centro de la línea si fue una cascada.
  async function resolveMatches(matches, movedCells, combo) {
    const toClear = new Set(matches.cells);

    for (const group of matches.groups) {
      if (group.length < 4) continue;
      const spot =
        group.find((i) => movedCells && movedCells.includes(i)) ??
        group[Math.floor(group.length / 2)];
      if (!toClear.has(spot)) continue; // esa casilla ya se usó para otro explosivo
      toClear.delete(spot);
      grid[spot] = EXPLOSIVE;
      setType(els[spot], EXPLOSIVE);
    }

    addScore(matches.cells.size * POINTS_PER_CANDY * combo, combo);
    await removeCells(toClear, "pop");
    await dropCandies();
  }

  // Mientras la caída genere nuevas combinaciones, se siguen resolviendo
  async function runCascades(combo) {
    let matches;
    while ((matches = findMatches(grid)).groups.length) {
      await resolveMatches(matches, null, combo);
      combo++;
    }
  }

  async function playTurn(a, b) {
    if (busy || a === null || b === null || !areAdjacent(a, b)) return;
    busy = true;
    clearSelection();

    try {
      await swapCells(a, b);
      const typeA = grid[a];
      const typeB = grid[b];

      if (typeA === EXPLOSIVE && typeB === EXPLOSIVE) {
        await detonate([{ index: b, radius: 2 }], [a]); // doble explosión 5x5
      } else if (typeA === EXPLOSIVE || typeB === EXPLOSIVE) {
        await detonate([{ index: typeA === EXPLOSIVE ? a : b, radius: 1 }]);
      } else {
        const matches = findMatches(grid);
        if (!matches.groups.length) {
          await swapCells(a, b); // no sirvió: los caramelos regresan
          return;
        }
        await resolveMatches(matches, [a, b], 1);
      }

      await runCascades(2);
      if (!hasPossibleMove(grid)) await reshuffle();
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
    if (busy) return;
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
    if (!swiped && !busy) handleTap(index); // fue un toque, no un deslizamiento
  });

  boardEl.addEventListener("pointercancel", () => (drag = null));

  restartBtn.addEventListener("click", () => {
    if (!busy) startGame();
  });

  // =====================================================================
  // 8. INICIO
  // =====================================================================

  function preloadImages() {
    const sources = [...CANDY_IMAGES, EXPLOSIVE_IMAGE];
    return Promise.all(
      sources.map(
        (src) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = img.onerror = resolve;
            img.src = src;
          })
      )
    );
  }

  function startGame() {
    score = 0;
    scoreEl.textContent = "0";
    messageEl.textContent = "";
    selected = null;
    grid = createGrid();
    render("appear");
  }

  preloadImages().then(startGame);
})();
