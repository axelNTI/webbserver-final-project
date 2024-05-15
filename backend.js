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
const { SpotifyApi } = require('@spotify/web-api-ts-sdk'); // Apache
const { read } = require('fs'); // ISC
const session = require('express-session'); // MIT
const { request } = require('undici'); // MIT
const Handlebars = require('handlebars'); // MIT
const parseurl = require('parseurl'); // MIT
const escapeHtml = require('escape-html'); // MIT
const WebSocket = require('ws'); // MIT
const hbs = require('hbs'); // MIT

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

// Regex for finding if string contains a new line
const newLineRegex = /\n/;

// Regex for finding the string between a dash and the first of the following: [a new line or a comma or the end of the string or the string "om"]
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
    tables
      .map((table) => table.Tables_in_regeringen)
      .forEach((table) => {
        db.query(`ALTER TABLE ${table} IMPORT TABLESPACE`, (err, result) => {
          if (err && err.code === 'ER_TABLESPACE_EXISTS') {
            console.log(
              `%cTablespace already exists for ${table}`,
              css.success
            );
            return;
          }
          if (err) {
            console.error(`%c${err}`, css.error);
            return;
          }
          console.log(`%cTablespace has been added to ${table}`, css.warning);
        });
      });
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
  console.log(userVotes);

  // res.json(result);
  // const quoted = filteredMessages.flatMap((message) => {
  //   const individuals = [];
  //   const lines = message.content.split(newLineRegex);
  //   lines.forEach((line) => {
  //     const matches = line.match(userRegex);
  //     if (matches) {
  //       individuals.push(...matches.map((match) => match.trim()));
  //     } else {
  //       console.log(`%c${line}`, css.error);
  //     }
  //   });
  //   return individuals;
  // });
  // const quotedCount = Object.fromEntries(
  //   Object.entries(
  //     quoted.reduce((acc, user) => {
  //       acc[user] = (acc[user] || 0) + 1;
  //       return acc;
  //     }, {})
  //   ).sort(([, a], [, b]) => b - a)
  // );
  // const messageCount = Object.fromEntries(
  //   Object.entries(
  //     filteredMessages
  //       .map((message) => message.author)
  //       .reduce((acc, user) => {
  //         acc[user.displayName] = (acc[user.displayName] || 0) + 1;
  //         return acc;
  //       }, {})
  //   ).sort(([, a], [, b]) => b - a)
  // );
  res.render('citat', {
    citat: citat,
    votes: userVotes,
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
    .then((spotify) => {
      return spotify.map((song) => {
        const hours = Math.floor(song.time / 3600000);
        const minutes = Math.floor((song.time % 3600000) / 60000);
        const seconds = Math.floor((song.time % 60000) / 1000);
        return {
          song: song.song,
          artist: song.artist,
          time: `${hours}h ${minutes}m ${seconds}s`,
        };
      });
    });
  res.render('spotify', {
    spotify: spotify,
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

app.post('/auth/register', (req, res) => {
  const { name, email, password, password_confirm } = req.body;
  db.query('SELECT name, email, email_verified FROM users', (err, result) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }
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
    bcrypt.genSalt(10, (err, salt) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).json({ message: 'Server error' });
      }
      bcrypt.hash(password, salt, (err, hashedPassword) => {
        if (err) {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: 'Server error' });
        }
        const token = crypto.randomBytes(32).toString('hex');
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
              console.error(`%c${err}`, css.error);
              return res.status(500).json({ message: 'Server error' });
            }
            console.log(
              `%cUser ${name} registered: ${result}`,
              css.information
            );
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
              console.log('%cEmail sent: ' + info.response, css.information);
              return res.status(200).json({
                message:
                  'Användare registrerad, bekräfta din epostadress för att bevara ditt konto',
              });
            });
          }
        );
      });
    });
  });
});

