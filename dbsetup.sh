#!/bin/bash

source .env

echo "Downloading postgresql using apt..."
sudo apt update
sudo apt install postgresql
echo "Complete!"
echo
echo "Downloading gringo using apt..."
sudo apt install gringo
echo "Complete!"
echo
echo "Restart postgresql..."
sudo systemctl stop postgresql
sudo systemctl start postgresql
echo "Complete!"
echo
echo "Cleanup possible previous db and user from postgresql and OS..."
sudo -u postgres dropdb $DB_NAME --if-exists
sudo -u postgres dropuser $DB_USERNAME --if-exists
sudo deluser $DB_USERNAME
echo "Complete!"
echo
echo "Creating new user and db for postgresql and OS..."
sudo useradd $DB_USERNAME
echo -e "$DB_PASSWORD\n$DB_PASSWORD" | sudo passwd $DB_USERNAME
sudo -u postgres psql -c "CREATE USER $DB_USERNAME WITH ENCRYPTED PASSWORD '$DB_PASSWORD';"
sudo -u postgres createdb $DB_NAME
echo "Complete!"
echo
echo "Creating the necessary tables..."

sudo -u $DB_USERNAME psql -c "CREATE TABLE contestants ( \
    nick varchar (50) PRIMARY KEY \
    )"

sudo -u $DB_USERNAME psql -c "CREATE TABLE heroes ( \
    hero varchar (50) PRIMARY KEY, \
    name varchar (50) NOT NULL, \
    young boolean NOT NULL, \
    legend boolean NOT NULL \
    )"

sudo -u $DB_USERNAME psql -c "CREATE TABLE selections ( \
    nick varchar (50) REFERENCES contestants, \
    hero varchar (50) REFERENCES heroes, \
    priority int NOT NULL CHECK (0 < priority AND priority < 6), \
    PRIMARY KEY (nick, hero) \
    )"

sudo -u $DB_USERNAME psql -c "CREATE TABLE assignments ( \
    groupnum int NOT NULL, \
    nick varchar (50) REFERENCES contestants, \
    hero varchar (50) REFERENCES heroes, \
    priority int NOT NULL CHECK (0 < priority AND priority < 6), \
    PRIMARY KEY (groupnum, nick, hero) \
    )"

echo "Complete!"
echo
echo "Populating the heroes table using heroes.txt..."

while IFS=\; read hero name young legend; do
    sudo -u $DB_USERNAME psql -c "INSERT INTO heroes (hero, name, young, legend) \
    VALUES ('$hero', '$name', '$young', '$legend')"
done < heroes.txt

echo "Complete!"
echo "Database is now ready for operation."
echo
