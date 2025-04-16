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

      // Eventos de mouse
      tile.addEventListener('dragstart', handleDragStart);
      tile.addEventListener('dragover', e => e.preventDefault());
      tile.addEventListener('drop', handleDrop);
      tile.addEventListener('dragend', () => tile.style.opacity = '1');

      // Eventos táctiles
      tile.addEventListener('touchstart', handleTouchStart, { passive: true });
      tile.addEventListener('touchend', handleTouchEnd);
    }
  }

  // DRAG & DROP
  let draggedTile = null;

  function handleDragStart(e) {
    draggedTile = e.target;
    e.dataTransfer.setData('text/plain', draggedTile.dataset.index);
    draggedTile.style.opacity = '0.5';
  }

  function handleDrop(e) {
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
    const targetIndex = parseInt(e.target.dataset.index);
    handleSwap(sourceIndex, targetIndex);
  }

  // TOUCH
  let touchStartIndex = null;

  function handleTouchStart(e) {
    touchStartIndex = parseInt(e.target.dataset.index);
  }

  function handleTouchEnd(e) {
    const touch = e.changedTouches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element || !element.classList.contains("tile")) return;

    const targetIndex = parseInt(element.dataset.index);
    handleSwap(touchStartIndex, targetIndex);
  }

  // COMMON SWAP HANDLING
  function handleSwap(sourceIndex, targetIndex) {
    const sourceTile = tiles[sourceIndex];
    const targetTile = tiles[targetIndex];

    if (!areAdjacent(sourceIndex, targetIndex)) {
      if (draggedTile) draggedTile.style.opacity = '1';
      return;
    }

    swapTiles(sourceTile, targetTile);

    setTimeout(() => {
      const isT1Explosive = sourceTile.style.backgroundImage.includes(explosiveCandy);
      const isT2Explosive = targetTile.style.backgroundImage.includes(explosiveCandy);

      if (isT1Explosive && isT2Explosive) {
        triggerDoubleExplosion(targetIndex).then(() => checkAndHandleMatches());
      } else if (isT1Explosive) {
        triggerExplosion(sourceIndex).then(() => checkAndHandleMatches());
      } else if (isT2Explosive) {
        triggerExplosion(targetIndex).then(() => checkAndHandleMatches());
      } else {
        if (checkMatches()) {
          handleMatches(targetIndex);
        } else {
          swapTiles(sourceTile, targetTile);
        }
      }
    }, 100);
  }

  function areAdjacent(i1, i2) {
    const x1 = i1 % width;
    const y1 = Math.floor(i1 / width);
    const x2 = i2 % width;
    const y2 = Math.floor(i2 / width);
    return Math.abs(x1 - x2) + Math.abs(y1 - y2) === 1;
  }

  function swapTiles(t1, t2) {
    const temp = t1.style.backgroundImage;
    t1.style.backgroundImage = t2.style.backgroundImage;
    t2.style.backgroundImage = temp;
  }

  function checkMatches() {
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

        if (match.length >= 4 && !explosionAssigned) {
          const explosionIndex = match[Math.floor(match.length / 2)];
          tiles[explosionIndex].style.backgroundImage = `url(${explosiveCandy})`;
          toRemove.delete(explosionIndex);
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

    let i = index + 1;
    while (i % width !== 0 && tiles[i] && tiles[i].style.backgroundImage === baseImg) {
      matches.push(i);
      i++;
    }

    i = index + width;
    while (i < width * width && tiles[i].style.backgroundImage === baseImg) {
      matches.push(i);
      i += width;
    }

    return matches.filter(i => tiles[i].style.backgroundImage === baseImg);
  }

  function triggerExplosion(centerIndex) {
    return new Promise(resolve => {
      const explosionIndices = [];
      const centerRow = Math.floor(centerIndex / width);
      const centerCol = centerIndex % width;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const newRow = centerRow + dy;
          const newCol = centerCol + dx;

          if (
            newRow >= 0 && newRow < width &&
            newCol >= 0 && newCol < width
          ) {
            const index = newRow * width + newCol;
            explosionIndices.push(index);
          }
        }
      }

      // Verificamos si alguno de estos caramelos también es explosivo
      const nestedExplosives = explosionIndices.filter(i =>
        tiles[i].style.backgroundImage.includes(explosiveCandy)
      );

      explosionIndices.forEach(i => tiles[i].classList.add("explosion"));

      setTimeout(() => {
        explosionIndices.forEach(i => {
          tiles[i].style.backgroundImage = "";
          tiles[i].classList.remove("explosion");
        });

        applyGravity().then(() => {
          // Si alguno de los caramelos eliminados era explosivo, lo activamos también
          if (nestedExplosives.length > 0) {
            Promise.all(nestedExplosives.map(triggerExplosion)).then(resolve);
          } else {
            resolve();
          }
        });
      }, 500);
    });
  }

  function triggerDoubleExplosion(centerIndex) {
    return new Promise(resolve => {
      const explosionTargets = new Set();
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const row = Math.floor(centerIndex / width);
          const col = centerIndex % width;
          const newRow = row + dy;
          const newCol = col + dx;

          if (newRow >= 0 && newRow < width && newCol >= 0 && newCol < width) {
            const index = newRow * width + newCol;
            explosionTargets.add(index);
          }
        }
      }

      explosionTargets.forEach(index => tiles[index].classList.add("explosion"));

      setTimeout(() => {
        explosionTargets.forEach(index => {
          tiles[index].style.backgroundImage = "";
          tiles[index].classList.remove("explosion");
        });
        applyGravity().then(resolve);
      }, 600);
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
      handleMatches(-1);
    }
  }

  // INIT
  createBoard();
  checkAndHandleMatches();
});