app.post('/auth/login', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ message: 'Fyll i alla fält' });
  }
  db.query(
    'SELECT name, email, password FROM users',
    [name],
    async (err, result) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).json({ message: 'Server error' });
      }
      const name_array_login = result.map((user) => user.name);
      const password_array_login = result.map((user) => user.password);
      const email_array_login = result.map((user) => user.email);
      if (emailRegex.test(name) && !email_array_login.includes(name)) {
        return res.status(400).json({ message: 'Fel inloggningsuppgifter' });
      }
      if (!emailRegex.test(name) && !name_array_login.includes(name)) {
        return res.status(400).json({ message: 'Fel inloggningsuppgifter' });
      }
      let index;
      if (emailRegex.test(name)) {
        index = email_array_login.indexOf(name);
      } else {
        index = name_array_login.indexOf(name);
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
        db.query(
          'SELECT * FROM discordusers WHERE userID = ?',
          [req.session.userID],
          (err, result) => {
            if (err) {
              console.error(`%c${err}`, css.error);
              return res.status(500).json({ message: 'Server error' });
            }
            if (result.length > 0) {
              req.session.linkedDiscord = true;
              req.session.username = result[0].discordUsername;
              req.session.displayname = result[0].discordDisplayname;
              req.session.avatar = result[0].discordAvatar;
              req.session.save((err) => {
                if (err) {
                  console.error(`%c${err}`, css.error);
                  return res.status(500).json({ message: 'Server error' });
                }
              });
            }
          }
        );
        console.log(`%cInloggad: ${name}`, css.information);
        return res.status(200).json({ message: 'Inloggad' });
      });
    }
  );
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
        redirect_uri: `http://localhost:4000/discordAuth`,
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
  username = discordUser.username;
  displayname = discordUser.global_name;
  avatar = discordUser.avatar;
  req.session.username = username;
  req.session.displayname = displayname;
  req.session.avatar = `https://cdn.discordapp.com/avatars/${discordUser.id}/${avatar}.png`;
  req.session.linkedDiscord = true;
  req.session.save((err) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: 'Server error' });
    }
  });
  db.query(
    'INSERT INTO discordusers SET?',
    {
      userID: req.session.userID,
      discordUsername: username,
      discordDisplayname: displayname,
      discordAvatar: `https://cdn.discordapp.com/avatars/${discordUser.id}/${avatar}.png`,
    },
    (err, result) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return;
      }
      console.log(`%cDiscord user added: ${result}`, css.information);
    }
  );
  return res.status(200).json({ message: 'Inloggad med Discord' });
});

