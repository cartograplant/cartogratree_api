'use strict';
const config = require('./config');
const pg_bienv4 = new require('pg').Pool(config.conf_bienv4);

module.exports = async function(queryText, queryValues, callback) {
  pg_bienv4.connect(function(db_error, client, release) {
    if(db_error) return callback(db_error);	// connection failure

    (async function() {
		client.query(queryText, queryValues, function(qry_error, result) {
		  release();				// release the client

		  if(qry_error) return callback(qry_error);	// query error

		  //return callback(null, result.rows, result);
		  return callback(null, result.rows, result, queryValues);
		});
	})();
  });
}