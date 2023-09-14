const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
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

app.get("/sm/heroes/cc", async (req, res) => {
  try {
    const query = "SELECT hero, name FROM heroes WHERE NOT young AND NOT legend ORDER BY hero ASC;";
    const dbres = await pool.query(query);

    return res.status(400).json(dbres.rows);
  } catch (error) {
    return res.status(500).end();
  }
})

app.get("/sm/heroes/blitz", async (req, res) => {
  try {
    const query = "SELECT hero, name FROM heroes WHERE young AND NOT legend ORDER BY hero ASC;";
    const dbres = await pool.query(query);

    return res.status(400).json(dbres.rows);
  } catch (error) {
    return res.status(500).end();
  }
})

app.get("/sm/contestants", async (req, res) => {
  try {
    const query = "SELECT * FROM contestants ORDER BY nick ASC;";
    const dbres = await pool.query(query);

    return res.status(400).json(dbres.rows);
  } catch (error) {
    return res.status(500).end();
  }
})

app.get("/sm/selections", async (req, res) => {
  try {
    const query = "SELECT nick, hero, priority FROM selections ORDER BY nick ASC, priority DESC;";
    const dbres = await pool.query(query);

    return res.status(400).json(dbres.rows);
  } catch (error) {
    return res.status(500).end();
  }
})

app.post("/sm/selection", async (req, res) => {
  try {
    const body = req.body;

    if (!body.nick) {
        return res.status(400).send({ error: "no nick given" });
    }

    const sanitizedNick = body.nick.replace(/[^A-Za-z]/g, "").toLowerCase();

    const nickcheck = `SELECT * FROM contestants WHERE nick = '${sanitizedNick}';`;
    const nickres = await pool.query(nickcheck);

    if (nickres.rows.length) {
      return res.status(400).send({ error: "nick already exists" });
    }

    const selections = body.selections;

    if (!selections || selections.length < 3) {
      return res.status(400).send({ error: "too few selections" });
    }

    if (new Set(selections).size !== selections.length) {
      return res.status(400).send({ error: "selections are not unique" });
    }

    for (selection of selections) {
      const herocheck = `SELECT * FROM heroes WHERE hero = '${selection}';`;
      const herores = await pool.query(herocheck);

      if (!herores.rows.length) {
        return res.status(400).send({ error: `hero ${selection} not valid` });
      }
    }

    const contestantquery = `INSERT INTO contestants(nick) VALUES ('${sanitizedNick}');`;
    const contestantres = await pool.query(contestantquery);

    let queryend = "";

    for (const [index, hero] of selections.entries()) {
      if (index === selections.length - 1) {
          queryend += `('${sanitizedNick}', '${hero}', ${5 - index})`;
          break;
      }

      queryend += `('${sanitizedNick}', '${hero}', ${5 - index}), `;
    }

    const query = `INSERT INTO selections(nick, hero, priority) VALUES ${queryend} RETURNING *;`;
    const queryres = await pool.query(query);

    return res.json(queryres.rows);
  } catch (error) {
    return res.status(500).end();
  }
})

app.get("/sm/assignments", async (req, res) => {
  try {
    const query = "SELECT * FROM assignments;";
    const dbres = await pool.query(query);

    return res.json(dbres.rows);
  } catch (error) {
    res.status(500).end();
  }
})

app.delete("/sm/assignments", async (req, res) => {
  try {
    const query = "DELETE FROM assignments;";
    const dbres = await pool.query(query);

    return res.end();
  } catch (error) {
    res.status(500).end();
  }
})

app.post("/sm/runsolver", async (req, res) => {
  try {
    const rmassignquery = "DELETE FROM assignments;";
    const rmassignres = await pool.query(rmassignquery);

    const text = fs.readFileSync('./solvertemplate.lp', 'utf8');

    const heroesquery = "SELECT DISTINCT hero FROM selections ORDER BY hero ASC;";
    const herores = await pool.query(heroesquery);

    const heroes = herores.rows.reduce((acc, curr) => acc + "hero(" + curr.hero + ").\n", "");

    const playersquery = "SELECT nick FROM contestants ORDER BY nick ASC;";
    const playerres = await pool.query(playersquery);

    const players = playerres.rows.reduce((acc, curr) => acc + "player(" + curr.nick + ").\n", "");

    const selquery = "SELECT nick, hero, priority FROM selections ORDER BY nick ASC, priority DESC;";
    const selres = await pool.query(selquery);

    const sels = selres.rows.reduce((acc, curr) => acc + "sel(" + curr.nick + ", " + curr.hero + ", " + curr.priority + ").\n", "");

    const opt = "#maximize { S: total(S) }.";

    const noopttext = text.replace('${HEROES}', heroes).replace('${PLAYERS}', players).replace('${SELECTIONS}', sels);
    const finaltext = noopttext.replace('${OPTIMIZE}', opt);

    fs.writeFileSync('./solver.lp', finaltext);

    // TODO: Try to find a solution without running the script twice
    exec('clingo solver.lp 0 --outf 2 --time-limit 3600 --opt-mode=optN --quiet=1', async (err, stdout, stderr) => {
      const output = JSON.parse(stdout);

      if (output.Result === "OPTIMUM FOUND") {
        const models = output.Call[0].Witnesses;

        for (const [idx, model] of models.entries()) {
          const modeldata = model.Value.map((m) => m.replace('finalsel(', '').replace(')', '').split(','));

          for (const [nick, hero, prio] of modeldata) {
            const assignquery = `INSERT INTO assignments(groupnum, nick, hero, priority) VALUES (${idx}, '${nick}', '${hero}', ${prio});`;
            const assignres = await pool.query(assignquery);
          }
        }
      }

      else {
        const newopt = `:- not total(${-output.Models.Costs[0]}).`;
        const opttext = noopttext.replace('${OPTIMIZE}', newopt);

        fs.writeFileSync('./solver.lp', opttext);

        exec('clingo solver.lp 0 --outf 2', async (err, stdout, stderr) => {
          const output = JSON.parse(stdout);
          const models = output.Call[0].Witnesses;

          for (const [idx, model] of models.entries()) {
            const modeldata = model.Value.map((m) => m.replace('finalsel(', '').replace(')', '').split(','));

            for (const [nick, hero, prio] of modeldata) {
              const assignquery = `INSERT INTO assignments(groupnum, nick, hero, priority) VALUES (${idx}, '${nick}', '${hero}', ${prio});`;
              const assignres = await pool.query(assignquery);
            }
          }

          if (stderr) {
              console.log(stderr);
              return;
          }
        })
      }

      if (stderr) {
          console.log(stderr);
          return;
      }
    });

    return res.end();
  } catch (error) {
    res.status(500).end();
  }
})

const error = (req, res) => {
  res.status(404).send({ error: 'unknown endpoint' });
}

app.use(error);

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
})
