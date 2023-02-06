'use strict';
const config = require('./config');
// The below code was used for node Version 8
// const pg = new require('pg').Pool(config.conf);
// This code works for node version 16
const { Pool } = require('pg');
const pg = new Pool(config.conf);

module.exports = function(queryText, queryValues, callback) {
  pg.connect(function(db_error, client, release) {
    if(db_error) return callback(db_error);	// connection failure

    client.query(queryText, queryValues, function(qry_error, result) {
      release();				// release the client

      if(qry_error) return callback(qry_error);	// query error

      return callback(null, result.rows, result);
    });
  });
}
