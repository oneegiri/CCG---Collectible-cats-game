document.addEventListener("DOMContentLoaded", function () {
  var saveData = localStorage.getItem("saveData");
  var gameOBJ = null;
  window.gameData = {};

  // Check if there's any game saved, if not, create the object
  if (saveData) {
    gameOBJ = JSON.parse(saveData);
    window.gameOBJ = gameOBJ;

    // Do actions based on the game object
    setTokens(window.gameOBJ);
  } else {
    var now = new Date();
    var defaultGameOBJ = {
      user: {
        uuid: generateUUID(),
        name: "",
        lastLogin: now.toISOString(),
        tokens: 100,
      },
      collection: [],
      trade: {},
    };

    window.gameOBJ = defaultGameOBJ;
    console.log(defaultGameOBJ);
    // Store the newly created object for later use
    localStorage.setItem("saveData", JSON.stringify(defaultGameOBJ));
  }

  // Load prizes and enable the draw button
  setDrawEvent();

  // Get user name and tokens
  var storedUserName = window.gameOBJ.user.name;
  var storedUserTokens = window.gameOBJ.user.tokens;
  var userDataWrapper = document.body.querySelector(".data--wrapper");
  var userName = document.body.querySelector("#user-name > span");
  var userTokens = document.body.querySelector("#user-tokens > span");
  // Push the element into an OBJ to be reused
  window.gameData.tokens = userTokens;
  // Inject the data
  userName.textContent = storedUserName;
  userTokens.textContent = storedUserTokens;
  userDataWrapper.classList.remove("hidden");
});

function generateUUID() {
  // Native, cryptographically secure, RFC 4122 v4 UUID
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function setDrawEvent() {
  await loadPrizes();
  console.log(prizes);

  var drawButton = document.body.querySelector("#draw");

  if (prizes.length > 0 && window.gameOBJ.user.tokens >= 100) {
    drawButton.addEventListener("click", function (e) {
      e.preventDefault();
      drawPrize(prizes);

      // Deduct tokens
      window.gameOBJ.user.tokens -= 100;
      // Re-render the token data
      window.gameData.tokens.textContent = window.gameOBJ.user.tokens;

      if (window.gameOBJ.user.tokens === 0) {
        drawButton.disabled = true;
      }

      console.log(window.gameOBJ);
      localStorage.setItem("saveData", JSON.stringify(window.gameOBJ));
    });

    drawButton.removeAttribute("disabled");
  } else {
    drawButton.disabled = true;
  }
}

// Check if 24h have passed, if so, give the user an amount of tokens
function setTokens(gameOBJ) {
  var lastLogin = new Date(gameOBJ.user.lastLogin).getTime();

  var twentyFourHoursInMs = 24 * 60 * 60 * 1000;

  var now = new Date();
  var isUserEligibleForTokens = now - lastLogin >= twentyFourHoursInMs;

  // Assign tokens and set a new date
  if (isUserEligibleForTokens) {
    gameOBJ.user.tokens += 50;
    gameOBJ.user.lastLogin = now.toISOString();
    window.gameOBJ = gameOBJ;
    console.log(gameOBJ);
    localStorage.setItem("saveData", JSON.stringify(gameOBJ));
  }
}