app.post('/auth/vote', (req, res) => {
  console.log(req.session);
  console.log(req.body);
  const { quote_id, type } = req.body;
  if (!quote_id || !type) {
    return res.status(400).json({ message: 'Ogiltig förfrågan' });
  }
  console.log(req.session);
  console.log(quote_id);
  console.log(type);
  while (true) {}
  switch (type) {
    case 'upvote':
      console.log('%cUpvote', css.information);
      db.query(
        'SELECT * FROM uservotes WHERE userID = ? AND quoteID = ?',
        [req.session, message.id],
        (err, result) => {
          if (err) {
            console.error(`%c${err}`, css.error);
            return;
          }
          if (result.length > 0 && result.type === 'downvote') {
            db.query(
              'UPDATE citat SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE id = ?; SET type = ? WHERE userID = ? AND quoteID = ?',
              [message.id, 'upvote', message.userID, message.id],
              (err, result) => {
                if (err) {
                  console.error(`%c${err}`, css.error);
                  return;
                }
              }
            );
          } else if (result.length > 0 && result.type === 'upvote') {
            db.query(
              'UPDATE citat SET upvotes = upvotes - 1 WHERE id = ?; DELETE FROM uservotes WHERE userID = ? AND quoteID = ?',
              [message.id, req.session.userID, message.id],
              (err, result) => {
                if (err) {
                  console.error(`%c${err}`, css.error);
                  return;
                }
              }
            );
          } else if (result.length === 0) {
            db.query(
              'UPDATE citat SET upvotes = upvotes + 1 WHERE id = ?; INSERT INTO uservotes SET?',
              [
                message.id,
                {
                  userID: req.session.userID,
                  quoteID: message.id,
                  type: 'upvote',
                },
              ],
              (err, result) => {
                if (err) {
                  console.error(`%c${err}`, css.error);
                  return;
                }
              }
            );
          }
        }
      );
      break;
    case 'downvote':
      console.log('%cDownvote', css.information);
      db.query(
        'SELECT * FROM uservotes WHERE userID = ? AND quoteID = ?',
        [req.session.userID, message.id],
        (err, result) => {
          if (err) {
            console.error(`%c${err}`, css.error);
            return;
          }
          if (result.length > 0 && result.type === 'upvote') {
            db.query(
              'UPDATE citat SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = ?; SET type = ? WHERE userID = ? AND quoteID = ?',
              [message.id, 'downvote', req.session.userID, message.id],
              (err, result) => {
                if (err) {
                  console.error(`%c${err}`, css.error);
                  return;
                }
              }
            );
          } else if (result.length > 0 && result.type === 'downvote') {
            db.query(
              'UPDATE citat SET downvotes = downvotes - 1 WHERE id = ?; DELETE FROM uservotes WHERE userID = ? AND quoteID = ?',
              [message.id, req.session.userID, message.id],
              (err, result) => {
                if (err) {
                  console.error(`%c${err}`, css.error);
                  return;
                }
              }
            );
          } else if (result.length === 0) {
            db.query(
              'UPDATE citat SET downvotes = downvotes + 1 WHERE id = ?; INSERT INTO uservotes SET?',
              [
                message.id,
                {
                  userID: req.session.userID,
                  quoteID: message.id,
                  type: 'downvote',
                },
              ],
              (err, result) => {
                if (err) {
                  console.error(`%c${err}`, css.error);
                  return;
                }
              }
            );
          }
        }
      );
      break;
    default:
      console.log('%cUnknown message', css.warning);
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
  fetchAllMessages(process.env.DISCORD_CHANNEL_ID_CITAT_DEPARTEMENTET).then(
    (messages) => {
      filteredMessages = messages
        .filter(
          (message) =>
            messages.indexOf(message) !== messages.length - 1 && !message.system
        )
        .reverse()
        .filter((message) => {
          const matched = message.content.match(userRegex);
          if (matched === null) {
            console.log(
              `%cFelaktig citat-syntax: ${message.content}`,
              css.warning
            );
          }
          return matched !== null;
        });
      const quotes = (async () => {
        return await new Promise((resolve, reject) => {
          db.query('SELECT * FROM citat', (err, result) => {
            if (err) {
              reject(err);
            }
            resolve(result);
          });
        });
      })().catch((err) => {
        console.error(`%c${err}`, css.error);
        return;
      });
      const dbQuotes = quotes.map((quote) => quote.quote);
      const newQuotes = filteredMessages.filter(
        (message) => !dbQuotes.includes(message.content)
      );
      let newQuotesCount = 0;
      const promises = [];
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
                console.error(`%c${err}`, css.error);
                reject(err);
              } else {
                newQuotesCount++;
                resolve();
              }
            }
          );
        });
        promises.push(promise);
      });
      Promise.all(promises).then(() => {
        console.log(
          `%c${newQuotesCount} av ${newQuotes.length} nya citat inlagda`,
          css.success
        );
      });
    }
  );
  fetchAllMessages(process.env.DISCORD_CHANNEL_ID_SCREENSHOTS).then(
    (messages) => {
      (async () => {
        await new Promise((resolve, reject) => {
          db.query('TRUNCATE TABLE screenshots', (err, result) => {
            if (err) {
              reject(err);
            }
            resolve();
          });
        });
      })().catch((err) => {
        console.error(`%c${err}`, css.error);
        return;
      });
      messages
        .filter((message) => message.attachments.size > 0 && !message.system)
        .reverse()
        .forEach((message) => {
          message.attachments.forEach((attachment) => {
            (async () => {
              await new Promise((resolve, reject) => {
                db.query(
                  'INSERT INTO screenshots SET?',
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
              });
            })().catch((err) => {
              console.error(`%c${err}`, css.error);
              return;
            });
          });
        });
      console.log('%cScreenshots återställda', css.success);
    }
  );
});

