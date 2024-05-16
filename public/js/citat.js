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
    if (!user.loggedIn) {
      alert('You must be logged in to vote');
      return;
    }
    const quoteID = $(this).prevAll('li').attr('id');
    const type = $(this).attr('class').includes('upvote')
      ? 'upvote'
      : 'downvote';
    $.ajax({
      url: '/auth/vote',
      method: 'POST',
      data: { quoteID: quoteID, type: type },
      success: function (data) {
        console.log(data);
        if (data.error) {
          alert(data.error);
          return;
        }
        if (data.message === 'Röstat') {
          // Add logic to update the vote count
          // If the user has not voted on this quote before, add 1 to either upvotes or downvotes
          // If the user has voted on this quote before and the vote type is the same, remove 1 from the corresponding vote type
          // If the user has voted on this quote before and the vote type is different, add 1 to the corresponding vote type and remove 1 from the other vote type
          // The information sent back from the server is message, and previous
          // The only new information is previous, which is either upvotes, downvotes, or null
          const previous = data.previous;
          // type and quoteID are already defined

          // If the user has not voted on this quote before
          if (!previous) {
            if
          }
        }
      },
      error: function (err) {
        console.error(err);
        alert('Error voting, please try again later');
      },
    });
  });
});
