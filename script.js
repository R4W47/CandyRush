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
  const CANDY_NAMES = ["red", "green", "blue", "pink", "purple", "yellow"];
  const IMAGE_VERSION = 4; // súbelo si reemplazas imágenes con el mismo nombre
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

  // ---------- Animal Rush (bonificación al ganar el nivel) ----------
  // Al ganar: 1) explotan los especiales que quedaron en el tablero,
  // 2) cada movimiento sobrante convierte un animalito al azar en rayado y explota,
  // 3) se resuelven las cascadas y los especiales nuevos hasta que todo queda quieto.
  const RUSH = {
    pointsPerMove: 150,    // puntos fijos por cada movimiento que sobró (además de las explosiones)
    perWave: 3,            // mínimo de movimientos que se convierten antes de explotarlos juntos
    maxWaves: 2,           // con muchos movimientos sobrantes, se agrupan para no tardar demasiado
    maxTime: 9000,         // duración máxima (ms): al pasarla, lo que falta se paga de una vez
    convertDelay: 140,     // pausa entre cada animalito que se convierte (ms)
    maxRounds: 30,         // límite de seguridad para no quedarse en un ciclo infinito
  };

  // ---------- Niveles ----------
  // Puntos que hace en promedio un jugador por movimiento, según cuántos colores hay.
  // Con menos colores salen más combinaciones y cascadas. Calibrado con un bot.
  const POINTS_PER_MOVE = { 5: 234, 6: 113 };
  // Se deja el nombre viejo a propósito: si se cambia, los jugadores pierden su progreso
  const SAVE_KEY = "candyRush.progress.v1"; // dónde se guarda el progreso en el navegador

  // ---------- Vidas ----------
  // Se pierde una vida al fallar un nivel o al salir a medias (después de haber jugado
  // al menos un movimiento). Ganar no gasta vidas. Se recargan solas con el tiempo.
  const LIVES = {
    max: 5,                    // vidas máximas
    refillMinutes: 30,         // minutos para recuperar 1 vida
  };

  // ---------- Power-ups ----------
  // Ninguno gasta movimiento. Al empezar el juego por primera vez se regalan "starter".
  const BOOSTERS = {
    starter: { hammer: 3, swap: 2, moves: 2, shuffle: 1 },
    extraMoves: 5,             // cuántos movimientos da el "+5"
  };

  // Premios por un resultado muy bueno. Solo se dan si ganas con 3 estrellas Y superas
  // tu récord del nivel (así no se puede repetir un nivel fácil para juntar power-ups).
  // Se mide con los movimientos que sobraron al llegar a las 3 estrellas: son los que el
  // Animal Rush convierte en puntos, o sea, lo que hace que el puntaje se pase por mucho.
  // "spare" = fracción de movimientos sobrantes (0.25 = te sobró la cuarta parte).
  // Calibrado con un bot: en los primeros niveles ~1 de cada 4 victorias con 3 estrellas
  // llega a 0.25; en niveles más avanzados es mucho más raro.
  const REWARDS = {
    tiers: [
      { spare: 0.4, count: 2, key: "rewardAmazing", shuffleChance: 0.35 },
      { spare: 0.25, count: 1, key: "rewardGreat", shuffleChance: 0 },
    ],
    // probabilidad de cada premio (la mezcla solo sale en el nivel "increíble", y poco)
    weights: { hammer: 40, swap: 30, moves: 30 },
  };

  // =====================================================================
  // IDIOMAS (inglés por defecto, español opcional)
  // =====================================================================
  // Para agregar o corregir un texto, cámbialo aquí en los dos idiomas.
  // En el HTML, los textos fijos llevan data-i18n="clave" (o data-i18n-aria
  // para las etiquetas de accesibilidad) y se rellenan desde esta lista.

  const LANG_KEY = "marshmallowPals.lang"; // dónde se guarda el idioma elegido
  const TEXTS = {
    en: {
      title: "Marshmallow Pals",
      starsWord: "stars",
      playLevel: "Play · Level",
      levels: "Levels",
      backHome: "Back to home",
      backMap: "Back to map",
      mapShort: "‹ Map",
      map: "Map",
      level: "Level",
      moves: "Moves",
      score: "Score",
      target: "Target",
      board: "Game board",
      rush: "Animal Rush!",
      quitTitle: "Leave level?",
      quitText: "If you leave before finishing, you'll lose a life.",
      keepPlaying: "Keep playing",
      quitLeave: "Leave (−1 life)",
      noLivesTitle: "Out of lives",
      noLivesText: "Your lives refill on their own over time.",
      nextLifeIn: "Next life in",
      watchAd: "Watch ad · +1 life",
      ok: "OK",
      livesFull: "Full",
      livesAria: (n, time) => `${n} li${n === 1 ? "fe" : "ves"}${time ? `, next one in ${time}` : ""}`,
      lifeLost: "−1 life",
      boosters: "Power-ups",
      boosterNames: { hammer: "Hammer", swap: "Free swap", moves: "+5 moves", shuffle: "Shuffle" },
      boosterHint: {
        hammer: "🔨 Tap a piece to smash it",
        swap: "🔀 Swipe or tap two neighbors to swap them",
        moves: "Tap +5 again to add 5 moves",
        shuffle: "Tap 🌀 again to shuffle the board",
      },
      boosterEmpty: "None left! Win 3 stars with a great score to earn more",
      movesAdded: "+5 moves!",
      boosterAria: (name, n) => `${name}: ${n} left`,
      rewardGreat: "🎁 Great score! You earned:",
      rewardAmazing: "🎁 Amazing score! You earned:",
      finalScore: "Score:",
      levelBest: "Level best:",
      best: "Best",
      play: "Play",
      close: "Close",
      rotate: "Turn your phone upright to play",
      switchLang: "Español",
      switchLangAria: "Cambiar a español",
      shuffling: "No moves left: shuffling…",
      boardCleared: "Board cleared!",
      tapToSkip: "Tap the board to skip",
      starMessages: ["", "⭐ Target reached! Go for more stars", "⭐⭐ 2 stars! One more to go", "⭐⭐⭐ 3 stars!"],
      combo: (n) => `Combo x${n}!`,
      levelComplete: "Level complete!",
      levelFailed: "Level failed",
      missedBy: (pts) => `You were ${pts} points short`,
      threeStarsSpare: (m) => `3 stars with ${m} move${m === 1 ? "" : "s"} to spare!`,
      newBest: "New best score on this level!",
      levelDone: (n) => `Level ${n} complete`,
      nextLevel: "Next level",
      replay: "Replay",
      retry: "Try again",
      levelTitle: (n) => `Level ${n}`,
      hardLevel: (world) => `🔥 Hard level · ${world}`,
      levelStart: (n, pts) => `Level ${n}! Reach ${pts} points`,
      hardStart: (n) => `🔥 Level ${n} is a hard one!`,
      levelAria: (n, locked) => `Level ${n}${locked ? " (locked)" : ""}`,
    },
    es: {
      title: "Marshmallow Pals",
      starsWord: "estrellas",
      playLevel: "Jugar · Nivel",
      levels: "Niveles",
      backHome: "Volver a la portada",
      backMap: "Volver al mapa",
      mapShort: "‹ Mapa",
      map: "Mapa",
      level: "Nivel",
      moves: "Movimientos",
      score: "Puntos",
      target: "Objetivo",
      board: "Tablero de juego",
      rush: "¡Animal Rush!",
      quitTitle: "¿Salir del nivel?",
      quitText: "Si sales antes de terminar, perderás una vida.",
      keepPlaying: "Seguir jugando",
      quitLeave: "Salir (−1 vida)",
      noLivesTitle: "Sin vidas",
      noLivesText: "Tus vidas se recargan solas con el tiempo.",
      nextLifeIn: "Próxima vida en",
      watchAd: "Ver anuncio · +1 vida",
      ok: "Entendido",
      livesFull: "Llenas",
      livesAria: (n, time) => `${n} vida${n === 1 ? "" : "s"}${time ? `, la siguiente en ${time}` : ""}`,
      lifeLost: "−1 vida",
      boosters: "Power-ups",
      boosterNames: { hammer: "Martillo", swap: "Cambio libre", moves: "+5 movimientos", shuffle: "Mezclar" },
      boosterHint: {
        hammer: "🔨 Toca un animalito para romperlo",
        swap: "🔀 Desliza o toca dos vecinos para cambiarlos",
        moves: "Toca +5 otra vez para sumar 5 movimientos",
        shuffle: "Toca 🌀 otra vez para mezclar el tablero",
      },
      boosterEmpty: "¡No te quedan! Gana 3 estrellas con un gran puntaje para conseguir más",
      movesAdded: "¡+5 movimientos!",
      boosterAria: (name, n) => `${name}: quedan ${n}`,
      rewardGreat: "🎁 ¡Gran puntaje! Ganaste:",
      rewardAmazing: "🎁 ¡Puntaje increíble! Ganaste:",
      finalScore: "Puntaje:",
      levelBest: "Récord del nivel:",
      best: "Récord",
      play: "Jugar",
      close: "Cerrar",
      rotate: "Gira tu teléfono en vertical para jugar",
      switchLang: "English",
      switchLangAria: "Switch to English",
      shuffling: "Sin movimientos: mezclando…",
      boardCleared: "¡Tablero limpio!",
      tapToSkip: "Toca el tablero para saltar",
      starMessages: ["", "⭐ ¡Objetivo cumplido! Ve por más estrellas", "⭐⭐ ¡2 estrellas! Una más y ganas", "⭐⭐⭐ ¡3 estrellas!"],
      combo: (n) => `¡Combo x${n}!`,
      levelComplete: "¡Nivel superado!",
      levelFailed: "Nivel fallido",
      missedBy: (pts) => `Te faltaron ${pts} puntos`,
      threeStarsSpare: (m) => `¡3 estrellas con ${m} movimiento${m === 1 ? "" : "s"} de sobra!`,
      newBest: "¡Nuevo récord en este nivel!",
      levelDone: (n) => `Nivel ${n} completado`,
      nextLevel: "Siguiente nivel",
      replay: "Repetir",
      retry: "Reintentar",
      levelTitle: (n) => `Nivel ${n}`,
      hardLevel: (world) => `🔥 Nivel difícil · ${world}`,
      levelStart: (n, pts) => `¡Nivel ${n}! Llega a ${pts} puntos`,
      hardStart: (n) => `🔥 ¡Nivel ${n} difícil!`,
      levelAria: (n, locked) => `Nivel ${n}${locked ? " (bloqueado)" : ""}`,
    },
  };

  function loadLang() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved && TEXTS[saved]) return saved;
    } catch (e) { /* sin acceso al almacenamiento: se usa inglés */ }
    return "en";
  }

  let lang = loadLang();

  // t("clave") devuelve el texto; si es una función, le pasa los datos: t("combo", 3)
  function t(key, ...args) {
    const value = TEXTS[lang][key] ?? TEXTS.en[key];
    return typeof value === "function" ? value(...args) : value;
  }

  // Qué tan exigente es el objetivo (fracción de lo que suele lograr un jugador)
  const DIFFICULTY = { start: 0.3, perLevel: 0.009, max: 0.72, hardBonus: 0.1, relaxDiscount: 0.08 };

  // Velocidad de las animaciones: 1 = rápido, 2 = el doble de lento, 1.5 = intermedio...
  const MOVE_SCALE = 2;       // movimientos: intercambio, caída y mezcla
  const REACTION_SCALE = 1.4; // reacciones: combinaciones y explosiones
  const FALL_SPEED = 1.2;     // caída: 1.2 = 20% más rápida que los demás movimientos
  const TIME = {
    swap: 180 * MOVE_SCALE,        // intercambio de dos caramelos
    fallPerRow: (70 * MOVE_SCALE) / FALL_SPEED,   // tiempo de caída por cada fila
    fallMin: (160 * MOVE_SCALE) / FALL_SPEED,     // caída mínima
    appear: 300 * MOVE_SCALE,      // entrada del tablero al iniciar
    pop: 250 * REACTION_SCALE,     // caramelos que desaparecen por combinación
    boom: 350 * REACTION_SCALE,    // caramelos que desaparecen por un especial
    transform: 300 * REACTION_SCALE, // caramelos que se convierten en especiales
    sweep: 450 * REACTION_SCALE,   // animalito rayado que cruza el tablero
    armed: 550 * REACTION_SCALE,   // el envuelto armado vibra antes de su segunda explosión
  };

  // ---------- Mundos ----------
  // Cada 100 niveles empieza un mundo nuevo. Cada mundo tiene su nombre, su color
  // y sus fondos en images/worlds/:
  //   <id>.jpg        fondo del juego en celular (vertical)
  //   <id>-wide.jpg   fondo del juego en computadora (horizontal)
  //   <id>-mapa.jpg   fondo del mapa (vertical, que se pueda repetir hacia arriba)
  // Si falta alguna imagen, se usa el degradado "fallback" de ese mundo.
  const LEVELS_PER_WORLD = 100;
  const WORLD_IMAGE_VERSION = 1; // súbelo si reemplazas imágenes con el mismo nombre
  const WORLDS = [
    { id: "pradera", name: { en: "Green Meadow", es: "Pradera Verde" }, color: "#43a047",
      fallback: "linear-gradient(#bfe9ff, #d8f5c4 35%, #8bc34a 70%, #5a9e2f)" },
    { id: "playa", name: { en: "Sunny Beach", es: "Playa Soleada" }, color: "#039be5",
      fallback: "linear-gradient(#aee4ff, #7fd3f7 40%, #f6e3a8 70%, #e9c97a)" },
    { id: "bosque", name: { en: "Mushroom Forest", es: "Bosque de Hongos" }, color: "#8d6e63",
      fallback: "linear-gradient(#cfe8c8, #7cb36a 40%, #4e7d3a 75%, #3b5e2b)" },
    { id: "selva", name: { en: "Tropical Jungle", es: "Selva Tropical" }, color: "#00897b",
      fallback: "linear-gradient(#b9f0d8, #4fbf8f 40%, #1f8a63 75%, #13684a)" },
    { id: "desierto", name: { en: "Cactus Desert", es: "Desierto de Cactus" }, color: "#fb8c00",
      fallback: "linear-gradient(#ffe0b2, #ffcc80 40%, #f0a85b 75%, #d9853b)" },
    { id: "nieve", name: { en: "Snowy Mountain", es: "Montaña Nevada" }, color: "#5c9ccf",
      fallback: "linear-gradient(#dff1ff, #f4fbff 40%, #cfe3f2 75%, #a9c7de)" },
    { id: "nubes", name: { en: "Cloud Kingdom", es: "Reino de las Nubes" }, color: "#8e24aa",
      fallback: "linear-gradient(#e7d9ff, #f8f0ff 40%, #d9c4f5 75%, #b79be6)" },
  ];

  const worldImage = (id, suffix = "") => `images/worlds/${id}${suffix}.jpg?v=${WORLD_IMAGE_VERSION}`;

  // Mundo del nivel n. Al terminar la lista, los mundos se repiten ("Pradera Verde 2"...)
  function worldOf(n) {
    const index = Math.floor((n - 1) / LEVELS_PER_WORLD);
    const world = WORLDS[index % WORLDS.length];
    const round = Math.floor(index / WORLDS.length);
    return {
      ...world,
      index,
      name: round ? `${world.name[lang]} ${round + 1}` : world.name[lang],
      first: index * LEVELS_PER_WORLD + 1,
      last: (index + 1) * LEVELS_PER_WORLD,
    };
  }

  // Pone el fondo del juego según el mundo del nivel n
  function applyWorld(n) {
    const world = worldOf(n);
    const root = document.documentElement.style;
    root.setProperty("--bg-image", `url("${worldImage(world.id)}")`);
    root.setProperty("--bg-image-wide", `url("${worldImage(world.id, "-wide")}")`);
    root.setProperty("--bg-fallback", world.fallback);
    root.setProperty("--world", world.color);
  }

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
      fired.push({ index: i, special: cell.special, color: cell.color });

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

  // Rayos que se están mostrando y que aún no se aplicaron (ver applyEffects)
  let pendingBeams = [];

  // El animalito rayado cruza el tablero dejando un rayo detrás:
  // el horizontal va de izquierda a derecha y el vertical de abajo hacia arriba
  function showBeam(index, special, color = null) {
    const horizontal = special === STRIPED_H;
    const dir = horizontal ? "h" : "v";
    const parts = [];

    const beam = document.createElement("div");
    beam.className = `beam beam-${dir}`;
    parts.push(beam);

    if (color !== null) {
      const runner = document.createElement("div");
      runner.className = `runner runner-${dir}`;
      const striped = STRIPED_IMAGES[special][color];
      const src = loadedImages.has(striped) ? striped : CANDY_IMAGES[color];
      runner.style.backgroundImage = `url("${src}")`;
      parts.push(runner);
    }

    for (const el of parts) {
      el.style.setProperty("--x", colOf(index));
      el.style.setProperty("--y", rowOf(index));
      el.style.setProperty("--w", WIDTH);
      el.style.setProperty("--sweep", `${TIME.sweep}ms`);
      boardEl.appendChild(el);
    }
    setTimeout(() => parts.forEach((el) => el.remove()), TIME.sweep + TIME.boom);
    pendingBeams.push({ index, special });
  }

  // Cuánto espera cada casilla para explotar: justo cuando el animalito pasa por ella
  function sweepDelays(cells, beams) {
    const delays = new Map();
    const origins = new Set(beams.map((b) => b.index));
    for (const i of cells) {
      if (origins.has(i)) continue; // el rayado sale de su casilla de inmediato
      let best = null;
      for (const { index, special } of beams) {
        let steps = null;
        if (special === STRIPED_H && rowOf(i) === rowOf(index)) steps = colOf(i) + 1;
        if (special === STRIPED_V && colOf(i) === colOf(index)) steps = WIDTH - rowOf(i);
        if (steps !== null) {
          const ms = (steps / (WIDTH + 1)) * TIME.sweep;
          best = best === null ? ms : Math.min(best, ms);
        }
      }
      if (best !== null) delays.set(i, Math.round(best));
    }
    return delays;
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

  // Vibración corta al explotar caramelos (si el teléfono lo permite)
  const VIBRATION_MS = 40;
  function vibrate() {
    try {
      if (navigator.vibrate) navigator.vibrate(VIBRATION_MS);
    } catch (e) { /* algunos navegadores no lo permiten: se ignora */ }
  }

  // Quita caramelos: los de una combinación "revientan" (pop),
  // los alcanzados por un especial "explotan" (boom)
  async function removeCells(cells, popCells, delays = new Map()) {
    vibrate();
    let longest = 0;
    for (const i of cells) {
      const effect = popCells.has(i) ? "pop" : "boom";
      const delay = effect === "boom" ? delays.get(i) || 0 : 0;
      els[i].style.setProperty("--delay", `${delay}ms`);
      longest = Math.max(longest, delay + (effect === "pop" ? TIME.pop : TIME.boom));
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
      if (f.special === STRIPED_H || f.special === STRIPED_V) showBeam(f.index, f.special, f.color);
    }
    const beams = pendingBeams;
    pendingBeams = [];
    for (const i of armed) {
      grid[i] = candy(grid[i].color, ARMED);
      setCell(els[i], grid[i]);
    }
    if (!clear.size) return;
    addScore(clear.size * POINTS_PER_CANDY * combo, combo);
    await removeCells(clear, popCells, sweepDelays(clear, beams));
  }

  // Si el tablero se queda sin combinaciones posibles, se mezcla (no es culpa del jugador)
  async function reshuffle() {
    showMessage(t("shuffling"));
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

  const formatNumber = (n) => n.toLocaleString(lang);

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
      showMessage(t("starMessages")[after], 2000);
    } else if (combo >= 2) {
      showMessage(t("combo", combo));
    }
  }

  // ---------- Fin del nivel ----------

  let onPrimary = null;   // qué hace cada botón del mensaje final (cambia si ganas o pierdes)
  let onSecondary = null;

  async function finishLevel() {
    ended = true;
    armedBooster = null;
    renderBoosters();
    clearSelection();
    // ganar no gasta vidas; fallar sí (si ya salió y la pagó, no se cobra dos veces)
    if (lifeInPlay(true)) settleLife(starsFor(score, level) === 0);
    const spareMoves = movesLeft;
    if (starsFor(score, level) > 0) await animalRush(); // solo si ganó
    const stars = starsFor(score, level);
    const won = stars > 0;
    const record = saveResult(level.number, score, stars);
    const reward = won ? rewardFor(stars, spareMoves, record) : null;

    await wait(700); // una pausa para que se vea cómo quedó el tablero
    if (currentScreen !== "game") return; // salió del juego durante la bonificación

    resultTitleEl.textContent = won ? t("levelComplete") : t("levelFailed");
    let text;
    if (!won) text = t("missedBy", formatNumber(level.target - score));
    else if (stars === 3 && spareMoves > 0)
      text = t("threeStarsSpare", spareMoves);
    else if (record.isNewBest && record.previousBest > 0) text = t("newBest");
    else text = t("levelDone", level.number);
    resultTextEl.textContent = text;
    finalScoreEl.textContent = formatNumber(score);
    bestScoreEl.textContent = formatNumber(record.best);
    resultStars.forEach((star, i) => {
      star.classList.remove("earned");
      star.style.animationDelay = `${300 + i * 300}ms`;
      if (i < stars) star.classList.add("earned");
    });

    if (won) {
      primaryBtn.textContent = t("nextLevel");
      onPrimary = () => location.replace(`#nivel-${level.number + 1}`);
      secondaryBtn.textContent = t("replay");
      secondaryBtn.hidden = false;
      onSecondary = () => playAgain(level.number);
    } else {
      primaryBtn.textContent = t("retry");
      onPrimary = () => playAgain(level.number);
      secondaryBtn.hidden = true;
      onSecondary = null;
    }

    showReward(reward);
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
      showMessage(t("boardCleared"));
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
      showBeam(b, STRIPED_H, grid[a].color);
      showBeam(b, STRIPED_V, grid[b].color);
      await applyEffects(expandEffects(grid, [...rowCells(b), ...colCells(b)], [a, b]));
    } else if (stripes === 1) {
      // rayado + envuelto: 3 filas y 3 columnas
      const color = (isStriped(grid[a]) ? grid[a] : grid[b]).color;
      for (const d of [-1, 0, 1]) {
        const r = rowOf(b) + d;
        const c = colOf(b) + d;
        if (r >= 0 && r < WIDTH) showBeam(indexOf(r, colOf(b)), STRIPED_H, color);
        if (c >= 0 && c < WIDTH) showBeam(indexOf(rowOf(b), c), STRIPED_V, color);
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
        await wait(TIME.armed); // se deja ver cómo vibra antes de volver a explotar
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
    if (!ended) markLifeInPlay(); // el Animal Rush también gasta movimientos, pero ya terminó
    movesLeft--;
    updateHud();
    bump(movesBoxEl);
  }

  // ---------- Animal Rush ----------

  let rushing = false;   // true mientras corre la bonificación
  let rushSkip = false;  // el jugador tocó para saltarla (o salió del nivel)
  const rushBannerEl = $("rushBanner");

  const boardSpecials = () => allCells().filter((i) => grid[i] && grid[i].special);

  // Explota unas casillas (con sus especiales), hace caer todo y resuelve las cascadas
  async function fireCells(cells) {
    await applyEffects(expandEffects(grid, cells), new Set(), 1);
    await dropCandies();
    await settleBoard(2);
  }

  // Explota, por rondas, todos los especiales que haya en el tablero
  async function fireAllSpecials() {
    for (let round = 0; round < RUSH.maxRounds && !rushSkip; round++) {
      const specials = boardSpecials();
      if (!specials.length) break;
      await fireCells(specials);
    }
  }

  // Convierte un movimiento sobrante en un animalito rayado al azar
  function convertMove(exclude) {
    const options = allCells().filter((i) => grid[i] && !grid[i].special && !exclude.includes(i));
    if (!options.length) return null;
    const i = options[Math.floor(Math.random() * options.length)];
    useMove();
    transformCell(i, candy(grid[i].color, Math.random() < 0.5 ? STRIPED_H : STRIPED_V));
    addScore(RUSH.pointsPerMove);
    return i;
  }

  async function animalRush() {
    rushing = true;
    rushSkip = false;
    rushBannerEl.hidden = false;
    playOnce(rushBannerEl, "show");
    showMessage(t("tapToSkip"), 2500);
    // Si se pasa del tiempo máximo, termina como si el jugador la hubiera saltado
    const timer = setTimeout(() => (rushSkip = true), RUSH.maxTime);
    try {
      await wait(600);
      await fireAllSpecials();                       // 1. especiales que quedaron

      const perWave = Math.max(RUSH.perWave, Math.ceil(movesLeft / RUSH.maxWaves));
      while (movesLeft > 0 && !rushSkip) {           // 2. movimientos sobrantes
        const wave = [];
        while (wave.length < perWave && movesLeft > 0 && !rushSkip) {
          const i = convertMove(wave);
          if (i === null) break;
          wave.push(i);
          await wait(RUSH.convertDelay);
        }
        if (!wave.length) break;
        await wait(TIME.transform);
        await fireCells(wave);
      }

      await fireAllSpecials();                       // 3. lo que haya quedado
    } finally {
      clearTimeout(timer);
      // Si se saltó (o se acabó el tiempo), los movimientos que faltaban se pagan de una vez
      // (su bono fijo más lo que daría, más o menos, la explosión de un rayado)
      if (movesLeft > 0) {
        const points = movesLeft * (RUSH.pointsPerMove + WIDTH * POINTS_PER_CANDY);
        movesLeft = 0;
        addScore(points);
      }
      rushBannerEl.hidden = true;
      rushing = false;
      rushSkip = false;
    }
  }


  // Después de cualquier jugada (o power-up): cascadas, fin del nivel o mezcla
  async function afterTurn() {
    await settleBoard(2);
    // el nivel termina al conseguir las 3 estrellas, o al acabarse los movimientos
    if (score >= level.stars[2] || movesLeft === 0) await finishLevel();
    else if (!hasPossibleMove(grid)) await reshuffle();
  }

  async function playTurn(a, b) {
    if (busy || ended || a === null || b === null || !areAdjacent(a, b)) return;
    const free = armedBooster === "swap"; // cambio libre: no necesita combinar ni gasta movimiento
    busy = true;
    clearSelection();
    if (free) spendBooster("swap");
    const move = () => { if (!free) useMove(); };

    try {
      await swapCells(a, b);
      const A = grid[a];
      const B = grid[b];

      if (A.special === BOMB || B.special === BOMB) {
        move();
        const bomb = B.special === BOMB ? b : a;
        await bombSwap(bomb, bomb === a ? b : a);
      } else if (A.special && B.special) {
        move();
        await specialCombo(a, b);
      } else {
        const matches = findMatches(grid);
        if (matches.groups.length) {
          move();
          await resolveMatches(matches, { a, b }, 1);
        } else if (!free) {
          await swapCells(a, b); // no sirvió: los caramelos regresan (no gasta movimiento)
          return;
        }
      }

      await afterTurn();
    } finally {
      busy = false;
      renderBoosters();
    }
  }

  // =====================================================================
  // POWER-UPS
  // =====================================================================
  //   progress.boosters = { hammer, swap, moves, shuffle }: cuántos tiene de cada uno
  //   armedBooster: el que está "armado" esperando que el jugador lo aplique

  const BOOSTER_TYPES = ["hammer", "swap", "moves", "shuffle"];
  const BOOSTER_ICONS = { hammer: "🔨", swap: "🔀", moves: "+5", shuffle: "🌀" };
  const boostersEl = $("boosters");
  const boosterBtns = [...boostersEl.querySelectorAll(".booster")];
  let armedBooster = null;
  let bonusMoves = 0; // movimientos sumados con "+5" en este nivel (no cuentan para premios)

  function boosterStock() {
    if (!progress.boosters) progress.boosters = { ...BOOSTERS.starter }; // regalo inicial
    return progress.boosters;
  }

  const boosterCount = (type) => boosterStock()[type] || 0;

  function spendBooster(type) {
    boosterStock()[type] = Math.max(0, boosterCount(type) - 1);
    armedBooster = null;
    markLifeInPlay(); // usar un power-up cuenta como haber empezado el nivel
    saveProgress();
    renderBoosters();
  }

  function giveBoosters(items) {
    const stock = boosterStock();
    for (const type of items) stock[type] = (stock[type] || 0) + 1;
    saveProgress();
  }

  function disarmBooster() {
    if (!armedBooster) return;
    armedBooster = null;
    renderBoosters();
  }

  function renderBoosters() {
    const names = t("boosterNames");
    for (const btn of boosterBtns) {
      const type = btn.dataset.booster;
      const n = boosterCount(type);
      btn.querySelector(".booster-count").textContent = n;
      btn.classList.toggle("none", n === 0);
      btn.classList.toggle("armed", armedBooster === type);
      btn.setAttribute("aria-pressed", armedBooster === type);
      btn.setAttribute("aria-label", t("boosterAria", names[type], n));
      btn.title = names[type];
    }
    boostersEl.classList.toggle("locked", ended);
    boardEl.classList.toggle("hammer-mode", armedBooster === "hammer");
  }

  // 🔨 Martillo: rompe el animalito tocado (si es especial, se activa)
  async function useHammer(i) {
    if (busy || ended || !grid[i]) return;
    busy = true;
    clearSelection();
    try {
      spendBooster("hammer");
      playOnce(els[i], "smash");
      vibrate();
      await wait(220);
      await applyEffects(expandEffects(grid, [i]), new Set(), 1);
      await dropCandies();
      await afterTurn();
    } finally {
      busy = false;
      renderBoosters();
    }
  }

  // +5 movimientos
  function useExtraMoves() {
    spendBooster("moves");
    movesLeft += BOOSTERS.extraMoves;
    bonusMoves += BOOSTERS.extraMoves;
    updateHud();
    bump(movesBoxEl);
    showMessage(t("movesAdded"));
  }

  // 🌀 Mezclar el tablero
  async function useShuffle() {
    if (busy) return;
    busy = true;
    clearSelection();
    try {
      spendBooster("shuffle");
      await reshuffle();
    } finally {
      busy = false;
      renderBoosters();
    }
  }

  // Primer toque: arma el power-up. Martillo y cambio se aplican en el tablero;
  // +5 y mezclar se confirman con un segundo toque (para no gastarlos sin querer).
  boostersEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".booster");
    if (!btn || busy || ended || rushing) return;
    const type = btn.dataset.booster;

    if (armedBooster === type) {
      if (type === "moves") return useExtraMoves();
      if (type === "shuffle") return useShuffle();
      return disarmBooster(); // tocar otra vez el martillo o el cambio los cancela
    }
    if (boosterCount(type) < 1) {
      disarmBooster();
      showMessage(t("boosterEmpty"), 3000);
      return;
    }
    armedBooster = type;
    clearSelection();
    renderBoosters();
    showMessage(t("boosterHint")[type], 6000);
  });

  // ---------- Premios por un resultado muy bueno ----------

  function pickBooster(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (const [type, w] of Object.entries(weights)) {
      roll -= w;
      if (roll < 0) return type;
    }
    return "hammer";
  }

  // Decide el premio al ganar. Devuelve null si no hay premio.
  function rewardFor(stars, spareMoves, record) {
    if (stars < 3 || !record.isNewBest) return null;
    const spare = Math.max(0, spareMoves - bonusMoves) / level.moves;
    const tier = REWARDS.tiers.find((tr) => spare >= tr.spare);
    if (!tier) return null;
    const items = [];
    for (let k = 0; k < tier.count; k++) {
      const shuffle = !items.includes("shuffle") && Math.random() < tier.shuffleChance;
      items.push(shuffle ? "shuffle" : pickBooster(REWARDS.weights));
    }
    giveBoosters(items);
    return { key: tier.key, items };
  }

  function showReward(reward) {
    const box = $("resultReward");
    box.hidden = !reward;
    if (!reward) return;
    $("rewardTitle").textContent = t(reward.key);
    const counts = {};
    for (const type of reward.items) counts[type] = (counts[type] || 0) + 1;
    const names = t("boosterNames");
    $("rewardItems").innerHTML = Object.entries(counts)
      .map(([type, n]) => `<span class="reward-item" title="${names[type]}">
        <span class="booster-icon${type === "moves" ? " text" : ""}" aria-hidden="true">${BOOSTER_ICONS[type]}</span>
        <span>${names[type]} ×${n}</span></span>`)
      .join("");
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
    if (rushing) {
      rushSkip = true; // tocar durante el Animal Rush lo salta
      return;
    }
    if (busy || ended) return;
    const index = cellFromPoint(e.clientX, e.clientY);
    if (index === null) return;
    if (armedBooster === "hammer") {
      useHammer(index);
      return;
    }
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

  primaryBtn.addEventListener("click", () => onPrimary && onPrimary());
  secondaryBtn.addEventListener("click", () => onSecondary && onSecondary());

  // "Mapa" (en el mensaje final) y "‹ Mapa" (arriba en el juego) vuelven al mapa
  exitBtn.addEventListener("click", () => goToMap());
  $("gameBack").addEventListener("click", () => {
    if (lifeInPlay()) showQuitConfirm(); // si ya jugó, avisa que pierde una vida
    else goToMap();
  });

  // =====================================================================
  // 8. INICIO
  // =====================================================================

  // Las imágenes cargadas se guardan aquí para que el navegador no las suelte de memoria.
  // Si las soltara, un animalito especial (que casi nunca está en pantalla) aparecería
  // como una casilla vacía mientras el teléfono vuelve a cargar su imagen.
  const keptImages = [];

  // Carga (y decodifica) todas las imágenes antes de empezar y anota cuáles existen
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
              keptImages.push(img);
              // decode() deja la imagen lista para dibujarse al instante
              const ready = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
              ready.then(resolve);
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

  // ---------- Vidas ----------
  //   progress.lives.count:   vidas que tiene
  //   progress.lives.since:   cuándo empezó a cargarse la próxima (null si están llenas)
  //   progress.lives.pending: nivel con una vida "en juego" (ya hizo al menos un movimiento).
  //     Si se cierra el juego a medias, al volver a abrirlo se cobra esa vida.
  const REFILL_MS = LIVES.refillMinutes * 60 * 1000;
  const quitEl = $("quitConfirm");
  const noLivesEl = $("noLives");

  function livesState() {
    if (!progress.lives) progress.lives = { count: LIVES.max, since: null, pending: null };
    return progress.lives;
  }

  // Suma las vidas que se recargaron desde la última vez que se revisó
  function refreshLives() {
    const L = livesState();
    const now = Date.now();
    if (L.count >= LIVES.max) {
      L.count = LIVES.max;
      L.since = null;
      return L;
    }
    if (!L.since || L.since > now) L.since = now; // sin fecha, o el reloj se atrasó
    const gained = Math.floor((now - L.since) / REFILL_MS);
    if (gained > 0) {
      L.count = Math.min(LIVES.max, L.count + gained);
      L.since = L.count >= LIVES.max ? null : L.since + gained * REFILL_MS;
      saveProgress();
      renderLives(true);
    }
    return L;
  }

  const canPlay = () => refreshLives().count > 0;

  function msToNextLife() {
    const L = refreshLives();
    return L.since ? Math.max(0, L.since + REFILL_MS - Date.now()) : 0;
  }

  function formatTime(ms) {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = String(total % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  }

  function loseLife() {
    const L = refreshLives();
    if (L.count >= LIVES.max) L.since = Date.now(); // empieza a recargarse desde ahora
    L.count = Math.max(0, L.count - 1);
    L.pending = null;
    saveProgress();
    renderLives(true);
  }

  // Para regalar vidas (por ejemplo, al ver un anuncio recompensado)
  function addLives(n = 1) {
    const L = refreshLives();
    L.count = Math.min(LIVES.max, L.count + n);
    if (L.count >= LIVES.max) L.since = null;
    saveProgress();
    renderLives(true);
  }

  // Con el primer movimiento, la vida de este nivel queda en juego
  function markLifeInPlay() {
    const L = livesState();
    if (L.pending === level.number) return;
    L.pending = level.number;
    saveProgress();
  }

  // ¿Hay una vida en juego en el nivel actual? (evenIfEnded: también después de terminar)
  const lifeInPlay = (evenIfEnded = false) =>
    !!level && (evenIfEnded || !ended) && livesState().pending === level.number;

  // Al terminar el nivel: si perdió, cuesta una vida; si ganó, la vida se devuelve
  function settleLife(lost) {
    if (lost) loseLife();
    else {
      livesState().pending = null;
      saveProgress();
    }
  }

  // Pinta las vidas en la portada, el mapa y el juego, y el reloj del mensaje "Sin vidas"
  function renderLives(animate = false) {
    const L = refreshLives();
    const left = msToNextLife();
    const time = L.count < LIVES.max ? formatTime(left) : "";
    document.querySelectorAll("[data-lives]").forEach((pill) => {
      pill.querySelector(".lives-count").textContent = L.count;
      const full = pill.classList.contains("small") ? "" : t("livesFull");
      pill.querySelector(".lives-timer").textContent = time || full;
      pill.classList.toggle("empty", L.count === 0);
      pill.setAttribute("aria-label", t("livesAria", L.count, time));
      if (animate) playOnce(pill, "bump");
    });
    if (!noLivesEl.hidden) {
      if (L.count > 0) noLivesEl.hidden = true; // ya se recargó una: puede jugar
      else $("noLivesTimer").textContent = formatTime(left);
    }
  }

  function showNoLives() {
    hideLevelCard();
    noLivesEl.hidden = false;
    renderLives();
    $("noLivesClose").focus();
  }

  function showQuitConfirm() {
    quitEl.hidden = false;
    $("quitStay").focus();
  }

  // Repetir el nivel (desde el mensaje final): solo si quedan vidas
  function playAgain(n) {
    if (canPlay()) return startLevel(n);
    goToMap();
    showNoLives();
  }

  $("quitStay").addEventListener("click", () => (quitEl.hidden = true));
  $("quitLeave").addEventListener("click", () => {
    quitEl.hidden = true;
    if (lifeInPlay()) loseLife();
    goToMap();
  });
  quitEl.addEventListener("click", (e) => {
    if (e.target === quitEl) quitEl.hidden = true;
  });
  $("noLivesClose").addEventListener("click", () => (noLivesEl.hidden = true));
  noLivesEl.addEventListener("click", (e) => {
    if (e.target === noLivesEl) noLivesEl.hidden = true;
  });

  // Espera a que termine la jugada en curso (por si el jugador sale a mitad de una cascada)
  async function whenIdle() {
    if (rushing) rushSkip = true; // no hace falta esperar toda la bonificación
    while (busy) await wait(50);
  }

  async function startLevel(n) {
    await whenIdle();
    hideResult();
    level = generateLevel(n);
    applyWorld(n);
    activeColors = level.colors;
    movesLeft = level.moves;
    score = 0;
    ended = false;
    selected = null;
    armedBooster = null;
    bonusMoves = 0;
    progress.current = n;
    saveProgress();

    grid = createGrid(seededRandom(level.seed)); // el tablero inicial es siempre el mismo
    render("appear");
    updateHud();
    renderBoosters();
    showMessage(level.hard ? t("hardStart", n) : t("levelStart", n, formatNumber(level.target)), 3000);
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
    if (name !== "game" && rushing) rushSkip = true;
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
    if (!canPlay()) return showNoLives();
    gameFrom = from;
    goTo(`#nivel-${n}`);
  }

  async function route() {
    hideLevelCard();
    const match = location.hash.match(/^#nivel-(\d+)$/);

    // Botón "atrás" del celular a mitad de un nivel: se queda en el nivel y pregunta
    if (currentScreen === "game" && lifeInPlay() && !(match && Number(match[1]) === level.number)) {
      history.pushState(null, "", `#nivel-${level.number}`);
      showQuitConfirm();
      return;
    }
    quitEl.hidden = true;

    if (match) {
      const n = Number(match[1]);
      if (n < 1 || n > progress.unlocked) {
        location.replace("#mapa"); // nivel bloqueado: al mapa
        return;
      }
      const isNewEntry = currentScreen !== "game" || !level || level.number !== n;
      if (isNewEntry && !canPlay()) {
        location.replace("#mapa"); // sin vidas: al mapa, con el aviso
        showNoLives();
        return;
      }
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
    applyWorld(progress.unlocked);
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
    // una franja de fondo por cada mundo visible en el mapa
    let html = "";
    const FADE = 160; // px en que un mundo se mezcla con el siguiente
    for (let w = worldOf(1); w.first <= count; w = worldOf(w.last + 1)) {
      const bottom = w.first === 1 ? height : pos(w.first).y + STEP / 2 + FADE;
      const top = w.last >= count ? 0 : pos(w.last).y - STEP / 2;
      html += `<div class="world-band${w.first === 1 ? " first" : ""}" style="top:${top}px; height:${bottom - top}px;
        --map-image:url('${worldImage(w.id, "-mapa")}'); --bg-fallback:${w.fallback}"></div>`;
    }

    html += `<svg class="map-road" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${d}" class="road-base" vector-effect="non-scaling-stroke"/>
      <path d="${d}" class="road-dash" vector-effect="non-scaling-stroke"/>
    </svg>`;

    for (let n = 1; n <= count; n++) {
      const p = pos(n);
      const zone = worldOf(n);
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
        ${locked ? "disabled" : ""} aria-label="${t("levelAria", n, locked)}">
        <span class="node-number">${locked ? "🔒" : n}</span>
        ${hard && !locked ? '<span class="node-fire">🔥</span>' : ""}
        ${info.stars ? `<span class="node-stars">${starIcons(info.stars)}</span>` : ""}
        ${current ? '<span class="node-pin" aria-hidden="true">▼</span>' : ""}
      </button>`;
    }
    mapPathEl.innerHTML = html;
    applyWorld(unlocked);
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
    $("cardTitle").textContent = t("levelTitle", n);
    $("cardZone").textContent = lvl.hard ? t("hardLevel", worldOf(n).name) : worldOf(n).name;
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
    if (e.key !== "Escape") return;
    hideLevelCard();
    disarmBooster();
    quitEl.hidden = true;
    noLivesEl.hidden = true;
  });

  // ---------- Idioma ----------

  // Pone todos los textos fijos de la página en el idioma actual
  function applyLanguage() {
    document.documentElement.lang = lang;
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nAria));
    });
    $("langToggle").setAttribute("aria-label", t("switchLangAria"));
    $("langToggle").lang = lang === "en" ? "es" : "en";
  }

  $("langToggle").addEventListener("click", () => {
    lang = lang === "en" ? "es" : "en";
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* no se pudo guardar */ }
    applyLanguage();
    if (currentScreen === "home") renderHome();
    if (currentScreen === "map") renderMap();
    if (currentScreen === "game" && level) updateHud();
    renderLives();
    renderBoosters();
  });

  // ---------- Arranque ----------

  applyLanguage();

  progress = loadProgress();
  // Si se cerró el juego a mitad de un nivel, esa vida se pierde
  if (livesState().pending !== null) loseLife();
  renderLives();
  setInterval(renderLives, 1000); // el reloj de la próxima vida
  window.addEventListener("hashchange", route);
  preloadImages().then(route);
})();
