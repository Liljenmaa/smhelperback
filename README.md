# smhelperback
The backend of Sankarien Mittelö tournament helper

# Installation

Setup backend:
```
npm install
```

Setup `.env` using `.env.template`. Remember to use double quotes for strings.

Setup and run database (note, will install psql, clingo and setup a new user called "smhelper" in the OS):
```
sudo ./dbsetup.sh
```

Run backend:
```
node index.js
```

Reverse proxy port 80 and / or port 443 traffic from "/sm/*" to port 5001 using your favourite method.
