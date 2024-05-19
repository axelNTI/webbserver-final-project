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
    $(this).children('.quote').text().replaceAll(/\n/g, '<br>');
  });
  ws.onmessage = function (event) {
    $('ul').append(
      '<li>' +
        JSON.parse(event.data).content.replaceAll(/\n/g, '<br>') +
        '</li><br>'
    );
  };

  $('.quote-vote').on('click', function () {
    if (!user.loggedIn) {
      alert('You must be logged in to vote');
      return;
    }
    const quoteID = $(this).parent().attr('id');
    const type = $(this).attr('class').includes('upvote')
      ? 'upvote'
      : 'downvote';
    $.ajax({
      url: '/auth/vote',
      method: 'POST',
      data: { quoteID: quoteID, type: type },
      success: function (data) {
        if (data.error) {
          alert(data.error);
          return;
        }
        if (data.message === 'Röstat') {
          const previous = data.previous;
          if (!previous) {
            $(`#${quoteID}`)
              .children(`.${type}-display`)
              .text((_, oldText) => parseInt(oldText) + 1);
          } else if (previous === type) {
            $(`#${quoteID}`)
              .children(`.${type}-display`)
              .text((_, oldText) => parseInt(oldText) - 1);
          } else if (previous !== type) {
            $(`#${quoteID}`)
              .children(`.${type}-display`)
              .text((_, oldText) => parseInt(oldText) + 1);
            $(`#${quoteID}`)
              .children(`.${type === 'upvote' ? 'downvote' : 'upvote'}-display`)
              .text((_, oldText) => parseInt(oldText) - 1);
          }
        }
      },
      error: function (err) {
        console.error(err);
        alert('Error voting, please try again later');
      },
    });
  });
  $('#sort-by-id').on('click', function () {
    const sortedQuotes = $('.quote-li').sort(function (a, b) {
      return parseInt($(a).attr('id')) - parseInt($(b).attr('id'));
    });
    $('#quotes').empty();
    sortedQuotes.each(function () {
      $('#quotes').append($(this));
    });
    $('.sort-by').text('Sort by: Date Written');
  });
  $('#sort-by-score').on('click', function () {
    const sortedQuotes = $('.quote-li').sort(function (a, b) {
      const aScore =
        parseInt($(a).children('.upvote-display').text()) -
        parseInt($(a).children('.downvote-display').text());
      const bScore =
        parseInt($(b).children('.upvote-display').text()) -
        parseInt($(b).children('.downvote-display').text());
      return bScore - aScore;
    });
    $('#quotes').empty();
    sortedQuotes.each(function () {
      $('#quotes').append($(this));
    });
    $('.sort-by').text('Sort by: Score');
  });
});
