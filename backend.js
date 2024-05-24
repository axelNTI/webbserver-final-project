// MIT-License:

// Copyright (c)

// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// BSD-2-Clause:

// Copyright <YEAR> <COPYRIGHT HOLDER>

// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

const express = require('express'); // MIT
const mysql = require('mysql2'); // MIT
const dotenv = require('dotenv'); // BSD-2-Clause
const bcrypt = require('bcryptjs'); // MIT
const crypto = require('crypto'); // ISC
const nodemailer = require('nodemailer'); // MIT-0
const {
  Client,
  Events,
  GatewayIntentBits,
  ActivityType,
} = require('discord.js'); // Apache-2.0
const session = require('express-session'); // MIT
const { request } = require('undici'); // MIT
const WebSocket = require('ws'); // MIT

// Styling for console.log and console.error messages in VSCode
const css = {
  error: 'color: #FF4422;',
  success: 'color: #00FF7F;',
  warning: 'color: #F9A900;',
  information: 'color: #1E90FF;',
};

const app = express();
app.set('view engine', 'hbs');
dotenv.config({ path: '../webbserver-final-project-private/.env' });

// Aktiverar sessions för att lagring av användaruppgifter
app.use(
  session({
    secret: process.env.EXPRESS_SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

// Skapar en WebSocket-server
const wss = new WebSocket.Server({ port: 8080 });

// Skapar en Map för att lagra anslutningar
const connections = new Map();

// Lyssnar efter anslutningar
wss.on('connection', function connection(ws, req) {
  const pageId = req.url.split('=')[1];
  connections.set(ws, pageId);

  // Tar emot meddelanden (borde inte ske)
  ws.on('message', function incoming(message) {
    message = JSON.parse(message);
    console.log(`%cReceived message: ${message.type}`, css.information);
  });

  // Tar bort användaren från Map när anslutningen stängs
  ws.on('close', function () {
    connections.delete(ws);
  });

  // Loggar fel
  ws.on('error', function (error) {
    console.error(`%c${error}`, css.error);
  });
});

// Skapar en Discord-klient
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

// En asynkron funktion som hämtar alla meddelanden från en kanal
async function fetchAllMessages(channel_id) {
  const channel = client.channels.cache.get(channel_id);
  let messages = [];
  let message = null;
  do {
    const fetchedMessages = await channel.messages.fetch({
      limit: 100,
      before: message,
    });
    if (fetchedMessages.size > 0) {
      messages = messages.concat(Array.from(fetchedMessages.values()));
      message = fetchedMessages.lastKey();
    } else {
      message = null;
    }
  } while (message);
  return messages;
}

// En regex för att kolla om en sträng är en epostadress
const emailRegex =
  /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

// En regex för att kolla om ett lösenord uppfyller kraven
const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z]{8,35}$/;

// https://regex101.com/library/qE9gR7
// En regex för att kolla om en sträng innehåller SQL-injektion
const sqlInjectionRegex =
  /(\s*([\0\b\'\"\n\r\t\%\_\\]*\s*(((select\s*.+\s*from\s*.+)|(insert\s*.+\s*into\s*.+)|(update\s*.+\s*set\s*.+)|(delete\s*.+\s*from\s*.+)|(drop\s*.+)|(truncate\s*.+)|(alter\s*.+)|(exec\s*.+)|(\s*(all|any|not|and|between|in|like|or|some|contains|containsall|containskey)\s*.+[\=\>\<=\!\~]+.+)|(let\s+.+[\=]\s*.*)|(begin\s*.*\s*end)|(\s*[\/\*]+\s*.*\s*[\*\/]+)|(\s*(\-\-)\s*.*\s+)|(\s*(contains|containsall|containskey)\s+.*)))(\s*[\;]\s*)*)+)/i;

// En regex för att kolla om en sträng innehåller en ny rad
const newLineRegex = /\n/;

// En regex för att hitta vem som har blivit citerad
const userRegex = /(?<=["”“].*["”“] -).*?(?=\n|,| om| till| medan| som|$)/;

const db = mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
});

app.use(express.urlencoded({ extended: 'false' }));
app.use(express.json());
app.use(express.static('public'));

// Skapar en transportör för att skicka epost
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

db.connect(async (err) => {
  if (err) {
    console.error(`%c${err}`, css.error);
  } else {
    console.log('%cAnsluten till MySQL', css.success);

    // Jag använder en annan repository för att spara databasen. Detta kan leda till en error angående tablespaces. Denna kod löser problemet.
    // Tar fram alla tabeller i databasen
    const tables = await new Promise((resolve, reject) => {
      db.query('SHOW TABLES', (err, result) => {
        if (err) {
          reject(err);
        }
        resolve(result);
      });
    }).catch((err) => {
      console.error(`%c${err}`, css.error);
    });
    const promises = [];
    tables
      .map((table) => table.Tables_in_regeringen)
      .forEach((table) => {
        // Ger varje tabell en tablespace om den inte redan har en
        const promise = new Promise((resolve, reject) => {
          db.query(`ALTER TABLE ${table} IMPORT TABLESPACE`, (err, result) => {
            if (err && err.code === 'ER_TABLESPACE_EXISTS') {
              resolve();
            } else if (err) {
              reject(err);
            } else {
              console.log(`%cTablespace for ${table} added`, css.warning);
              resolve();
            }
          });
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
        });
        promises.push(promise);
      });
    await Promise.all(promises);
    console.log('%cAll tablespaces have been added', css.success);
  }
});

app.get('/', (req, res) => {
  res.render('index', { user: req.session, query: req.query });
});

app.get('/register', (req, res) => {
  res.render('register', { user: req.session, query: req.query });
});

app.get('/account', (req, res) => {
  res.render('account', { user: req.session, query: req.query });
});

app.get('/citat', async (req, res) => {
  // Hämtar alla citat från databasen
  const quotes = await new Promise((resolve, reject) => {
    db.query('SELECT * FROM citat', (err, result) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Hämtar alla röster från databasen
  const userVotes = await new Promise((resolve, reject) => {
    db.query(
      'SELECT * FROM uservotes WHERE userID = ?',
      [req.session.userID],
      (err, result) => {
        if (err) {
          reject(err);
        }
        resolve(result);
      }
    );
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Hämtar alla citerade personer från citaten
  const quoted = quotes.flatMap((message) => {
    const individuals = [];
    const lines = message.quote.split(newLineRegex);
    lines.forEach((line) => {
      const matches = line.match(userRegex);
      if (matches) {
        individuals.push(...matches.map((match) => match.trim()));
      } else {
        console.log(`%c${line}`, css.error);
      }
    });
    return individuals;
  });

  // Räknar antalet gånger varje person har blivit citerad
  const quotedCount = Object.fromEntries(
    Object.entries(
      quoted.reduce((acc, user) => {
        acc[user] = (acc[user] || 0) + 1;
        return acc;
      }, {})
    ).sort(([, a], [, b]) => b - a)
  );

  // Räknar antalet citat varje person har skrivit
  const quotesPerson = quotes.map((quote) => quote.discordUsername);
  const messageCount = Object.fromEntries(
    Object.entries(
      quotesPerson.reduce((acc, user) => {
        acc[user] = (acc[user] || 0) + 1;
        return acc;
      }, {})
    ).sort(([, a], [, b]) => b - a)
  );

  // Gör om objekten till arrayer av objekt
  const messageCountArray = Object.entries(messageCount).map(
    ([name, count]) => ({
      name,
      count,
    })
  );

  // Görom objekten till arrayer av objekt
  const quotedCountArray = Object.entries(quotedCount).map(([name, count]) => ({
    name,
    count,
  }));

  // Skickar sidan och datan till klienten
  res.render('citat', {
    citat: quotes,
    votes: userVotes,
    quoted: quotedCountArray,
    messages: messageCountArray,
    user: req.session,
    query: req.query,
  });
});

app.get('/screenshots', async (req, res) => {
  // Hämtar alla skärmbilder från databasen
  const screenshots = await new Promise((resolve, reject) => {
    db.query('SELECT * FROM screenshots', (err, result) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Skickar sidan och datan till klienten
  res.render('screenshots', {
    screenshots: screenshots,
    user: req.session,
    query: req.query,
  });
});

app.get('/activity', async (req, res) => {
  // Tar fram aktivitets-statistik från databasen
  const activities = await new Promise((resolve, reject) => {
    db.query('SELECT * FROM activities ORDER BY time DESC ', (err, result) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Gör om tiden från millisekunder till timmar, minuter och sekunder
  const mappedActivities = activities.map((activity) => {
    const hours = Math.floor(activity.time / 3600000);
    const minutes = Math.floor((activity.time % 3600000) / 60000);
    const seconds = Math.floor((activity.time % 60000) / 1000);
    return {
      name: activity.name,
      time: `${hours}h ${minutes}m ${seconds}s`,
    };
  });

  // Skickar sidan och datan till klienten
  res.render('activity', {
    activities: mappedActivities,
    user: req.session,
    query: req.query,
  });
});

app.get('/spotify', async (req, res) => {
  // Hämtar alla låtar från databasen
  const spotify = await new Promise((resolve, reject) => {
    db.query('SELECT * FROM spotify ORDER BY time DESC ', (err, result) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  })
    .catch((err) => {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    })
    .then(async (spotify) => {
      return await Promise.all(
        spotify.map(async (song) => {
          // Hämtar alla artistID för varje låt
          const artistIDs = await new Promise((resolve, reject) => {
            db.query(
              'SELECT artistID FROM artistsongs WHERE songID = ?',
              [song.songID],
              (err, result) => {
                if (err) {
                  reject(err);
                }
                resolve(result);
              }
            );
          }).catch((err) => {
            console.error(`%c${err}`, css.error);
            return res.status(500).json({ message: 'Server error' });
          });

          // Hämtar alla artister för varje låt
          const artists = await new Promise((resolve, reject) => {
            db.query(
              'SELECT * FROM artists WHERE FIND_IN_SET(artistID, ?)',
              [artistIDs.map((artist) => artist.artistID).join(',')],
              (err, result) => {
                if (err) {
                  reject(err);
                }
                resolve(result);
              }
            );
          }).catch((err) => {
            console.error(`%c${err}`, css.error);
            return res.status(500).json({ message: 'Server error' });
          });

          // Räknar om tiden från millisekunder till timmar, minuter och sekunder
          const hours = Math.floor(song.time / 3600000);
          const minutes = Math.floor((song.time % 3600000) / 60000);
          const seconds = Math.floor((song.time % 60000) / 1000);
          return {
            song: song.song,
            artist: artists,
            time: `${hours}h ${minutes}m ${seconds}s`,
          };
        })
      );
    });

  // Hämtar alla artister från databasen
  const artists = await new Promise((resolve, reject) => {
    db.query('SELECT artistName, time FROM artists', (err, result) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  })
    .catch((err) => {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    })
    .then((artists) => {
      return artists
        .sort((a, b) => b.time - a.time)
        .map((artist) => {
          // Räknar om tiden från millisekunder till timmar, minuter och sekunder
          const hours = Math.floor(artist.time / 3600000);
          const minutes = Math.floor((artist.time % 3600000) / 60000);
          const seconds = Math.floor((artist.time % 60000) / 1000);
          return {
            artistName: artist.artistName,
            time: `${hours}h ${minutes}m ${seconds}s`,
          };
        });
    });

  // Skickar sidan och datan till klienten
  res.render('spotify', {
    spotify: spotify,
    artists: artists,
    user: req.session,
    query: req.query,
  });
});

app.get('/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(500).json({ message: 'Token saknas' });
  }

  // Sätter att användarens epostadress är verifierad
  await new Promise((resolve, reject) => {
    db.query(
      'UPDATE users SET email_verified = 1 WHERE token = ?',
      [token],
      (err, result) => {
        if (err) {
          reject(err);
        }
        resolve();
      }
    );
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Skickar användaren till startsidan
  res.redirect('http://localhost:4000');
});

app.get('/delete', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    // Skickar nytt mail till användaren
    const token = crypto.randomBytes(32).toString('hex');
    await new Promise((resolve, reject) => {
      db.query(
        'UPDATE users SET token = ? WHERE email = ? ',
        [token, req.session.email],
        (err, result) => {
          if (err) {
            reject(err);
          }
          console.log(`%cUser token updated: ${result}`, css.success);
          resolve();
        }
      );
    }).catch((err) => {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    });

    // Skapar ett mail till användaren för att ta bort kontot
    const mailOptions = {
      from: process.env.EMAIL,
      to: req.session.email,
      subject: 'Bekräftelse av radering av konto',
      text: `Klicka på länken för att radera ditt konto: http://localhost:4000/delete?token=${token}`,
    };

    // Skickar mailet
    await new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
          reject(err);
        }
        console.log(`%cEmail sent: ${info.response}`, css.information);
        resolve();
      });
    }).catch((err) => {
      console.error(`%c${err}`, css.error);
      return res.status(500).send('Server error');
    });

    // Omdirigerar användaren till kontosidan med ett meddelande
    res.redirect(
      'http://localhost:4000/account?message=Kontot kommer att raderas om du bekräftar det via epost'
    );
    return;
  }

  // Raderar användaren från databasen
  await new Promise((resolve, reject) => {
    db.query('DELETE FROM users WHERE token = ?', [token], (err, result) => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Tar bort användarens session
  req.session.destroy((err) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }
  });

  console.log('%cUser deleted', css.information);

  // Skickar användaren till startsidan
  res.redirect('http://localhost:4000');
});

app.get('/logout', (req, res) => {
  // Loggar ut användaren
  req.session.destroy((err) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }
  });

  // Skickar att användaren är utloggad
  res.redirect('http://localhost:4000');
});

app.get('/404', (req, res) => {
  res.render('404', { user: req.session, query: req.query });
});

app.get('/auth/userdata', (req, res) => {
  // Skickar användaruppgifterna till klienten
  res.json(req.session);
});

app.get('*', (req, res) => {
  // Om sidan inte finns skickas användaren till 404-sidan
  res.redirect('http://localhost:4000/404');
});

app.post('/auth/register', async (req, res) => {
  const { name, email, password, password_confirm } = req.body;

  // Hämtar alla användare från databasen
  const result = await new Promise((resolve, reject) => {
    db.query('SELECT name, email, email_verified FROM users', (err, result) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Gör om användaruppgifterna till arrayer
  const name_array = result.map((user) => user.name);
  const email_array = result.map((user) => user.email);
  const email_verified_array = result.map((user) => user.email_verified);
  if (sqlInjectionRegex.test(name) || sqlInjectionRegex.test(email)) {
    return res.status(400).json({ message: 'Ogiltiga tecken' });
  }
  if (!name || !email || !password || !password_confirm) {
    return res.status(400).json({ message: 'Fyll i alla fält' });
  }
  if (name_array.includes(name)) {
    return res.status(400).json({ message: 'Användarnamnet är upptaget' });
  }
  if (email_array.includes(email)) {
    email_index = email_array.indexOf(email);
    if (email_verified_array[email_index] === 1) {
      return res.status(400).json({ message: 'Epostadressen är upptagen' });
    }

    // Skapar ett mail till användaren för att bekräfta epostadressen
    const token = crypto.randomBytes(32).toString('hex');
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: 'Bekräftelse av epostadress',
      text: `Klicka på länken för att bekräfta din epostadress: http://localhost:4000/verify?token=${token}`,
    };

    // Skickar mailet
    await new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
          reject(err);
        }
        console.log(`%cEmail sent: ${info.response}`, css.information);
        resolve();
      });
    }).catch((err) => {
      console.error(`%c${err}`, css.error);
      return res.status(500).send('Server error');
    });

    // Uppdaterar användarens token
    await new Promise((resolve, reject) => {
      db.query(
        'UPDATE users SET token = ? WHERE email = ?',
        [token, email],
        (err, result) => {
          if (err) {
            reject(err);
          }
          console.log(`%cUser token updated: ${result}`, css.success);
          resolve();
        }
      );
    }).catch((err) => {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    });

    // Skickar att användaren måste bekräfta epostadressen
    return res.status(400).json({
      message:
        'Epostadressen är upptagen, bekräfta den eller radera kontot om du inte registrerade det',
    });
  }
  if (password !== password_confirm) {
    return res.status(400).json({ message: 'Lösenorden matchar inte' });
  }
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Ogiltig epostadress' });
  }
  if (emailRegex.test(name)) {
    return res
      .status(400)
      .json({ message: 'Användarnamn får inte vara en epostadress' });
  }
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      message:
        'Lösenordet måste innehålla mellan 8 och 35 tecken, varav minst en siffra, en stor bokstav och en liten bokstav',
    });
  }

  // Skapar ett salt för lösenordet
  const salt = await new Promise((resolve, reject) => {
    bcrypt.genSalt(10, (err, salt) => {
      if (err) {
        reject(err);
      }
      resolve(salt);
    });
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Hashar lösenordet
  const hashedPassword = await new Promise((resolve, reject) => {
    bcrypt.hash(password, salt, (err, hashedPassword) => {
      if (err) {
        reject(err);
      }
      resolve(hashedPassword);
    });
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Skapar en token för användaren
  const token = crypto.randomBytes(32).toString('hex');

  // Lägger till användaren i databasen
  await new Promise((resolve, reject) => {
    db.query(
      'INSERT INTO users SET?',
      {
        name: name,
        email: email,
        password: hashedPassword,
        email_verified: 0,
        token: token,
      },
      (err, result) => {
        if (err) {
          reject(err);
        }
        console.log(`%cUser ${name} registered: ${result}`, css.information);
        resolve();
      }
    );
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Skapar ett mail till användaren för att bekräfta epostadressen
  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: 'Bekräftelse av epostadress',
    text: `Klicka på länken för att bekräfta din epostadress: http://localhost:4000/verify?token=${token}`,
  };

  // Skickar mailet
  await new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        reject(err);
      }
      console.log(`%cEmail sent: ${info.response}`, css.information);
      resolve();
    });
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).send('Server error');
  });

  // Skickar att användaren måste bekräfta epostadressen
  return res.status(200).json({
    message:
      'Användare registrerad, bekräfta din epostadress för att bevara ditt konto',
  });
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Fyll i alla fält' });
  }
  if (sqlInjectionRegex.test(username)) {
    return res.status(400).json({ message: 'Ogiltiga tecken' });
  }

  // Hämtar alla användare från databasen
  const users = await new Promise((resolve, reject) => {
    db.query(
      'SELECT name, email, password FROM users',
      [username],
      (err, result) => {
        if (err) {
          reject(err);
        }
        resolve(result);
      }
    );
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Gör om användaruppgifterna till arrayer
  const name_array_login = users.map((user) => user.name);
  const password_array_login = users.map((user) => user.password);
  const email_array_login = users.map((user) => user.email);

  // Kontrollerar om användaren finns
  if (emailRegex.test(username) && !email_array_login.includes(username)) {
    return res.status(400).json({ message: 'Fel inloggningsuppgifter' });
  }
  if (!emailRegex.test(username) && !name_array_login.includes(username)) {
    return res.status(400).json({ message: 'Fel inloggningsuppgifter' });
  }

  // Tar fram användarens index
  let index;
  if (emailRegex.test(username)) {
    index = email_array_login.indexOf(username);
  } else {
    index = name_array_login.indexOf(username);
  }

  // Kontrollerar om lösenordet stämmer
  const hashedPassword = password_array_login[index];
  const passwordMatch = await bcrypt.compare(password, hashedPassword);
  if (!passwordMatch) {
    return res.status(400).json({ message: 'Fel inloggningsuppgifter' });
  }

  // Sparar användaruppgifterna i sessionen
  req.session.user = name_array_login[index];
  req.session.email = email_array_login[index];
  req.session.userID = index;
  req.session.loggedIn = true;

  // Sparar sessionen
  req.session.save((err) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }
  });

  // Hämtar användarens Discord-uppgifter
  const discordUsers = await new Promise((resolve, reject) => {
    db.query(
      'SELECT * FROM discordusers WHERE userID = ?',
      [req.session.userID],
      (err, result) => {
        if (err) {
          reject(err);
        }
        resolve(result);
      }
    );
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return res.status(500).json({ message: 'Server error' });
  });

  // Skickar användaruppgifterna till klienten
  let data;
  if (discordUsers.length > 0) {
    req.session.linkedDiscord = true;
    req.session.username = discordUsers[0].discordUsername;
    req.session.displayname = discordUsers[0].discordDisplayname;
    req.session.avatar = discordUsers[0].discordAvatar;
    req.session.save((err) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).json({ message: 'Server error' });
      }
    });
    data = {
      user: req.session.user,
      displayname: req.session.displayname,
      avatar: req.session.avatar,
      loggedIn: req.session.loggedIn,
      linkedDiscord: req.session.linkedDiscord,
    };
  } else {
    data = {
      user: req.session.user,
      loggedIn: req.session.loggedIn,
    };
  }
  console.log(`%cInloggad: ${username}`, css.information);

  // Skickar att användaren är inloggad
  return res.status(200).json({ message: 'Inloggad', data: data });
});

