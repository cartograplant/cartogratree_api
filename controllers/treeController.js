//nodejs libraries
const { PerformanceObserver, performance } = require('perf_hooks');
const request = require("request");
const ct_cache = require("memory-cache");
var fs = require('fs');
//dependencies js
const config = require('./../config');
const utils = require("./../utils");
const query = require("./../query");
const query_bienv4 = require("./../query_bienv4"); //to cater for BIENv4 data
var pg_native_client = require('pg-native');
const { spawn } = require('child_process');
const { fork } = require('child_process');
const retus = require("retus");
const { parse } = require("node-html-parser");
//var pgsync = require('pg-sync');
const cache_time_24 = 72*60*60*1000;
const JSONdb = require('simple-json-db');
var db_storage = new JSONdb(__dirname + '/../storage.json', {asyncWrite: true, syncOnWrite: true});
const treeController_functions = require('./treeController_functions');
exports.db_storage = db_storage;

require("tls").DEFAULT_ECDH_CURVE = "auto";

/**
 * This gets called when the WFID website creates, changes or deletes an observation on their side
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.wfid_observation_action_hook = function(req, res, next) {
	try {
		console.log(req.body);
		db_storage.set('wfid_observation_action_hook_last', req.body);
		var verification_code = req.body.verification_code;
		var data = req.body.data;
		data = data.events;
		// Technically this for statement will only have one item 
		for(var i=0; i<data.length; i++) {
			var observation_id = data[i].id;
			var operation = data[i].operation;
			var type = data[i].type;
			if(type == 'observation') {
				if (operation == 'delete') {
					utils.wfid_delete_tree(observation_id);
				}
				else {
					// delete
					utils.wfid_delete_tree(observation_id);

					var url = config.conf_wfid.host + '/api/v1/third-party/single-observation/' + observation_id;
					// pull the new observation data
					request.get(
						{
						  url: url,
						  json: {},
						  headers: {
							  'User-Agent': 'my request',
							  'Authorization': 'Bearer ' + oauth_object.access_token,
							  'Content-Type': 'application/json',
							  'Accept': 'application/json'
						  }
						},
						function(error, response, body){
						  // console.log(error);
						  // console.log(response);
						  // console.log(body);


						  // Technically, this should only get one tree since the endpoint should only have one observation
						  for(var i=0; i < body.data.length; i++) {
							  try {
								var observation_object = body.data[i];
								var fuzzy_coordinates = fuzifyCoorinates(observation_object.location.latitude, observation_object.location.longitude);
								var current_species = observation_object.species[0].latin_name;
								var current_genus = observation_object.species[0].latin_name.split(' ')[0];
								var row = {
									uniquename : 'WFID-' + observation_object.id,
									genus : current_genus,
									species : current_species,
									latitude : fuzzy_coordinates.latitude,
									longitude : fuzzy_coordinates.longitude,
									subkingdom : '',
									family : '',
									source_id : 4,
									icon_type : 6,
									coordinate_type : 1
								}

								var species_parts = current_species.split(' ');
								// species_parts must contain at least 2 pieces (genus + species) to be valid
								if(species_parts.length >= 2) {
									if(species_parts[1] != '') {
										// Use the species_corrections CSV to either ignore or rename
										var species_corrections = ct_cache.get('species_corrections');
										var operation = null;
										var correction = null;
										for(var j=0; j<species_corrections.length; j++) {
											if(species_corrections[j].species.toLowerCase() == current_species.trim().toLowerCase()) {
												operation = species_corrections[j].operation;
												correction = species_corrections[j].correction;
												// Since we found a correction, break out of the loop
												break;
											}
										}

										if(operation == 'ignore') {
											// do not add tree (left empty)
										}
										else {
											if(operation == 'rename') {
												// Set the species with the new correction
												row.species = correction;
												row.genus = correction.split(' ')[0];
												console.log('Species correction: replacing ' + current_species + ' with ' + correction);
											}

											// Add tree if not ignore
											utils.wfid_insert_tree(row);
										}
									}
								}
							  }
							  catch(err) {
								  console.log(err);
							  }
				
						  }
						}
						
					); 				

					// insert the new data
					// utils.wfid_insert_tree(row);
				}
			}
		}
   }
   catch (err) {
     console.log(err);
   }
   res.status(200).json({result: 'done'});
 }


/**
 * This requests a new oauth token for World Forest ID
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.wfid_oauth_token_request = function(req, res, next) {
  try {
    treeController_functions.wfid_oauth_token_request_function(config,request,db_storage); // did it this way so the function can also be called outside of an express call
    res.status(200).json({result: 'done'});
  }
  catch (err) {
    console.log(err);
  }
}



/**
 * This requests all observations from WFID
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.wfid_import_observations_all = async function(req, res, next) {
  try {
	var api_superuser_password = req.query.asup;
	//console.log('API SUPERUSER PASSWORD:' + config.conf.api_superuser_password);
	if(config.conf.api_superuser_password == api_superuser_password) {
		console.log(req.query);

		var oauth_object = db_storage.get('wfid_oauth_object');
		console.log(oauth_object);
		if(oauth_object != undefined) {
			var url = config.conf_wfid.host + '/api/v1/third-party/observations';
			console.log('observations url', url);
			console.log(oauth_object.access_token);
			await wfid_import_observations_page(url, oauth_object);
		}      
		res.status(200).json({result: 'done'});
	}
	else {
		res.status(200).json({result: 'asup required'});
	}
  }
  catch (err) {
    console.log(err);
  }
}

async function wfid_import_observations_page(url, oauth_object) {
	await sleep(2500);
    request.get(
		{
		  url: url,
		  json: {},
		  headers: {
			  'User-Agent': 'my request',
			  'Authorization': 'Bearer ' + oauth_object.access_token,
			  'Content-Type': 'application/json',
			  'Accept': 'application/json'
		  }
		},
		function(error, response, body){
		  // console.log(error);
		  // console.log(response);
		  // console.log(body);
		  console.log(body.next_page_url);
		  for(var i=0; i < body.data.length; i++) {
			  try {
				var observation_object = body.data[i];
				var fuzzy_coordinates = fuzifyCoorinates(observation_object.location.latitude, observation_object.location.longitude);
				var current_species = observation_object.species[0].latin_name;
				var current_genus = observation_object.species[0].latin_name.split(' ')[0];
				var species_parts = current_species.split(' ');
				// console.log(species_parts);
				// species_parts must contain at least 2 pieces (genus + species) to be valid
				if(species_parts.length >= 2) {
					if(species_parts[1] != '') {
						var row = {
							uniquename : 'WFID-' + observation_object.id,
							genus : current_genus,
							species : current_species,
							latitude : fuzzy_coordinates.latitude,
							longitude : fuzzy_coordinates.longitude,
							subkingdom : '',
							family : '',
							source_id : 4,
							icon_type : 6,
							coordinate_type : 1
						}


						// Use the species_corrections CSV to either ignore or rename
						var species_corrections = ct_cache.get('species_corrections');
						// console.log(species_corrections);
						var operation = null;
						var correction = null;
						for(var j=0; j<species_corrections.length; j++) {
							if(species_corrections[j].species.toLowerCase() == current_species.trim().toLowerCase()) {
								operation = species_corrections[j].operation;
								correction = species_corrections[j].correction;
								// Since we found a correction, break out of the loop
								break;
							}
						}

						if(operation == 'ignore') {
							// do not add tree (left empty)
						}
						else {
							if(operation == 'rename') {
								// Set the species with the new correction
								row.species = correction;
								row.genus = correction.split(' ')[0];
								console.log('Species correction: replacing ' + current_species + ' with ' + correction);
							}

							// Add tree if not ignore
							utils.wfid_insert_tree(row);
						}
					}  
				}
			  }
			  catch(err) {
				  console.log(err);
			  }

		  }
		  if(body.next_page_url != null && body.next_page_url != undefined && body.next_page_url != 'null') {
			  wfid_import_observations_page(body.next_page_url, oauth_object);
		  }
		  else {
			wfid_consolidate_metadata_function();
		  }
		}
	); 	
}

function fuzifyCoorinates(original_latitude, original_longitude) {
	// Generate fuzzified coordinates.  Transform by 10,000 to ensure mt_rand is working on integers
	var miles = 5;
	//72.4637681159 = 1000 / 69 miles per lat/2 for radius
	var range = miles * 72.4637681159;
	var latitude = 0;
	var longitude = 0;
	var latitude = original_latitude * 10000 + generateRandomDouble(range * (-1), range);
	var longitude = original_longitude * 10000 + generateRandomDouble(range * (-1), range);

	var coordinates_object =  {
		'latitude' : latitude / 10000,
		'longitude' : longitude / 10000,
	}
	// console.log(coordinates_object);
	return coordinates_object;
}

var generateRandomDouble = function(min, max) {
    if(min > max) {
        throw new Error('Minimum value should be smaller than maximum value.');
    }
    var range = max - min;
    return min + range * Math.random();
};

/**
 * This should return overlapping genotypes by study
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.genotypes_overlapping_by_study_ids = function(req, res, next) {
	console.log('gentypes_overlapping_by_study_ids');
	console.log(req.body.studies);
	var studies = [];
	if(req.body.studies != undefined) {
		studies = JSON.parse(req.body.studies); // should be an array
	}
	if(studies.length > 0) {
		var query_str = 'SELECT accessions, cardinality(markers) FROM chado.test_studies_marker_overlap WHERE ';
		console.log(query_str);
		for(var i=0; i<studies.length; i++) {
			if(i > 0) {
				query_str += " AND '" + studies[i] + "' = ANY (accessions) ";
			}
			else {
				query_str += " '" + studies[i] + "' = ANY (accessions) ";
			}
		}
		if(studies.length > 0) {
			query_str += ' AND cardinality(accessions) = ' + studies.length
		}
		console.log(query_str);
		query (query_str, [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
		}
		//console.log(rows);

		res.status(200).json(rows);
		});
	}
	else {
		var rows = [];
		res.status(200).json(rows);
	}
 }

/**
 * This function will perform query to delete none overlapping markers
 * for studies specified that have been stored in the analysis_data
 * for a specific analysis_id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
 exports.analysis_delete_markers_study_none_overlaps = async function(req, res, next) {
	try {
		var results = {
			updated: false
		};

		// Let us use query synchronized for procedural querying
		var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		pg_n_client.querySync("set datestyle='ISO';");
		pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		pg_n_client.querySync("SET bytea_output TO escape;");
		pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.body.analysis_id;
		var study_ids_arr = JSON.parse(req.body.study_ids_arr);
		var variable_name = "studies_snp_none_overlap_" + study_ids_arr.join("_");
		console.log('Deleting ' + variable_name + ' for analysis_id ' + analysis_id);
		
		// Delete the row if this already exists (just in case)
		var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
		pg_n_client.querySync(query_str,[variable_name,analysis_id]);
		results['updated'] = true;

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		pg_n_client.end();
				
	}
	catch(err) {
		console.log(err);
	}
	res.send(JSON.stringify(results));
 }

/**
 * This function will perform query to delete overlapping markers
 * between the studies specified that have been stored in the analysis_data
 * for a specific analysis_id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
 exports.analysis_delete_markers_study_overlaps = async function(req, res, next) {
	try {
		var results = {
			updated: false
		};

		// Let us use query synchronized for procedural querying
		var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		pg_n_client.querySync("set datestyle='ISO';");
		pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		pg_n_client.querySync("SET bytea_output TO escape;");
		pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.body.analysis_id;
		var study_ids_arr = JSON.parse(req.body.study_ids_arr);
		var variable_name = "studies_snp_overlap_" + study_ids_arr.join("_");
		console.log('Deleting ' + variable_name + ' for analysis_id ' + analysis_id);
		
		// Delete the row if this already exists (just in case)
		var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
		pg_n_client.querySync(query_str,[variable_name,analysis_id]);
		results['updated'] = true;

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		pg_n_client.end();
				
	}
	catch(err) {
		console.log(err);
	}
	res.send(JSON.stringify(results));
 }

/**
 * This function will perform query to check for markers that do not overlap
 * for a study and stores it in the cartogratree_analysis_data table
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
exports.analysis_insert_markers_study_none_overlaps = async function(req, res, next) {
	try {
		var results = {
			updated: false
		};		
		// Let us use query synchronized for procedural querying
		var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		pg_n_client.querySync("set datestyle='ISO';");
		pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		pg_n_client.querySync("SET bytea_output TO escape;");
		pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.body.analysis_id;
		var study_ids_arr = JSON.parse(req.body.study_ids_arr);
		var variable_name = "studies_snp_none_overlap_" + study_ids_arr.join("_");		

		for(var i=0; i<study_ids_arr.length; i++) {
			var study_id = study_ids_arr[i];


			// Delete the row if this already exists (just in case)
			var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
			pg_n_client.querySync(query_str,[variable_name,analysis_id]);

			var query_str = "";
			query_str += "select markers from (";
			query_str += "select markers from (select array(";
			query_str += "(select unnest(markers) from markers_and_studies_names where accession = '" + study_id + "')";
			query_str += " EXCEPT ";
			query_str += "(select distinct markers from ";
			query_str += "(select unnest(markers) as markers from test_studies_marker_overlap WHERE '" + study_id + "' = ANY (accessions))w) ";
			query_str += ")";
			query_str += "as markers )";
			query_str += "x)";
			query_str += "y;";

			// results['query_str'] = query_str;
			
			var rows = pg_n_client.querySync(query_str);
			if(rows.length > 0) {
				// overlap_none[study_id] = rows[0]['cardinality'];
				var markers = rows[0].markers;

				var query_str = "INSERT INTO cartogratree_analysis_data (analysis_id, variable_name, variable_data)";
				query_str += " VALUES ($1,$2,$3)";
				pg_n_client.querySync(query_str, [analysis_id,variable_name,markers]);
				results['updated'] = true;
			}
		} 
		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		pg_n_client.end();
	}
	catch (err) {
		console.log(err);
	}
	res.send(JSON.stringify(results));
}

/**
 * This function will perform query to check for overlapping markers
 * between the studies specified and stores it in the analysis_data
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
 exports.analysis_insert_markers_study_overlaps = async function(req, res, next) {
	try {
		var results = {
			updated: false
		};

		// Let us use query synchronized for procedural querying
		var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		pg_n_client.querySync("set datestyle='ISO';");
		pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		pg_n_client.querySync("SET bytea_output TO escape;");
		pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.body.analysis_id;
		var study_ids_arr = JSON.parse(req.body.study_ids_arr);
		var variable_name = "studies_snp_overlap_" + study_ids_arr.join("_");
		
		// Delete the row if this already exists (just in case)
		var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
		pg_n_client.querySync(query_str,[variable_name,analysis_id]);


		// Get the markers that overlap
		var query_str = "select markers, cardinality(markers) from chado.test_studies_marker_overlap WHERE ";
		for (var i=0; i<study_ids_arr.length; i++) {
		  var study_id = study_ids_arr[i];
		  if (i == 0) {
			query_str += "'" + study_id + "' = ANY(accessions)";
		  }
		  else {
			query_str += " AND '" + study_id + "' = ANY(accessions)";
		  }
		}
		query_str += " order by cardinality desc limit 1";




		// results['query_str'] = query_str;
		// console.log(query_str);

		var rows = pg_n_client.querySync(query_str);
		if(rows.length > 0) {
			var markers = rows[0].markers;
			console.log(markers);
			var query_str = "INSERT INTO cartogratree_analysis_data (analysis_id, variable_name, variable_data)";
			query_str += " VALUES ($1,$2,$3)";
			pg_n_client.querySync(query_str, [analysis_id,variable_name,markers]);
			results['updated'] = true;

			// This code was used to verify that the data gets inserted into the database
			// var query_str = "SELECT * FROM cartogratree_analysis_data WHERE analysis_id = $1 AND variable_name = $2";
			// var rows2 = pg_n_client.querySync(query_str, [analysis_id,variable_name]);
			// if(rows2.length > 0) {
			// 	console.log(rows2[0].variable_data);
			// 	console.log('variable_data');
			// }
		}

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		pg_n_client.end();

	}
	catch (err) {
		console.log(err);
	}

	res.send(JSON.stringify(results));
 }

/**
 * This should change the analysis name
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
 exports.analysis_update_analysis_name = async function(req, res, next) {
	try {
		var results = {
			updated: false
		};

		// Let us use query synchronized for procedural querying
		var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		pg_n_client.querySync("set datestyle='ISO';");
		pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		pg_n_client.querySync("SET bytea_output TO escape;");
		pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.query.analysis_id;
		var analysis_name = req.query.analysis_name;

		// Find the user_id of this user, using the username
		var query_str = "UPDATE cartogratree_analysis_index SET analysis_name = $1 WHERE analysis_id = $2";
		var rows = pg_n_client.querySync(query_str, [analysis_name, analysis_id]);
		results['updated'] = true;

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		pg_n_client.end();
	}
	catch (err) {
		console.log(err);
	}

	res.send(JSON.stringify(results));
}



/**
 * This should return a new analysis id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
 exports.analysis_create_id = async function(req, res, next) {
	try {
		var results = {
			analysis_id: -1,
		};
		var user_email = req.query.user_email;
		var user_id = -1;

		// Let us use query synchronized for procedural querying
		var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		pg_n_client.querySync("set datestyle='ISO';");
		pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		pg_n_client.querySync("SET bytea_output TO escape;");
		pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');

		// Find the user_id of this user, using the username
		var query_str = "SELECT * FROM users WHERE mail ILIKE $1 LIMIT 1";
		var rows = pg_n_client.querySync(query_str, [user_email]);
		if(rows.length > 0) {
			console.log('User id was found');
			user_id = rows[0].uid;
			console.log('user_id', user_id);
		}

		// Ensure the user id was found (valid)
		if(user_id != -1) {
			var query_str = "INSERT INTO cartogratree_analysis_index (user_id, analysis_name, analysis_created_time) ";
			query_str += " VALUES ($1,$2,$3) returning analysis_id;";
			console.log(query_str);
			var time_created = Math.floor(Date.now() / 1000);
			var rows = pg_n_client.querySync(query_str, [user_id, 'Untitled', time_created]);
			if(rows.length > 0) {
				results['analysis_id'] = rows[0].analysis_id;
			}
			else {
				results['analysis_id'] = -1;
				console.log('Could not find a returning analysis_id');
			}
		}

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		pg_n_client.end();
	}
	catch (err) {
		console.log(err);
	}
	res.send(JSON.stringify(results));

 };
 

/**
 * This should return the numbers of overlaps_all, overlaps_some, overlaps_none
 * in venn format for the venn diagram
 * for SNPS using views created by Emily Grau within the TreeGenes database
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
 exports.genotypes_snps_overlaps_by_studies_views_venn_format = async function(req, res, next) {
	try {
	   // First we need to get permutations of the studies
	   // console.log(req.body);

	   // Get study_ids_arr from the req.body
	   var study_ids_arr = JSON.parse(req.body.study_ids);
	   // console.log(study_ids_arr);

   // Let us use query synchronized for procedural querying
   var pg_n_client = new pg_native_client();
   
   console.log('Connecting to database...');
   pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
   //console.log(config.conf.host);
   //console.log(config.conf.user);
   //console.log(config.conf.password);
   pg_n_client.querySync("set datestyle='ISO';");
   pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
   pg_n_client.querySync("SET bytea_output TO escape;");
   pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');    


   // STEP 1 - Overlap All - number of markers shared between all studies
   var total_overlaps = 0;
   var query_str = "select accessions, cardinality(markers) from chado.test_studies_marker_overlap WHERE ";
   for (var i=0; i<study_ids_arr.length; i++) {
	 var study_id = study_ids_arr[i];
	 if (i == 0) {
	   query_str += "'" + study_id + "' = ANY(accessions)";
	 }
	 else {
	   query_str += " AND '" + study_id + "' = ANY(accessions)";
	 }
   }
   query_str += " order by cardinality desc limit 1";
   
   // Perform the query to get the results of total_overlaps
   var rows = pg_n_client.querySync(query_str);
   if(rows.length > 0) {
	 total_overlaps = rows[0].cardinality;
   }
   console.log('Total overlaps = ' + total_overlaps);
   // Generate the overlap_all object
   var overlap_all = {};
   for(var i=0; i<study_ids_arr.length; i++) {
	 var study_id = study_ids_arr[i];
	 overlap_all[study_id] = total_overlaps;
   }
   console.log('overlap_all', JSON.stringify(overlap_all));


   // SETP 1.5 GET OVERLAPS BETWEEN PAIRS OF STUDIES
   // Get the pairs first
// Generate all permutations

	var result_pairs = pairwise(study_ids_arr);
	console.log(result_pairs);
	var overlap_pairs = [];
	for(var i=0; i<result_pairs.length; i++) {
		var pair = result_pairs[i];
		// console.log('pair', JSON.stringify(pair));
		var pair_result_object = {};
		var query_str = "select accessions, cardinality(markers) from chado.test_studies_marker_overlap WHERE ";
		for (var j=0; j<pair.length; j++) {
			var study_id = pair[j];
			// console.log('study_id', study_id);
			if (j == 0) {
				query_str += "'" + study_id + "' = ANY(accessions)";
			}
			else {
				query_str += " AND '" + study_id + "' = ANY(accessions)";
			}
		}
		query_str += " order by cardinality desc limit 1";
		// console.log(query_str);
		
		// // Perform the query to get the results of total_overlaps between pair
		var rows = pg_n_client.querySync(query_str);
		if(rows.length > 0) {
			pair_result_object['sets'] = pair;
			pair_result_object['size'] = rows[0].cardinality;
		// total_overlaps = rows[0].cardinality;
		}
		if(!overlap_pairs.includes(pair_result_object)) {
			overlap_pairs.push(pair_result_object);
		}
	}
	console.log('overlap_pairs', JSON.stringify(overlap_pairs));



   // STEP 2 - Get total markers for each study
   var total_snps_per_study = {};
   var query_str = "select accession, cardinality(markers) from markers_and_studies_names where accession in (";
   for(var i=0; i<study_ids_arr.length; i++) {
	 var study_id = study_ids_arr[i];
	 total_snps_per_study[study_id] = 0;
	 if(i == 0) {
	   query_str += "'" + study_id + "'"
	 }
	 else {
	   query_str += ",'" + study_id + "'"
	 }
   }
   query_str += ") order by cardinality;"
   
   // Perform the query to get the results of total snps per studies (each row has the total per study)
   var rows = pg_n_client.querySync(query_str);
   for(var i=0; i<rows.length; i++) {
	 var study_id = rows[i]['accession'];
	 total_snps_per_study[study_id] = rows[i]['cardinality'];
   }
   console.log('total_snps_per_study',JSON.stringify(total_snps_per_study));


   // STEP 3 - Getting overlaps_some for each study
   // We go through each study (for loop)
   var overlap_some = {};
   for(var i=0; i<study_ids_arr.length; i++) {
	 var anchor_study_id = study_ids_arr[i];
	 console.log(anchor_study_id);
	 var anchor_index = i;

	 // Set default overlap_some for anchor study
	 overlap_some[anchor_study_id] = 0;
	 // Get all other studies
	 var other_studies = [];
	 for(var j=0; j<study_ids_arr.length;j++) {
	   if(j != i) {
		 other_studies.push(study_ids_arr[j]);
	   }
	 }
	 // Now we have other_studies exclusive of anchor study

	 // We need to perform sql based on achor study versus each other study
	 var table_count = 1;
	 var query_str = "SELECT count(unnest) as c1 FROM ((select DISTINCT(unnest) FROM (";
	 for(var j=0; j<other_studies.length; j++) {
	   var other_study = other_studies[j];
	   if(j>0) {
		 query_str += " UNION ";
	   }
	   query_str += "(select unnest(markers) from(select markers from test_studies_marker_overlap ";
	   query_str += " WHERE '" + anchor_study_id + "' = ANY (accessions) AND '" + other_study + "' = ANY (accessions) order by cardinality(accessions) asc limit 1) table" + table_count + ")";
	   query_str += " ";
	   table_count = table_count + 1;    
	 }
	 query_str += ") table" + table_count + ")";
	 table_count = table_count + 1;

	 // Now we need to get all markers that overlap all studies into this query
	 query_str += " EXCEPT ";
	 query_str += "(select unnest(markers) FROM (select markers from test_studies_marker_overlap WHERE ";
	 for(var j=0; j<study_ids_arr.length; j++) {
	   var study = study_ids_arr[j];
	   if(j>0) {
		 query_str += " AND ";
	   }
	   query_str += "'" + study + "' = ANY(accessions) ";
	   
	 } 
	 query_str += ") table_overlap_all)) count_table";

	 // console.log(query_str);
	 var rows = pg_n_client.querySync(query_str);
	 if(rows.length > 0) {
	   overlap_some[anchor_study_id] = rows[0]['c1'];
	 }
   }

   console.log('overlap_some', JSON.stringify(overlap_some));

   // STEP 4 - Get overlaps_none for each study
   var overlap_none = {};
   for (var i=0; i<study_ids_arr.length; i++) {
	 var study_id = study_ids_arr[i];
	 var query_str = "";
	 query_str += "select cardinality(markers) from (";
	 query_str += "select markers from (select array(";
	 query_str += "(select unnest(markers) from markers_and_studies_names where accession = '" + study_id + "')";
	 query_str += " EXCEPT ";
	 query_str += "(select distinct markers from ";
	 query_str += "(select unnest(markers) as markers from test_studies_marker_overlap WHERE '" + study_id + "' = ANY (accessions))w) ";
	 query_str += ")";
	 query_str += "as markers )";
	 query_str += "x)";
	 query_str += "y;";
	 
	 var rows = pg_n_client.querySync(query_str);
	 if(rows.length > 0) {
	   overlap_none[study_id] = rows[0]['cardinality'];
	 }      
	 
   }
   console.log('overlap_none', JSON.stringify(overlap_none));


   // STEP 5 - generate the venn format needed

   var venn_array = [];

   // Add all_studies_intersect
   var set_object = {};
   set_object['sets'] = [];
   var study_id = "";
   for(var i=0; i<study_ids_arr.length; i++) {
	   study_id = study_ids_arr[i];

	   set_object['sets'].push(study_id);
   }
   set_object['size'] = overlap_all[study_id];
   venn_array.push(set_object);  


   // Put each overlap_pairs object into the venn_array (this is overlaps between each pair
   // of studies)
   for (var i=0; i<overlap_pairs.length; i++) {
	   if(!venn_array.includes(overlap_pairs[i])) {
	   	venn_array.push(overlap_pairs[i]);
	   }
   }


	// Size per study
	for(var i=0; i<study_ids_arr.length; i++) {
		var study_id = study_ids_arr[i];
		var set_object = {};
		set_object['sets'] = [];
		set_object['sets'].push(study_id);
		set_object['size'] = total_snps_per_study[study_id];
		venn_array.push(set_object);
	}



  console.log('venn_array', JSON.stringify(venn_array));


	// Create a results object to be returned
	var results = {
		'study_ids_arr': study_ids_arr,
		'venn_array': venn_array,
		'overlap_none': overlap_none
	}		

	// Now we have all permutations, perform SQL calls
	// for (var i=0; i<result_pairs.length; i++) {
	// 	var pair = result_pairs[i];
	// 	console.log(pair);
	// }

   // NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
   pg_n_client.end();

	   res.send(JSON.stringify(results));
	}
	catch (err) { console.log(err) }
}

/**
 * This should return the numbers of overlaps_all, overlaps_some, overlaps_none
 * for SNPS using views created by Emily Grau within the TreeGenes database
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
 exports.genotypes_snps_overlaps_by_studies_views = async function(req, res, next) {
	 try {
		// First we need to get permutations of the studies
		// console.log(req.body);

		// Get study_ids_arr from the req.body
		var study_ids_arr = JSON.parse(req.body.study_ids);
		// console.log(study_ids_arr);

    // Let us use query synchronized for procedural querying
    var pg_n_client = new pg_native_client();
    
    console.log('Connecting to database...');
    pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
    //console.log(config.conf.host);
    //console.log(config.conf.user);
    //console.log(config.conf.password);
    pg_n_client.querySync("set datestyle='ISO';");
    pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
    pg_n_client.querySync("SET bytea_output TO escape;");
    pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');    


    // STEP 1 - Overlap All - number of markers shared between all studies
    var total_overlaps = 0;
    var query_str = "select accessions, cardinality(markers) from chado.test_studies_marker_overlap WHERE ";
    for (var i=0; i<study_ids_arr.length; i++) {
      var study_id = study_ids_arr[i];
      if (i == 0) {
        query_str += "'" + study_id + "' = ANY(accessions)";
      }
      else {
        query_str += " AND '" + study_id + "' = ANY(accessions)";
      }
    }
    query_str += " order by cardinality desc limit 1";
    
    // Perform the query to get the results of total_overlaps
    var rows = pg_n_client.querySync(query_str);
    if(rows.length > 0) {
      total_overlaps = rows[0].cardinality;
    }
    console.log('Total overlaps = ' + total_overlaps);
    // Generate the overlap_all object
    var overlap_all = {};
    for(var i=0; i<study_ids_arr.length; i++) {
      var study_id = study_ids_arr[i];
      overlap_all[study_id] = total_overlaps;
    }
    console.log('overlap_all', JSON.stringify(overlap_all));

    // STEP 2 - Get total markers for each study
    var total_snps_per_study = {};
    var query_str = "select accession, cardinality(markers) from markers_and_studies_names where accession in (";
    for(var i=0; i<study_ids_arr.length; i++) {
      var study_id = study_ids_arr[i];
      total_snps_per_study[study_id] = 0;
      if(i == 0) {
        query_str += "'" + study_id + "'"
      }
      else {
        query_str += ",'" + study_id + "'"
      }
    }
    query_str += ") order by cardinality;"
    
    // Perform the query to get the results of total snps per studies (each row has the total per study)
    var rows = pg_n_client.querySync(query_str);
    for(var i=0; i<rows.length; i++) {
      var study_id = rows[i]['accession'];
      total_snps_per_study[study_id] = rows[i]['cardinality'];
    }
    console.log('total_snps_per_study',JSON.stringify(total_snps_per_study));


    // STEP 3 - Getting overlaps_some for each study
    // We go through each study (for loop)
    var overlap_some = {};
    for(var i=0; i<study_ids_arr.length; i++) {
      var anchor_study_id = study_ids_arr[i];
      console.log(anchor_study_id);
      var anchor_index = i;

      // Set default overlap_some for anchor study
      overlap_some[anchor_study_id] = 0;
      // Get all other studies
      var other_studies = [];
      for(var j=0; j<study_ids_arr.length;j++) {
        if(j != i) {
          other_studies.push(study_ids_arr[j]);
        }
      }
      // Now we have other_studies exclusive of anchor study

      // We need to perform sql based on achor study versus each other study
      var table_count = 1;
      var query_str = "SELECT count(unnest) as c1 FROM ((select DISTINCT(unnest) FROM (";
      for(var j=0; j<other_studies.length; j++) {
        var other_study = other_studies[j];
        if(j>0) {
          query_str += " UNION ";
        }
        query_str += "(select unnest(markers) from(select markers from test_studies_marker_overlap ";
        query_str += " WHERE '" + anchor_study_id + "' = ANY (accessions) AND '" + other_study + "' = ANY (accessions) order by cardinality(accessions) asc limit 1) table" + table_count + ")";
        query_str += " ";
        table_count = table_count + 1;    
      }
      query_str += ") table" + table_count + ")";
      table_count = table_count + 1;

      // Now we need to get all markers that overlap all studies into this query
      query_str += " EXCEPT ";
      query_str += "(select unnest(markers) FROM (select markers from test_studies_marker_overlap WHERE ";
      for(var j=0; j<study_ids_arr.length; j++) {
        var study = study_ids_arr[j];
        if(j>0) {
          query_str += " AND ";
        }
        query_str += "'" + study + "' = ANY(accessions) ";
        
      } 
      query_str += ") table_overlap_all)) count_table";

      // console.log(query_str);
      var rows = pg_n_client.querySync(query_str);
      if(rows.length > 0) {
        overlap_some[anchor_study_id] = rows[0]['c1'];
      }
    }

    console.log('overlap_some', JSON.stringify(overlap_some));

    // STEP 4 - Get overlaps_none for each study
    var overlap_none = {};
    for (var i=0; i<study_ids_arr.length; i++) {
      var study_id = study_ids_arr[i];
      var query_str = "";
      query_str += "select cardinality(markers) from (";
      query_str += "select markers from (select array(";
      query_str += "(select unnest(markers) from markers_and_studies_names where accession = '" + study_id + "')";
      query_str += " EXCEPT ";
      query_str += "(select distinct markers from ";
      query_str += "(select unnest(markers) as markers from test_studies_marker_overlap WHERE '" + study_id + "' = ANY (accessions))w) ";
      query_str += ")";
      query_str += "as markers )";
      query_str += "x)";
      query_str += "y;";
      
      var rows = pg_n_client.querySync(query_str);
      if(rows.length > 0) {
        overlap_none[study_id] = rows[0]['cardinality'];
      }      
      
    }
    console.log('overlap_none', JSON.stringify(overlap_none));


    // STEP 6 - generate the grid format needed
    var snps_grid_overlap_array = [];
    for(var i=0; i<study_ids_arr.length; i++) {
      var study_id = study_ids_arr[i];
      var study_object = {};
      study_object['study_name'] = study_id;
      study_object['overlap_all'] = overlap_all[study_id];
      study_object['overlap_some'] = overlap_some[study_id];
      study_object['overlap_none'] = overlap_none[study_id];
      snps_grid_overlap_array.push(study_object);
    }
    
    console.log('snps_grid_overlap_array', JSON.stringify(snps_grid_overlap_array));
		// Generate all permutations
		// var result_pairs = pairwise(study_ids_arr);
		// console.log(result_pairs);

		// Create a results object to be returned
		var results = {
			'study_ids_arr': study_ids_arr,
			'snps_grid_overlap_array': snps_grid_overlap_array
		}		

		// Now we have all permutations, perform SQL calls
		// for (var i=0; i<result_pairs.length; i++) {
		// 	var pair = result_pairs[i];
		// 	console.log(pair);
		// }

    // NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
    pg_n_client.end();

		res.send(JSON.stringify(results));
	 }
	 catch (err) { console.log(err) }
 }

 /**
  * Generates unique pairs from a list / array of values
  * Code obtained from Stackoverflow
  * https://stackoverflow.com/questions/36254049/generate-n-sets-of-unique-pairs-from-an-array
  * @param {*} req 
  * @param {*} res 
  * @param {*} next 
  */
  function pairwise(list) {
	if (list.length < 2) { return []; }
	var first = list[0],
		rest  = list.slice(1),
		pairs = rest.map(function (x) { return [first, x]; });
	return pairs.concat(pairwise(rest));
  }
  
  


