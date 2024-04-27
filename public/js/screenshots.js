$(function () {
  const ws = new WebSocket("ws://localhost:8080?=screenshots");
  ws.onmessage = function (event) {
    const data = JSON.parse(event.data);
    const img = document.createElement("img");
    img.src = data.url;
  };
});
