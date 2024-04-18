$(function () {
  const ws = new WebSocket('ws://localhost:8080?=citat');
  $('li').each(function () {
    if ($(this).text().includes('\n')) {
      $(this).html($(this).text().replace(/\n/g, '<br>'));
    }
  });
  ws.onmessage = function (event) {
    const message = JSON.parse(event.data);
    $('#messages').append('<li>' + message.content + '</li>');
  };
});