/**
 * This should return the tree_ids that have SNP data and their user selected trees
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.genotypes_snps_by_studies = function(req, res, next) {
	try {
		console.log('It came here SNPS by Studies!');
		console.log(req.body.data);
		var data = JSON.parse(req.body.data);

		var study_ids_arr = data.study_ids;
		console.log(study_ids_arr);
		var where_statement = "";

		for(var i=0; i<study_ids_arr.length; i++) {
			if(i == 0) {
				// where_statement += " WHERE ";
			}
			else if(i > 0) {
				where_statement += " OR "
			}
			where_statement += " tree_acc LIKE '" + study_ids_arr[i] + "%' ";

		}

		var query_str = "SELECT tree_acc, marker_name FROM chado.geno_view WHERE (";
		query_str += where_statement;
		query_str += ") AND marker_type = 'SNP' LIMIT 1000000";

		console.log(query_str);

		query (query_str, [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
			return;
		}
		//console.log(rows);

		res.status(200).json(rows);
	});
	}
	catch (err) {
		console.log(err);
	}		
 }

/**
 * This should return the tree_ids that have SNP data and their user selected trees
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.genotypes_snps_by_batch = function(req, res, next) {
	console.log('It came here SNPS!');
	console.log(req.body.data);
	var data = JSON.parse(req.body.data);

	var tree_ids_arr = data.tree_ids;
	var tree_ids_wherein = "";

	for(var i=0; i<tree_ids_arr.length; i++) {
		if(i > 0) {
			tree_ids_wherein += ",";
		}
		tree_ids_wherein += "'" + tree_ids_arr[i] + "'";
	}

	var query_str = "SELECT tree_acc, marker_type, study_type, marker_name, latitude, longitude  FROM chado.geno_view";
	query_str += " LEFT JOIN ct_trees ON geno_view.tree_acc = ct_trees.uniquename ";
	query_str += " WHERE tree_acc IN (";
	query_str += tree_ids_wherein;
	query_str += ") AND marker_type = 'SNP'";

	console.log(query_str);

	query (query_str, [], function (err, rows, result) {
		if (err) {
			console.log(err);
			res.status(400);
		   return;
	   }
	   //console.log(rows);

	   res.status(200).json(rows);
   });		
 }

/**
 * This should return the tree_ids that have SSR data and their user selected trees
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.genotypes_ssrs_by_batch = function(req, res, next) {
	console.log('It came here SSRS!');
	console.log(req.body.data);
	var data = JSON.parse(req.body.data);

	var tree_ids_arr = data.tree_ids;
	var tree_ids_wherein = "";

	for(var i=0; i<tree_ids_arr.length; i++) {
		if(i > 0) {
			tree_ids_wherein += ",";
		}
		tree_ids_wherein += "'" + tree_ids_arr[i] + "'";
	}

	var query_str = "SELECT tree_acc, marker_type, study_type, marker_name, latitude, longitude  FROM chado.new_geno_view";
	query_str += " LEFT JOIN ct_trees ON new_geno_view.tree_acc = ct_trees.uniquename ";
	query_str += " WHERE tree_acc IN (";
	query_str += tree_ids_wherein;
	query_str += ") AND marker_type = 'SSR';";

	console.log(query_str);
	query (query_str, [], function (err, rows, result) {
		if (err) {
			console.log(err);
			res.status(400);
		   return;
	   }
	   //console.log(rows);

	   res.status(200).json(rows);
   });		

 }



/**
 * This should return the overlapping traits / phenotypes between studies and their user selected trees
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.union_traits_by_batch = function(req, res, next) {
	console.log(req.body.data);

	var data = JSON.parse(req.body.data);
	// Assumption that studies is at least 2 based on GUI constraints
	var studies_list = Object.keys(data);
	var query_str = "SELECT distinct(name) FROM ("; 
	for(var i=0; i<studies_list.length; i++) {
		var trees_list = data[studies_list[i]];
		var trees_list_csv = "";
		for(var j=0; j < trees_list.length; j++) {
			if(j > 0) {
				trees_list_csv += ',';
			}
			trees_list_csv += "'" + trees_list[j] + "'";
		}

		if(i > 0) {
			query_str += " UNION ";
		}
		query_str += "(SELECT distinct(LOWER(name)) as name FROM chado.new_pheno_view WHERE tree_acc IN (" + trees_list_csv + "))";
	}
	query_str += ") as traits_table;"

	console.log(query_str);
	

	 query (query_str, [], function (err, rows, result) {
	 	if (err) {
	 		console.log(err);
	 		res.status(400);
			return;
		}
		//console.log(rows);

		res.status(200).json(rows);
	});	
	
}

/**
 * This should return the overlapping traits / phenotypes between studies and their user selected trees
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.intersect_traits_by_batch = function(req, res, next) {
	console.log(req.body.data);

	var data = JSON.parse(req.body.data);
	// Assumption that studies is at least 2 based on GUI constraints
	var studies_list = Object.keys(data);
	var query_str = ""
	// query_str += "SELECT distinct(name) FROM ("; 
	for(var i=0; i<studies_list.length; i++) {
		var trees_list = data[studies_list[i]];
		var trees_list_csv = "";
		for(var j=0; j < trees_list.length; j++) {
			if(j > 0) {
				trees_list_csv += ',';
			}
			trees_list_csv += "'" + trees_list[j] + "'";
		}

		if(i > 0) {
			query_str += " INTERSECT ";
		}
		query_str += "(SELECT distinct(LOWER(name)) as name FROM chado.new_pheno_view WHERE tree_acc IN (" + trees_list_csv + "))";
	}
	//query_str += ") as traits_table;"

	console.log(query_str);
	

	 query (query_str, [], function (err, rows, result) {
	 	if (err) {
	 		console.log(err);
	 		res.status(400);
			return;
		}
		//console.log(rows);

		res.status(200).json(rows);
	});	
	
}

/**
 * This should return the overlapping traits / phenotypes between studies and their user selected trees
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.trees_by_intersect_trait = function(req, res, next) {
	console.log(req.body.data);

	var study_data = JSON.parse(req.body.data.detected_studies);
	var trait = req.body.data.trait;
	// Assumption that studies is at least 2 based on GUI constraints
	var studies_list = Object.keys(study_data);
	var query_str = '';
	// query_str = "SELECT distinct(name) FROM ("; 
	for(var i=0; i<studies_list.length; i++) {
		var trees_list = data[studies_list[i]];
		var trees_list_csv = "";
		for(var j=0; j < trees_list.length; j++) {
			if(j > 0) {
				trees_list_csv += ',';
			}
			trees_list_csv += "'" + trees_list[j] + "'";
		}

		if(i > 0) {
			query_str += " UNION ";
		}
		query_str += "(SELECT tree_acc FROM chado.new_pheno_view WHERE lower(name) LIKE '' tree_acc IN (" + trees_list_csv + "))";
	}
	// query_str += ") as traits_table;"

	console.log(query_str);
	

	 query (query_str, [], function (err, rows, result) {
	 	if (err) {
	 		console.log(err);
	 		res.status(400);
			return;
		}
		//console.log(rows);

		res.status(200).json(rows);
	});	
	
}




/**
 * This should return a subset of trees with specific trait / phenotype
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.trees_by_trait = function(req, res, next) {
	console.log(req.body.data);

	var data = JSON.parse(req.body.data);

	var trees = data.trees;
	var trees_csv = '';
	for (var i=0; i<trees.length; i++) {
		if(i > 0) {
			trees_csv += ',';
		}
		trees_csv += "'" + trees[i] + "'";
	}

	var operand = data.operand;
	var safe_operand = ""
	if(operand == "union") {
		safe_operand = "UNION";
	}
	else {
		safe_operand = "INTERSECT"
	}
	var traits = data.traits;

	var query_str = "SELECT DISTINCT(tree_acc), name, value, units FROM ("; 
	for(var i=0; i < traits.length; i++) {
		if(i > 0) {
			query_str += ' ' + operand + ' ';
		}
		query_str += "SELECT tree_acc, name, value, units FROM chado.new_pheno_view WHERE name ILIKE '" + traits[i] + "' AND tree_acc IN (" + trees_csv +  ")";
	}
	query_str += ") as trees_table;"

	console.log(query_str);
	

	query (query_str, [], function (err, rows, result) {
	 	if (err) {
	  		console.log(err);
	  		res.status(400);
	 		return;
	 	}
	 	// console.log(rows);
		// We want to return an array of just the tree_ids
		var tree_ids = [];
		for(var i=0; i<rows.length; i++) {
			tree_ids.push(rows[i].tree_acc);
		}

	 	res.status(200).json(rows);
	});	
	
}


/**
 * This should return the current species count for a specific filter executed on CT UI by a user. This will require the source_id and filter_query which will used to get the count from ct_trees table.
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.species_count = function(req, res, next) {
	var filter = req.query.filter;
	var source_id = req.query.source_id;
	console.log(filter);
	console.log(source_id);
	//make sure to also cache the query if possible
	if(filter == "") {
		filter = "(1 = 1)";
	}
	var query_str = "SELECT DISTINCT species as species FROM ct_trees WHERE " + filter + " AND source_id = " + source_id;
	//var query_str = "SELECT COUNT(*) as tree_count FROM (" + sub_query + ") AS TABLE1;";
	console.log(query_str);
	var species_arr = [];

	//check cache
	var cache_result = ct_cache.get('species_count_' + query_str);
	if(cache_result != null) {
		console.log('Cache result key/data returned:' + 'species_count_' + query_str);
		res.status(200).json(cache_result);
	}
	else {
		console.log('No cache result, returning from db');
		query (query_str, [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			//console.log(rows);
			var tree_count = 0;
			rows.forEach(row => {
				species_arr.push(row.species);
				console.log(row);
				//console.log('NCount: ' + row.ncount);
			});			
			//console.log('trees_reload_status finished.');
			ct_cache.put('species_count_' + query_str, species_arr);
			res.status(200).json(species_arr);
		});	
	}
}


/**
 * This should return the current count for a specific filter executed on CT UI by a user. This will require the source_id and filter_query which will used to get the count from ct_trees table.
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.trees_count = function(req, res, next) {
	var filter = req.query.filter;
	var source_id = req.query.source_id;
	console.log(filter);
	console.log(source_id);
	//make sure to also cache the query if possible
	if(filter == "") {
		filter = "(1 = 1)";
	}
	var query_str = "SELECT COUNT(*) as tree_count FROM ct_trees WHERE " + filter + " AND source_id = " + source_id;
	//var query_str = "SELECT COUNT(*) as tree_count FROM (" + sub_query + ") AS TABLE1;";
	console.log(query_str);
	var tree_count = 0;

	var cache_result = ct_cache.get('trees_count_'+query_str);
	if(cache_result != null) {
		res.status(200).json({'tree_count': cache_result});
	}
	else {
		query (query_str, [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			//console.log(rows);
			
			rows.forEach(row => {
				tree_count = row.tree_count;
				console.log(row);
				//console.log('NCount: ' + row.ncount);
			});			
			//console.log('trees_reload_status finished.');
			ct_cache.put('trees_count_'+query_str, tree_count);
			res.status(200).json({'tree_count':tree_count});
		});	
	}
}


/**
 * Clears the cache and refreshes the materialized views to able to view all the newly added trees to cartogratree based on tpps submissions
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.trees_reload = function(req, res, next) {
	var api_key = req.query.api_key;
	var api_superuser_password = req.query.asup;

	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		// ct_cache.clear();		
		//var skip_to = req.query.skip_to;
		//utils.treesnap_add("https://treesnap.org/web-services/v1/observations?page=" + page_num);
		const defaults = {
			shell: true
		};
		var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_trees_reload.js']);
		child.on('exit', function (code, signal) {
			ct_cache.clear();	
		  //console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
		});	
		child.stdout.on('data', (data) => {
		  console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
		  console.error("" + data + "");
		});		
		
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;
	}
}

/**
 * Clears the cache and refreshes the materialized views to able to view all the newly added trees to cartogratree based on tpps submissions
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.trees_reload_old = function(req, res, next) {
	//console.log('API SUPERUSER PASSWORD:' + config.conf.api_superuser_password);
	if(config.conf.api_superuser_password == api_superuser_password) {
		//utils.valid_api_key(api_key, res, function() {
		//clear the cache
		console.log('Clear the cache');
		ct_cache.clear();
		//refresh all dependent views
		query ("REFRESH MATERIALIZED VIEW chado.new_geno_view", [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			console.log('chado.new_geno_view refresh completed');
			query ("REFRESH MATERIALIZED VIEW chado.geno_view", [], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				console.log('chado.geno_view refresh completed');			
				query ("REFRESH MATERIALIZED VIEW chado.plusgeno_view", [], function (err, rows, result) {
					if (err) {
						console.log(err);
						res.status(400);
						return;
					}
					console.log('chado.plusgeno_view refresh completed');
					query ("REFRESH MATERIALIZED VIEW chado.new_pheno_view", [], function (err, rows, result) {
						if (err) {
							console.log(err);
							res.status(400);
							return;
						}	
						console.log('chado.new_pheno_view refresh completed');
						query ("REFRESH MATERIALIZED VIEW chado.ct_view", [], function (err, rows, result) {
							if (err) {
								console.log(err);
								res.status(400);
								return;
							}
							console.log('chado.ct_view refresh completed');


							console.log('Beginning refresh of ct_trees_treegenes_dryad...');
							query ("REFRESH MATERIALIZED VIEW chado.ct_trees_treegenes_dryad", [], function (err, rows, result) {
								if (err) {
									console.log(err);
									res.status(400);
									return;
								}										
								console.log('Beginning refresh of ct_trees_all_view...');
								query ("REFRESH MATERIALIZED VIEW ct_trees_all_view", [], function (err, rows, result) {
									if (err) {
										console.log(err);
										res.status(400);
										return;
									}
									console.log('ct_trees_all_view refresh completed');
									query ("REFRESH MATERIALIZED VIEW ct_trees", [], function (err, rows, result) {
										if (err) {
											console.log(err);
											res.status(400);
											return;
										}
										console.log("ct_trees refresh completed");
										query ("REFRESH MATERIALIZED VIEW chado.tpps_study_summary", [], function (err, rows, result) {
											if (err) {
												console.log(err);
												res.status(400);
												return;
											}
											console.log("tpps_study_summary refresh completed");
											console.log('Clear the cache');
											ct_cache.clear();	
										});
									});
								});	
							});
							


							// WE NEED TO DEPRECATE THE CODE BELOW SINCE THE UNDERLYING FUNCTION utils.insert_new_trees
							// is trying to insert trees into ct_trees_treegenes which no longer exists as a table.
							// so this code won't work anymore!
							// NOTED by Risharde Ramnath 5/5/2022

							//add new trees to table
							// 	query ("SELECT * FROM chado.ct_view", [], function (err, rows, result) {
							// 		if (err) {
							// 			console.log(err);
							// 			res.status(400);
							// 			return;
							// 		}
							// 		console.log('chado.ct_view inserting new trees...');
							// 		console.log('ROWS:' + rows.length);
							// 		try {
							// 			utils.insert_new_trees(res, rows);
							// 		}
							// 		catch (err) {
							// 			console.log(err);
							// 		}
							// 		console.log('chado.ct_view finished inserting new trees');
							// 		//refresh the view that houses all the trees and their respective data
							// 		//THIS IS DUE TO CALLBACK - WE NEED TO WAIT TO MAKE SURE IT PROCESSES CORRECTLY
							// 		// var wait_time = rows.length * 3; //rows by 3ms
							// 		// console.log('Waiting ' + (wait_time / 1000) + ' seconds before refreshing ct_trees_all_view ...');
							// 		// setTimeout(function() {
							// 		// 	console.log('Beginning refresh of ct_trees_treegenes_dryad...');
							// 		// 	query ("REFRESH MATERIALIZED VIEW chado.ct_trees_treegenes_dryad", [], function (err, rows, result) {
							// 		// 		if (err) {
							// 		// 			console.log(err);
							// 		// 			res.status(400);
							// 		// 			return;
							// 		// 		}										
							// 		// 		console.log('Beginning refresh of ct_trees_all_view...');
							// 		// 		query ("REFRESH MATERIALIZED VIEW ct_trees_all_view", [], function (err, rows, result) {
							// 		// 			if (err) {
							// 		// 				console.log(err);
							// 		// 				res.status(400);
							// 		// 				return;
							// 		// 			}
							// 		// 			console.log('ct_trees_all_view refresh completed');
							// 		// 			query ("REFRESH MATERIALIZED VIEW ct_trees", [], function (err, rows, result) {
							// 		// 				if (err) {
							// 		// 					console.log(err);
							// 		// 					res.status(400);
							// 		// 					return;
							// 		// 				}
							// 		// 				console.log("ct_trees refresh completed");
							// 		// 				query ("REFRESH MATERIALIZED VIEW chado.tpps_study_summary", [], function (err, rows, result) {
							// 		// 					if (err) {
							// 		// 						console.log(err);
							// 		// 						res.status(400);
							// 		// 						return;
							// 		// 					}
							// 		// 					console.log("tpps_study_summary refresh completed");
							// 		// 					console.log('Clear the cache');
							// 		// 					ct_cache.clear();	
							// 		// 				});
							// 		// 			});
							// 		// 		});	
							// 		// 	});
							// 		// }, wait_time);
							// 	});							
							// });
						});
					});
				});
			});
		});
		/*
		//THIS HAS BEEN REMOVED IN FAVOUR OF NESTED IF ABOVE SO THAT THE REFRESHES GET EXECUTED IN A SPECIFIC ORDER.
		//add new trees to table
		query ("SELECT * FROM chado.ct_view", [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			utils.insert_new_trees(res, rows);
		});	
		//refresh the view that houses all the trees and their respective data
		query ("REFRESH MATERIALIZED VIEW ct_trees_all_view", [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
		});	
		*/
		
		console.log('trees_reload finished.');
		res.status(200).json("success - reload will continue to run in the background");
		return;
	//});
	}
	else {
		res.status(200).json("no asup was given");
	}
 }

