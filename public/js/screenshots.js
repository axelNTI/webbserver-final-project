$(function () {
  // Skapar en WebSocket-anslutning till servern
  const ws = new WebSocket('ws://localhost:8080?=screenshots');

  // Lyssnar på meddelanden från servern
  ws.onmessage = function (event) {
    // Konverterar JSON-strängen till ett JavaScript-objekt
    const data = JSON.parse(event.data);

    // Lägger till en bild i listan
    $('ul').append(
      `<li>` +
        `<img src='${data}' class='my-2 mx-3' />` +
        `</li>` +
        `<hr />`
    );
  };
});
