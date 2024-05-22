$(function () {
  const ws = new WebSocket('ws://localhost:8080?=register');
  $('#submit').on('click', function () {
    const name = $('#username').val();
    const email = $('#email').val();
    const password = $('#password').val();
    const password_confirm = $('#password-confirmation').val();
    const emailRegex =
      /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z]{8,35}$/;
    const messageContent = $('.response');
    console.log(name);
    console.log(email);
    console.log(password);
    console.log(password_confirm);
    console.log(messageContent);
    if (!name || !email || !password || !password_confirm) {
      messageContent.text('Fyll i alla fält');
      messageContent.removeClass('alert-success');
      messageContent.addClass('alert-danger');
      messageContent.show();
      console.log(messageContent);
      return;
    }
    if (password !== password_confirm) {
      messageContent.text('Lösenorden matchar inte');
      messageContent.removeClass('alert-success');
      messageContent.addClass('alert-danger');
      messageContent.show();
      return;
    }
    if (!emailRegex.test(email)) {
      messageContent.text('Ogiltig epostadress');
      messageContent.removeClass('alert-success');
      messageContent.addClass('alert-danger');
      messageContent.show();
      return;
    }
    if (emailRegex.test(name)) {
      messageContent.text('Användarnamn får inte vara en epostadress');
      messageContent.removeClass('alert-success');
      messageContent.addClass('alert-danger');
      messageContent.show();
      return;
    }
    if (!passwordRegex.test(password)) {
      messageContent.text(
        'Lösenordet måste innehålla mellan 8 och 35 tecken, varav minst en siffra, en stor bokstav och en liten bokstav'
      );
      messageContent.removeClass('alert-success');
      messageContent.addClass('alert-danger');
      messageContent.show();
      return;
    }
    console.log('sending message');
    $.ajax({
      url: '/auth/register',
      method: 'POST',
      data: {
        name: name,
        email: email,
        password: password,
        password_confirm: password_confirm,
      },
      success: function (data) {
        if (data.message) {
          messageContent.text(data.message);
          messageContent.removeClass('alert-danger');
          messageContent.addClass('alert-success');
          messageContent.show();
        }
      },
      error: function (err) {
        const message = err.responseJSON.message;
        const expectedResponses = [
          'Server error',
          'Ogiltiga tecken',
          'Fyll i alla fält',
          'Användarnamnet är upptaget',
          'Epostadressen är upptagen',
          'Lösenorden matchar inte',
          'Ogiltig epostadress',
          'Användarnamn får inte vara en epostadress',
          'Lösenordet måste innehålla mellan 8 och 35 tecken, varav minst en siffra, en stor bokstav och en liten bokstav',
        ];
        messageContent.text(message);
        messageContent.removeClass('alert-success');
        messageContent.addClass('alert-danger');
        if (!expectedResponses.includes(message)) {
          console.error(err);
        }
        messageContent.show();
      },
    });

    // fetch('/auth/register', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     name: name,
    //     email: email,
    //     password: password,
    //     password_confirm: password_confirm,
    //   }),
    // })
    //   .then((response) => response.json())
    //   .then((data) => {
    //     if (data.message) {
    //       messageContent.text(data.message);
    //       messageContent.show();
    //     }
    //   })
    //   .catch((error) => {
    //     console.error(error);
    //     messageContent.text('An error occurred. Please try again later.');
    //     messageContent.show();
    //   });
  });
});