/**
 * Outputs status of reload - whether it is still performing refresh materialized views basically.
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.trees_reload_status = function(req, res, next) {
	var api_key = req.query.api_key;
	var api_superuser_password = req.query.asup;
	//console.log('API SUPERUSER PASSWORD:' + config.conf.api_superuser_password);
	if(config.conf.api_superuser_password == api_superuser_password) {
	//utils.valid_api_key(api_key, res, function() {
		//refresh the view that houses all the trees and their respective data
		query ("SELECT COUNT(pid) as ncount FROM (SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state FROM pg_stat_activity WHERE query ILIKE 'REFRESH MATERIALIZED VIEW%') AS TABLE1;", [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			//console.log(rows);
			rows.forEach(row => {
				if(row.ncount > 0) {
					res.status(200).json("running");
					return;					
				}
				else {
					res.status(200).json("not running");
					return;						
				}
				//console.log('NCount: ' + row.ncount);
			});			
			//console.log('trees_reload_status finished.');

		});			
		
	//});
	}
	else {
		res.status(200).json("no asup was given");
	}	
}

/**
 * Removes source id = 0 trees which are the TreeGenes trees from the public.ct_trees table
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.remove_treegenes_trees = function(req, res, next) {
	var api_key = req.query.api_key;

	var api_superuser_password = req.query.asup;
	//console.log('API SUPERUSER PASSWORD:' + config.conf.api_superuser_password);
	if(config.conf.api_superuser_password == api_superuser_password) {

	//utils.valid_api_key(api_key, res, function() {
		console.log('Removing TreeGenes trees from the public.ct_trees_treegenes table. Make sure to perform a reload to restore ct_trees.');
		query ("DELETE FROM public.ct_trees_treegenes WHERE source_id = 0;", [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			res.status(200).json("success");
			return;	
		});
	//})
	}
	else {
		res.status(200).json("no asup was given");
	}	
}

/**
 * Generate biome data by getting trees from ct_trees and querying biomes geoserver layer
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.biomes_generate = async function(req, res, next) {
	var api_key = req.query.api_key;

	var api_superuser_password = req.query.asup;
	//console.log('API SUPERUSER PASSWORD:' + config.conf.api_superuser_password);
	if(config.conf.api_superuser_password == api_superuser_password) {


		const defaults = {
			shell: true
		};
		var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_biomes_generate.js']);
		child.on('exit', function (code, signal) {
		  //console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
		});	
		child.stdout.on('data', (data) => {
		  console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
		  console.error("" + data + "");
		});		
		
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}

}

/**
 * Update biome data by getting trees from ct_trees and querying biomes geoserver layer for missing trees in the biome_data table
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.biomes_update = async function(req, res, next) {
	var api_key = req.query.api_key;

	var api_superuser_password = req.query.asup;
	//console.log('API SUPERUSER PASSWORD:' + config.conf.api_superuser_password);
	if(config.conf.api_superuser_password == api_superuser_password) {


		const defaults = {
			shell: true
		};
		var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_biomes_update.js']);
		child.on('exit', function (code, signal) {
		  //console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
		});	
		child.stdout.on('data', (data) => {
		  console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
		  console.error("" + data + "");
		});		
		
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}
}


/**
 * Clears the in memory cache for everything (complete cache clear)
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.cache_clear = function(req, res, next) {
	var api_key = req.query.api_key;

	var api_superuser_password = req.query.asup;
	//console.log('API SUPERUSER PASSWORD:' + config.conf.api_superuser_password);
	if(config.conf.api_superuser_password == api_superuser_password) {
	//utils.valid_api_key(api_key, res, function() {
		//clear the cache
		console.log('Clear the cache');
		ct_cache.clear();
		
		console.log('cache_clear finished.');
		res.status(200).json("success");
		return;
	//});
	}
	else {
		res.status(200).json("no asup was given");
	}	
}


exports.dryad_consolidate_trees_from_treegenes = async function(req, res, next) {
	var api_superuser_password = req.query.asup;
	if(config.conf.api_superuser_password == api_superuser_password) {
		/*
			query("SELECT accession FROM tpps_submission where status ILIKE 'approved' AND (POSITION('dry' IN submission_state::TEXT) > 0);", [], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(200).json(err);
					return;
				}
				//console.log(rows.length);
				for(var i=0; i < rows.length; i++) {
					console.log(rows[i]);
				}			
			});
		*/	
		setTimeout(function() {
			var pg_n_client = new pg_native_client();
			try {
				console.log('Connecting...');
				pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				//console.log(config.conf.host);
				//console.log(config.conf.user);
				//console.log(config.conf.password);
				pg_n_client.querySync("set datestyle='ISO';");
				pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
				pg_n_client.querySync("SET bytea_output TO escape;");
				pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
				
				var filter = "dryad";
				//var rows = pg_n_client.querySync("SELECT accession FROM tpps_submission where status ILIKE 'approved' AND (POSITION('dryad' IN submission_state::TEXT) > 0)");
				var rows = pg_n_client.querySync("SELECT accession FROM tpps_submission where status ILIKE 'approved' AND submission_state::TEXT ILIKE '%dryad%';");
				console.log('Found ' + rows.length + ' DRYAD studies');
				if(rows.length > 0) {
					for(i=0; i<rows.length; i++) {
						var accession = rows[i].accession;
						console.log('Updating TREES set source_id=2 FOR uniquename starting with:' + accession + '%');
						//Update ct_trees
						var sql_update = "UPDATE ct_trees SET source_id=2 WHERE uniquename ILIKE '" + accession + "%'";
						//console.log(sql_update);
						pg_n_client.querySync(sql_update);
						//console.log(rows[i]);
					}
				}
				pg_n_client.end();
			}
			catch(err) {
				console.log(err);
			}
		},1000);
		
		res.status(200).json("success");
		return;	
	}
	else {
		res.status(200).json("no asup was given");
	}
}

