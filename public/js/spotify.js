$(function () {
  const ws = new WebSocket('ws://localhost:8080?=spotify');
  $('.artistList').each(function () {
    const artist = $(this).text();
    // Split the artist string into an array of artists and remove the last empty string
    const artists = artist.split('†').slice(0, -1);
    $(this).empty();
    // Return the artists into this element as a string with commas and an "and" before the last artist as long as there are more than one artist
    if (artists.length > 2) {
      $(this).append(
        artists.slice(0, -1).join(', ') + ', and ' + artists.slice(-1)
      );
    } else if (artists.length === 2) {
      $(this).append(artists.join(' and '));
    } else {
      $(this).append(artists);
    }
  });
});
