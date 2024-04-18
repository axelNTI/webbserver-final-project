$(function () {
  const ws = new WebSocket('ws://localhost:8080?=discordAuth');
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  if (urlParams.has('code')) {
    const code = urlParams.get('code');
    $.post(
      'http://localhost:4000/auth/discord',
      { code: code },
      function (data) {}
    );
    window.location.href = 'http://localhost:4000/';
  }
  if (urlParams.has('error')) {
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    $('#info').html(`Error: ${error}<br>Description: ${errorDescription}`);
  }
});
