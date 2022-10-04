//nodejs libraries
const request = require("request");
const ct_cache = require("memory-cache");
const crypto = require("crypto");
//js files 
const utils = require("./../utils");
const query = require("./../query");

function generate_api_key(res, hashed_id, user_id, rewrite=false) {
	crypto.randomBytes(16, (error, buf) => {
		if (error) {
			console.log(err);
			res.status(400);
			return;
		}
			
		var key = "ct-" + hashed_id + "-" + buf.toString("hex");
		var encrypted_key = utils.encrypt(key).toString("hex");
		var date_time = utils.generate_date_time();
		
		if (rewrite) {
			console.log("replace key");
			query ("UPDATE ct_api_keys SET api_key = $1, date_created = $2 WHERE user_id = $3", [encrypted_key, date_time, user_id], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				res.status(200).json(key);
				return;
			});
		}
		else {
			query ("INSERT INTO ct_api_keys (api_key, date_created, user_id) VALUES ($1, $2, $3)", [encrypted_key, date_time, user_id], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				res.status(200).json(key);
				return;
			});
		}
	});
}

exports.get_api_key = function(req, res, next) {
	try {	
		var user_id = req.query.user_id;
		var new_key = req.query.new_key == "true";

		query ("SELECT * FROM ct_api_keys WHERE user_id = $1", [user_id], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			if(user_id != undefined) {
				var hashed_id = crypto.createHash("sha256").update(user_id).digest().toString("hex").substring(0,32);
				if (rows.length > 0) {
					if (!new_key) {
						var encrypted_key = rows[0]["api_key"];
						var decrypted_key = utils.decrypt(encrypted_key);
						res.status(200).json(decrypted_key);
						return;
					}
					else {
						generate_api_key(res, hashed_id, user_id, true);
					}
				}
				else {
					generate_api_key(res, hashed_id, user_id);
				}
			}
			else {
				console.log("Could not get api key since user_id was undefined");
				res.status(400);
				return;
			}
		});
	}
	catch (err) {
		console.log(err);
	}
}


