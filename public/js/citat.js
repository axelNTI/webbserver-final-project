$(function () {
  const ws = new WebSocket('ws://localhost:8080?=citat');
  $('li').each(function () {
    $(this).html($(this).text().replaceAll(/\n/g, '<br>'));
  });
  ws.onmessage = function (event) {
    $('ul').append(
      '<li>' +
        JSON.parse(event.data).content.replaceAll(/\n/g, '<br>') +
        '</li><br>'
    );
  };
});
