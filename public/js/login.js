$(function () {
  const ws = new WebSocket('ws://localhost:8080?=login');
  $('form').on('submit', function (event) {
    event.preventDefault();
    const name = $('#name-lgn').val();
    const password = $('#password-lgn').val();
    const messageContent = $('.alert');
    if (!name || !password) {
      messageContent.text('Fyll i alla fält');
      messageContent.show();
      return;
    }
    fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, password: password }),
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
