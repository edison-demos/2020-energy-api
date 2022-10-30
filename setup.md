## setup swap

sudo fallocate -l 1G /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

## install postgres
as link https://www.postgresql.org/download/linux/debian/

## config postgres

1. sudo -i -u postgres

### postgres cli commands
1. create database energy;
1. create user artilectgreen with password '53745401';
1. grant ALL PRIVILEGES ON DATABASE energy to artilectgreen;

#### let this server postgres listen 0.0.0.0

from: https://zaiste.net/posts/postgresql-allow-remote-connections/

sudo vi /etc/postgresql/13/main/postgresql.conf
change `listen_addresses = '*'`
sudo service postgresql restart

#### PRIVILEGES on access the db

sudo vi /etc/postgresql/13/main/pg_hba.conf
add
```
host    all             all              0.0.0.0/0                       md5
host    all             all              ::/0                            md5
```
sudo service postgresql restart

done  !!

## config server timezone as TW timezone
sudo timedatectl set-timezone Asia/Taipei

## install nginx

sudo apt install nginx

## postgre config

1. create table
1. create user and password oooxxx
1. grand user on table