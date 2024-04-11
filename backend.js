const express = require("express");
const mysql = require("mysql2");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const { SpotifyApi } = require("@spotify/web-api-ts-sdk");
const { read } = require("fs");
const session = require("express-session");
const { request } = require("undici");
const Handlebars = require("handlebars");

const css = {
  error: "color: #FF4422;",
  success: "color: #00FF7F;",
  warning: "color: #F9A900;",
  information: "color: #1E90FF;",
};

const app = express();
app.set("view engine", "hbs");
dotenv.config({ path: "../.env" });

const client = new Client({
  intents: 8,
});

const emailRegex =
  /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z]{8,35}$/;

// https://regex101.com/library/qE9gR7
const sqlInjectionRegex =
  /(\s*([\0\b\'\"\n\r\t\%\_\\]*\s*(((select\s*.+\s*from\s*.+)|(insert\s*.+\s*into\s*.+)|(update\s*.+\s*set\s*.+)|(delete\s*.+\s*from\s*.+)|(drop\s*.+)|(truncate\s*.+)|(alter\s*.+)|(exec\s*.+)|(\s*(all|any|not|and|between|in|like|or|some|contains|containsall|containskey)\s*.+[\=\>\<=\!\~]+.+)|(let\s+.+[\=]\s*.*)|(begin\s*.*\s*end)|(\s*[\/\*]+\s*.*\s*[\*\/]+)|(\s*(\-\-)\s*.*\s+)|(\s*(contains|containsall|containskey)\s+.*)))(\s*[\;]\s*)*)+)/i;

const db = mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
});

app.use(express.urlencoded({ extended: "false" }));
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

db.connect((err) => {
  if (err) {
    console.error(`%c${err}`, css.error);
  } else {
    console.log("%cAnsluten till MySQL", css.success);
  }
});

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/register", (req, res) => {
  res.render("register");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/discordAuth", (req, res) => {
  const { code } = req.query;
  if (code) {
    res.render("discordAuth", { code });
  } else {
    res.render("discordAuth");
  }
});

app.post("/auth/register", (req, res) => {
  const { name, email, password, password_confirm } = req.body;
  db.query("SELECT name, email, email_verified FROM users", (err, result) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: "Server error" });
    }
    const name_array = result.map((user) => user.name);
    const email_array = result.map((user) => user.email);
    const email_verified_array = result.map((user) => user.email_verified);
    if (sqlInjectionRegex.test(name) || sqlInjectionRegex.test(email)) {
      return res.status(400).json({ message: "Ogiltiga tecken" });
    }
    if (!name || !email || !password || !password_confirm) {
      return res.status(400).json({ message: "Fyll i alla fält" });
    }
    if (name_array.includes(name)) {
      return res.status(400).json({ message: "Användarnamnet är upptaget" });
    }
    if (email_array.includes(email)) {
      email_index = email_array.indexOf(email);
      if (email_verified_array[email_index] === 1) {
        return res.status(400).json({ message: "Epostadressen är upptagen" });
      }
      const token = crypto.randomBytes(32).toString("hex");
      const mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: "Bekräftelse av epostadress",
        text: `Klicka på länken för att bekräfta din epostadress: http://localhost:4000/verify?token=${token}`,
      };
      transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
          console.error(`%c${err}`, css.error);
          return res.status(500).send("Server error");
        }
        console.log(`%cEmail sent: ${info.response}`, css.information);
        db.query(
          "UPDATE users SET token = ? WHERE email = ?",
          [token, email],
          (err, result) => {
            if (err) {
              console.error(`%c${err}`, css.error);
              return res.status(500).json({ message: "Server error" });
            }
            console.log(`%cUser token updated: ${result}`, css.success);
          }
        );
      });
      return res.status(400).json({
        message:
          "Epostadressen är upptagen, bekräfta den eller radera kontot om du inte registrerade det",
      });
    }
    if (password !== password_confirm) {
      return res.status(400).json({ message: "Lösenorden matchar inte" });
    }
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Ogiltig epostadress" });
    }
    if (emailRegex.test(name)) {
      return res
        .status(400)
        .json({ message: "Användarnamn får inte vara en epostadress" });
    }
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Lösenordet måste innehålla mellan 8 och 35 tecken, varav minst en siffra, en stor bokstav och en liten bokstav",
      });
    }
    bcrypt.genSalt(10, (err, salt) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).json({ message: "Server error" });
      }
      bcrypt.hash(password, salt, (err, hashedPassword) => {
        if (err) {
          console.error(`%c${err}`, css.error);
          return res.status(500).json({ message: "Server error" });
        }
        const token = crypto.randomBytes(32).toString("hex");
        db.query(
          "INSERT INTO users SET?",
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
              return res.status(500).json({ message: "Server error" });
            }
            console.log(
              `%cUser ${name} registered: ${result}`,
              css.information
            );
            const mailOptions = {
              from: process.env.EMAIL,
              to: email,
              subject: "Bekräftelse av epostadress",
              text: `Klicka på länken för att bekräfta din epostadress: http://localhost:4000/verify?token=${token}`,
            };
            transporter.sendMail(mailOptions, (err, info) => {
              if (err) {
                console.error(`%c${err}`, css.error);
                return res.status(500).send("Server error");
              }
              console.log("%cEmail sent: " + info.response, css.information);
              return res.status(200).json({
                message:
                  "Användare registrerad, bekräfta din epostadress för att bevara ditt konto",
              });
            });
          }
        );
      });
    });
  });
});

