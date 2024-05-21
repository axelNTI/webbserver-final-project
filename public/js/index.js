$(function () {
  const ws = new WebSocket('ws://localhost:8080?=index');
  $('#login-button').on('click', function () {
    // When the button is clicked, add a popup for login and darkening all other content on the page
    $('#login-popup').css('display', 'inline');
    $('main').css('filter', 'brightness(0.5)');
    $('aside').css('filter', 'brightness(0.5)');
    $('header').css('filter', 'brightness(0.5)');
  });
});
