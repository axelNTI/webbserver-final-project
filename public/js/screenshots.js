$(function () {

  // Skapar en WebSocket-anslutning till servern
  const ws = new WebSocket("ws://localhost:8080?=screenshots");

  // Lyssnar på meddelanden från servern
  ws.onmessage = function (event) {

    // Konverterar JSON-strängen till ett JavaScript-objekt
    const data = JSON.parse(event.data);

    // Skapar en bild och lägger till den i DOM:en
    const img = document.createElement("img");
    img.src = data.url;
  };
});
