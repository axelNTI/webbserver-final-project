$(function () {
  const ws = new WebSocket('ws://localhost:8080/register');
  $('form').on('submit', function (event) {
    event.preventDefault();
    const name = $('#name-reg').val();
    const email = $('#email-reg').val();
    const password = $('#password-reg').val();
    const password_confirm = $('#password-conf-reg').val();
    const emailRegex =
      /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z]{8,35}$/;
    const messageContent = $('.alert');
    if (!name || !email || !password || !password_confirm) {
      messageContent.text('Fyll i alla fält');
      messageContent.show();
      return;
    }
    if (password !== password_confirm) {
      messageContent.text('Lösenorden matchar inte');
      messageContent.show();
      return;
    }
    if (!emailRegex.test(email)) {
      messageContent.text('Ogiltig epostadress');
      messageContent.show();
      return;
    }
    if (emailRegex.test(name)) {
      messageContent.text('Användarnamn får inte vara en epostadress');
      messageContent.show();
      return;
    }
    if (!passwordRegex.test(password)) {
      messageContent.text(
        'Lösenordet måste innehålla mellan 8 och 35 tecken, varav minst en siffra, en stor bokstav och en liten bokstav'
      );
      messageContent.show();
      return;
    }
    fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        email: email,
        password: password,
        password_confirm: password_confirm,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.message) {
          messageContent.text(data.message);
          messageContent.show();
        }
      })
      .catch((error) => {
        console.error(error);
        messageContent.text('An error occurred. Please try again later.');
        messageContent.show();
      });
  });
});
