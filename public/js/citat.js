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
  $('button').on('click', function () {
    const id = $(this).parent().attr('id');
    const button_class = $(this).attr('class');
    if (button_class.includes('upvote')) {
      ws.send(JSON.stringify({ id: id, type: 'upvote' }));
    } else {
      ws.send(JSON.stringify({ id: id, type: 'downvote' }));
    }
  });
});