app.post('/auth/forgot', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Fyll i epostadress' });
  }

  // Hämtar alla användare från databasen
  db.query('SELECT email, email_verified FROM users', (err, result) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }

    // Gör om användaruppgifterna till arrayer
    const email_array_forgot = result.map((user) => user.email);
    const email_verified_array_forgot = result.map(
      (user) => user.email_verified
    );
    if (!email_array_forgot.includes(email)) {
      return res.status(400).json({ message: 'Epostadressen finns inte' });
    }
    const email_index = email_array_forgot.indexOf(email);
    if (email_verified_array_forgot[email_index] === 0) {
      return res
        .status(400)
        .json({ message: 'Epostadressen är inte verifierad' });
    }

    // Skapar en token för användaren
    const token = crypto.randomBytes(32).toString('hex');

    // Skapar ett mail till användaren för att återställa lösenordet
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: 'Återställning av lösenord',
      text: `Klicka på länken för att återställa ditt lösenord: http://localhost:4000/reset?token=${token}`,
    };

    // Skickar mailet
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).send('Server error');
      }
      console.log(`%cEmail sent: ${info.response}`, css.information);

      // Uppdaterar användarens token
      db.query(
        'UPDATE users SET token = ? WHERE email = ?',
        [token, email],
        (err, result) => {
          if (err) {
            console.error(`%c${err}`, 'color: red;');
            return res.status(500).json({ message: 'Server error' });
          }
          console.log(`%cUser token updated: ${result}`, css.information);
        }
      );
    });

    // Skickar att ett mail har skickats
    return res.status(200).json({ message: 'Ett mail har skickats' });
  });
});

