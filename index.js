const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const { exec } = require("child_process");
const { pool } = require("./db");

app.use(cors());
app.use(bodyParser.json());

const logger = (request, _, next) => {
  console.log('Date:  ', new Date().toLocaleString());
  console.log('Method:', request.method);
  console.log('Path:  ', request.path);
  console.log('Body:  ', request.body);
  console.log('---');
  next();
}

app.use(logger);

// Hello world endpoint
app.get("/sm/test", (_, res) => {
  res.send("<h1>Hello World!</h1>");
})

// Get all heroes
app.get("/sm/heroes", async (_, res) => {
  try {
    const query = "SELECT * FROM heroes;";
    const dbres = await pool.query(query);

    return res.json(dbres.rows);
  } catch (error) {
    console.log(error);
    return res.status(500).end();
  }
})

// Get all CC legal heroes
app.get("/sm/heroes/cc", async (_, res) => {
  try {
    const query = "SELECT hero, name FROM heroes WHERE NOT young AND NOT legend ORDER BY hero ASC;";
    const dbres = await pool.query(query);

    return res.json(dbres.rows);
  } catch (error) {
    console.log(error);
    return res.status(500).end();
  }
})

// Get all Blitz legal heroes
app.get("/sm/heroes/blitz", async (_, res) => {
  try {
    const query = "SELECT hero, name FROM heroes WHERE young AND NOT legend ORDER BY hero ASC;";
    const dbres = await pool.query(query);

    return res.json(dbres.rows);
  } catch (error) {
    console.log(error);
    return res.status(500).end();
  }
})

// Get all contestants
app.get("/sm/contestants", async (_, res) => {
  try {
    const query = "SELECT * FROM contestants ORDER BY nick ASC;";
    const dbres = await pool.query(query);

    return res.json(dbres.rows);
  } catch (error) {
    console.log(error);
    return res.status(500).end();
  }
})

// Get all selections by contestants
app.get("/sm/selections", async (_, res) => {
  try {
    const query = "SELECT nick, hero, priority FROM selections ORDER BY nick ASC, priority DESC;";
    const dbres = await pool.query(query);

    return res.json(dbres.rows);
  } catch (error) {
    console.log(error);
    return res.status(500).end();
  }
})

// Add selections by a contestant to the database
app.post("/sm/selection", async (req, res) => {
  try {
    const body = req.body;

    if (!body.nick) {
        return res.status(400).send({ error: "no nick given" });
    }

    // åäö -> aao, filter only the english alphabet, transform to lower case
    const sanitizedNick = body.nick.replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^A-Za-z]/g, "").toLowerCase();

    if (sanitizedNick === "" || sanitizedNick.length > 50) {
      return res.status(400).send({ error: "nick invalid" });
    }

    const nickcheck = "SELECT * FROM contestants;";
    const nickres = await pool.query(nickcheck);
    const nicklist = nickres.rows.map((n) => n.nick);

    if (nicklist.includes(sanitizedNick)) {
      return res.status(400).send({ error: "nick already exists" });
    }

    const selections = body.selections.map((sel) => sel.replace(/[^a-z]/g, ""));

    if (!selections || selections.length < 3 || selections.length > 5) {
      return res.status(400).send({ error: "invalid number of selections" });
    }

    if (new Set(selections).size !== selections.length) {
      return res.status(400).send({ error: "selections are not unique" });
    }

    const heroes = "Select hero FROM heroes;";
    const heroesres = await pool.query(heroes);
    const herolist = heroesres.rows.map((h) => h.hero);

    for (const selection of selections) {
      if (!herolist.includes(selection)) {
        return res.status(400).send({ error: "one of the heroes not valid" });
      }
    }

    const contestantquery = `BEGIN; INSERT INTO contestants(nick) VALUES ('${sanitizedNick}');`;
    await pool.query(contestantquery);

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
    const commit = "COMMIT;";
    await pool.query(commit);

    return res.json(queryres.rows);
  } catch (error) {
    const rollback = "ROLLBACK;";
    await pool.query(rollback);
    console.log(error);
    return res.status(500).end();
  }
})

