$(async function () {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);

  // Om URL:en innehåller en kod från Discord, skicka den till servern för att verifiera
  if (urlParams.has('code')) {
    const code = urlParams.get('code');

    // Skicka koden till servern
    await $.ajax({
      url: '/auth/discord',
      method: 'POST',
      data: { code: code },
      success: function (response) {
        if (response.data) {
          console.log(response.data);
          const aside = $('aside');
          aside.empty();
          aside.append(
            `<img src="${response.data.avatar}" alt="avatar"><p>${response.data.user}</p><p>Discord: ${response.data.displayname}</p><a href='/account'>Account</a>`
          );
        }
      },
      error: function (error) {
        console.error(error);
      },
    });

    // Ta bort koden från URL:en
    window.location.href = 'http://localhost:4000/';
  }

  // Om användaren klickar på länken för att logga in
  $('#login-button').on('click', function () {

    // Visa popup-fönstret
    $('#login-popup').addClass('card');

    // Mörkna resten av sidan
    $('main').css('filter', 'brightness(0.5)');
    $('aside').css('filter', 'brightness(0.5)');
    $('header').css('filter', 'brightness(0.5)');
  });

  // Om användaren klickar på stäng-knappen i popup-fönstret
  $('#close-login').on('click', function () {

    // Dölj popup-fönstret
    $('#login-popup').removeClass('card');

    // Återställ sidan
    $('main').css('filter', 'brightness(1)');
    $('aside').css('filter', 'brightness(1)');
    $('header').css('filter', 'brightness(1)');
    $('#response').hide();
  });

  // Om användaren klickar på skicka-knappen i popup-fönstret
  $('#submit-login').on('click', function () {

    // Hämta användarnamn och lösenord
    const username = $('#username').val();
    const password = $('#password').val();
    const messageContent = $('#response');

    // Om användarnamn eller lösenord saknas i formuläret - visa felmeddelande
    if (!username || !password) {
      messageContent.text('Fyll i alla fält');
      messageContent.removeClass('alert-success');
      messageContent.addClass('alert-danger');
      messageContent.show();
      return;
    }

    // Skicka användarnamn och lösenord till servern för att logga in
    $.ajax({
      url: '/auth/login',
      method: 'POST',
      data: { username: username, password: password },
      success: function (response) {
        if (response.message) {

          // Visa serverns svar
          messageContent.text(response.message);
          messageContent.removeClass('alert-danger');
          messageContent.addClass('alert-success');
          messageContent.show();
        }

        // Om användaren är inloggad, uppdatera kontorutan med användarens information
        if (response.data) {
          const aside = $('aside');
          aside.empty();
          if (response.data.linkedDiscord) {
            aside.append(
              `<img src="${response.data.avatar}" alt="avatar"><p>${response.data.user}</p><p>Discord: ${response.data.displayname}</p><a href='/account'>Konto</a>`
            );
          } else if (response.data.loggedIn) {
            aside.append(
              `<img src="/images/default-avatar.png" alt="avatar"><p>${response.data.user}</p><a href="https://discord.com/oauth2/authorize?client_id=1222824481571999856&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A4000%2F&scope=identify">Länka Discord</a><a href='/account'>Konto</a>`
            );
          }
        }
      },
      error: function (error) {

        // Visa felmeddelande från servern
        const message = error.responseJSON.message;
        const expectedResponses = [
          'Fyll i alla fält',
          'Ogiltiga tecken',
          'Server error',
          'Fel inloggningsuppgifter',
        ];

        // Visa felmeddelandet
        messageContent.text(message);
        messageContent.removeClass('alert-success');
        messageContent.addClass('alert-danger');
        if (!expectedResponses.includes(message)) {
          console.error(error);
        }
        messageContent.show();
      },
    });
  });
});
