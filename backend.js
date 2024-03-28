const express = require("express");
const mysql = require("mysql2");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const { SpotifyApi } = require("@spotify/web-api-ts-sdk");
const { read } = require("fs");

const app = express();
app.set("view engine", "hbs");
dotenv.config({ path: "../.env" });

const client = new Client({
  intents: 8,
});

const emailRegex =
  /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z]{8,35}$/;

function mailOptions(email, token) {
  return {
    from: process.env.EMAIL,
    to: email,
    subject: "Confirm your email address",
    text: `Click on this link to verify your email: http://localhost:4000/verify?token=${token}\n\nIf you did not register, click on this link to delete the account: http://localhost:4000/delete?token=${token}`,
  };
}

const db = mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
});

app.use(express.urlencoded({ extended: "false" }));
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

db.connect((err) => {
  if (err) {
    console.error(`%c${err}`, "color: red;");
  } else {
    console.log("%cAnsluten till MySQL", "color: green;");
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

app.post("/auth/register", (req, res) => {
  const { name, email, password, password_confirm } = req.body;
  db.query("SELECT name, email, email_verified FROM users", (err, result) => {
    if (err) {
      console.error(`%c${err}`, "color: red;");
      return res.status(500).json({ message: "Server error" });
    }
    const name_array = result.map((user) => user.name);
    const email_array = result.map((user) => user.email);
    const email_verified_array = result.map((user) => user.email_verified);
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
      transporter.sendMail(mailOptions(email, token), (err, info) => {
        if (err) {
          console.error(`%c${err}`, "color: red;");
          return res.status(500).send("Server error");
        }
        console.log("Email sent: " + info.response);
        db.query(
          "UPDATE users SET token = ? WHERE email = ?",
          [token, email],
          (err, result) => {
            if (err) {
              console.error(`%c${err}`, "color: red;");
              return res.status(500).json({ message: "Server error" });
            }
            console.log(`User token updated: ${result}`);
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
        console.error(`%c${err}`, "color: red;");
        return res.status(500).json({ message: "Server error" });
      }
      bcrypt.hash(password, salt, (err, hashedPassword) => {
        if (err) {
          console.error(`%c${err}`, "color: red;");
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
              console.error(`%c${err}`, "color: red;");
              return res.status(500).json({ message: "Server error" });
            }
            console.log(`User ${name} registered: ${result}`);

            transporter.sendMail(mailOptions(email, token), (err, info) => {
              if (err) {
                console.error(`%c${err}`, "color: red;");
                return res.status(500).send("Server error");
              }
              console.log("Email sent: " + info.response);
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
        console.error(`%c${err}`, "color: red;");
        return res.status(500).json({ message: "Server error" });
      }
      console.log(`User email verified: ${result}`);
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
      console.error(`%c${err}`, "color: red;");
      return res.status(500).json({ message: "Server error" });
    }
    console.log(`User deleted: ${result}`);
    return res.status(200).json({ message: "Konto raderat" });
  });
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
        console.error(`%c${err}`, "color: red;");
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

client.login(process.env.DISCORD_TOKEN);

client.on(Events.ClientReady, (readyClient) => {
  console.log(
    `%cBotten är online som ${readyClient.user.tag}`,
    "color: green;"
  );
});

client.on(Events.MessageCreate, (message) => {
  if (message.content === "!ping") {
    message.reply("Pong!");
  }
});

app.listen(4000, () => {
  console.log("%cServern körs, besök http://localhost:4000", "color: green;");
});
