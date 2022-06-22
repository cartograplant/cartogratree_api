# Requirements
 * NodeJs v8.11.2
 * NPM v5.6.0

# Server setup
 * Create a directory for this API (say `cartogratree/api`), copy these files into it, change directory (`cd cartogratree/api`).
 * Install the following modules.
   * `$ npm install express pg --save`
 * Replace the values for `host`, `port`, `database`, `user`, and `password` in `query.js`.

## Configure it to run as a service
Assumptions:
 * CentOS
 * `PM2` is not installed

### Install `PM2` and run it as a service
```bash
$ sudo npm install pm2@latest -g
$ sudo pm2 startup systemd
## confirm that it's running
$ sudo systemctl status pm2-root.service
```

### Start `CartograTree API` and add it to PM2's process list
```bash
$ pm2 start cartogratree_api
## to [stop|start|restart|get info] run:
$ pm2 [stop|start|restart|info] cartogratree_api
```