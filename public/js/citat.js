$(async function () {
  const ws = new WebSocket('ws://localhost:8080?=citat');
  ws.onmessage = function (event) {
    $('ul').append(
      '<li>' +
        JSON.parse(event.data).content.replaceAll(/\n/g, '<br>') +
        '</li><br>'
    );
  };
  $('li').each(function () {
    $(this).children('.quote').text().replaceAll(/\n/g, '<br>');
  });
  const uservotes = $('#votes')
    .text()
    .split(' ')
    .filter((el) => el !== '' && el !== '\n')
    .map((el) => el.slice(0, -1));
  // The array contains alternating quote IDs and vote types, convert them to an array of objects
  const restructured = uservotes
    .map((el, i) => {
      if (i % 2 === 0) {
        return { id: el, type: uservotes[i + 1] };
      }
    })
    .filter((el) => el !== undefined);
  restructured.forEach((el) => {
    $(`#${el.id}`)
      .children()
      .children(`button.${el.type}`)
      .removeClass('active')
      .attr('aria-pressed', 'false');
  });
  const user = await new Promise((resolve, reject) => {
    $.ajax({
      url: '/auth/userdata',
      method: 'GET',
      success: function (data) {
        resolve(data);
      },
      error: function (err) {
        reject(err);
      },
    });
  }).catch((err) => {
    console.error(err);
    alert('Error fetching user data');
  });
  if (user.loggedIn) {
    console.log($('#taxel6146'));
    console.log($(`#${user.username}`).text());
    $(`#${user.username}`).text($(`#${user.username}`).text() + ' (Du)');
  }
  $('.quote-vote').on('click', function () {
    if (!user.loggedIn) {
      alert('You must be logged in to vote');
      return;
    }
    const quoteID = $(this).parent().parent().attr('id');
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
              .children()
              .children(`.${type}-display`)
              .text((_, oldText) => parseInt(oldText) + 1);
            $(`#${quoteID}`)
              .children()
              .children(`button.${type}`)
              .removeClass('active')
              .attr('aria-pressed', 'false');
          } else if (previous === type) {
            $(`#${quoteID}`)
              .children()
              .children(`.${type}-display`)
              .text((_, oldText) => parseInt(oldText) - 1);
            $(`#${quoteID}`)
              .children()
              .children(`button.${type}`)
              .addClass('active')
              .attr('aria-pressed', 'true');
          } else if (previous !== type) {
            $(`#${quoteID}`)
              .children()
              .children(`.${type}-display`)
              .text((_, oldText) => parseInt(oldText) + 1);
            $(`#${quoteID}`)
              .children()
              .children(`button.${type}`)
              .removeClass('active')
              .attr('aria-pressed', 'false');
            $(`#${quoteID}`)
              .children()
              .children(`.${type === 'upvote' ? 'downvote' : 'upvote'}-display`)
              .text((_, oldText) => parseInt(oldText) - 1);
            $(`#${quoteID}`)
              .children()
              .children(`button.${type === 'upvote' ? 'downvote' : 'upvote'}`)
              .addClass('active')
              .attr('aria-pressed', 'true');
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
      $('#quotes').append('<hr/>');
      $('#quotes').append($(this));
    });
    $('#quotes').append('<hr/>');
    $('#sort-by').text('Sortera: Datum');
  });

  $('#sort-by-score').on('click', function () {
    const sortedQuotes = $('.quote-li').sort(function (a, b) {
      const aScore =
        parseInt($(a).children().children('.upvote-display').text()) -
        parseInt($(a).children().children('.downvote-display').text());
      const bScore =
        parseInt($(b).children().children('.upvote-display').text()) -
        parseInt($(b).children().children('.downvote-display').text());
      return bScore - aScore;
    });
    $('#quotes').empty();
    sortedQuotes.each(function () {
      $('#quotes').append('<hr/>');
      $('#quotes').append($(this));
    });
    $('#quotes').append('<hr/>');
    $('#sort-by').text('Sortera: Bäst');
  });
});