// Get the hero assignment sets created by the logic script
app.get("/sm/assignments", async (_, res) => {
  try {
    const query = "SELECT * FROM assignments;";
    const dbres = await pool.query(query);

    return res.json(dbres.rows);
  } catch (error) {
    console.log(error);
    res.status(500).end();
  }
})

// Delete the hero assignment sets
app.delete("/sm/assignments", async (_, res) => {
  try {
    const query = "DELETE FROM assignments;";
    await pool.query(query);

    return res.end();
  } catch (error) {
    console.log(error);
    res.status(500).end();
  }
})

// Run the solver, creating the hero assignment sets into DB
app.post("/sm/runsolver", async (_, res) => {
  try {
    // Reset the hero assignments sets
    const rmassignquery = "DELETE FROM assignments;";
    await pool.query(rmassignquery);

    // Get the .lp template which is filled according the DB data
    const text = fs.readFileSync('./solvertemplate.lp', 'utf8');

    // Fill the heroes in the template
    const heroesquery = "SELECT DISTINCT hero FROM selections ORDER BY hero ASC;";
    const herores = await pool.query(heroesquery);

    const heroes = herores.rows.reduce((acc, curr) => acc + "hero(" + curr.hero + ").\n", "");

    // Fill the players in the template
    const playersquery = "SELECT nick FROM contestants ORDER BY nick ASC;";
    const playerres = await pool.query(playersquery);

    const players = playerres.rows.reduce((acc, curr) => acc + "player(" + curr.nick + ").\n", "");

    // Fill the selections in the template
    const selquery = "SELECT nick, hero, priority FROM selections ORDER BY nick ASC, priority DESC;";
    const selres = await pool.query(selquery);

    const sels = selres.rows.reduce((acc, curr) => acc + "sel(" + curr.nick + ", " + curr.hero + ", " + curr.priority + ").\n", "");

    // Fill the optimize in the template
    const opt = "#maximize { S: total(S) }.";

    const noopttext = text.replace('${HEROES}', heroes).replace('${PLAYERS}', players).replace('${SELECTIONS}', sels);
    const finaltext = noopttext.replace('${OPTIMIZE}', opt);

    // Create the logic program file for use by clingo
    fs.writeFileSync('./solver.lp', finaltext);

    // Try to find all optimal hero assignments within an hour of runtime
    // TODO: Try to find a solution without running the script twice
    exec('clingo solver.lp 0 --outf 2 --time-limit 3600 --opt-mode=optN --quiet=1', async (_, stdout, stderr) => {
      const output = JSON.parse(stdout);

      // Success
      if (output.Result === "OPTIMUM FOUND") {
        const models = output.Call[0].Witnesses;

        // Upload the different answer sets to the DB
        for (const [idx, model] of models.entries()) {
          const modeldata = model.Value.map((m) => m.replace('finalsel(', '').replace(')', '').split(','));

          for (const [nick, hero, prio] of modeldata) {
            const assignquery = `INSERT INTO assignments(groupnum, nick, hero, priority) VALUES (${idx}, '${nick}', '${hero}', ${prio});`;
            await pool.query(assignquery);
          }
        }
      }

      // Did not find the optimum in time
      else {
        // Replace the optimize sentence with trying to find all the best solutions that were found in allocated time
        const newopt = `:- not total(${-output.Models.Costs[0]}).`;
        const opttext = noopttext.replace('${OPTIMIZE}', newopt);

        fs.writeFileSync('./solver.lp', opttext);

        // Get all the most optimal solutions found
        exec('clingo solver.lp 0 --outf 2', async (_, stdout, stderr) => {
          const output = JSON.parse(stdout);
          const models = output.Call[0].Witnesses;

          // Upload the different answer sets to the DB
          for (const [idx, model] of models.entries()) {
            const modeldata = model.Value.map((m) => m.replace('finalsel(', '').replace(')', '').split(','));

            for (const [nick, hero, prio] of modeldata) {
              const assignquery = `INSERT INTO assignments(groupnum, nick, hero, priority) VALUES (${idx}, '${nick}', '${hero}', ${prio});`;
              await pool.query(assignquery);
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

    return res.json({ msg: "run started" });
  } catch (error) {
    console.log(error);
    res.status(500).end();
  }
})

const error = (_, res) => {
  res.status(404).send({ error: 'unknown endpoint' });
}

app.use(error);

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
})
