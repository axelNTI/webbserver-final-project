const express = require("express");
const mysql = require("mysql2");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

const app = express();
app.set("view engine", "hbs");
dotenv.config({ path: "../.env" });

// Regex för att validera epostadress
// https://stackoverflow.com/questions/46155/how-can-i-validate-an-email-address-in-javascript
const emailRegex =
  /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

// Regex för att validera lösenord
const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z]{8,35}$/;

const db = mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
});

app.use(express.urlencoded({ extended: "false" }));
app.use(express.json());

db.connect((error) => {
  if (error) {
    console.error(error);
  } else {
    console.log("Ansluten till MySQL");
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

  // Hämtar alla användarnamn och epostadresser från databasen
  db.query("SELECT name, email FROM users", (err, result) => {
    if (err) {
      console.error(err);
      // Om det blir ett fel så skickas ett felmeddelande till klienten
      return res.status(500).json({ message: "Server error" });
    }

    // Skapar en array med alla användarnamn och en array med alla epostadresser
    const name_array = result.map((user) => user.name);
    const email_array = result.map((user) => user.email);

    // Om något av fälten är tomma så skickas ett felmeddelande till klienten
    if (!name || !email || !password || !password_confirm) {
      return res.status(400).json({ message: "Fyll i alla fält" });
    }

    // Om användarnamnet eller epostadressen redan finns i databasen så skickas ett felmeddelande till klienten
    if (name_array.includes(name) || email_array.includes(email)) {
      console.log("Användarnamn eller epostadress upptagen");
      return res
        .status(400)
        .json({ message: "Användarnamn eller epostadress upptagen" });
    }

    // Om lösenorden inte matchar så skickas ett felmeddelande till klienten
    if (password !== password_confirm) {
      return res.status(400).json({ message: "Lösenorden matchar inte" });
    }

    // Om epostadressen inte är en giltig epostadress så skickas ett felmeddelande till klienten
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Ogiltig epostadress" });
    }

    // Om användarnamnet är en epostadress så skickas ett felmeddelande till klienten
    if (emailRegex.test(name)) {
      return res
        .status(400)
        .json({ message: "Användarnamn får inte vara en epostadress" });
    }

    // Om lösenordet inte matchar regexen så skickas ett felmeddelande till klienten
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Lösenordet måste innehålla mellan 8 och 35 tecken, varav minst en siffra, en stor bokstav och en liten bokstav",
      });
    }

    // Om alla valideringar är godkända så krypteras lösenordet och användaren läggs till i databasen
    bcrypt.genSalt(10, (err, salt) => {
      if (err) {
        console.error(err);

        // Om det blir ett fel så skickas ett felmeddelande till klienten
        return res.status(500).json({ message: "Server error" });
      }
      bcrypt.hash(password, salt, (err, hashedPassword) => {
        if (err) {
          console.error(err);

          // Om det blir ett fel så skickas ett felmeddelande till klienten
          return res.status(500).json({ message: "Server error" });
        }

        // Lägger till användaren i databasen
        db.query(
          "INSERT INTO users SET?",
          { name: name, email: email, password: hashedPassword },
          (err, result) => {
            if (err) {
              console.error(err);

              // Om det blir ett fel så skickas ett felmeddelande till klienten
              return res.status(500).json({ message: "Server error" });
            } else {
              // Om användaren har lagts till så skickas ett meddelande till klienten
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

  // Om något av fälten är tomma så skickas ett felmeddelande till klienten
  if (!name || !password) {
    return res.status(400).json({ message: "Fyll i alla fält" });
  }

  // Hämtar alla användarnamn, emails och epostadresser från databasen
  db.query(
    "SELECT name, email, password FROM users",
    [name],
    async (err, result) => {
      if (err) {
        console.error(err);

        // Om det blir ett fel så skickas ett felmeddelande till klienten
        return res.status(500).json({ message: "Server error" });
      }

      // Skapar en array med alla användarnamn, en array med alla lösenord och en array med alla epostadresser
      const name_array_login = result.map((user) => user.name);
      const password_array_login = result.map((user) => user.password);
      const email_array_login = result.map((user) => user.email);

      // Om användarnamnet eller epostadressen inte finns i databasen så skickas ett felmeddelande till klienten
      if (emailRegex.test(name) && !email_array_login.includes(name)) {
        return res.status(400).json({ message: "Fel inloggningsuppgifter" });
      }
      if (!emailRegex.test(name) && !name_array_login.includes(name)) {
        return res.status(400).json({ message: "Fel inloggningsuppgifter" });
      }

      // Om användarnamnet eller epostadressen finns i databasen så kollar vi om lösenordet matchar
      let index;
      if (emailRegex.test(name)) {
        index = email_array_login.indexOf(name);
      } else {
        index = name_array_login.indexOf(name);
      }
      const hashedPassword = password_array_login[index];
      const passwordMatch = await bcrypt.compare(password, hashedPassword);

      // Om lösenordet inte matchar så skickas ett felmeddelande till klienten
      if (!passwordMatch) {
        return res.status(400).json({ message: "Fel inloggningsuppgifter" });
      }

      // Om användaren har loggat in så skickas ett meddelande till klienten
      return res.status(200).json({ message: "Inloggad" });
    }
  );
});

app.listen(4000, () => {
  console.log("Servern körs, besök http://localhost:4000");
});
