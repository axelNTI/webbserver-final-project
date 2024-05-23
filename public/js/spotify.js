$(function () {
  // Skapar en WebSocket-anslutning till servern
  const ws = new WebSocket('ws://localhost:8080?=spotify');
  $('.artistList').each(function () {
    // Hämtar artistnamn från varje element
    const artist = $(this).text();

    // Delar upp artistnamnen i en array och tar bort det sista elementet
    const artists = artist.split('†').slice(0, -1);

    // Tömmer elementet och lägger till artistnamnen
    $(this).empty();

    if (artists.length > 2) {
      // Om det finns fler än två artister lägger den till artistnamnen i elementet och lägger till ', and' mellan det näst sista och sista artistnamnet
      $(this).append(
        artists.slice(0, -1).join(', ') + ', and ' + artists.slice(-1)
      );
    } else if (artists.length === 2) {
      // Om det finns två artister lägger den till artistnamnen i elementet och lägger till ' and' mellan det första och sista artistnamnet
      $(this).append(artists.join(' and '));
    } else {
      // Om det finns en artist lägger den till artistnamnet i elementet
      $(this).append(artists);
    }
  });
});