/**
 * Saves the given session and the map state
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.session_save = function(req, res, next) {	
	var session_data = req.body["data"];
	var date_time = utils.generate_date_time();
	query ("INSERT INTO ct_sessions (updated_at, selected_filters, selected_layers, zoom, pitch, bearing, center, included_trees, session_id) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (session_id) DO UPDATE SET updated_at = $1, selected_filters = $2, selected_layers = $3, zoom = $4, pitch = $5, bearing = $6, center = $7, included_trees = $8",
		[
			date_time,
			session_data["filters"],
			session_data["layers"],
			session_data["user_data"]["zoom"],
			session_data["user_data"]["pitch"],
			session_data["user_data"]["bearing"],
			session_data["user_data"]["center"],
			JSON.stringify(session_data["user_data"]["included_trees"]), 
			session_data["session_id"],
		],
		function (err, rows, result) {
			if (err) {
				res.status(400).json(err);
				return;
			}
			res.status(200).json("success");
			return;
		}
	);
}

/**
 * Saves the given session related to a user
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.session_save_user = function(req, res, next) {
	var user_session_data = req.body["data"];	

	query ("INSERT INTO ct_sessions_user (user_id, title, comments, session_id) VALUES($1, $2, $3, $4) ON CONFLICT(user_id, session_id) DO UPDATE SET title = $2, comments = $3",
		[
			user_session_data["user_id"],
			user_session_data["title"],
			user_session_data["comments"],
			user_session_data["session_id"],
		],
		function (err, rows, result) {
			if (err) {
				res.status(400).json(err);
				return;
			}
			res.status(200).json("success");
			return;
		}
	);
}

/**
 * Gets session information based on the given session_id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.session_get = function(req, res, next) {
	var session_id = req.query.session_id;
	var api_key = req.query.api_key;

	utils.valid_api_key(api_key, res, function() {	
		query ("SELECT * FROM ct_sessions WHERE session_id = $1", [session_id], function (err, rows, result) {
			if (err) {
				res.status(400).json(err);
				return;
			}
			if (rows.length == 0) {
				res.status(200).json(null);
				return;
			}
			else {
				var session_data = {};
				session_data["layers"] = rows[0]["selected_layers"];
				session_data["filters"] = rows[0]["selected_filters"];
				session_data["zoom"] = rows[0]["zoom"];
				session_data["pitch"] = rows[0]["pitch"];
				session_data["bearing"] = rows[0]["bearing"];
				session_data["center"] = rows[0]["center"];
				session_data["included_trees"] = rows[0]["included_trees"]
				session_data["session_id"] = session_id;
				res.status(200).json(session_data);
				return;
			}
		});
	});
}

/**
 * Gets the session associated with a given user, only returns the basic save session information
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.session_get_user = function(req, res, next) {
	var user_id = req.query.user_id;
	var session_id = req.query.session_id;
	var api_key = req.query.api_key;

	utils.valid_api_key(api_key, res, function() {
		utils.execute_request("SELECT * FROM ct_sessions_user WHERE user_id = $1 AND session_id = $2", [user_id, session_id], res, next);
	});	
}

/**
 * Gets all the sessions and the session information of a given user
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.sessions_all_get_user = function(req, res, next) {
	var user_id = req.query.user_id;
	//var session_id = req.query.session_id;
	var api_key = req.query.api_key;
	
	utils.valid_api_key(api_key, res, function() {
		query (
			"SELECT * FROM ct_sessions s JOIN ct_sessions_user su ON s.session_id = su.session_id WHERE su.user_id = $1 ORDER BY s.updated_at DESC",
			[user_id],
			function (err, rows, result) {
				if (err) {
					res.status(400).json(err);
					return;
				}
				var user_sessions = [];
				for (var i = 0; i < rows.length; i++) {
					user_sessions.push({
						"title": rows[i]["title"],
						"comments": rows[i]["comments"],
						"session_id": rows[i]["session_id"],
						"layers": rows[i]["selected_layers"],
						"filters": rows[i]["selected_filters"],
						"zoom": rows[i]["zoom"],
						"pitch": rows[i]["pitch"],
						"bearing": rows[i]["bearing"],
						"center": rows[i]["center"],
						"updated_at": rows[i]["updated_at"],
						"included_trees": rows[i]["included_trees"]
					});
				}	
				res.status(200).json(user_sessions);	
				return;	
			}
		);
	});
}

/**
 * Deletes a session from the database
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.session_delete = function(req, res, next) {
	var session_id = req.query.session_id;
	var user_id = req.query.user_id;
	var api_key = req.query.api_key;

	utils.valid_api_key(api_key, res, function() {
		query (
			"DELETE FROM ct_sessions_user WHERE session_id = $1 AND user_id = $2", 
			[session_id, user_id], 
			function(err, rows, result) {
				if (err) {
					res.status(400).json(err);
					return;
				}
			}
		);
		
		query (
			"DELETE FROM ct_sessions WHERE session_id = $1", 
			[session_id], 
			function(err, rows, result) {
				if (err) {
					res.status(400).json(err);
					return;
				}
			}
		);

		res.status(200);
		return;
	});
}

/**
 * Creates a new session
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.session_create = function(req, res, next) {
	var session_id = req.query.session_id;	
	//var api_key = req.query.api_key;
	/*
	console.log("creating session, key: " + api_key);
	utils.valid_api_key(api_key, res, function() {
	

	console.log("creating session, " + session_id);
		query (
			"INSERT INTO ct_sessions (session_id) VALUES ($1)", 
			[session_id],
			function (err, rows, result) {
				if (err) {
					res.status(400).json(err);
					return;
				}
			}
		);	
		res.status(200);
		return;
	//});
	*/


	res.status(200);
	return;
}

