document.addEventListener("DOMContentLoaded", () => {
  const board = document.getElementById("gameBoard");
  if (!board) {
    console.error('No se encontró el div#gameBoard');
    return;
  }

  const width = 8;
  const candyImages = [
    'images/candies/red.png',
    'images/candies/green.png',
    'images/candies/blue.png',
    'images/candies/orange.png',
    'images/candies/purple.png'
  ];
  let tiles = [];
  let firstTile = null;

  let score = 0;
  let highScore = localStorage.getItem('highScore') || 0;

  function updateScore(points) {
    score += points;
    document.getElementById('score').innerText = `Puntaje: ${score}`;
  }

  function updateHighScore() {
    document.getElementById('highScore').innerText = `Puntaje más alto: ${highScore}`;
  }

  function checkHighScore() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('highScore', highScore);
      updateHighScore();
    }
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
      tile.style.backgroundSize = "cover";
      tile.dataset.index = i;
      board.appendChild(tile);
      tiles.push(tile);
    }

    attachClickHandlers();
  }

  function attachClickHandlers() {
    tiles.forEach((tile) => {
      tile.addEventListener("click", () => handleClick(tile));
    });
  }

  function areAdjacent(index1, index2) {
    const x1 = index1 % width;
    const y1 = Math.floor(index1 / width);
    const x2 = index2 % width;
    const y2 = Math.floor(index2 / width);
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  }

  function swapTiles(tile1, tile2) {
    const img1 = tile1.style.backgroundImage;
    tile1.style.backgroundImage = tile2.style.backgroundImage;
    tile2.style.backgroundImage = img1;
  }

  function handleClick(tile) {
    if (!firstTile) {
      firstTile = tile;
      tile.style.outline = "2px solid white";
    } else {
      if (tile === firstTile || !areAdjacent(+firstTile.dataset.index, +tile.dataset.index)) {
        firstTile.style.outline = "none";
        firstTile = null;
        return;
      }

      swapTiles(firstTile, tile);
      tile.style.outline = "none";
      firstTile.style.outline = "none";
      const t1 = firstTile;
      const t2 = tile;
      firstTile = null;

      setTimeout(() => {
        if (checkMatches()) {
          handleMatches();
        } else {
          swapTiles(t1, t2);
        }
      }, 300);
    }
  }

  function checkMatches() {
    let matchFound = false;

    for (let row = 0; row < width; row++) {
      for (let col = 0; col <= width - 3; col++) {
        const i = row * width + col;
        const c1 = tiles[i].style.backgroundImage;
        const c2 = tiles[i + 1].style.backgroundImage;
        const c3 = tiles[i + 2].style.backgroundImage;

        if (c1 === c2 && c2 === c3 && c1 !== "") {
          matchFound = true;
        }
      }
    }

    for (let col = 0; col < width; col++) {
      for (let row = 0; row <= width - 3; row++) {
        const i = row * width + col;
        const c1 = tiles[i].style.backgroundImage;
        const c2 = tiles[i + width].style.backgroundImage;
        const c3 = tiles[i + 2 * width].style.backgroundImage;

        if (c1 === c2 && c2 === c3 && c1 !== "") {
          matchFound = true;
        }
      }
    }

    return matchFound;
  }

  async function handleMatches() {
    let toRemove = new Set();
    let pointsToAdd = 0;

    for (let row = 0; row < width; row++) {
      for (let col = 0; col <= width - 3; col++) {
        const i = row * width + col;
        const c1 = tiles[i].style.backgroundImage;
        const c2 = tiles[i + 1].style.backgroundImage;
        const c3 = tiles[i + 2].style.backgroundImage;

        if (c1 === c2 && c2 === c3 && c1 !== "") {
          toRemove.add(i); toRemove.add(i + 1); toRemove.add(i + 2);
          pointsToAdd += 30;
        }
      }
    }

    for (let col = 0; col < width; col++) {
      for (let row = 0; row <= width - 3; row++) {
        const i = row * width + col;
        const c1 = tiles[i].style.backgroundImage;
        const c2 = tiles[i + width].style.backgroundImage;
        const c3 = tiles[i + 2 * width].style.backgroundImage;

        if (c1 === c2 && c2 === c3 && c1 !== "") {
          toRemove.add(i); toRemove.add(i + width); toRemove.add(i + 2 * width);
          pointsToAdd += 30;
        }
      }
    }

    updateScore(pointsToAdd);

    // Animar desaparición
    toRemove.forEach(i => tiles[i].classList.add("fading-out"));

    await new Promise(resolve => setTimeout(resolve, 500));

    toRemove.forEach(i => {
      tiles[i].style.backgroundImage = "";
      tiles[i].classList.remove("fading-out");
    });

    await applyGravity();

    if (checkMatches()) {
      await handleMatches();
    } else {
      checkHighScore();
    }
  }

  function applyGravity() {
    return new Promise(resolve => {
      for (let col = 0; col < width; col++) {
        let emptySpots = 0;

        for (let row = width - 1; row >= 0; row--) {
          const i = row * width + col;

          if (tiles[i].style.backgroundImage === "") {
            emptySpots++;
          } else if (emptySpots > 0) {
            const targetIndex = (row + emptySpots) * width + col;
            tiles[targetIndex].style.backgroundImage = tiles[i].style.backgroundImage;
            tiles[i].style.backgroundImage = "";
          }
        }

        for (let i = 0; i < emptySpots; i++) {
          const index = i * width + col;
          const tile = tiles[index];
          tile.style.backgroundImage = `url(${randomImage()})`;
          tile.classList.add("fading-in");
          setTimeout(() => tile.classList.remove("fading-in"), 400);
        }
      }

      setTimeout(resolve, 500);
    });
  }

  createBoard();
});
