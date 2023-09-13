const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const { exec } = require("child_process");
const { pool } = require("./db");

app.use(cors());
app.use(bodyParser.json());

const logger = (request, response, next) => {
  console.log('Method:', request.method);
  console.log('Path:  ', request.path);
  console.log('Body:  ', request.body);
  console.log('---');
  next();
}

app.use(logger);

app.get("/sm/test", (req, res) => {
  res.send("<h1>Hello World!</h1>");
})

app.get("/sm/heroes", async (req, res) => {
  try {
    const query = "SELECT * FROM heroes;";
    const dbres = await pool.query(query);

    return res.status(400).json(dbres.rows);
  } catch (error) {
    return res.status(500).end();
  }
})

/*

app.post("/sm/selection", async (req, res) => {
  try {
    const body = req.body;
    const nick = req.nick;

    const nickcheck = `SELECT * FROM selections WHERE nick = ${nick};`;
    const nickres = await pool.query(nickcheck);

    if (nickres.rows) {
      return res.status(400).json({ error: "nick already exists" });
    }

    const selections = req.selections;
    let queryend = "";

    for (const [index, hero] of selections.entries()) {
      if (index === selections.length - 1) {
          queryend += `('${nick}', '${hero}', ${5 - index});`;
          break;
      }

      queryend += `('${nick}', '${hero}', ${5 - index}), `;
    }

    const query = "INSERT INTO selections(nick, hero, priority) VALUES" + queryend;
  } catch (error) {
    return res.status(500).end();
  }
})

app.get("/sm/assignments", async (req, res) => {
  try {
    const query = "SELECT * FROM assignments;";
    const dbres = await pool.query(query);

    if (!dbres.rows.length) {
      const assignmentquery = "SELECT * FROM selections ORDER BY nick ASC, priority DESC;";
      const assignmentres = await pool.query(assignmentquery);

      return res.json(assignmentres.rows);
      // const addtodb = "INSERT INTO assignments(nick, hero, priority)";
    }

    return res.json(dbres.rows);
  } catch (error) {
    res.status(500).end();
  }
})

app.delete("/sm/assignments", async (req, res) => {
  try {
    const query = "DELETE * FROM assignments;";
    const dbres = await pool.query(query);

    return res.json(dbres.rows);
  } catch (error) {
    res.status(500).end();
  }
})

*/

const error = (req, res) => {
  res.status(404).send({error: 'unknown endpoint'});
}

app.use(error);

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
})
