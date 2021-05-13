const fs = require("fs");
const http = require("http");
const https = require("https");
const socketIO = require("socket.io");
const express = require("express");
const cors = require("cors");
const cron = require('node-cron');
const path = require('path');
const DB = require("./db") // import singleton
const {
  env
} = require("process");

function loadFile(hasEnvParam, fileName) {
  return hasEnvParam ? fs.readFileSync(fileName, "utf8").toString().replace(new RegExp("\\\\n", "\g"), "\n") : fs.readFileSync(fileName, "utf8");
}

const exphbs = require('express-handlebars');

const app = express();
// setup handles bars for templating so we can inject variables
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');
app.set("views", path.join(__dirname, "views"))

let protocol = "http://"
const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",") : []


app.use(cors({
  origin: 'https://localhost:8080',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
  // origin: (origin, callback) => {
  //   // allow requests with no origin 
  //   // (like mobile apps or curl requests)
  //   if (!origin) return callback(null, true);
  //   if (allowedOrigins.indexOf(origin) === -1) {
  //     const msg = 'The CORS policy for this site do∂ßes not ' +
  //       'allow access from the specified Origin.';
  //     return callback(new Error(msg), false);
  //   }
  //   return callback(null, true);
  // }
}));


app.use(express.static("public"));

app.get(
  "/.well-known/acme-challenge/sdk7Ne4KyfDw6dLwD39qIqJ8BcFiAWTLYLeZjhE9ylc",
  (req, res) => {
    res.send(
      "sdk7Ne4KyfDw6dLwD39qIqJ8BcFiAWTLYLeZjhE9ylc.VeFbm-Pcx9jG1LNNYKt1-ssk8U1QMse-QJsLzcWPGiI"
    );
  }
);

app.get("/sso/", (req, res) => {
  const {
    ALLOWED_DOMAINS,
  } = env;

  // render the bundle scripts from SSO
  res.render('sso.hbs', {
    ALLOWED_DOMAINS
  });
});

app.get("/sso/bundle.js", (req, res) => {
  let {
    TOP_LEVEL_BASE_URL,
  } = env;

  if (!TOP_LEVEL_BASE_URL) {
    TOP_LEVEL_BASE_URL = req.headers.host
  }

  res.header('Content-Type', 'application/javascript');
  // render the bundle scripts from SSO
  res.render('bundle.hbs', {
    BASE_URL: TOP_LEVEL_BASE_URL,
    PROTOCOL: protocol,
  });
});

app.get("/auth", (req, res) => {
  const {
    GOOGLE_SSO_ID,
  } = env;
  if (!GOOGLE_SSO_ID) {
    console.error("Unable to locate Google SSO key")
    return res.status(500);
  }
  res.render('index.hbs', {
    GOOGLE_SSO_ID,
  });
})

app.get(
  "/get-client-data",
  (req, res) => {
    console.log(req)
    res.send(
      "ok"
    );
  }
);

///////// Include support for loading cert keys via environment parameters for local testing
const privKeyFileName = env.PRIVATE_KEY_PATH || "/etc/letsencrypt/live/aelatgt.net/privkey.pem";
const certFileName = env.CERT_PATH || "/etc/letsencrypt/live/aelatgt.net/cert.pem";
const chainFileName = env.CHAIN_PATH || "/etc/letsencrypt/live/aelatgt.net/chain.pem";

cron.schedule('0 1 * * *', () => {
  // DB.backup()
  console.log("Backup completed")
});

// this will either be an http or https server
var httpServer;

if (
  fs.existsSync(privKeyFileName) &&
  fs.existsSync(certFileName) &&
  fs.existsSync(chainFileName)
) {
  // logic for handling white space issues when running locally with self-signed cert
  const privateKey = loadFile(env.PRIVATE_KEY_PATH, privKeyFileName)
  const certificate = loadFile(env.CERT_PATH, certFileName)
  const ca = loadFile(env.CHAIN_PATH, chainFileName)

  const credentials = {
    key: privateKey,
    cert: certificate,
    ca: [ca],
  };

  httpServer = https.createServer(credentials, app);
  httpServer.listen(3001, () => {
    console.log("HTTPS Server running on port 3001")
    protocol = "https://"
  });
} else {
  console.log("https certs are not available, not starting https server");
  httpServer = http.createServer(app);

  httpServer.listen(3000, () => {
    console.log("HTTP Server running on port 3000");
  });
}

// Starting for either the http or https servers
const io = socketIO.listen(httpServer);

io.sockets.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("ERROR", event => console.error(event));
  socket.on("save", (event) => {
    console.log("sso login event detected")
    const {
      email
    } = event
    if (!email) {
      socket.send("ERROR", {
        message: "Email not found",
        event
      });
      return
    }
    DB.getUser(email).then(userdata => {
      if (!userdata.length) {
        return DB.insertNewUser(email, event).then(user => {
          console.log("New user recreated", user)
          socket.emit("new_user", user)
        }).catch(e => console.log(e))
      }
      console.log("send user data")
      socket.emit("userdata", userdata.pop())
    }).catch(e => console.log(e));
  });
});