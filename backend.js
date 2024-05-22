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

app.use(
  session({
    secret: process.env.EXPRESS_SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

const wss = new WebSocket.Server({ port: 8080 });

const connections = new Map();

wss.on('connection', function connection(ws, req) {
  const pageId = req.url.split('=')[1];
  connections.set(ws, pageId);
  ws.on('message', function incoming(message) {
    message = JSON.parse(message);
    console.log(`%cReceived message: ${message.type}`, css.information);
  });
  ws.on('close', function () {
    connections.delete(ws);
  });
  ws.on('error', function (error) {
    console.error(`%c${error}`, css.error);
  });
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

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

const emailRegex =
  /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z]{8,35}$/;

// https://regex101.com/library/qE9gR7
const sqlInjectionRegex =
  /(\s*([\0\b\'\"\n\r\t\%\_\\]*\s*(((select\s*.+\s*from\s*.+)|(insert\s*.+\s*into\s*.+)|(update\s*.+\s*set\s*.+)|(delete\s*.+\s*from\s*.+)|(drop\s*.+)|(truncate\s*.+)|(alter\s*.+)|(exec\s*.+)|(\s*(all|any|not|and|between|in|like|or|some|contains|containsall|containskey)\s*.+[\=\>\<=\!\~]+.+)|(let\s+.+[\=]\s*.*)|(begin\s*.*\s*end)|(\s*[\/\*]+\s*.*\s*[\*\/]+)|(\s*(\-\-)\s*.*\s+)|(\s*(contains|containsall|containskey)\s+.*)))(\s*[\;]\s*)*)+)/i;

const newLineRegex = /\n/;

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

app.get('/login', (req, res) => {
  res.render('login', { user: req.session, query: req.query });
});

app.get('/discordAuth', (req, res) => {
  res.render('discordAuth', { user: req.session, query: req.query });
});

app.get('/account', (req, res) => {
  res.render('account', { user: req.session, query: req.query });
});

app.get('/citat', async (req, res) => {
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
  const quotedCount = Object.fromEntries(
    Object.entries(
      quoted.reduce((acc, user) => {
        acc[user] = (acc[user] || 0) + 1;
        return acc;
      }, {})
    ).sort(([, a], [, b]) => b - a)
  );
  const messageCount = Object.fromEntries(
    Object.entries(
      quotes
        .map((message) => message.discordUsername)
        .reduce((acc, user) => {
          acc[user.displayName] = (acc[user.displayName] || 0) + 1;
          return acc;
        }, {})
    ).sort(([, a], [, b]) => b - a)
  );
  res.render('citat', {
    citat: quotes,
    votes: userVotes,
    quoted: quotedCount,
    messages: messageCount,
    user: req.session,
    query: req.query,
  });
});

app.get('/screenshots', async (req, res) => {
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
  res.render('screenshots', {
    screenshots: screenshots,
    user: req.session,
    query: req.query,
  });
});

app.get('/activity', async (req, res) => {
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
  const mappedActivities = activities.map((activity) => {
    const hours = Math.floor(activity.time / 3600000);
    const minutes = Math.floor((activity.time % 3600000) / 60000);
    const seconds = Math.floor((activity.time % 60000) / 1000);
    return {
      name: activity.name,
      time: `${hours}h ${minutes}m ${seconds}s`,
    };
  });
  res.render('activity', {
    activities: mappedActivities,
    user: req.session,
    query: req.query,
  });
});

app.get('/spotify', async (req, res) => {
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
          const hours = Math.floor(artist.time / 3600000);
          const minutes = Math.floor((artist.time % 3600000) / 60000);
          const seconds = Math.floor((artist.time % 60000) / 1000);
          return {
            artistName: artist.artistName,
            time: `${hours}h ${minutes}m ${seconds}s`,
          };
        });
    });

  console.log(spotify);
  console.log(artists);
  res.render('spotify', {
    spotify: spotify,
    artists: artists,
    user: req.session,
    query: req.query,
  });
});

app.get('/verify', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(500).json({ message: 'Token saknas' });
  }
  db.query(
    'UPDATE users SET email_verified = 1 WHERE token = ?',
    [token],
    (err, result) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).json({ message: 'Server error' });
      }
      console.log(`%cUser email verified: ${result}`, css.information);
      return res.status(200).json({ message: 'Email verifierad' });
    }
  );
});

app.get('/delete', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(500).json({ message: 'Token saknas' });
  }
  db.query('DELETE FROM users WHERE token = ?', [token], (err, result) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }
    console.log(`%cUser deleted: ${result}`, css.information);
    return res.status(200).json({ message: 'Konto raderat' });
  });
});

app.get('/auth', (req, res) => {
  res.render('auth', { user: req.session, query: req.query });
});

app.get('/404', (req, res) => {
  res.render('404', { user: req.session, query: req.query });
});

app.get('/auth/userdata', (req, res) => {
  res.json(req.session);
});

app.get('*', (req, res) => {
  res.redirect('http://localhost:4000/404');
});

