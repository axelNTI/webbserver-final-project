$(async function () {
  // Skapar en WebSocket-anslutning till servern
  const ws = new WebSocket('ws://localhost:8080?=citat');

  // När servern skickar ett meddelande läggs det till i citatlistan
  ws.onmessage = function (event) {
    $('ul').append(
      '<li>' +
        JSON.parse(event.data).content.replaceAll(/\n/g, '<br>') +
        '</li><br>'
    );
  };

  // Byter ut alla \n i citaten mot <br>
  $('li').each(function () {
    $(this).children('.quote').text().replaceAll(/\n/g, '<br>');
  });

  // Hämtar användarens röster från #votes och konverterar till en array
  const uservotes = $('#votes')
    .text()
    .split(' ')
    .filter((el) => el !== '' && el !== '\n')
    .map((el) => el.slice(0, -1));

  // Omvandlar arrayen till en array av objekt
  const restructured = uservotes
    .map((el, i) => {
      if (i % 2 === 0) {
        return { id: el, type: uservotes[i + 1] };
      }
    })
    .filter((el) => el !== undefined);

  // Loopar igenom restructured och lyser upp röstknapparna som användaren har röstat på
  restructured.forEach((el) => {
    $(`#${el.id}`)
      .children()
      .children(`button.${el.type}`)
      .removeClass('active')
      .attr('aria-pressed', 'false');
  });

  // Hämtar användarens information från servern
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

  // Om användaren är inloggad, lägg till (Du) efter användarnamnet i vem som har citerat andra
  if (user.loggedIn) {
    $(`#${user.username}`).text($(`#${user.username}`).text() + ' (Du)');
  }

  // När användaren klickar på en röstknapp
  $('.quote-vote').on('click', function () {
    if (!user.loggedIn) {
      alert('You must be logged in to vote');
      return;
    }

    // Hämtar citatets ID och typen av röst
    const quoteID = $(this).parent().parent().attr('id');
    const type = $(this).attr('class').includes('upvote')
      ? 'upvote'
      : 'downvote';
    
    // Skickar en POST-förfrågan till servern
    $.ajax({
      url: '/auth/vote',
      method: 'POST',
      data: { quoteID: quoteID, type: type },
      success: function (data) {
        if (data.error) {
          alert(data.error);
          return;
        }

        // Om röstningen lyckades, uppdatera röstknapparna och räkna om rösterna
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

  // När användaren sorterar citaten efter datum
  $('#sort-by-id').on('click', function () {

    // Sorterar citaten efter ID
    const sortedQuotes = $('.quote-li').sort(function (a, b) {
      return parseInt($(a).attr('id')) - parseInt($(b).attr('id'));
    });

    // Tömmer #quotes och lägger till de sorterade citaten
    $('#quotes').empty();
    sortedQuotes.each(function () {
      $('#quotes').append('<hr/>');
      $('#quotes').append($(this));
    });
    $('#quotes').append('<hr/>');

    // Ändrar texten på sortera-knappen
    $('#sort-by').text('Sortera: Datum');
  });

  // När användaren sorterar citaten efter deras poäng
  $('#sort-by-score').on('click', function () {

    // Sorterar citaten efter deras poäng
    const sortedQuotes = $('.quote-li').sort(function (a, b) {
      const aScore =
        parseInt($(a).children().children('.upvote-display').text()) -
        parseInt($(a).children().children('.downvote-display').text());
      const bScore =
        parseInt($(b).children().children('.upvote-display').text()) -
        parseInt($(b).children().children('.downvote-display').text());
      return bScore - aScore;
    });

    // Tömmer #quotes och lägger till de sorterade citaten
    $('#quotes').empty();
    sortedQuotes.each(function () {
      $('#quotes').append('<hr/>');
      $('#quotes').append($(this));
    });
    $('#quotes').append('<hr/>');

    // Ändrar texten på sortera-knappen
    $('#sort-by').text('Sortera: Bäst');
  });
});
