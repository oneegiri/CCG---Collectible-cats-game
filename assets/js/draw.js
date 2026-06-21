// Configuration - path from JS folder to DB folder
var PRIZES_URL = "../../DB/prizes.json";
var prizes = [];

/**
 * Fetch and load prizes from JSON file
 */
async function loadPrizes() {
  try {
    var response = await fetch(PRIZES_URL);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    prizes = await response.json();

    if (!Array.isArray(prizes) || prizes.length === 0) {
      throw new Error("No prizes found in JSON file");
    }

    console.log(`Loaded ${prizes.length} prizes`);
    return prizes;
  } catch (error) {
    console.error("Error loading prizes:", error);
    return [];
  }
}

/**
 * Calculate total weight based on rarity
 * Higher rarity = rarer (lower chance)
 * ┌────────┬────────┬────────────┐
 * │ Rarity │ Weight │ Chance (%) │
 * ├────────┼────────┼────────────┤
 * │   1    │  1000  │   33.058   │
 * │   2    │   729  │   24.099   │
 * │   3    │   512  │   16.926   │
 * │   4    │   343  │   11.339   │
 * │   5    │   216  │    7.140   │
 * │   6    │   125  │    4.132   │
 * │   7    │    64  │    2.116   │
 * │   8    │    27  │    0.893   │
 * │   9    │     8  │    0.264   │
 * │  10    │     1  │    0.033   │
 * └────────┴────────┴────────────┘
 * @param {object} prize
 */
function calculateWeightedPrize(prizes) {
  if (prizes.length === 0) {
    return null;
  }
  var totalWeight = 0;
  var weightedPrizes = prizes.map(function (prize) {
    // Invert rarity so higher rarity = lower weight = rarer drop
    // Rarity 1 → weight 1000, Rarity 10 → weight 1
    var inverted = 11 - prize.rarity;
    var weight = Math.pow(inverted, 3);
    totalWeight += weight;
    return { ...prize, weight };
  });

  var random = Math.random() * totalWeight;
  for (var prize of weightedPrizes) {
    random -= prize.weight;
    if (random <= 0) {
      return prize;
    }
  }
  return weightedPrizes[weightedPrizes.length - 1];
}

/**
 * Get rarity label and color
 * @param {int} rarity
 */
function getRarityInfo(rarity) {
  var labels = {
    1: { label: "Common", color: "#808080" },
    2: { label: "Uncommon", color: "#4CAF50" },
    3: { label: "Rare", color: "#2196F3" },
    4: { label: "Rare", color: "#2196F3" },
    5: { label: "Epic", color: "#9C27B0" },
    6: { label: "Epic", color: "#9C27B0" },
    7: { label: "Legendary", color: "#FF9800" },
    8: { label: "Legendary", color: "#FF9800" },
    9: { label: "Mythic", color: "#F44336" },
    10: { label: "Mythic", color: "#F44336" },
  };
  return labels[rarity] || { label: "Unknown", color: "#000000" };
}

/**
 * Show the prize
 * @param {object} prize
 */
function showPrize(prize) {
  var capsule = document.body.querySelector(".capsule");
  var target = document.body.querySelector(".prize--wrapper");
  var prizeContent = target.querySelector(".prize__content");
  var prizeImage = prizeContent.querySelector(".prize");
  var rarity = prizeContent.querySelector(".rarity");

  // Set the rarity
  var prizeRarity = getRarityInfo(prize.rarity);
  rarity.classList.add(prizeRarity.label.toLowerCase());
  rarity.textContent = prizeRarity.label;

  // Add suspance by animating the capsule
  capsule.classList.add("animated");
  capsule.classList.add("infinite");

  window.setTimeout(function () {
    prizeImage.src = prize.image;
    capsule.classList.remove("animated");
    capsule.classList.remove("infinite");
    // Show the prize window
    target.classList.add("active");
    window.setTimeout(function () {
      prizeContent.classList.add("zoomIn");
    }, 15);

    
    // Remove everything after a short delay
    window.setTimeout(function () {
      target.classList.remove("active");
      prizeContent.classList.remove("zoomIn");
      prizeImage.src = "";
      rarity.classList.remove(prizeRarity.label.toLowerCase());
    }, 6000);
  }, 3000);
}

/**
 * Draw a random prize and add it to collection
 * @param {object} prize
 */
function drawPrize(prizes) {
  var selectedPrize = calculateWeightedPrize(prizes);
  if (!selectedPrize) {
    console.warn("Error selecting prize");
    return;
  }

  var found = false;
  for (var i = 0; i < window.gameOBJ.collection.length; i += 1) {
    if (window.gameOBJ.collection[i].id === selectedPrize.id) {
      window.gameOBJ.collection[i].count += 1;
      found = true;
      break; // stop looking once we've found the match
    }
  }

  if (!found) {
    selectedPrize.count = 1;
    window.gameOBJ.collection.push(selectedPrize);
  }

  showPrize(selectedPrize);
  localStorage.setItem("saveData", JSON.stringify(window.gameOBJ));
}