exports.treesnap_consolidate_subkingdoms = async function(req, res, next) {
	var api_superuser_password = req.query.asup;
	if(config.conf.api_superuser_password == api_superuser_password) {
		setTimeout(function() {
			var pg_n_client = new pg_native_client();
			try {
				var species_without_organismprop_subkingdom_data = "";
				pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				var rows = pg_n_client.querySync('SELECT DISTINCT(genus,species), genus, species FROM ct_trees_treesnap WHERE subkingdom IS NULL AND source_id = 1;');
				if(rows.length > 0) {
					for(i=0; i<rows.length; i++) {
						genus = rows[i].genus;
						species = rows[i].species;
						species_parts = species.split(' ');
						species_name = species_parts[1];
						//console.log('RESULTS1:' + genus + ':' + species + ':' +  species_name);
						
						//This will find the subkingdom if one exists
						var rows2 = pg_n_client.querySync("SELECT * FROM chado.organism LEFT JOIN chado.organismprop ON chado.organism.organism_id = chado.organismprop.organism_id WHERE genus ILIKE '" + genus + "' AND organismprop.type_id = 35 LIMIT 1;");
						if(rows2.length > 0) {
							//If it reaches here, it's only one record found since we used LIMIT 1 above
							for(j=0; j<rows2.length; j++) {
								//perform the update
								var temp_organism_id = rows2[j].organism_id;
								var temp_subkingdom = rows2[j].value;
								var temp_genus = genus;
								var temp_species_name = species_name;
									 
								//console.log('RESULTS2:'  + temp_genus + ':' + temp_species_name + ':' + temp_subkingdom + ':' + temp_organism_id);								
								//console.log('Updating all records where subkingdom is null and species is:' + species + '. NEW SUBKINGDOM:' + temp_subkingdom);
								//pg_n_client.querySync("UPDATE ct_trees SET subkingdom = '" + temp_subkingdom + "' WHERE genus ILIKE '" + genus + "' AND species ILIKE '" + species + "' AND subkingdom IS NULL");
								
								console.log('Updating all records where subkingdom is null and genus is:' + genus + '. NEW SUBKINGDOM:' + temp_subkingdom);
								pg_n_client.querySync("UPDATE ct_trees_treesnap SET subkingdom = '" + temp_subkingdom + "' WHERE genus ILIKE '" + genus + "' AND subkingdom IS NULL AND source_id=1;");
								if(temp_subkingdom == 'gymnosperm') {
									pg_n_client.querySync("UPDATE ct_trees_treesnap SET icon_type=4 where subkingdom='gymnosperm' AND genus ILIKE '" + genus +"' AND source_id=1;");
								}
								else if(temp_subkingdom == 'angiosperm') {
									pg_n_client.querySync("UPDATE ct_trees_treesnap SET icon_type=5 where subkingdom='angiosperm' AND genus ILIKE '" + genus + "' AND source_id=1;");
								}
							}

						}
						else {
							console.log('WARNING: Could not find organism information to update treesnap tree for species: ' + species);
							genus_lowercase = genus.toLowerCase();
							if(genus_lowercase == 'pinus' || genus_lowercase == 'acer') {
								
							}
							else {
								species_without_organismprop_subkingdom_data = species_without_organismprop_subkingdom_data + species + "\n";
							}
						}
					}
				}
				pg_n_client.querySync("UPDATE ct_trees_treesnap SET subkingdom = 'angiosperms' WHERE genus ILIKE 'acer' AND subkingdom IS NULL AND source_id=1;");
				pg_n_client.querySync("UPDATE ct_trees_treesnap SET subkingdom = 'gymnosperms' WHERE genus ILIKE 'pinus' AND subkingdom IS NULL AND source_id=1;");
				console.log('Saving failed species to ' + __basedir + '/info_species_without_organismprop_subkingdom_data.txt');
				fs.writeFile(__basedir + '/info_species_without_organismprop_subkingdom_data.txt', species_without_organismprop_subkingdom_data, function (err) {
				  if (err) throw err;
				  console.log('Saved!');
				});
				species_without_organismprop_subkingdom_data = "";

			}
			catch(err) {
				console.log(err);
			}
		
		},1000);
		res.status(200).json("success");
		return;		
	}
	else {
		res.status(200).json("no asup was given");
	}
}

exports.treesnap_consolidate_families = async function(req, res, next) {
	var api_superuser_password = req.query.asup;
	if(config.conf.api_superuser_password == api_superuser_password) {
		setTimeout(function() {
			var pg_n_client = new pg_native_client();
			try {
				//var species_without_organismprop_subkingdom_data = "";
				pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				var rows = pg_n_client.querySync('SELECT DISTINCT(genus,species), genus, species FROM ct_trees_treesnap WHERE family IS NULL AND source_id = 1;');
				if(rows.length > 0) {
					for(i=0; i<rows.length; i++) {
						genus = rows[i].genus;
						species = rows[i].species;
						species_parts = species.split(' ');
						species_name = species_parts[1];
						//console.log('RESULTS1:' + genus + ':' + species + ':' +  species_name);
						
						//This will find the subkingdom if one exists
						var rows2 = pg_n_client.querySync("SELECT * FROM chado.organism LEFT JOIN chado.organismprop ON chado.organism.organism_id = chado.organismprop.organism_id WHERE genus ILIKE '" + genus + "' AND organismprop.type_id = 10 LIMIT 1;");
						if(rows2.length > 0) {
							//If it reaches here, it's only one record found since we used LIMIT 1 above
							for(j=0; j<rows2.length; j++) {
								//perform the update
								var temp_organism_id = rows2[j].organism_id;
								var temp_family = rows2[j].value;
								var temp_genus = genus;
								var temp_species_name = species_name;
									 
								//console.log('RESULTS2:'  + temp_genus + ':' + temp_species_name + ':' + temp_subkingdom + ':' + temp_organism_id);								
								//console.log('Updating all records where subkingdom is null and species is:' + species + '. NEW SUBKINGDOM:' + temp_subkingdom);
								//pg_n_client.querySync("UPDATE ct_trees SET subkingdom = '" + temp_subkingdom + "' WHERE genus ILIKE '" + genus + "' AND species ILIKE '" + species + "' AND subkingdom IS NULL");
								
								console.log('Updating all records where family is null and genus is:' + genus + '. NEW Family:' + temp_family);
								pg_n_client.querySync("UPDATE ct_trees_treesnap SET family = '" + temp_family + "' WHERE genus ILIKE '" + genus + "' AND family IS NULL AND source_id=1;");
							}
						}
						else {
							console.log('WARNING: Could not find organism information to update treesnap tree for species: ' + species);
							/*
							genus_lowercase = genus.toLowerCase();
							if(genus_lowercase == 'pinus' || genus_lowercase == 'acer') {
								
							}
							else {
								species_without_organismprop_subkingdom_data = species_without_organismprop_subkingdom_data + species + "\n";
							}
							*/
						}
					}
				}
				/*
				pg_n_client.querySync("UPDATE ct_trees SET subkingdom = 'angiosperms' WHERE genus ILIKE 'acer' AND subkingdom IS NULL AND source_id=1;");
				pg_n_client.querySync("UPDATE ct_trees SET subkingdom = 'gymnosperms' WHERE genus ILIKE 'pinus' AND subkingdom IS NULL AND source_id=1;");
				console.log('Saving failed species to ' + __basedir + '/info_species_without_organismprop_subkingdom_data.txt');
				fs.writeFile(__basedir + '/info_species_without_organismprop_subkingdom_data.txt', species_without_organismprop_subkingdom_data, function (err) {
				  if (err) throw err;
				  console.log('Saved!');
				});
				species_without_organismprop_subkingdom_data = "";
				*/
				pg_n_client.end();
			}
			catch(err) {
				console.log(err);
			}
		
		},1000);
		res.status(200).json("success");
		return;		
	}
	else {
		res.status(200).json("no asup was given");
	}
}

