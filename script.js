// Código completo con correcciones

// Asegúrate que este script esté dentro de un DOMContentLoaded o al final del body
document.addEventListener("DOMContentLoaded", () => {
  const board = document.getElementById("gameBoard");
  const width = 8;
  const candyImages = [
    'images/candies/red.png',
    'images/candies/green.png',
    'images/candies/blue.png',
    'images/candies/orange.png',
    'images/candies/purple.png'
  ];
  const explosiveCandy = 'images/candies/explosive.png';
  let tiles = [];
  let firstTile = null;
  let score = 0;

  function updateScore(points) {
    score += points;
    document.getElementById('score').innerText = `Puntaje: ${score}`;
  }

  function randomImage() {
    return candyImages[Math.floor(Math.random() * candyImages.length)];
  }

  function createBoard() {
    board.innerHTML = "";
    tiles = [];
    for (let i = 0; i < width * width; i++) {
      const tile = document.createElement("div");
      tile.classList.add("tile");
      tile.style.backgroundImage = `url(${randomImage()})`;
      tile.dataset.index = i;
      tile.setAttribute("draggable", "true");
      board.appendChild(tile);
      tiles.push(tile);

      tile.addEventListener('dragstart', handleDragStart);
      tile.addEventListener('dragover', e => e.preventDefault());
      tile.addEventListener('drop', handleDrop);
      tile.addEventListener('dragend', () => tile.style.opacity = '1');
    }
  }

  let draggedTile = null;

  function handleDragStart(e) {
    draggedTile = e.target;
    e.dataTransfer.setData('text/plain', draggedTile.dataset.index);
    draggedTile.style.opacity = '0.5';
  }

  function handleDrop(e) {
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
    const targetIndex = parseInt(e.target.dataset.index);
    const sourceTile = tiles[sourceIndex];
    const targetTile = tiles[targetIndex];

    if (!areAdjacent(sourceIndex, targetIndex)) {
      draggedTile.style.opacity = '1';
      return;
    }

    swapTiles(sourceTile, targetTile);

    setTimeout(() => {
      if (targetTile.style.backgroundImage.includes(explosiveCandy)) {
        triggerExplosion(targetIndex).then(() => checkAndHandleMatches());
      } else if (sourceTile.style.backgroundImage.includes(explosiveCandy)) {
        triggerExplosion(sourceIndex).then(() => checkAndHandleMatches());
      } else {
        if (checkMatches(sourceIndex, targetIndex)) {
          handleMatches(sourceIndex, targetIndex);
        } else {
          swapTiles(sourceTile, targetTile); // revert if no match
        }
      }
    }, 100);
  }

  function areAdjacent(index1, index2) {
    const x1 = index1 % width;
    const y1 = Math.floor(index1 / width);
    const x2 = index2 % width;
    const y2 = Math.floor(index2 / width);
    return (Math.abs(x1 - x2) + Math.abs(y1 - y2)) === 1;
  }

  function swapTiles(tile1, tile2) {
    const temp = tile1.style.backgroundImage;
    tile1.style.backgroundImage = tile2.style.backgroundImage;
    tile2.style.backgroundImage = temp;
  }

  function checkMatches(...movedIndices) {
    // Siempre revisamos todo el tablero para mantener lógica limpia
    for (let i = 0; i < tiles.length; i++) {
      if (getMatchAt(i).length >= 3) return true;
    }
    return false;
  }

  function handleMatches(lastMovedIndex) {
    const toRemove = new Set();
    let explosionAssigned = false;

    for (let i = 0; i < tiles.length; i++) {
      const match = getMatchAt(i);
      if (match.length >= 3) {
        match.forEach(index => toRemove.add(index));

        if (match.length >= 4 && !explosionAssigned && match.includes(lastMovedIndex)) {
          tiles[lastMovedIndex].style.backgroundImage = `url(${explosiveCandy})`;
          toRemove.delete(lastMovedIndex);
          explosionAssigned = true;
        }
      }
    }

    updateScore(toRemove.size * 10);
    toRemove.forEach(index => tiles[index].classList.add("fading-out"));

    setTimeout(() => {
      toRemove.forEach(index => {
        tiles[index].style.backgroundImage = "";
        tiles[index].classList.remove("fading-out");
      });
      applyGravity().then(() => checkAndHandleMatches());
    }, 400);
  }

  function getMatchAt(index) {
    const matches = [index];
    const row = Math.floor(index / width);
    const col = index % width;
    const baseImg = tiles[index].style.backgroundImage;

    // Horizontal check
    let i = index + 1;
    while (i % width !== 0 && tiles[i] && tiles[i].style.backgroundImage === baseImg) {
      matches.push(i);
      i++;
    }

    // Vertical check
    i = index + width;
    while (i < width * width && tiles[i].style.backgroundImage === baseImg) {
      matches.push(i);
      i += width;
    }

    // Si no hay suficientes, reducimos
    return matches.filter(i => tiles[i].style.backgroundImage === baseImg);
  }

  function triggerExplosion(centerIndex) {
    return new Promise(resolve => {
      const explosionIndices = [];
      const dirs = [
        -width-1, -width, -width+1,
        -1, 0, 1,
        width-1, width, width+1
      ];

      dirs.forEach(offset => {
        const i = centerIndex + offset;
        if (tiles[i]) explosionIndices.push(i);
      });

      explosionIndices.forEach(i => tiles[i].classList.add("explosion"));

      setTimeout(() => {
        explosionIndices.forEach(i => {
          tiles[i].style.backgroundImage = "";
          tiles[i].classList.remove("explosion");
        });
        applyGravity().then(resolve);
      }, 500);
    });
  }

  function applyGravity() {
    return new Promise(resolve => {
      for (let col = 0; col < width; col++) {
        let emptySpots = 0;
        for (let row = width - 1; row >= 0; row--) {
          const index = row * width + col;
          if (tiles[index].style.backgroundImage === "") {
            emptySpots++;
          } else if (emptySpots > 0) {
            const targetIndex = (row + emptySpots) * width + col;
            tiles[targetIndex].style.backgroundImage = tiles[index].style.backgroundImage;
            tiles[index].style.backgroundImage = "";
          }
        }

        for (let i = 0; i < emptySpots; i++) {
          const index = i * width + col;
          tiles[index].style.backgroundImage = `url(${randomImage()})`;
        }
      }
      setTimeout(resolve, 300);
    });
  }

  function checkAndHandleMatches() {
    if (checkMatches()) {
      handleMatches(-1); // -1 = no movimiento específico
    }
  }

  createBoard();
  checkAndHandleMatches();
});
