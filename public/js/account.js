$(function () {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  const response = $('#response');
  response.hide();

  // Skapar en WebSocket-anslutning till servern
  const ws = new WebSocket('ws://localhost:8080?=account');
  console.log(urlParams)
  // Skriver ut meddelanden från servern i konsolen
  if (urlParams.has('message')) {
    const code = urlParams.get('message');
    response.text(code);
    response.removeClass('d-none');
    response.show();
  }
});