/**
 * Adds the new treesnap trees to db
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.reload_treesnap = function(req, res, next) {
	var api_superuser_password = req.query.asup;
	

	var api_key = req.query.api_key;
	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		ct_cache.clear();		
		query ("SELECT uniquename FROM ct_trees WHERE source_id = 1 ORDER BY tree_num DESC LIMIT 1", [], function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			var uniquename = rows[0].uniquename;
			var treesnap_num = uniquename.split(".")[1];
			var page_num = Math.floor(Math.max(treesnap_num/100 - 6, 1));

			console.log('Performing Treesnap_add page no:' + page_num);
			utils.treesnap_add("https://treesnap.org/web-services/v1/observations?page=" + page_num);
			res.status(200).json("success");
			return;
		});	
	}
	else {		
		res.status(200).json("no asup was given");
		return;
	}
	//});
}



exports.force_find_treesnap_terms = function(req, res, next) {
	var api_superuser_password = req.query.asup;
	console.log("TreeSnap Terms:");
	console.log(utils.treesnap_terms);
	if(config.conf.api_superuser_password == api_superuser_password) {
		/*	
		for(var i=0; i< utils.treesnap_terms.length; i++) {
			fs.appendFileSync('treesnap_terms.txt', utils.treesnap_terms[i] + "\n");
		}
		*/
		try {
			utils.treesnap_terms = [];
			utils.treesnap_terms_tree_total = 0;
			utils.treesnap_terms_tree_current = 0;
			utils.treesnap_location_errors = 0;
			utils.treesnap_location_manual = 0;
			utils.treesnap_location_all = 0;
			var page_num = 1;
			utils.treesnap_add_get_terms_only("https://treesnap.org/web-services/v1/observations?page=" + page_num);
		}
		catch(err) {
			console.log(err);
		}
		res.status(200).json("success");
		return;

	}
	else {
		res.status(200).json("no asup was given");
		return;	
	}
}


exports.force_reload_treesnap = function(req, res, next) {
	var api_superuser_password = req.query.asup;
	

	var api_key = req.query.api_key;
	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		ct_cache.clear();		
		//var uniquename = rows[0].uniquename;
		//var treesnap_num = uniquename.split(".")[1];
		var page_num = 1;
		
		//console.log('Performing Treesnap_add page no:' + page_num);
		utils.treesnap_terms = [];
		utils.treesnap_add("https://treesnap.org/web-services/v1/observations?page=" + page_num);
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}
	//});
}

exports.process_startup_cache_build = function(req, res, next) {
	try {
		var api_superuser_password = req.query.asup;
		if(config.conf.api_superuser_password == api_superuser_password) {
			//var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_startup_cache_build.js']);
			var child = fork(__dirname + '/../process_startup_cache_build.js');
			child.on('exit', function (code, signal) {
				//console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
			});	
			child.on('message', function (message, sendHandle) {
				//console.log('[PROCESS_STARTUP_CACHE_BUILD] Received message:' + message);
				var result = JSON.parse(message);
				if(result.accession != undefined) {
					console.log('[treeController process_startup_cache_build] Received ' + message.length + ' bytes for Study ' + result.accession);
					if(message.length < 500) {
						console.log('[treeController process_startup_cache_build] WARNING Study data for ' + result.accession + ' seems small');
					}
				}
				else if(result.species != undefined) {
					console.log('[treeController process_startup_cache_build] Received ' + message.length + ' bytes for Species ' + result.species);
					if(message.length < 500) {
						console.log('[treeController process_startup_cache_build] WARNING Species data for ' + result.species + ' seems small');
					}					
				}
				//console.log('[treeController process_startup_cache_build] Caching SQL: ' + result.query_str);
				ct_cache.put(result.query_str, result.tree_features, cache_time_24);
			});

			if(res != null) {
				res.status(200).json("success");
			}
			return;
		}
		else {
			if(res != null) {
				res.status(200).json("no asup was given");
			}
			return;
		}		
		/*
		child.stdout.on('data', (data) => {
			console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
			console.error("" + data + "");
		});
		*/	
	}
	catch(err) {
		console.log(err);
		if (res != null) {
			res.status(200).json("error");
		}
		return;				
	}
}


exports.process_generategeojson_bienv4_by_species = function(req, res, next) {
	try {
		var api_superuser_password = req.query.asup;
		var species = req.query.species;
		var mbtiles = req.query.mbtiles;
		if(config.conf.api_superuser_password == api_superuser_password) {
			//var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_startup_cache_build.js']);
			var child = fork(__dirname + '/../process_generategeojson_bienv4_by_species.js');

			child.send(JSON.stringify({ 'species': species, 'mbtiles': mbtiles }));

			child.on('exit', function (code, signal) {
				//console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
			});	
			child.on('message', function (message, sendHandle) {
				//console.log('[PROCESS_STARTUP_CACHE_BUILD] Received message:' + message);
				var result = JSON.parse(message);
			});

			res.status(200).json("success");
			return;
		}
		else {
			res.status(200).json("no asup was given");
			return;
		}		
		/*
		child.stdout.on('data', (data) => {
			console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
			console.error("" + data + "");
		});
		*/	
	}
	catch(err) {
		console.log(err);
		res.status(200).json("error");
		return;				
	}	
}

exports.force_reload_bienv4 = function(req, res, next) {
	var api_superuser_password = req.query.asup;
	

	var api_key = req.query.api_key;
	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		ct_cache.clear();		
		//var skip_to = req.query.skip_to;
		//utils.treesnap_add("https://treesnap.org/web-services/v1/observations?page=" + page_num);
		const defaults = {
			shell: true
		};
		var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_import_bienv4_trees.js']);
		child.on('exit', function (code, signal) {
		  //console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
		});	
		child.stdout.on('data', (data) => {
		  console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
		  console.error("" + data + "");
		});		
		
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}
	//});
}

exports.force_reload_bienv4_linkedwithtganddryad = function(req, res, next) {
	var api_superuser_password = req.query.asup;
	

	var api_key = req.query.api_key;
	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		ct_cache.clear();		
		//var skip_to = req.query.skip_to;
		//utils.treesnap_add("https://treesnap.org/web-services/v1/observations?page=" + page_num);
		const defaults = {
			shell: true
		};
		var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_import_bienv4_trees_linkedwithtganddryad.js']);
		child.on('exit', function (code, signal) {
		  //console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
		});	
		child.stdout.on('data', (data) => {
		  console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
		  console.error("" + data + "");
		});		
		
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}
	//});
}

exports.reload_bienv4 = function(req, res, next) {
	var api_superuser_password = req.query.asup;
	

	var api_key = req.query.api_key;
	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		ct_cache.clear();		
		//var skip_to = req.query.skip_to;
		//utils.treesnap_add("https://treesnap.org/web-services/v1/observations?page=" + page_num);
		const defaults = {
			shell: true
		};
		var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_import_bienv4_update_trees.js']);
		child.on('exit', function (code, signal) {
		  //console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
		});	
		child.stdout.on('data', (data) => {
		  console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
		  console.error("" + data + "");
		});		
		
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}
	//});
}

exports.force_generategeometry_bienv4_linkedwithtganddryad = function(req, res, next) {
	var api_superuser_password = req.query.asup;
	

	var api_key = req.query.api_key;
	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		ct_cache.clear();		
		//var skip_to = req.query.skip_to;
		//utils.treesnap_add("https://treesnap.org/web-services/v1/observations?page=" + page_num);
		const defaults = {
			shell: true
		};
		var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_generategeometry_bienv4_trees_linkedwithtganddryad.js']);
		child.on('exit', function (code, signal) {
		  //console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
		});	
		child.stdout.on('data', (data) => {
		  console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
		  console.error("" + data + "");
		});		
		
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}
	//});
}

exports.cleanup_bienv4 = function(req, res, next) {
	var api_superuser_password = req.query.asup;
	

	var api_key = req.query.api_key;
	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		ct_cache.clear();		
		//var skip_to = req.query.skip_to;
		//utils.treesnap_add("https://treesnap.org/web-services/v1/observations?page=" + page_num);
		const defaults = {
			shell: true
		};
		var child = spawn('node', ['--max-old-space-size=1024', __dirname + '/../process_cleanup_bienv4_trees.js']);
		child.on('exit', function (code, signal) {
		  //console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
		});	
		child.stdout.on('data', (data) => {
		  console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
		  console.error("" + data + "");
		});		
		
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}
	//});
}


exports.force_reload_bienv4_endangeredtaxa = function(req, res, next) {
	var api_superuser_password = req.query.asup;
	

	var api_key = req.query.api_key;
	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		ct_cache.clear();		
		//var skip_to = req.query.skip_to;
		//utils.treesnap_add("https://treesnap.org/web-services/v1/observations?page=" + page_num);
		const defaults = {
			shell: true
		};
		var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_import_bienv4_endangeredtaxa.js']);
		child.on('exit', function (code, signal) {
		  //console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
		});	
		child.stdout.on('data', (data) => {
		  console.log("" + data + "");
		});
		child.stderr.on('data', (data) => {
		  console.error("" + data + "");
		});		
		
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}
	//});
}


function perform_bienv4_import() {
	//query("DELETE FROM ct_trees WHERE source_id = 3;", [], function (err, rows, result) {
	query("SELECT * FROM ct_trees_bien WHERE source_id = 3 LIMIT 1;", [], function (err, rows, result) {
			if (err) {
				console.log(err);
				//res.status(400);
				res.status(200).json("Error:" + err);
				return;
			}
			else {
				//Get all genus from TreeGenes to use for searching
				var pg_n_client_tg = new pg_native_client(); //Connect to TreeGenes Database server
				pg_n_client_tg.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				var rows = pg_n_client_tg.querySync("SELECT distinct(genus) FROM chado.organism order by genus asc OFFSET 131;");

				//semi global variables
				var tree_count_invalid = 0;
				var tree_count_valid = 0;
				var tree_count_abs = 0;
				
				var t0 = performance.now();
				
				console.log('[BIENv4 Force Reload] Detected ' + rows.length + ' genus from TreeGenes');
				for (var i = 0; i < rows.length; i++) {
					var genus_original = rows[i].genus;
					console.log('[BIENv4 Force Reload] --------------------------------------------');
					console.log('[BIENv4 Force Reload] Searching for observations for ' + genus_original + ' genus');
					
					//each genus record
					//continue to get data from BIENv4
					
					var pg_n_client_bienv4 = new pg_native_client();
					try {
						
						console.log('[BIENv4 Force Reload] Connecting to BIENv4 public database server');
						pg_n_client_bienv4.connectSync('postgresql://' + config.conf_bienv4.user + ':' + config.conf_bienv4.password + '@' + config.conf_bienv4.host + ':' + config.conf_bienv4.port + '/' + config.conf_bienv4.database + '');
						/*
						pg_n_client.querySync("set datestyle='ISO';");
						pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
						pg_n_client.querySync("SET bytea_output TO escape;");
						pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
						*/
						
						var rows_bien = pg_n_client_bienv4.querySync("SELECT COUNT(*) as c FROM view_full_occurrence_individual WHERE scrubbed_genus = '" + genus_original + "';");
						//console.log('Found ' + rows_bien.length + ' for ' + genus);
						if(rows_bien.length > 0) {
							for(j=0; j<rows_bien.length; j++) {
								var c = rows_bien[j].c;
								console.log("[BIENv4 Force Reload] There are " + c + ' individual occurrences for ' + genus_original);
								console.log("[BIENv4 Force Reload] Importing into ct_trees table. This could take a while!");

								//Remember to use specific rows to ease up network data download
								var rows_bien_trees_rows = pg_n_client_bienv4.querySync("SELECT taxonobservation_id, scrubbed_species_binomial, scrubbed_genus, scrubbed_family, higher_plant_group, latitude, longitude FROM view_full_occurrence_individual WHERE scrubbed_genus = '" + genus_original + "';");
								for(k=0; k<rows_bien_trees_rows.length; k++) {
									var uniquename = 'bien.' + rows_bien_trees_rows[k].taxonobservation_id;
									var species = rows_bien_trees_rows[k].scrubbed_species_binomial;
									var genus = rows_bien_trees_rows[k].scrubbed_genus;
									var family = rows_bien_trees_rows[k].scrubbed_family;
									var subkingdom = (rows_bien_trees_rows[k].higher_plant_group + "").split(" ")[0];
									var latitude = rows_bien_trees_rows[k].latitude;
									var longitude = rows_bien_trees_rows[k].longitude;
									var source_id = 3;
									var icon_type = 3;
									
									//console.log(rows_bien_trees_rows[k]); //for debugging per tree record... very verbose
									tree_count_abs = tree_count_abs + 1;
									if(species == null || latitude == null || longitude == null) {
								
										tree_count_invalid = tree_count_invalid + 1;											
										//console.log('[BIENv4 Force Reload] ' + uniquename + ' will be ignored because it contains too much nulls');
									}
									else {
										tree_count_valid = tree_count_valid + 1;
										if(subkingdom == 'flowering') {
											subkingdom = 'angiosperm';
										}
										pg_n_client_tg.querySync("INSERT INTO ct_trees_bien (uniquename, species, genus, family, subkingdom, latitude, longitude, source_id, icon_type) VALUES('" + uniquename + "','" + species + "','" + genus + "','" + family + "','" + subkingdom + "'," + latitude + "," + longitude +"," + source_id + "," + icon_type + ") ON CONFLICT(uniquename) DO NOTHING;");
										
										if(k % 1000 == 0) {
											console.log("[BIENv4 Force Reload] PROGRESS - " + k + " of " + rows_bien_trees_rows.length + " inserted [" + genus + "]");
										}
										//uniquename	genus	species	subkingdom	family	latitude	longitude	coordinate_type	source_id	icon_type	tree_num	external_name
										
										
										/*
										pool.query("INSERT INTO ct_trees (uniquename, species, genus, family, subkingdom, latitude, longitude, source_id, icon_type) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(uniquename) DO NOTHING",
											["treesnap." + tree_data["id"], tree_data["genus"] + " " + tree_data["species"], tree_data["genus"], null, null, tree_data["latitude"], tree_data["longitude"], 3, 3],
											function (err, result) {
												if (err) {
													console.log(err);
													return;
												}	
											}
										);
										*/	
									}
								}
								
							}
						}
						console.log('[BIENv4 Force Reload] Disconnected from BIENv4 public database server');
						pg_n_client_bienv4.end();
					}
					catch(err) {
						console.log(err);
					}							
					

				}
				console.log('[BIENv4 Force Reload] -------------------------------------------------------');
				console.log('[BIENv4 Force Reload] Valid tree records:' + tree_count_valid);
				console.log('[BIENv4 Force Reload] Invalid tree records:' + tree_count_invalid);
				console.log('[BIENv4 Force Reload] Total tree records:' + tree_count_abs);
				console.log('[BIENv4 Force Reload] -------------------------------------------------------');
				console.log('[BIENv4 Force Reload] Import completed.');
				var t1 = performance.now();
				console.log("[BIENv4 Force Reload] Elapsed time: " + ((t1 - t0)/1000) + " seconds.");
				pg_n_client_tg.end(); //Disconnect from TreeGenes database server

			}
			
	});
}