app.post('/auth/register', async (req, res) => {
  const { name, email, password, password_confirm } = req.body;
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
    const token = crypto.randomBytes(32).toString('hex');
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: 'Bekräftelse av epostadress',
      text: `Klicka på länken för att bekräfta din epostadress: http://localhost:4000/verify?token=${token}`,
    };
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).send('Server error');
      }
      console.log(`%cEmail sent: ${info.response}`, css.information);
      db.query(
        'UPDATE users SET token = ? WHERE email = ?',
        [token, email],
        (err, result) => {
          if (err) {
            console.error(`%c${err}`, css.error);
            return res.status(500).json({ message: 'Server error' });
          }
          console.log(`%cUser token updated: ${result}`, css.success);
        }
      );
    });
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
  const token = crypto.randomBytes(32).toString('hex');
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
  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: 'Bekräftelse av epostadress',
    text: `Klicka på länken för att bekräfta din epostadress: http://localhost:4000/verify?token=${token}`,
  };
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
  const name_array_login = users.map((user) => user.name);
  const password_array_login = users.map((user) => user.password);
  const email_array_login = users.map((user) => user.email);
  if (emailRegex.test(username) && !email_array_login.includes(username)) {
    return res.status(400).json({ message: 'Fel inloggningsuppgifter' });
  }
  if (!emailRegex.test(username) && !name_array_login.includes(username)) {
    return res.status(400).json({ message: 'Fel inloggningsuppgifter' });
  }
  let index;
  if (emailRegex.test(username)) {
    index = email_array_login.indexOf(username);
  } else {
    index = name_array_login.indexOf(username);
  }
  const hashedPassword = password_array_login[index];
  const passwordMatch = await bcrypt.compare(password, hashedPassword);
  if (!passwordMatch) {
    return res.status(400).json({ message: 'Fel inloggningsuppgifter' });
  }
  req.session.user = name_array_login[index];
  req.session.email = email_array_login[index];
  req.session.userID = index;
  req.session.loggedIn = true;
  req.session.save((err) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }
  });
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
  return res.status(200).json({ message: 'Inloggad', data: data });
});

app.post('/auth/logout', (req, res) => {
  return res.status(200).json({ message: 'Utloggad' });
});

app.post('/auth/forgot', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Fyll i epostadress' });
  }
  db.query('SELECT email, email_verified FROM users', (err, result) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }
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
    const token = crypto.randomBytes(32).toString('hex');
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: 'Återställning av lösenord',
      text: `Klicka på länken för att återställa ditt lösenord: http://localhost:4000/reset?token=${token}`,
    };
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).send('Server error');
      }
      console.log(`%cEmail sent: ${info.response}`, css.information);
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
    return res.status(200).json({ message: 'Ett mail har skickats' });
  });
});

app.post('/auth/discord', async (req, res) => {
  const { code } = req.body;
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
  const oauthData = await tokenResponseData.body.json();
  const userResult = await request('https://discord.com/api/users/@me', {
    headers: {
      authorization: `${oauthData.token_type} ${oauthData.access_token}`,
    },
  });
  const discordUser = await userResult.body.json();
  console.log(discordUser);
  const username = discordUser.username;
  const displayname = discordUser.global_name;
  const avatar = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
  req.session.username = username;
  req.session.displayname = displayname;
  req.session.avatar = avatar;

  req.session.linkedDiscord = true;
  req.session.save((err) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }
  });
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
  return res.status(200).json({ message: 'Inloggad med Discord', data: data });
});

app.post('/auth/vote', async (req, res) => {
  const { quoteID, type } = req.body;
  if (!quoteID || !type) {
    console.log('%cMissing data', css.warning);
    return res.status(400).json({ message: 'Ogiltig förfrågan' });
  }
  let uservote;
  switch (type) {
    case 'upvote':
      console.log('%cUpvote', css.information);
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
      console.log(uservote);
      if (uservote.length > 0 && uservote[0].type === 'downvote') {
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
      console.log(uservote);
      if (uservote.length > 0 && uservote[0].type === 'upvote') {
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
      console.log('%cUnknown message', css.warning);
      return res.status(400).json({ message: 'Ogiltig förfrågan' });
  }
});

client.login(process.env.DISCORD_TOKEN);

client.on(Events.ClientReady, async (readyClient) => {
  console.log(`%cBotten är online som ${readyClient.user.tag}`, css.success);
  client.user.setPresence({
    activities: [
      { name: `Samlar data om regeringen`, type: ActivityType.Custom },
    ],
  });
  const quotes = await fetchAllMessages(
    process.env.DISCORD_CHANNEL_ID_CITAT_DEPARTEMENTET
  );
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
  const newQuotes = filteredQuotes.filter(
    (message) => !dbQuotesArray.includes(message.content)
  );
  let newQuotesCount = 0;
  const quotePromises = [];
  newQuotes.forEach((message) => {
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
  Promise.all(quotePromises).then(() => {
    console.log(
      `%c${newQuotesCount} av ${newQuotes.length} nya citat inlagda`,
      css.success
    );
  });
  const screenshots = await fetchAllMessages(
    process.env.DISCORD_CHANNEL_ID_SCREENSHOTS
  );
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
  Promise.all(screenshotPromises).then(() => {
    console.log('%cScreenshots återställda', css.success);
  });
});

client.on(Events.MessageCreate, async (message) => {
  switch (message.channelId) {
    case process.env.DISCORD_CHANNEL_ID_CITAT_DEPARTEMENTET:
      if (message.system) {
        return;
      }
      if (message.content.match(userRegex) === null) {
        console.log(`%c${message.content}`, css.error);
        return;
      }
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
      console.log(`%cCitat inlagt: ${message.content}`, css.information);
      connections.forEach((pageId, ws) => {
        if (pageId === 'citat' && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      });
      return;
    case process.env.DISCORD_CHANNEL_ID_SCREENSHOTS:
      const promises = [];
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
      Promise.all(promises).then(() => {
        console.log('%cScreenshots inlagda', css.information);
      });
      return;
    default:
      return;
  }
});

client.on(Events.PresenceUpdate, async (oldActivities, newActivities) => {
  if (oldActivities && oldActivities.activities) {
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

app.listen(port, () => {
  console.log(`%cServern körs, besök http://localhost:${port}`, css.success);
});