client.on(Events.MessageCreate, async (message) => {
  if (
    message.channelId === process.env.DISCORD_CHANNEL_ID_CITAT_DEPARTEMENTET
  ) {
    if (message.content.match(userRegex) === null) {
      console.log(`%c${message.content}`, css.error);
      return;
    }
    (async () => {
      await new Promise((resolve, reject) => {
        db.query(
          'INSERT INTO citat SET?',
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
      });
    })().catch((err) => {
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
  } else if (message.channelId === process.env.DISCORD_CHANNEL_ID_SCREENSHOTS) {
    message.attachments.forEach((attachment) => {
      (async () => {
        await new Promise((resolve, reject) => {
          db.query(
            'INSERT INTO screenshots SET?',
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
        });
      })().catch((err) => {
        console.error(`%c${err}`, css.error);
        return;
      });
      console.log(`%cScreenshot inlagt: ${attachment.url}`, css.information);
      connections.forEach((pageId, ws) => {
        if (pageId === 'screenshots' && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      });
    });
    return;
  }
});

client.on(Events.PresenceUpdate, async (oldActivities, newActivities) => {
  // TODO: Fixa att databasen uppdateras om man har en låt på repeat.
  if (oldActivities && oldActivities.activities) {
    oldActivities.activities
      .filter(
        (activity) =>
          !newActivities.activities
            .map((new_activity) => new_activity.createdTimestamp)
            .includes(activity.createdTimestamp)
      )
      .forEach((activity) => {
        // Time kan bli negativt på grund av okänd anledning. Därför används Math.max för att undvika negativa värden.
        const time = Math.max(
          new Date().getTime() - activity.createdTimestamp,
          0
        );
        const activities = (async () => {
          return await new Promise((resolve, reject) => {
            db.query(
              'SELECT * FROM activities WHERE name = ?',
              [activity.name],
              (err, result) => {
                if (err) {
                  reject(err);
                }
                resolve(result);
              }
            );
          });
        })().catch((err) => {
          console.error(`%c${err}`, css.error);
          return;
        });
        if (activities.length === 0) {
          (async () => {
            await new Promise((resolve, reject) => {
              db.query(
                'INSERT INTO activities SET?',
                { name: activity.name, time: time },
                (err, result) => {
                  if (err) {
                    reject(err);
                  }
                  resolve();
                }
              );
            });
          })().catch((err) => {
            console.error(`%c${err}`, css.error);
            return;
          });
        } else {
          (async () => {
            await new Promise((resolve, reject) => {
              db.query(
                'UPDATE activities SET time = time + ? WHERE name = ?',
                [time, activity.name],
                (err, result) => {
                  if (err) {
                    reject(err);
                  }
                  resolve();
                }
              );
            });
          })().catch((err) => {
            console.error(`%c${err}`, css.error);
            return;
          });
        }
        if (activity.name === 'Spotify') {
          const spotifyActivities = (async () => {
            return await new Promise((resolve, reject) => {
              db.query(
                'SELECT * FROM spotify WHERE song = ? AND artist = ?',
                [activity.details, activity.state],
                (err, result) => {
                  if (err) {
                    reject(err);
                  }
                  resolve(result);
                }
              );
            });
          })().catch((err) => {
            console.error(`%c${err}`, css.error);
            return;
          });
          if (spotifyActivities.length === 0) {
            async () => {
              await new Promise((resolve, reject) => {
                db.query(
                  'INSERT INTO spotify SET?',
                  {
                    song: activity.details,
                    artist: activity.state,
                    time: time,
                  },
                  (err, result) => {
                    if (err) {
                      reject(err);
                    }
                    resolve();
                  }
                );
              })().catch((err) => {
                console.error(`%c${err}`, css.error);
                return;
              });
            };
          } else {
            async () => {
              await new Promise((resolve, reject) => {
                db.query(
                  'UPDATE spotify SET time = time + ? WHERE song = ? AND artist = ?',
                  [time, activity.details, activity.state],
                  (err, result) => {
                    if (err) {
                      reject(err);
                    }
                    resolve();
                  }
                );
              })().catch((err) => {
                console.error(`%c${err}`, css.error);
                return;
              });
            };
          }
        }
      });
  }
});

const port = 4000;

app.listen(port, () => {
  console.log(`%cServern körs, besök http://localhost:${port}`, css.success);
});
