const express = require("express");
const mysql = require("mysql2");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const { SpotifyApi } = require("@spotify/web-api-ts-sdk");

const app = express();
app.set("view engine", "hbs");
dotenv.config({ path: "../.env" });

const emailRegex =
  /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z]{8,35}$/;

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
    user: "your-email-username", // Skriv in din epostadress här
    pass: "your-email-password", // Skriv in ditt epostlösenord här
  },
});

db.connect((err) => {
  if (err) {
    console.error(err);
  } else {
    console.log("Ansluten till MySQL");
  }
});

app.post("/send-verification-email", (req, res) => {
  const email = req.body.email;
  const token = crypto.randomBytes(32).toString("hex");

  // Save the token and email in your database for later verification

  const mailOptions = {
    from: "your-email",
    to: email,
    subject: "Confirm your email address",
    text: `Click on this link to verify your email: http://yourwebsite.com/verify?token=${token}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error sending verification email.");
    } else {
      console.log("Email sent: " + info.response);
      res.send("Verification email sent.");
    }
  });
});

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/register", (req, res) => {
  ö;
  res.render("register");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/auth/register", (req, res) => {
  const { name, email, password, password_confirm } = req.body;
  db.query("SELECT name, email FROM users", (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }
    const name_array = result.map((user) => user.name);
    const email_array = result.map((user) => user.email);
    if (!name || !email || !password || !password_confirm) {
      return res.status(400).json({ message: "Fyll i alla fält" });
    }
    if (name_array.includes(name) || email_array.includes(email)) {
      return res
        .status(400)
        .json({ message: "Användarnamn eller epostadress upptagen" });
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
        console.error(err);
        return res.status(500).json({ message: "Server error" });
      }
      bcrypt.hash(password, salt, (err, hashedPassword) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: "Server error" });
        }
        db.query(
          "INSERT INTO users SET?",
          { name: name, email: email, password: hashedPassword },
          (err, result) => {
            if (err) {
              console.error(err);
              return res.status(500).json({ message: "Server error" });
            } else {
              return res.status(200).json({ message: "Användare registrerad" });
            }
          }
        );
      });
    });
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
        console.error(err);
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

app.listen(4000, () => {
  console.log("Servern körs, besök http://localhost:4000");
});
