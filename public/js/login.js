$(async function () {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  if (urlParams.has('code')) {
    const code = urlParams.get('code');
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
    window.location.href = 'http://localhost:4000/';
  }
  $('#login-button').on('click', function () {
    $('#login-popup').addClass('card');
    $('main').css('filter', 'brightness(0.5)');
    $('aside').css('filter', 'brightness(0.5)');
    $('header').css('filter', 'brightness(0.5)');
  });
  $('#close-login').on('click', function () {
    $('#login-popup').removeClass('card');
    $('main').css('filter', 'brightness(1)');
    $('aside').css('filter', 'brightness(1)');
    $('header').css('filter', 'brightness(1)');
    $('#response').hide();
  });
  $('#submit-login').on('click', function () {
    const username = $('#username').val();
    const password = $('#password').val();
    const messageContent = $('#response');
    if (!username || !password) {
      messageContent.text('Fyll i alla fält');
      messageContent.removeClass('alert-success');
      messageContent.addClass('alert-danger');
      messageContent.show();
      return;
    }
    $.ajax({
      url: '/auth/login',
      method: 'POST',
      data: { username: username, password: password },
      success: function (response) {
        if (response.message) {
          messageContent.text(response.message);
          messageContent.removeClass('alert-danger');
          messageContent.addClass('alert-success');
          messageContent.show();
        }
        if (response.data) {
          const aside = $('aside');
          aside.empty();
          if (response.data.linkedDiscord) {
            aside.append(
              `<img src="${response.data.avatar}" alt="avatar"><p>${response.data.user}</p><p>Discord: ${response.data.displayname}</p><a href='/account'>Account</a>`
            );
          } else if (response.data.loggedIn) {
            aside.append(
              `<img src="/images/default-avatar.png" alt="avatar"><p>${response.data.user}</p><a href="https://discord.com/oauth2/authorize?client_id=1222824481571999856&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A4000%2F&scope=identify">Länka Discord</a><a href='/account'>Account</a>`
            );
          }
        }
      },
      error: function (error) {
        const message = error.responseJSON.message;
        const expectedResponses = [
          'Fyll i alla fält',
          'Ogiltiga tecken',
          'Server error',
          'Fel inloggningsuppgifter',
        ];
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
