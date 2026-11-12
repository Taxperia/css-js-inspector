"use strict";
const demoButton = document.querySelector("#sample-button");
const demoResult = document.querySelector("#demo-result");
let clickCount = 0;
demoButton.addEventListener("click", function showClickCount() {
  clickCount += 1;
  demoResult.textContent = `Butona ${clickCount} kez tıklandı.`;
});