/**
 * Returns a json object with the species, genus and family fields for all trees that we have in our database
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
 exports.trees_get_fields_dynamic = function(req, res, next) {
	// var api_key = req.query.api_key;
	// utils.valid_api_key(api_key, res, function() {
		var source_ids = req.query.sids;
		var source_ids_parts = source_ids.split(',');
		var source_ids_string = '';
		for (var i=0; i<source_ids_parts.length; i++) {
			if(i != 0) {
				source_ids_string += ',';
			}
			source_ids_string += source_ids_parts[i];
		}
		
		//var cached_val = null; // override the code for this first version of this function
		var query_str = "SELECT DISTINCT ON(species) species, genus, family FROM ct_trees WHERE source_id IN (" + source_ids_string + ")";
		var cached_val = ct_cache.get(query_str);
		if (cached_val == null && source_ids_string != "") {
			query (query_str, [], function (err, rows, result) {
			//query("SELECT DISTINCT ON (species) species, genus, value as family FROM chado.organism LEFT JOIN chado.organismprop ON organism.organism_id = organismprop.organism_id WHERE organismprop.type_id = 10;",[], function (err,rows,result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				var trees_fields = {"species": [], "genus": {}, "family": {}};
				for (var i = 0; i < rows.length; i++) {
					trees_fields["species"].push(rows[i]["species"]);
					//trees_fields["species"].push(rows[i]["genus"] + ' ' + rows[i]["species"]);


					if (rows[i]["genus"] != null && rows[i]["genus"].length > 0) {
						trees_fields["genus"][rows[i]["genus"]] = true;
					}
					if (rows[i]["family"] != null && rows[i]["family"].length > 0) {
						trees_fields["family"][rows[i]["family"]] = true;
					}
				}
				ct_cache.put(query_str, trees_fields, cache_time_24);
				res.status(200).json(trees_fields);
				return;
			});
		}	
		else {
			res.status(200).json(cached_val);
			return;
		}
	// });
}

/**
 * Returns a json object with the species, genus and family fields for all trees that we have in our database
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_get_fields = function(req, res, next) {
	var api_key = req.query.api_key;
	utils.valid_api_key(api_key, res, function() {
		var cached_val = ct_cache.get("trees_fields");	
		if (cached_val == null) {
			query ("SELECT DISTINCT ON(species) species, genus, family FROM ct_trees WHERE source_id IN (0,1,2)", [], function (err, rows, result) {
			//query("SELECT DISTINCT ON (species) species, genus, value as family FROM chado.organism LEFT JOIN chado.organismprop ON organism.organism_id = organismprop.organism_id WHERE organismprop.type_id = 10;",[], function (err,rows,result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				var trees_fields = {"species": [], "genus": {}, "family": {}};
				for (var i = 0; i < rows.length; i++) {
					trees_fields["species"].push(rows[i]["species"]);
					//trees_fields["species"].push(rows[i]["genus"] + ' ' + rows[i]["species"]);


					if (rows[i]["genus"] != null && rows[i]["genus"].length > 0) {
						trees_fields["genus"][rows[i]["genus"]] = true;
					}
					if (rows[i]["family"] != null && rows[i]["family"].length > 0) {
						trees_fields["family"][rows[i]["family"]] = true;
					}
				}
				ct_cache.put("trees_fields", trees_fields, cache_time_24);
				res.status(200).json(trees_fields);
				return;
			});
		}	
		else {
			res.status(200).json(cached_val);
			return;
		}
	});
}

/**
 * Returns all the currently available marker types
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.markers_get_fields = function(req, res, next) {
	var api_key = req.query.api_key;
	
	utils.valid_api_key(api_key, res, function() {
		var cached_val = ct_cache.get("markers_fields");
		if (cached_val == null) {
			query ("SELECT * FROM geno_view_distinct ORDER BY marker_type", [], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				var output_arr = [];
				for (var i = 0; i < rows.length; i++) {
					output_arr.push(rows[i].marker_type);
					//res.status(200).json(rows);
				}
					
				ct_cache.put("marker_options", output_arr);
				res.status(200).json(output_arr);
				return;
			});
		}
		else {
			res.status(200).json(cached_val);
			return;
		}
	});
}

/**
 * Returns the basic information of a tree
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.tree_get_basic = function(req, res, next) {
	var tree_id = req.query.tree_id;
	var api_key = req.query.api_key;
	
	utils.valid_api_key(api_key, res, function() {
		var cached_val = ct_cache.get("tree_id=" + tree_id);
		if(cached_val == null) {
			query ("SELECT * FROM ct_trees WHERE uniquename = $1", [tree_id], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				// console.log('Querying the ct_trees');
				if(rows != undefined) {
					console.log('rows defined');
					if(rows.length > 0) {
						// console.log('rows more than 0');
						var species_name = rows[0].species;
						// console.log('Querying the endangered taxa');
						query ("SELECT * FROM ct_trees_bien_endangered_taxa WHERE taxon_rank = 'species' AND taxon_scrubbed_canonical = $1 LIMIT 1", [species_name], function (err, rows_endangered, result) {
							if (err) {
								//console.log(err);
								//res.status(400);
								//return;
							}
							//console.log(rows[0]);
							//console.log(rows_endangered[0]);
							if(rows_endangered != undefined) {
								try {
									if(rows_endangered.length > 0) {
										rows[0].endangered_cites_status = rows_endangered[0].cites_status;
										rows[0].endangered_iucn_status = rows_endangered[0].iucn_status;
										rows[0].endangered_usda_status_fed = rows_endangered[0].usda_status_fed;
										rows[0].endangered_usda_status_state = rows_endangered[0].usda_status_state;
									}
								}
								catch(err) {
									console.log(err);
								}
							}
							else {
								//To consider whether we should still add nulls - waste of bandwidth?
							}
							console.log(rows[0]);
							ct_cache.put("tree_id=" + tree_id, rows[0], cache_time_24);
							res.status(200).json(rows[0]);
							return;					
						});
					}
					else {
						// console.log('rows less than or equal zero');
						res.status(404).json("no tree");
						return;
					}
					/*
					ct_cache.put("tree_id=" + tree_id, rows[0], cache_time_24);
					res.status(200).json(rows[0]);
					return;
					*/
				}
				else {
					console.log('rows undefined');
					res.status(404);
					return;					
				}
			});
		}
		else {
			res.status(200).json(cached_val);
			return;
		}	
	});
};


/**
 * Returns the phenotypes of the passed tree id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.phenotypes_tree_get = function(req, res, next) {
	var tree_id = req.query.tree_id;
	var api_key = req.query.api_key;	
	
	utils.valid_api_key(api_key, res, function() {
		var key = tree_id + "_phenotype";
		var cached_val = ct_cache.get(key);
		if (cached_val == null) {
			if(tree_id.includes("treesnap") == true) {
				query ("SELECT * FROM ct_trees_phenotypes_treesnap WHERE tree_acc = $1 ORDER BY phenotype_name ASC;", [tree_id], function (err, rows, result) {
					if (err) {
						console.log(err);
						res.status(400);
						return;
					}
					else {
						ct_cache.put(key, rows, cache_time_24);
						res.status(200).json(rows);
						return;
					}
				});
			}
			else {
				query ("SELECT * FROM chado.new_pheno_view WHERE tree_acc = $1 ORDER BY phenotype_name ASC;", [tree_id], function (err, rows, result) {
					if (err) {
						console.log(err);
						res.status(400);
						return;
					}
					else {
						ct_cache.put(key, rows, cache_time_24);
						res.status(200).json(rows);
						return;
					}
				});
			}
		}
		else {
			res.status(200).json(cached_val);
			return;
		}
	});
}

/**
 * Returns a max of 16 genotypes of the passed tree id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.genotypes_tree_get = function(req, res, next) {
	var tree_id = req.query.tree_id;
	var api_key = req.query.api_key;	
	
	utils.valid_api_key(api_key, res, function() {
		var key = tree_id + "_genotype";
		var cached_val = ct_cache.get(key);
		if (cached_val == null) {
			query ("SELECT * FROM chado.new_geno_view WHERE tree_acc LIKE $1 LIMIT 16;", [tree_id + '%'], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				else {
					ct_cache.put(key, rows, cache_time_24);
					res.status(200).json(rows);
					return;
				}
			});				
		}
		else {
			res.status(200).json(cached_val);
			return;
		}
	});
}

/**
 * Count genotypes of the passed tree id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.genotypes_count_tree_get = function(req, res, next) {
	var tree_id = req.query.tree_id;
	var api_key = req.query.api_key;	
	
	utils.valid_api_key(api_key, res, function() {
		var key = tree_id + "_genotype_count";
		var cached_val = ct_cache.get(key);
		if (cached_val == null) {
			query ("SELECT COUNT(*) as c1 FROM chado.geno_view WHERE tree_acc = $1;", [tree_id], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				else {
					ct_cache.put(key, rows, cache_time_24);
					res.status(200).json(rows);
					return;
				}
			});				
		}
		else {
			res.status(200).json(cached_val);
			return;
		}
	});
}


/**
 * Count phenotypes of the passed tree id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
 exports.phenotypes_count_all_tree_get = function(req, res, next) {
	var tree_id = req.query.tree_id;
	var api_key = req.query.api_key;
	
	var tree_id_parts = tree_id.split('-');
	var accession = tree_id_parts[0];
	
	utils.valid_api_key(api_key, res, function() {
		var key = accession + "_phenotype_count_all";
		var cached_val = ct_cache.get(key);
		if (cached_val == null) {
			query ("SELECT COUNT(*) as c1 FROM chado.new_pheno_view WHERE tree_acc LIKE $1;", [accession + '%'], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				else {
					ct_cache.put(key, rows, cache_time_24);
					res.status(200).json(rows);
					return;
				}
			});				
		}
		else {
			res.status(200).json(cached_val);
			return;
		}
	});
}

/**
 * Count genotypes of the passed tree id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
 exports.genotypes_count_all_tree_get = function(req, res, next) {
	var tree_id = req.query.tree_id;
	var api_key = req.query.api_key;
	
	var tree_id_parts = tree_id.split('-');
	var accession = tree_id_parts[0];
	
	utils.valid_api_key(api_key, res, function() {
		var key = accession + "_genotype_count_all";
		var cached_val = ct_cache.get(key);
		if (cached_val == null) {
			query ("SELECT COUNT(*) as c1 FROM chado.geno_view WHERE tree_acc LIKE $1;", [accession + '%'], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				else {
					ct_cache.put(key, rows, cache_time_24);
					res.status(200).json(rows);
					return;
				}
			});				
		}
		else {
			res.status(200).json(cached_val);
			return;
		}
	});
}

/**
 * Returns the markers of the passed tree id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.markertypes_tree_get = function(req, res, next) {
	var tree_id = req.query.tree_id;
	var api_key = req.query.api_key;
	
	utils.valid_api_key(api_key, res, function() {	
		var key = tree_id + "_markertype";
		var cached_val = ct_cache.get(key);
		if (cached_val == null) {
			query ("SELECT DISTINCT ON(marker_type) * FROM chado.geno_view WHERE tree_acc = $1", [tree_id], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				else {
					ct_cache.put(key, rows, cache_time_24);
					res.status(200).json(rows);
					return;
				}
			});	
		}
		else {
			res.status(200).json(cached_val);
			return;
		}
	});
}

/**
 * Returns the publication information of a tree
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.publications_tree_get = function(req, res, next) {
	var tree_acc = req.query.tree_acc;
	var api_key = req.query.api_key;
		
	utils.valid_api_key(api_key, res, function() {
		var key = tree_acc + "_pub";
		var cached_val = ct_cache.get(key);
		if (cached_val == null) {
			query ("SELECT * FROM chado.tpps_study_summary LEFT JOIN public.chado_bio_data_13 ON tpps_study_summary.pub_id = chado_bio_data_13.record_id WHERE accession = $1", [tree_acc], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				else {
					ct_cache.put(key, rows, cache_time_24);
					res.status(200).json(rows);
					return;
				}
			});	
		}
		else {
			res.status(200).json(cached_val);
			return;
		}
	});
}


/**
 * Returns the treesnap data and properties of a treesnap tree as an object
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
 exports.tree_get_treesnap = function(req, res, next) {
	var tree_id = req.query.tree_id.split(".")[1];
	var api_key = req.query.api_key;		

	utils.valid_api_key(api_key, res, function() {
		var key = "ts_"+ tree_id; 
		var cached_val = null;//ct_cache.get(key);

		if (cached_val == null) {
			var options = {
				uri: "https://treesnap.org/web-services/v1/observation/" + tree_id, 
				method: "GET",
				headers: {
					"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
					"Accept": "application/json",
				},
				rejectUnauthorized: false
			}
			var req_result = request(options, function(error, response, body) {
				if (error) {
					console.log(error);
					res.status(400);
					return;
				}

				if (response.statusCode == 200) {
					ct_cache.put(key, body, cache_time_24);
					res.status(200).json(JSON.parse(body).data);
					return;
				}	
				res.status(response.statusCode).json("status code: " + response.statusCode);
				return;
			});
		}
		else {
			res.status(200).json(val);
			return;
		}
	});
}

/**
 * Returns the treesnap data and properties of a treesnap tree as an object
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.tree_get_treesnap_from_treesnap_api = function(req, res, next) {
	var tree_id = req.query.tree_id.split(".")[1];
	var api_key = req.query.api_key;		

	utils.valid_api_key(api_key, res, function() {
		var key = "ts_"+ tree_id; 
		var cached_val = null;//ct_cache.get(key);

		if (cached_val == null) {
			var options = {
				uri: "https://treesnap.org/web-services/v1/observation/" + tree_id, 
				method: "GET",
				headers: {
					"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
					"Accept": "application/json",
				},
			}
			var req_result = request(options, function(error, response, body) {
				if (error) {
					console.log(error);
					res.status(400);
					return;
				}

				if (response.statusCode == 200) {
					ct_cache.put(key, body, cache_time_24);
					res.status(200).json(JSON.parse(body).data);
					return;
				}	
				res.status(response.statusCode).json("status code: " + response.statusCode);
				return;
			});
		}
		else {
			res.status(200).json(val);
			return;
		}
	});
}

/**
 * Returns the total number of publications currently recorded
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.total_publications = function(req, res, next) {	
	query ("SELECT COUNT(*) AS count FROM (SELECT DISTINCT ON(accession) * FROM chado.tpps_study_summary) p", [], function(err, rows, result) {
		if (err) {
			console.log(err);
			res.status(400);
			return;
		}
		res.status(200).json(rows[0]["count"]);
		return;
	});
}

/**
 * Returns the total unique species currently recorded
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.total_unique_species = function(req, res, next) {
	query ("SELECT DISTINCT species FROM ct_trees WHERE source_id IN (0,1,2)", [], function(err, rows, result) {
		if (err) {
			console.log(err);
			res.status(400);
			return;
		}
		var species_arr = [];
		for(var i=0; i<rows.length;i++) {
			species_arr.push(rows[i].species);
		}
		res.status(200).json(species_arr);
		return;
	});
}

/**
 * Returns the total number of species currently recorded
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.total_species = function(req, res, next) {
	var query_str = "SELECT COUNT(*) AS count FROM (SELECT DISTINCT ON(species) * FROM ct_trees WHERE source_id IN (0,1,2,3)) t";
	var cached_results = ct_cache.get(query_str);
	if(cached_results == null) {
		query (query_str, [], function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			ct_cache.put(query_str, rows, cache_time_24);
			res.status(200).json(rows[0]["count"]);
			return;
		});
	}
	else {
		 var rows = cached_results;
		 res.status(200).json(rows[0]["count"]);
		 return;		 
	}
}

/**
 * Returns the total number of trees currently recorded
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.total_trees = function(req, res, next) {
	var query_str = "SELECT COUNT(*) FROM ct_trees;";
	var cached_results = ct_cache.get(query_str);
	if(cached_results == null) {
		query (query_str, [], function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			ct_cache.put(query_str, rows, cache_time_24);
			res.status(200).json(rows[0]["count"]);
			return;
		});
	}
	else {
		var rows = cached_results;
		res.status(200).json(rows[0]["count"]);
		return;
   }	
}

function build_tree_query_str(query_conditions, sources) {	
	var query_str = "SELECT DISTINCT ON(uniquename) * FROM ct_trees_all_view WHERE";
	//var query_str = "SELECT * FROM ct_trees_all_view WHERE";
	if (query_conditions.length > 0) {
		query_str = query_str + " " + query_conditions + " AND (";
	}
	else {
		query_str = "SELECT DISTINCT ON(uniquename) * FROM ct_trees_all_view WHERE (";
	}

	for (var s = 0; s < sources.length; s++) {
		if(sources[s] != 3) { // bien is not a json layer, do not include
			if (s > 0) {
				query_str += " OR ";
			}
			query_str += "source_id = " + sources[s];
		}
	}
	query_str += ")";
	
	
	/*
	//This was for when BIEN was a geojson layer (WSS version) - this has been deprecated in favour of geoserver tileset layer
	if(sources.includes("3") == true) {
		query_str += " AND (species IN (SELECT distinct(species) as species FROM public.ct_trees WHERE source_id = 0 OR source_id = 2))";
	}
	*/
	return query_str;
}

