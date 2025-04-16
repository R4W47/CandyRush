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

      tile.addEventListener('dragstart', handleDragStart);
      tile.addEventListener('dragover', e => e.preventDefault());
      tile.addEventListener('drop', handleDrop);
      tile.addEventListener('dragend', () => tile.style.opacity = '1');

      tile.addEventListener('touchstart', handleTouchStart, { passive: true });
      tile.addEventListener('touchend', handleTouchEnd);
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
    handleSwap(sourceIndex, targetIndex);
  }

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
        triggerChainExplosions([sourceIndex, targetIndex]).then(() => checkAndHandleMatches());
      } else if (isT1Explosive) {
        triggerChainExplosions([sourceIndex]).then(() => checkAndHandleMatches());
      } else if (isT2Explosive) {
        triggerChainExplosions([targetIndex]).then(() => checkAndHandleMatches());
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

  function getExplosionIndices(centerIndex) {
    const indices = [];
    const dirs = [
      -width-1, -width, -width+1,
      -1, 0, 1,
      width-1, width, width+1
    ];
    dirs.forEach(offset => {
      const i = centerIndex + offset;
      if (i >= 0 && i < width * width) indices.push(i);
    });
    return indices;
  }

  async function triggerChainExplosions(initialCenters) {
    const toExplode = new Set();
    const queue = [...initialCenters];

    while (queue.length > 0) {
      const center = queue.shift();
      const explosionIndices = getExplosionIndices(center);

      explosionIndices.forEach(i => {
        if (!toExplode.has(i)) {
          toExplode.add(i);
          if (tiles[i].style.backgroundImage.includes(explosiveCandy)) {
            queue.push(i);
          }
        }
      });
    }

    toExplode.forEach(i => tiles[i].classList.add("explosion"));

    return new Promise(resolve => {
      setTimeout(() => {
        toExplode.forEach(i => {
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

          // Mover la imagen del caramelo
          tiles[targetIndex].style.backgroundImage = tiles[index].style.backgroundImage;
          tiles[index].style.backgroundImage = "";
        }
      }

      // Rellenar nuevos caramelos en la parte superior
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

  createBoard();
  checkAndHandleMatches();
});