app.get("/verify", (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(500).json({ message: "Token saknas" });
  }
  db.query(
    "UPDATE users SET email_verified = 1 WHERE token = ?",
    [token],
    (err, result) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).json({ message: "Server error" });
      }
      console.log(`%cUser email verified: ${result}`, css.information);
      return res.status(200).json({ message: "Email verifierad" });
    }
  );
});

app.get("/delete", (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(500).json({ message: "Token saknas" });
  }
  db.query("DELETE FROM users WHERE token = ?", [token], (err, result) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: "Server error" });
    }
    console.log(`%cUser deleted: ${result}`, css.information);
    return res.status(200).json({ message: "Konto raderat" });
  });
});

app.get("/auth", (req, res) => {
  res.render("auth");
});

app.post("/auth/login", (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ message: "Fyll i alla fält" });
  }
  db.query(
    "SELECT name, email, password FROM users",
    [name],
    async (err, result) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).json({ message: "Server error" });
      }
      const name_array_login = result.map((user) => user.name);
      const password_array_login = result.map((user) => user.password);
      const email_array_login = result.map((user) => user.email);
      if (emailRegex.test(name) && !email_array_login.includes(name)) {
        return res.status(400).json({ message: "Fel inloggningsuppgifter" });
      }
      if (!emailRegex.test(name) && !name_array_login.includes(name)) {
        return res.status(400).json({ message: "Fel inloggningsuppgifter" });
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
        return res.status(400).json({ message: "Fel inloggningsuppgifter" });
      }
      return res.status(200).json({ message: "Inloggad" });
    }
  );
});

app.post("/auth/logout", (req, res) => {
  return res.status(200).json({ message: "Utloggad" });
});

app.post("/auth/forgot", (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Fyll i epostadress" });
  }

  db.query("SELECT email, email_verified FROM users", (err, result) => {
    if (err) {
      console.error(`%c${err}`, css.error);
      return res.status(500).json({ message: "Server error" });
    }
    const email_array_forgot = result.map((user) => user.email);
    const email_verified_array_forgot = result.map(
      (user) => user.email_verified
    );
    if (!email_array_forgot.includes(email)) {
      return res.status(400).json({ message: "Epostadressen finns inte" });
    }
    const email_index = email_array_forgot.indexOf(email);
    if (email_verified_array_forgot[email_index] === 0) {
      return res
        .status(400)
        .json({ message: "Epostadressen är inte verifierad" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Återställning av lösenord",
      text: `Klicka på länken för att återställa ditt lösenord: http://localhost:4000/reset?token=${token}`,
    };
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error(`%c${err}`, css.error);
        return res.status(500).send("Server error");
      }
      console.log(`%cEmail sent: ${info.response}`, css.information);
      db.query(
        "UPDATE users SET token = ? WHERE email = ?",
        [token, email],
        (err, result) => {
          if (err) {
            console.error(`%c${err}`, "color: red;");
            return res.status(500).json({ message: "Server error" });
          }
          console.log(`%cUser token updated: ${result}`, css.information);
        }
      );
    });
    return res.status(200).json({ message: "Ett mail har skickats" });
  });
});

app.post("/auth/discord", async (req, res) => {
  const { code } = req.body;
  const tokenResponseData = await request(
    "https://discord.com/api/oauth2/token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `http://localhost:4000/discordAuth`,
        scope: "identify",
      }).toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  const oauthData = await tokenResponseData.body.json();
  const userResult = await request("https://discord.com/api/users/@me", {
    headers: {
      authorization: `${oauthData.token_type} ${oauthData.access_token}`,
    },
  });
  const discordUser = await userResult.body.json();

  username = discordUser.username;
  displayname = discordUser.global_name;
  console.log(
    `%cKopplat Discord-konto: ${displayname} (${username})`,
    css.information
  );

  db.query("SELECT userID from users");
});

client.login(process.env.DISCORD_TOKEN);

client.on(Events.ClientReady, (readyClient) => {
  console.log(`%cBotten är online som ${readyClient.user.tag}`, css.success);
});

client.on(Events.MessageCreate, (message) => {
  console.log("%cContent not implemented", css.warning);
  message.reply("Content not implemented");
});

const port = 4000;

app.listen(port, () => {
  console.log(`%cServern körs, besök http://localhost:${port}`, css.success);
});
