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
  $('.sort-by').on('click', function () {
    // Sort the list of quotes by the selected option
    // The possible options are: date (default, which is the order of the ids), and votes (upvotes - downvotes)
    const sortBy = $(this).attr('id');
    const quotes = $('ul').children('li');
    let sortedQuotes;
    if (sortBy === 'date') {
      sortedQuotes = quotes.sort((a, b) => {
        return parseInt($(a).attr('id')) - parseInt($(b).attr('id'));
      });
    } else if (sortBy === 'votes') {
      sortedQuotes = quotes.sort((a, b) => {
        return (
          parseInt($(b).children('.upvote-display').text()) -
          parseInt($(b).children('.downvote-display').text()) -
          (parseInt($(a).children('.upvote-display').text()) -
            parseInt($(a).children('.downvote-display').text()))
        );
      });
    }
    $('ul').empty();
    sortedQuotes.each(function () {
      $('ul').append($(this));
    });
  });
});
