$(function () {
  const ws = new WebSocket('ws://localhost:8080?=citat');
  let user;
  $.ajax({
    url: '/auth/userdata',
    method: 'GET',
    success: function (data) {
      user = data;
    },
    error: function (err) {
      console.error('Error fetching user data:', err);
    },
  });
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
    // Get the id from the parent element
    const quote_id = $(this).parent().attr('id');
    const button_class = $(this).attr('class');
    if (!user.loggedIn) {
      alert('You must be logged in to vote');
      return;
    }
    const type = button_class.includes('upvote') ? 'upvote' : 'downvote';
    console.log(quote_id);
    console.log(type);
    $.ajax({
      url: '/auth/vote',
      method: 'POST',
      data: { quote_id: quote_id, type: type },
      success: function (data) {
        console.log(data);
      },
      error: function (err) {
        console.error(err);
        alert('Error voting, please try again later');
      },
    });
  });
});