/**
 * Receives a json object which outlines the queries desired by the user, and creates a sql query out of it after parsing
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_list_qbuilder = function(req, res, next) {
	var api_key = req.query.api_key;
	
	utils.valid_api_key(api_key, res, function() {
		var query_str = build_tree_query_str(utils.parse_json_query(req.body["query"], ""), req.body["active_sources"]);

		var cached_trees = ct_cache.get(query_str);
		console.log(query_str);
		if (cached_trees == null) {
			console.log('Returning trees from direct Postgresql');
			query (query_str, [], function(err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}
				var tree_features = {"features":[], "center":[null, null]};
				var most_common = 0;
				var coords_to_freq = {};
				var freq_to_coords = {};
				var unq_species = {};
				var unq_pub = {};
				
				var tree_count = 0;
				var lon_leftmost = 99999;
				var lon_rightmost = -99999;
				var lat_topmost = -99999;
				var lat_bottommost = 99999;
				var center_lat = 0;
				var center_lon = 0;
				for (var i = 0; i < rows.length; i++) {
					

					// Record the widest cross section
					if(lon_leftmost > rows[i]["longitude"]) {
						lon_leftmost = rows[i]["longitude"];
					}
					if(lon_rightmost < rows[i]["longitude"]) {
						lon_rightmost = rows[i]["longitude"];
					}
					if(lat_topmost < rows[i]["latitude"]) {
						lat_topmost = rows[i]["latitude"];
					}
					if(lat_bottommost > rows[i]["latitude"]) {
						lat_bottommost = rows[i]["latitude"];
					}


					var curr_tree = {"type": "Feature"};
					var is_tree = new Boolean(rows[i]["is_tree"])
					is_tree = is_tree.toString();
					curr_tree["properties"] = {"id": rows[i]["uniquename"], "icon_type": rows[i]["icon_type"], "is_tree": is_tree, "sid": rows[i]["source_id"]};
					curr_tree["geometry"] = {"type": "Point", "coordinates": [rows[i]["longitude"], rows[i]["latitude"]]};
					if (rows[i]["accession"] != null && rows[i]["accession"].length > 0) {
						unq_pub[rows[i]["accession"]] = true;
					}
					if (rows[i]["species"].length > 0) {
						unq_species[rows[i]["species"]] = true;	
					}
						
					var coords_key = rows[i]["longitude"] + "_" + rows[i]["latitude"];
					var coords_count = coords_to_freq[coords_key] == undefined ? 1 : coords_count + 1;
						
					coords_to_freq[coords_key] = coords_count;
					freq_to_coords[coords_count] = coords_key;
					if (coords_count > most_common) {
						most_common = coords_count;
					}
					tree_features["features"].push(curr_tree);
					tree_count++;
				}
				if (most_common > 0) {
					var coords_split = freq_to_coords[most_common].split("_");
					tree_features["center"] = [parseFloat(coords_split[0]), parseFloat(coords_split[1])];
				}

				//Override center with new code
				center_lat = ((lat_topmost + lat_bottommost) / 2);
				center_lon = ((lon_rightmost + lon_leftmost) / 2);
				tree_features["center"] = [parseFloat(center_lon),parseFloat(center_lat)];

				tree_features["num_species"] = Object.keys(unq_species).length;
				tree_features["unq_species"] = unq_species;
				tree_features["num_pubs"] = Object.keys(unq_pub).length;
				tree_features["num_trees"] = tree_count;
				
				ct_cache.put(query_str, tree_features, cache_time_24);
				
				// We could put the compressed data into cache but for debug we won't do that
				// Perform compression
				tree_features = zlib_deflate_base64(JSON.stringify(tree_features));				

				res.status(200).json({'zlib_deflated_base64': tree_features});
				return;
			});
		}
		else {
			console.log('Retrieving trees from cache');
			// res.status(200).json(cached_trees);

			// Perform compression
			cached_trees = zlib_deflate_base64(JSON.stringify(cached_trees));
			res.status(200).json({zlib_deflated_base64: cached_trees});

			return;
		}
	});
};

/**
 * Returns all the trees that are currently present in the db
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_list = function(req, res, next) {
 	var cached_trees = ct_cache.get("trees_list");
	if(cached_trees == null) {
		query ("SELECT * FROM ct_trees WHERE source_id IN (0,1,2);", [], function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			var treeFeatures = [];
			for (var i = 0; i < rows.length; i++) {
				var currTree = {"type": "Feature"};
				var is_tree = new Boolean(rows[i]["is_tree"])
				is_tree = is_tree.toString();
				currTree["properties"] = {"id": rows[i]["uniquename"], "icon_type": rows[i]["icon_type"], "is_tree": is_tree};
				currTree["geometry"] = {"type": "Point", "coordinates": [rows[i]["longitude"], rows[i]["latitude"]]};
				treeFeatures.push(currTree);
			}
			ct_cache.put("trees_list", treeFeatures, cache_time_24);

			// We could put the compressed data into cache but for debug we won't do that
			// Perform compression
			treeFeatures = zlib_deflate_base64(JSON.stringify(treeFeatures));

			res.status(200).json({zlib_deflated_base64: treeFeatures});
			return;
		});
	}
	else {
		// Perform compression
		cached_trees = zlib_deflate_base64(JSON.stringify(cached_trees));
		res.status(200).json({zlib_deflated_base64: cached_trees});
		return;
	}	
};

function zlib_deflate_base64(input) {
	var zlib = require('zlib');
	var deflated = zlib.deflateSync(input).toString('base64');
	return deflated;
}



exports.wfid_consolidate_metadata = async function(req, res, next) {
	wfid_consolidate_metadata_function();
	
	res.status(200).json({'result':'executing in background'});	
	return;		
};

function wfid_consolidate_metadata_function() {
	// Set timeout makes it run in the background.
	var prefix = "[wfid_consolidate_metadata] ";
	// Find all distinct genus from WFID table
	try {
		var query_str = 'SELECT distinct(genus) FROM public.ct_trees_wfid';
		query(query_str, [], async function(err, rows, result) {
			if (err) {
				console.log(err);
				// res.status(400);
				return;
			}
			for(var i=0; i<rows.length; i++) {
				// Check to see whether this genus exists with populated data from ct_trees
				// var genus = rows[i]['genus'];
				await sleep(2000);
				console.log(prefix + 'Genus from WFID:' + rows[i]['genus']);
				var query_against_ct_trees = "SELECT * FROM public.ct_trees WHERE genus ILIKE $1 AND family IS NOT NULL AND subkingdom IS NOT NULL LIMIT 1;";
				query(query_against_ct_trees, [rows[i]['genus']], function(err, rows_against_ct_trees, result) {
					if (err) {
						console.log(err);
						// res.status(400);
						return;
					}					
					// If there is population
					if(rows_against_ct_trees.length > 0) {
						console.log(rows_against_ct_trees);
						console.log(rows_against_ct_trees.length);						
						// Update family metadata from ct_trees into wfid table
						var genus_str = rows_against_ct_trees[0].genus;
						var family = rows_against_ct_trees[0].family;
						var query_update_family = "UPDATE public.ct_trees_wfid SET family = $1 WHERE genus ILIKE $2 AND family is NULL;";
						query(query_update_family, [family, genus_str], function(err, rows_against_ct_trees, result) {
							if (err) {
								console.log(err);
								// res.status(400);
								return;
							}	
							console.log(prefix + ' Updating where genus (' + genus_str + ') update family to (' + family + ') AND subkingdom to (' + subkingdom + ')');
						});

						var subkingdom = rows_against_ct_trees[0].subkingdom
						if(subkingdom == 'flowering') {
							subkingdom = 'angiosperm';
						}
						var query_update_subkingdom = "UPDATE public.ct_trees_wfid SET subkingdom = $1 WHERE genus ILIKE $2 AND subkingdom is NULL;";
						query(query_update_subkingdom, [subkingdom, genus_str], function(err, rows_against_ct_trees, result) {
							if (err) {
								console.log(err);
								// res.status(400);
								return;
							}	
							console.log(prefix + ' Updating where genus (' + genus_str + ') update family to (' + family + ') AND subkingdom to (' + subkingdom + ')');
						});
					}
				});
			}
		});	

		// BIEN cross reference update family and subkingdom based on Genus
		var query_str_with_empty_vals = 'SELECT distinct(genus) as genus FROM public.ct_trees_wfid WHERE family IS NULL OR subkingdom IS NULL ORDER BY genus ASC;';
		query(query_str_with_empty_vals, [], async function(err, rows, result) {
			if (err) {
				console.log(err);
				// res.status(400);
				return;
			}

			// Go through each genus
			for(var genus_i=0; genus_i < rows.length; genus_i++) {
				await sleep(2000);
				var pg_n_client_bienv4 = new pg_native_client();
				try {
					var genus = rows[genus_i]['genus'];
					pg_n_client_bienv4.connectSync('postgresql://' + config.conf_bienv4.user + ':' + config.conf_bienv4.password + '@' + config.conf_bienv4.host + ':' + config.conf_bienv4.port + '/' + config.conf_bienv4.database + '');
					var rows_bien = pg_n_client_bienv4.querySync("SELECT * FROM view_full_occurrence_individual WHERE scrubbed_genus = '" + genus + "' LIMIT 1;");
					// This for statement only happens once since we limit the above SQL with LIMIT 1
					for(var rows_bien_i=0; rows_bien_i < rows_bien.length; rows_bien_i++) {
						// console.log(rows_bien_row);
						var rows_bien_row = rows_bien[rows_bien_i];
						var family = rows_bien_row.scrubbed_family;
						var subkingdom = (rows_bien_row.higher_plant_group + "").split(" ")[0];	
						if(subkingdom == 'flowering') {
							subkingdom = 'angiosperm';
						}
						var query_str_update_family_subkingdom = "UPDATE public.ct_trees_wfid SET family = $1, subkingdom = $2 WHERE genus ILIKE $3;";
						console.log('Updating WFID trees WHERE genus = ' + genus + ' set subkingdom = ' + subkingdom + ' and family = ' + family);
						query(query_str_update_family_subkingdom, [family, subkingdom, genus], function(err, rows_updated, result) {
							if (err) {
								console.log(err);
								// res.status(400);
								return;
							}
							console.log('updated');
							console.log(query_str_update_family_subkingdom);

						});				
						
					}
					pg_n_client_bienv4.end();
				}
				catch (err) {
					console.log(err);
				}
			}

		});

	}
	catch (try_err) {
		console.log(try_err);
	}
}

/**
 * Returns all the trees that are currently present in the db
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
 exports.wfid_trees_list = function(req, res, next) {
	var cached_trees = ct_cache.get("wfid_trees_list");
   if(cached_trees == null) {
	   query ("SELECT * FROM ct_trees_wfid;", [], function(err, rows, result) {
		   if (err) {
			   console.log(err);
			   res.status(400);
			   return;
		   }
		   var treeFeatures = [];
		   for (var i = 0; i < rows.length; i++) {
			   var currTree = {"type": "Feature"};
			   currTree["properties"] = {"id": rows[i]["uniquename"], "icon_type": rows[i]["icon_type"]};
			   currTree["geometry"] = {"type": "Point", "coordinates": [rows[i]["longitude"], rows[i]["latitude"]]};
			   treeFeatures.push(currTree);
		   }
		   ct_cache.put("wfid_trees_list", treeFeatures, cache_time_24);
		   res.status(200).json(treeFeatures);
		   return;
	   });
   }
   else {
	   res.status(200).json(cached_trees);
	   return;
   }	
};



/**
 * Returns all the trees that are currently present in the db based on source_id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_list_by_source_id = function(req, res, next) {
	var source_id = req.query.source_id;
	if(source_id == null) {
		
	}
	else {
		try {
			source_id = parseInt(source_id);
		}
		catch(err) {
			source_id = null;
		}
	}
 	var cached_trees = ct_cache.get("trees_list_" + source_id);
	if(cached_trees == null) {
		console.log('Performing query');
		query("SELECT * FROM ct_trees WHERE source_id = $1;", [source_id], function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			console.log('Query results returned');
			var treeFeatures = [];
			for (var i = 0; i < rows.length; i++) {
				var currTree = {"type": "Feature"};
				currTree["properties"] = {"id": rows[i]["uniquename"], "icon_type": rows[i]["icon_type"]};
				currTree["geometry"] = {"type": "Point", "coordinates": [rows[i]["longitude"], rows[i]["latitude"]]};
				treeFeatures.push(currTree);
				if(i % 1000 == 0) {
					console.log('Generating data for ' + i + ' of ' + rows.length + ' trees for source_id = ' + source_id);
				}
			}
			ct_cache.put("trees_list_" + source_id, treeFeatures, cache_time_24);
			res.status(200).json(treeFeatures);
			return;
		});
	}
	else {
		res.status(200).json(cached_trees);
		return;
	}	
};

function build_snp_query(trees_list) {
	var query_cond = "(";
	if (typeof(trees_list) == "object") {
		for (var i = 0; i < trees_list.length; i++) {
			query_cond += "$" + (i + 1);
			if (i < trees_list.length - 1) {
				query_cond += ", ";
			}
		}
	}
	else {
		query_cond += "$1";
		trees_list = [trees_list];
	}
	query_cond += ") ORDER BY tree_acc, marker_name";
	return {"query_str": "SELECT tree_acc, marker_name, description FROM chado.new_geno_view WHERE marker_type = 'SNP' AND tree_acc IN " + query_cond, "query_params": trees_list};
}


exports.tree_get_snp = function(req, res, next) {
	var tree_id = req.query.tree_id;
	console.log("Retrieving SNP data for Tree ID: " + tree_id);
	var query_str = "SELECT tree_acc, marker_name, description FROM chado.geno_view WHERE marker_type = 'SNP' AND tree_acc = $1;";
	query(query_str, [tree_id], function(err, rows, result) {
		if (err) {
			console.log(err);
			res.status(400);
			return;
		}

		var tree_acc = tree_id;
		var marker_name = "";
		var description = "";
		for (var i = 0; i < rows.length; i++) {
			tree_acc = rows[i]["tree_acc"];
			marker_name = rows[i]["marker_name"];
			description = rows[i]["description"];
		}
		res.status(200).json({"tree_acc":tree_acc,"marker_name":marker_name,"description":description});
		return;		
	});	
	return;
}

exports.trees_snps_missing = function(req, res, next) {
	var trees_list = req.body["trees"];
	var sql_query = build_snp_query(trees_list);
	console.log('snp query: ' + sql_query["query_str"]);
	console.log('snp query params: ' + sql_query["query_params"]);
	
	//var cached_snp_missing = ct_cache.get(sql_query);
		
	//if (cached_snp_missing == null) {
		query(sql_query["query_str"], sql_query["query_params"], function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}		

			var snps_missing = {};
			var trees_snp_data = {};
			var markers_all = {};
			//transfer to util.js file as functions
			for (var i = 0; i < rows.length; i++) {
				var tree = rows[i]["tree_acc"];
				var marker = rows[i]["marker_name"];
				var marker_des = rows[i]["description"];

				markers_all[marker] = 0;
				if (trees_snp_data[tree] == undefined) {			
					trees_snp_data[tree] = {};
				}
				
				trees_snp_data[tree][marker] = marker_des;
			}	
			
			var tree_snp_missing = {};
			for (var tree_id in trees_snp_data) {
				var tree_missing_count = 0;
				for (var snp in markers_all) {
					var tree_snp_des = trees_snp_data[tree_id][snp];
					if (tree_snp_des == undefined) {	
						var missing_count = snps_missing[snp];
						snps_missing[snp] = missing_count == undefined ? 1 : missing_count + 1;	
						tree_missing_count++;
					}
					else {
						if (tree_snp_des == "NA" || tree_snp_des.length <= 2) {
							var missing_count = snps_missing[snp];
							snps_missing[snp] = missing_count == undefined ? 1 : missing_count + 1;	
							tree_missing_count++;
						}
					}
				}
				tree_snp_missing[tree_id] = (tree_missing_count/Object.keys(markers_all).length) * 100;
			}

			var num_trees = Object.keys(trees_snp_data).length;
			var snps_missing_freq = {};
			var freq_to_snp = {};
			for (var snp in snps_missing) {
				var missing_percent = (snps_missing[snp]/num_trees) * 100;
				snps_missing_freq[snp] = missing_percent;
				if (freq_to_snp[missing_percent] == undefined) {
					freq_to_snp[missing_percent] = [];
				}
				freq_to_snp[missing_percent].push(snp);
			}
			//ct_cache.put(sql_query, JSON.stringify({"snps_to_missing_freq": snps_missing_freq, "freq_to_snp": freq_to_snp, "tree_snp_missing": tree_snp_missing}), cache_time_24);
			res.status(200).json({"snps_to_missing_freq": snps_missing_freq, "freq_to_snp": freq_to_snp, "tree_snp_missing": tree_snp_missing});
			return;
		});	
	/*}
	else {
		res.status(200).json(JSON.parse(cached_snp_missing));
		return;
	}*/
	//res.status(200).json(sql_query);
}