app.post('/auth/discord', async (req, res) => {
  const { code } = req.body;

  // Hämtar användarens Discord-uppgifter
  const tokenResponseData = await request(
    'https://discord.com/api/oauth2/token',
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `http://localhost:4000/`,
        scope: 'identify',
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  // Gör om användarens uppgifter till JSON
  const oauthData = await tokenResponseData.body.json();
  const userResult = await request('https://discord.com/api/users/@me', {
    headers: {
      authorization: `${oauthData.token_type} ${oauthData.access_token}`,
    },
  });

  // Sparar användarens Discord-uppgifter i sessionen
  const discordUser = await userResult.body.json();
  const username = discordUser.username;
  const displayname = discordUser.global_name;
  const avatar = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
  req.session.username = username;
  req.session.displayname = displayname;
  req.session.avatar = avatar;
  req.session.linkedDiscord = true;

  // Sparar sessionen
  req.session.save((err) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }
  });

  // Lägger till användaren i databasen
  await new Promise((resolve, reject) => {
    db.query(
      'INSERT INTO discordusers SET?',
      {
        userID: req.session.userID,
        discordUsername: username,
        discordDisplayname: displayname,
        discordAvatar: avatar,
      },
      (err, result) => {
        if (err) {
          console.error(`%c${err}`, css.error);
          reject(err);
        }
        console.log(`%cDiscord user added: ${username}`, css.information);
        resolve();
      }
    );
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return;
  });
  let data = {
    user: req.session.user,
    displayname: displayname,
    avatar: avatar,
  };

  // Skickar att användaren är inloggad med Discord
  return res.status(200).json({ message: 'Inloggad med Discord', data: data });
});

