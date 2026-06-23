document.addEventListener("DOMContentLoaded", function () {
  var saveData = localStorage.getItem("saveData");

  if (saveData) {
    window.userCollection = JSON.parse(saveData).collection;

    var collection = window.userCollection;
    var prizes = document.body.querySelectorAll(".collection__item");

    // Get only the ID for each prize;
    var collectionIds = [];
    collection.forEach(function (item) {
      collectionIds.push(item.id);
    });

    // Enable only dropped prizes
    prizes.forEach(function (prize) {
      var curPrizeId = prize.getAttribute("data-prize-id");

      if (collectionIds.includes(curPrizeId)) {
        prize.setAttribute("data-dropped", "1");
      }
    });
  }
});