/**
 * Returns all the snp markers a tree currently has
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_snp = function(req, res, next) {
	var trees_list = req.query.tree_id;	
	var sql_query = build_snp_query(trees_list);
	
	query(sql_query["query_str"], sql_query["query_params"], function(err, rows, result) {
		if (err) {
			console.log(err);
			res.status(400);
			return;
		}

		var marker_freq = {};
		var tree_snp_data = {};
		var markers_available = {};
		for (var i = 0; i < rows.length; i++) {
			var tree = rows[i]["tree_acc"];
			var marker = rows[i]["marker_name"];
			var marker_des = rows[i]["description"];
			var is_homo = false;

			if (marker_des.length > 2 && marker_des.charAt(0) == marker_des.charAt(2)) {
				is_homo = true;
			}

			if (tree_snp_data[tree] == undefined) {
				tree_snp_data[tree] = {};
			}		
			tree_snp_data[tree][marker] = marker_des;
			
			//var marker_count = markers_available[marker];
			markers_available[marker] = 0;//marker_count == undefined ? 1 : marker_count + 1;
			
			if (marker_freq[marker] == undefined) {
				marker_freq[marker] = {};
				marker_freq[marker]["max"] = 0;
				marker_freq[marker]["homo_ref"] = null;
			}
			
			var marker_des_count = marker_freq[marker][marker_des];
			marker_freq[marker][marker_des] = marker_des_count == undefined ? 1 : marker_des_count + 1;
			if (is_homo && marker_freq[marker][marker_des] > marker_freq[marker]["max"]) {
				marker_freq[marker]["max"] = marker_freq[marker][marker_des];
				marker_freq[marker]["homo_ref"] = marker_des;
			}
		}

		var sorted_markers = Object.keys(markers_available).sort();
		
		var snp_table = [["NAME"]];	
		var missing_freq = {};
		snp_table[0] = snp_table[0].concat(sorted_markers);

		for (var tree_id in tree_snp_data) {
			var snp_table_row = [tree_id];	
			for (var snp_idx in sorted_markers) {
				var snp = sorted_markers[snp_idx];
				if (tree_snp_data[tree_id][snp] != undefined) {
					var marker_val = 0;
					var marker_des = tree_snp_data[tree_id][snp];
					if (marker_des.length > 2){
						if (marker_des.charAt(0) != marker_des.charAt(2)) {
							marker_val = 1;
						}
						else if (marker_freq[snp]["homo_ref"] != marker_des) {
							marker_val = 2;
						}
					}
					else {
						marker_val = "NaN";
						var missing_count = missing_freq[snp];
						missing_freq[snp] = missing_count == undefined ? 1 : missing_count + 1;
					}
					snp_table_row.push(marker_val);
				}
				else {
					var missing_count = missing_freq[snp];
					missing_freq[snp] = missing_count == undefined ? 1 : missing_count + 1;
					snp_table_row.push("NaN");
				}
			}
			snp_table.push(snp_table_row);
		}

		var snp_percent_missing = {};
		for (var snp in missing_freq) {
			snp_percent_missing[snp] = missing_freq[snp]/Object.keys(tree_snp_data).length;
		}
		res.status(200).json(snp_percent_missing);
		return;
	});
};


/**
 * Returns the associated publications given search input of year and other publication properties
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
/*
exports.search_publications = function(req, res, next) {
	var year = req.params.year;
	var search_param = Object.keys(req.query);
	
	var cached_publications = ct_cache.get(year + "_" + search_param + "_pubs");
	
	var base_query = "SELECT DISTINCT ON(accession) * FROM ct_pub_view";
	var matching_vals = [];	

	if (!isNaN(year)) {
		base_query += " WHERE pyear = $1";
		matching_vals.push("" + year);

		if (search_param.length > 0) {
			base_query += " AND " + search_param + " = $2";
			matching_vals.push(req.query[search_param]);
		}
		
	} 
	else if (search_param.length > 0) {
		base_query += " WHERE " + search_param + " = $1";
		matching_vals.push(req.query[search_param]);
	}	
	
	if (cached_publications == null) {
		query (base_query, matching_vals, function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			res.status(200).json(rows);
			return;
		});
	}
}
*/

/**
 * Returns the trees of a given phenotype or combination phenotypes
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_by_phenotype = function(req, res, next) {
	var base_query = "SELECT tree_acc FROM chado.new_pheno_view WHERE";
	var query_args = req.query;
	var matching = [];
	var idx = 1;
	var k = "";
	if (query_args.hasOwnProperty("pheno")) {
		var phenos = query_args.pheno;
		if (typeof(phenos) == "object") {	
			var obj_keys = Object.keys(phenos).sort(function(a,b){return (phenos[a]).localeCompare(phenos[b])});
			for (var i = 0; i < obj_keys.length; i++) {
				base_query += " phenotype_name = $" + idx;// + publications[pub_keys_sorted[i]] + "%"";
				if (i < obj_keys.length - 1) {
					base_query += " OR";
				}
				k += phenos[obj_keys[i]];
				matching.push(phenos[obj_keys[i]]);
				idx++;
			}
		}
		else {
			matching.push(phenos);
			k += phenos;
			base_query += " phenotype_name = " + "$1";
			idx++;
		}
	}
	if (query_args.hasOwnProperty("pato")) {
		var patos = query_args.pato;	
		if (matching.length > 0) {
			base_query += " OR";
		}
		if (typeof(patos) == "object") {	
			var obj_keys = Object.keys(patos).sort(function(a,b){return (patos[a]).localeCompare(patos[b])});
			for (var i = 0; i < obj_keys.length; i++) {
				base_query += " observable_name = $" + idx;// + publications[pub_keys_sorted[i]] + "%"";
				if (i < obj_keys.length - 1) {
					base_query += " OR";
				}
				k += patos[obj_keys[i]];
				matching.push(patos[obj_keys[i]]);
				idx++;
			}
		}
		else {
			matching.push(patos);
			k += patos;
			base_query += " observable_name = " + " $" + idx;
			idx++;
		}
	}
	if (query_args.hasOwnProperty("po")) {	
		var pos = query_args.po;	
		if (matching.length > 0) {
			base_query += " OR";
		}
		if (typeof(pos) == "object") {	
			var obj_keys = Object.keys(pos).sort(function(a,b){return (pos[a]).localeCompare(pos[b])});
			for (var i = 0; i < obj_keys.length; i++) {
				base_query += " structure_name = $" + idx;// + publications[pub_keys_sorted[i]] + "%"";
				if (i < obj_keys.length - 1) {
					base_query += " OR";
				}
				k += pos[obj_keys[i]];
				matching.push(pos[obj_keys[i]]);
				idx++;
			}
		}
		else {
			matching.push(pos);
			k += pos;
			base_query += " structure_name = " + " $" + idx;
			idx++;
		}
	}
	
	var cached_pheno_trees = ct_cache.get(k + "_trees");
	if (cached_pheno_trees == null) {
		console.log(base_query);
		query (base_query, matching, function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}

			res.status(200).json(rows);
			return;
		});
	}
	else {
		res.status(200).json(cached_pheno_trees);
		return;
	}
}

/**
 * Returns the trees given a marker type or combination of marker types
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_by_genotype = function(req, res, next) {
	var query_props = utils.parse_uni_query(req.query.marker_type, false, "marker_type");
	query_props["query_str"] = "SELECT tree_acc FROM ct_geno_view WHERE" + query_props["query_str"];
	
	var cached_marker_trees = ct_cache.get(query_props["key"] + "_trees");
	if (cached_marker_trees == null) {
		query (query_props["query_str"], query_props["query_vals"], function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}

			res.status(200).json(rows);
			return;
		});
	}
	else {
		res.status(200).json(cached_marker_trees);
		return;
	}
}

/**
 * Returns the trees given a publication id or multiple publication ids
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_by_publication = function(req, res, next) {
	var query_props = utils.parse_uni_query(req.query.pub_id, true, "uniquename");
	query_props["query_str"] = "SELECT * FROM ct_trees WHERE" + query_props["query_str"];
	//res.json(query_props);
	
	var cached_pub_list = ct_cache.get(query_props["key"] + "_trees");

	if (cached_pub_list == null) {
		get_tree_ids(res, query_props);
	}
	else {	
		res.status(200).json(cached_pub_list);
		return;
	}
}

/**
 * Returns the trees given a single family name or multiple family name joined by OR conditions
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_by_family = function(req, res, next) {		
	var query_props = utils.parse_uni_query(req.query.family_name, false, "family");	
	query_props["query_str"] = "SELECT * FROM ct_trees WHERE" + query_props["query_str"];
	var cached_family_list = ct_cache.get(query_props["key"] + "_trees");

	if (cached_family_list == null) {
		get_tree_ids(res, query_props);
	}
	else {
		res.status(200).json(cached_family_list);
		return;
	}
}


/**
 * Returns the trees given a single genus name or multiple genus name joined by OR conditions
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_by_genus = function(req, res, next) {
	var query_props = utils.parse_uni_query(req.query.genus_name, false, "genus");	
	query_props["query_str"] = "SELECT * FROM ct_trees WHERE" + query_props["query_str"];
	var cached_genus_list = ct_cache.get(query_props["key"] + "_trees");

	if (cached_genus_list == null) {
		get_tree_ids(res, query_props);
	}
	else {
		res.status(200).json(cached_genus_list);
		return;
	}
}

/**
 * Returns the trees given a single genus name or multiple species name joined by OR conditions
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_by_species = function(req, res, next) {
	var query_props = utils.parse_uni_query(req.query.species_name, false, "species");
	query_props["query_str"] = "SELECT * FROM ct_trees WHERE" + query_props["query_str"];

	var cached_species_list = ct_cache.get(query_props["key"] + "_trees");
	if (cached_species_list == null) {
		get_tree_ids(res, query_props);
	}
	else {
		res.status(200).json(cached_species_list);
		return;
	}
}

/**
 * Returns the trees given any number of source combinations from {0, 1, 2}
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_by_source = function(req, res, next) {
	var sources = req.query.source_id;
	var sources_idx = Object.keys(sources);
	var sources_arr = [];
	var placeholder = sources[0];	

	for (var i = 0; i < 3; i++) {
		if (i < sources_idx.length) {
			sources_arr.push(sources[i]);
		}
		else {
			sources_arr.push(placeholder);
		}
	}

	var cached_trees = ct_cache.get(sources_arr.join("_") + "_trees_list");
	if (cached_trees == null) {
		query ("SELECT * FROM ct_trees WHERE source_id = $1 OR source_id = $2 OR source_id = $3", sources_arr, function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			var treeFeatures = []; 
			for (var i = 0; i < rows.length; i++) {
				var currTree = {"type": "Feature"};
				currTree["properties"] = {"id": rows[i]["uniquename"], "icon": 0};
				currTree["geometry"] = {"type": "Point", "coordinates": [rows[i]["longitude"], rows[i]["latitude"]]};
				treeFeatures.push(currTree);
			}
			ct_cache.put(sources_arr.join("_") + "_trees_list", treeFeatures, 60*60*1000);
			res.status(200).json(treeFeatures);
			return;
		});
	}
	else {
		res.status(200).json(cached_trees);
		return;
	}
};

/**
 * Returns neon site summary data (using a scraping method)
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.data_get_neon_site_summary = function(req, res, next) {
	if(req.query.site != undefined) {
		var site = req.query.site;
		site = site.toUpperCase();

		//check cache
		var html = ct_cache.get('data_neon_html_' + site);
		if(html != null) {
			//we're good, do nothing since it will be processed
			data_get_neon_site_summary_process_html(site, res);
		}	
		else {
			var url = "https://www.neonscience.org/field-sites/field-sites-map/" + site;
			console.log('Retrieving url: ' + url)		
			//html = retus(url, {'responseType': 'text'});
			var request = require("request");

			request({uri: url}, function(error, response, body) {
				console.log(error);
				html = body;
				ct_cache.put('data_neon_html_' + site, html, cache_time_24);
				data_get_neon_site_summary_process_html(site, res);	
			});
			

		}

	}
	else {
		res.status(200).json('no site specified');
		return;
	}
};

function data_get_neon_site_summary_process_html(site, res) {
	try {
		var html = ct_cache.get('data_neon_html_' + site);
		//console.log(html);
		const root = parse(html);
		console.log(root);
		//console.log(root.querySelectorAll("p"));

		var json_object = {};

		//Site Name
		var element = root.querySelector(".page-title");
		//console.log(element);
		if(element != null) {
			var text = element.rawText.trim();
			
			json_object['site_name'] = text;
		}

		//Lat/Long
		var element = root.querySelector(".site-characteristics-field--latitude-longitude");
		//console.log(element);
		if(element != null) {
			var text = element.childNodes[1].rawText;
			
			json_object['latlon'] = text;
		}

		//Elevation
		var element = root.querySelector(".site-characteristics-field--elevation");
		//console.log(element);
		if(element != null) {
			var text = element.childNodes[1].rawText;
			
			json_object['elevation'] = text;
		}

		//Mean Annual Temperature
		var element = root.querySelector(".site-characteristics-field--temperature");
		//console.log(element);
		if(element != null) {
			var text = element.childNodes[1].rawText;
			
			json_object['temperature'] = text;
		}	

		//Mean Annual Precipitation
		var element = root.querySelector(".site-characteristics-field--precipitation");
		//console.log(element);
		if(element != null) {
			var text = element.childNodes[1].rawText;
			
			json_object['precipitation'] = text;
		}		

		//Dominant NLCD Classes
		var element = root.querySelector(".site-characteristics-field--dominant-NLCD-classes");
		//console.log(element);
		if(element != null) {
			var text = '';
			//console.log(element.childNodes.length);
			
			for(var i=1; i < element.childNodes.length; i++) {
				//console.log(element.childNodes[i]);
				if(i == 1) {
					text = element.childNodes[i].childNodes[0].rawText;
				}
				else {
					text = text + ', ' + element.childNodes[i].childNodes[0].rawText;
				}
			}
			
			json_object['dom_nlcd_classes'] = text;
		}

		//This contains some of the data like geology, dominant phenology species, mean canopy height, soil family, wind direction
		var all_ps = root.querySelectorAll("p");
		
		for(var i=0; i < all_ps.length; i++) {
			console.log('[' + i +'] ' + all_ps[i].rawText);
			if(all_ps[i].rawText.includes('Geology:')) {
				json_object['geology'] = all_ps[i+1].rawText; //this is the next line
			}
			else if(all_ps[i].rawText.includes('Dominant Phenology Species:')) {
				json_object['dominant_phenology_species'] = all_ps[i+1].rawText;
			}
			else if(all_ps[i].rawText.includes('Mean Canopy Height:')) {
				json_object['mean_canopy_height'] = all_ps[i+1].rawText;
			}
			else if(all_ps[i].rawText.includes('Soil Family:')) {
				json_object['soil_family'] = all_ps[i+1].rawText;
			}
			else if(all_ps[i].rawText.includes('Wind Direction:')) {
				json_object['wind_direction'] = all_ps[i+1].rawText;
			}				
		}


		//Img
		var element = root.querySelector("object");
		//console.log(element);
		if(element != null) {
			var img_object_html = element.toString();
			json_object['img_object_html'] = img_object_html;
		}		
	}
	catch(err) {
		console.log(err);
	}

	res.status(200).json(json_object);
	return;		
}

async function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}