app.post('/auth/vote', async (req, res) => {
  const { quoteID, type } = req.body;
  if (!quoteID || !type) {
    return res.status(400).json({ message: 'Ogiltig förfrågan' });
  }
  let uservote;

  // Röstar på citatet
  switch (type) {
    case 'upvote':
      console.log('%cUpvote', css.information);

      // Hämtar användarens röster från databasen
      uservote = await new Promise((resolve, reject) => {
        db.query(
          'SELECT * FROM uservotes WHERE userID = ? AND quoteID = ?',
          [req.session.userID, quoteID],
          (err, result) => {
            if (err) {
              reject(err);
            }
            resolve(result);
          }
        );
      }).catch((err) => {
        console.error(`%c${err}`, css.error);
        return res.status(500).json({ message: 'Server error' });
      });

      if (uservote.length > 0 && uservote[0].type === 'downvote') {
        // Röstar på citatet
        await new Promise((resolve, reject) => {
          db.query(
            'UPDATE citat SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE citatID = ?',
            [quoteID],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });

        // Uppdaterar användarens röst
        await new Promise((resolve, reject) => {
          db.query(
            'UPDATE uservotes SET type = ? WHERE userID = ? AND quoteID = ?',
            [type, req.session.userID, quoteID],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });
        return res
          .status(200)
          .json({ message: 'Röstat', previous: 'downvote' });
      } else if (uservote.length > 0 && uservote[0].type === 'upvote') {
        // Röstar på citatet
        await new Promise((resolve, reject) => {
          db.query(
            'UPDATE citat SET upvotes = upvotes - 1 WHERE citatID = ?',
            [quoteID, req.session.userID, quoteID],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });
        // Tar bort användarens röst
        await new Promise((resolve, reject) => {
          db.query(
            'DELETE FROM uservotes WHERE userID = ? AND quoteID = ?',
            [req.session.userID, quoteID],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });
        return res.status(200).json({ message: 'Röstat', previous: 'upvote' });
      } else if (uservote.length === 0) {
        // Röstar på citatet
        await new Promise((resolve, reject) => {
          db.query(
            'UPDATE citat SET upvotes = upvotes + 1 WHERE citatID = ?',
            [quoteID, req.session.userID, quoteID, type],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });

        // Lägger till användarens röst
        await new Promise((resolve, reject) => {
          db.query(
            'INSERT INTO uservotes set? ',
            { userID: req.session.userID, quoteID: quoteID, type: type },
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });
        return res.status(200).json({ message: 'Röstat', previous: null });
      } else {
        console.log('%cUnknown message', css.warning);
        return res.status(400).json({ message: 'Ogiltig förfrågan' });
      }
    case 'downvote':
      console.log('%cDownvote', css.information);

      // Hämtar användarens röster från databasen
      uservote = await new Promise((resolve, reject) => {
        db.query(
          'SELECT * FROM uservotes WHERE userID = ? AND quoteID = ?',
          [req.session.userID, quoteID],
          (err, result) => {
            if (err) {
              reject(err);
            }
            resolve(result);
          }
        );
      }).catch((err) => {
        console.error(`%c${err}`, css.error);
        return res.status(500).json({ message: 'Server error' });
      });
      if (uservote.length > 0 && uservote[0].type === 'upvote') {
        // Röstar på citatet
        await new Promise((resolve, reject) => {
          db.query(
            'UPDATE citat SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE citatID = ?',
            [quoteID, type, req.session.userID, quoteID],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });

        // Uppdaterar användarens röst
        await new Promise((resolve, reject) => {
          db.query(
            'UPDATE uservotes SET type = ? WHERE userID = ? AND quoteID = ?',
            [type, req.session.userID, quoteID],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });
        return res.status(200).json({ message: 'Röstat', previous: 'upvote' });
      } else if (uservote.length > 0 && uservote[0].type === 'downvote') {
        // Röstar på citatet
        await new Promise((resolve, reject) => {
          db.query(
            'UPDATE citat SET downvotes = downvotes - 1 WHERE citatID = ?',
            [quoteID, req.session.userID, quoteID],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });

        // Tar bort användarens röst
        await new Promise((resolve, reject) => {
          db.query(
            'DELETE FROM uservotes WHERE userID = ? AND quoteID = ?',
            [req.session.userID, quoteID],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });
        return res
          .status(200)
          .json({ message: 'Röstat', previous: 'downvote' });
      } else if (uservote.length === 0) {
        // Röstar på citatet
        await new Promise((resolve, reject) => {
          db.query(
            'UPDATE citat SET downvotes = downvotes + 1 WHERE citatID = ?',
            [quoteID, req.session.userID, quoteID, type],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });

        // Lägger till användarens röst
        await new Promise((resolve, reject) => {
          db.query(
            'INSERT INTO uservotes set? ',
            { userID: req.session.userID, quoteID: quoteID, type: type },
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        });
        return res.status(200).json({ message: 'Röstat', previous: null });
      } else {
        console.log('%cUnknown message', css.warning);
        return res.status(400).json({ message: 'Ogiltig förfrågan' });
      }
    default:
      // Om förfrågan är okänd
      console.log('%cUnknown message', css.warning);
      return res.status(400).json({ message: 'Ogiltig förfrågan' });
  }
});

// Loggar in som discordboten
client.login(process.env.DISCORD_TOKEN);

// När botten är redo
client.on(Events.ClientReady, async (readyClient) => {
  console.log(`%cBotten är online som ${readyClient.user.tag}`, css.success);

  // Sätter status
  client.user.setPresence({
    activities: [
      { name: `Samlar data om regeringen`, type: ActivityType.Custom },
    ],
  });

  // Hämtar alla citat och sparar i databasen
  const quotes = await fetchAllMessages(
    process.env.DISCORD_CHANNEL_ID_CITAT_DEPARTEMENTET
  );

  // Filtrera ut systemmeddelanden (såsom threads och pins) och felaktiga citat
  const filteredQuotes = quotes
    .filter(
      (message) =>
        quotes.indexOf(message) !== quotes.length - 1 && !message.system
    )
    .reverse()
    .filter((message) => {
      const matched = message.content.match(userRegex);
      if (matched === null) {
        console.log(`%cFelaktig citat-syntax: ${message.content}`, css.warning);
      }
      return matched !== null;
    });

  // Hämtar alla citat från databasen
  const dbQuotes = await new Promise((resolve, reject) => {
    db.query('SELECT * FROM citat', (err, result) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return;
  });
  const dbQuotesArray = dbQuotes.map((quote) => quote.quote);

  // Kollar vilka citat som är nya
  const newQuotes = filteredQuotes.filter(
    (message) => !dbQuotesArray.includes(message.content)
  );
  let newQuotesCount = 0;
  const quotePromises = [];
  newQuotes.forEach((message) => {
    // Lägger till citatet i databasen
    const promise = new Promise((resolve, reject) => {
      db.query(
        'INSERT INTO citat SET ?',
        {
          upvotes: 0,
          downvotes: 0,
          quote: message.content,
          discordUsername: message.author.username,
        },
        (err, result) => {
          if (err) {
            reject(err);
          }
          newQuotesCount++;
          resolve();
        }
      );
    }).catch((err) => {
      console.error(`%c${err}`, css.error);
      return;
    });
    quotePromises.push(promise);
  });

  // Väntar på att alla citat ska läggas till
  Promise.all(quotePromises).then(() => {
    console.log(
      `%c${newQuotesCount} av ${newQuotes.length} nya citat inlagda`,
      css.success
    );
  });

  // Hämtar alla skärmbilder
  const screenshots = await fetchAllMessages(
    process.env.DISCORD_CHANNEL_ID_SCREENSHOTS
  );

  // Rensar skärmbildstabellen
  await new Promise((resolve, reject) => {
    db.query('TRUNCATE TABLE screenshots', (err, result) => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  }).catch((err) => {
    console.error(`%c${err}`, css.error);
    return;
  });
  const screenshotPromises = [];
  screenshots
    .filter((message) => message.attachments.size > 0 && !message.system)
    .reverse()
    .map((message) => {
      return message.attachments.map((attachment) => {
        return {
          url: attachment.url,
          discordUsername: message.author.username,
          messageID: message.id,
        };
      });
    })
    .flat()
    .forEach((screenshot) => {
      // Lägger till skärmbilden i databasen
      const promise = new Promise((resolve, reject) => {
        db.query('INSERT INTO screenshots SET ?', screenshot, (err, result) => {
          if (err) {
            reject(err);
          }
          resolve();
        });
      }).catch((err) => {
        console.error(`%c${err}`, css.error);
      });
      screenshotPromises.push(promise);
    });

  // Väntar på att alla skärmbilder ska läggas till
  Promise.all(screenshotPromises).then(() => {
    console.log('%cScreenshots återställda', css.success);
  });
});

// När botten tar emot ett meddelande
client.on(Events.MessageCreate, async (message) => {
  // Kollar vilken kanal meddelandet skickades i
  switch (message.channelId) {
    case process.env.DISCORD_CHANNEL_ID_CITAT_DEPARTEMENTET:
      if (message.system) {
        return;
      }
      if (message.content.match(userRegex) === null) {
        console.log(`%c${message.content}`, css.error);
        return;
      }

      // Lägger till citatet i databasen
      await new Promise((resolve, reject) => {
        db.query(
          'INSERT INTO citat SET ?',
          {
            upvotes: 0,
            downvotes: 0,
            quote: message.content,
            discordUsername: message.author.username,
          },
          (err, result) => {
            if (err) {
              reject(err);
            }
            resolve();
          }
        );
      }).catch((err) => {
        console.error(`%c${err}`, css.error);
        return;
      });

      // Tar fram det nya citatets ID
      const citatID = await new Promise((resolve, reject) => {
        db.query(
          'SELECT citatID FROM citat WHERE quote = ?',
          [message.content],
          (err, result) => {
            if (err) {
              reject(err);
            }
            resolve(result);
          }
        );
      }).catch((err) => {
        console.error(`%c${err}`, css.error);
        return;
      });
      console.log(`%cCitat inlagt: ${message.content}`, css.information);

      const data = {
        quote: message.content,
        citatID: citatID,
      };
      // Skickar citatet till alla anslutna klienter på citatsidan
      connections.forEach((pageId, ws) => {
        if (pageId === 'citat' && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(data));
        }
      });
      return;
    case process.env.DISCORD_CHANNEL_ID_SCREENSHOTS:
      const promises = [];

      // Lägger till skärmbilderna i databasen
      message.attachments.forEach((attachment) => {
        const promise = new Promise((resolve, reject) => {
          db.query(
            'INSERT INTO screenshots SET ?',
            {
              url: attachment.url,
              discordUsername: message.author.username,
              messageID: message.id,
            },
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return;
        });
        promises.push(promise);
      });

      // Väntar på att alla skärmbilder ska läggas till
      Promise.all(promises).then(() => {
        console.log('%cScreenshots inlagda', css.information);
      });
      message.attachments.forEach((attachment) => {
        connections.forEach((pageId, ws) => {
          if (pageId === 'screenshots' && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(attachment.url));
          }
        });
      });
      return;
    default:
      return;
  }
});

// När en användare byter aktivitet
client.on(Events.PresenceUpdate, async (oldActivities, newActivities) => {
  if (oldActivities && oldActivities.activities) {
    // Omformaterar aktiviteterna och loopar igenom dem
    oldActivities.activities
      .filter(
        (activity) =>
          !newActivities.activities
            .map((new_activity) => new_activity.createdTimestamp)
            .includes(activity.createdTimestamp)
      )
      .forEach(async (activity) => {
        // Tiden kan bli negativ på grund av okänd anledning. Därför används Math.max för att undvika detta.
        const time = Math.max(
          new Date().getTime() - activity.createdTimestamp,
          0
        );

        // Lägger till aktiviteten i databasen
        await new Promise((resolve, reject) => {
          db.query(
            'INSERT INTO activities (name, time) VALUES (?, ?) ON DUPLICATE KEY UPDATE time = time + VALUES(time)',
            [activity.name, time],
            (err, result) => {
              if (err) {
                reject(err);
              }
              resolve();
            }
          );
        }).catch((err) => {
          console.error(`%c${err}`, css.error);
          return null;
        });
        if (activity.name === 'Spotify') {
          // Lägger till Spotify-aktiviteten i databasen
          await new Promise((resolve, reject) => {
            db.query(
              'INSERT INTO spotify (song, mainArtist, time) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE time = time + VALUES(time)',
              [activity.details, activity.state.split(';')[0], time],
              (err, result) => {
                if (err) {
                  reject(err);
                }
                resolve();
              }
            );
          }).catch((err) => {
            console.error(`%c${err}`, css.error);
            return null;
          });

          // Lägger till artisterna i databasen
          await Promise.all(
            activity.state.split(';').map(async (artist) => {
              return new Promise((resolve, reject) => {
                db.query(
                  'INSERT INTO artists (artistName, time) VALUES (?, ?) ON DUPLICATE KEY UPDATE time = time + VALUES(time)',
                  [artist, time],
                  (err, result) => {
                    if (err) {
                      reject(err);
                    }
                    resolve();
                  }
                );
              }).catch((err) => {
                console.error(`%c${err}`, css.error);
                return null;
              });
            })
          );

          // Tar fram artisternas och låtens ID
          const songID = await new Promise((resolve, reject) => {
            db.query(
              'SELECT songID FROM spotify WHERE song = ? AND mainArtist = ?',
              [activity.details, activity.state.split(';')[0]],
              (err, result) => {
                if (err) {
                  reject(err);
                }
                resolve(result);
              }
            );
          }).catch((err) => {
            console.error(`%c${err}`, css.error);
            return null;
          });
          const artistIDs = await Promise.all(
            activity.state.split(';').map(async (artist) => {
              return new Promise((resolve, reject) => {
                db.query(
                  'SELECT artistID FROM artists WHERE artistName = ?',
                  [artist],
                  (err, result) => {
                    if (err) {
                      reject(err);
                    }
                    resolve(result);
                  }
                );
              }).catch((err) => {
                console.error(`%c${err}`, css.error);
                return null;
              });
            })
          );

          // Lägger till artisterna och låten i artistlåt-tabellen
          const songIDValue = songID[0].songID;
          const artistIDsValues = artistIDs.map((artist) => artist[0].artistID);
          artistIDsValues.forEach(async (artistID) => {
            await new Promise((resolve, reject) => {
              db.query(
                'INSERT INTO artistsongs (songID, artistID) VALUES (?, ?) ON DUPLICATE KEY UPDATE songID = songID',
                [songIDValue, artistID],
                (err, result) => {
                  if (err) {
                    reject(err);
                  }
                  resolve();
                }
              );
            }).catch((err) => {
              console.error(`%c${err}`, css.error);
              return null;
            });
          });
        }
      });
  }
});

const port = 4000;

// Startar servern
app.listen(port, () => {
  console.log(`%cServern körs, besök http://localhost:${port}`, css.success);
});
