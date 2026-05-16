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
const NextflowJobManager = require('./../includes/nextflow_job_manager.js').NextflowJobManager;
const { Pool, Client } = require("pg"); 
const pool = new Pool({
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	database: process.env.DB_NAME,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	max: 20,
	idleTimeoutMillis: 10000,
	connectionTimeoutMillis: 5000, 
});
const { spawn } = require('child_process');
const { fork } = require('child_process');
// const { stripHtml } = require('string-strip-html'); // ESM module doesn't work with require

const retus = require("retus");
const { parse } = require("node-html-parser");
//var pgsync = require('pg-sync');
const cache_time_72 = 72*60*60*1000;
const cache_time_24 = 24*60*60*1000;
const JSONdb = require('simple-json-db');
var db_storage = new JSONdb(__dirname + '/../storage.json', {asyncWrite: true, syncOnWrite: true});
const treeController_functions = require('./treeController_functions');
const { dir } = require('console');
const e = require('cors');
exports.db_storage = db_storage;

require("tls").DEFAULT_ECDH_CURVE = "auto";
var global = null;

exports.set_global = function (global_obj) {
	global = global_obj;
}

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
		// var data = req.body.data;
		data = req.body;
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
							  'Accept': 'application/json',
							  'Cache-Control': 'no-cache'
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
		console.log('oauth_object', oauth_object);
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
    console.log('wfid_import_observations_all error:', err);
  }
}


async function anecdata_login_do() {
	var axios = require('axios');
	var https = require('https');

	const axios_instance = axios.create({
		httpsAgent: new https.Agent({  
		  rejectUnauthorized: false
		})
	});

	var url = '';
	// url = 'https://anecdata.org/rest_users/login.json?nocache=' + Math.floor(Date.now() / 1000);
	url = 'https://api.anecdata.org/auth/login?nocache=' + Math.floor(Date.now() / 1000);
	console.log(url);
	// console.log(config);
	axios_instance({
		method: 'POST',
		url: url,
		data: {
			"email": config.conf_anecdata.username,
			"password": config.conf_anecdata.password			
		},
		headers: {
			'User-Agent': 'TreeGenesDB',
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		}
	}).then(function(response) {
		// console.log(response.data);
		var data = response.data;
		console.log(data.token);
		config.conf_anecdata.token_loggedin = data.token;
		// console.log(config.conf_anecdata);
		return data;
	}).catch (function(err) {
		console.log(err);
		return null;
	});
}




/**
 * This requests login from 
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.anecdata_login = async function(req, res, next) {
	try {
	  var api_superuser_password = req.query.asup;
	  //console.log('API SUPERUSER PASSWORD:' + config.conf.api_superuser_password);
	  if(config.conf.api_superuser_password == api_superuser_password) {
		var result = anecdata_login_do();
		if (result != null) {
			res.status(200).send('success');
		}
		else {
			res.status(400).send('failed');
		}

	  }
	  else {
		res.status(400).send('ASUP is required');
	  }
	}
	catch (err) {
		console.log(err);
		res.status(400).send(err);
	}
}

async function wfid_import_observations_page(url, oauth_object) {
	await sleep(2500);

	var axios = require('axios');
	var https = require('https');

	const axios_instance = axios.create({
		httpsAgent: new https.Agent({  
		  rejectUnauthorized: false
		})
	});

	try {
		axios_instance({
			method: 'get',
			url: url,
			headers: {
				'User-Agent': 'my request',
				'Authorization': 'Bearer ' + oauth_object.access_token,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			}
		}).then(function(response) {
			console.log('IT CAME HERE');
			var body = response.data;
			// console.log('body', body);
			console.log('body.next_page_url', body.next_page_url);
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
		}).catch(function(err) {
			console.log('err', err);
		});
	} catch (err) {
		console.log('err', err);
	}

	// REQUEST IS DEPRECATED
    // request.get(
	// 	{
	// 	  url: url,
	// 	  json: {},
	// 	  headers: {
	// 		  'User-Agent': 'my request',
	// 		  'Authorization': 'Bearer ' + oauth_object.access_token,
	// 		  'Content-Type': 'application/json',
	// 		  'Accept': 'application/json'
	// 	  }
	// 	},
	// 	function(error, response, body){
	// 	  // console.log(error);
	// 	  // console.log(response);
	// 	  // console.log(body);
	// 	  console.log(body.next_page_url);
	// 	  for(var i=0; i < body.data.length; i++) {
	// 		  try {
	// 			var observation_object = body.data[i];
	// 			var fuzzy_coordinates = fuzifyCoorinates(observation_object.location.latitude, observation_object.location.longitude);
	// 			var current_species = observation_object.species[0].latin_name;
	// 			var current_genus = observation_object.species[0].latin_name.split(' ')[0];
	// 			var species_parts = current_species.split(' ');
	// 			// console.log(species_parts);
	// 			// species_parts must contain at least 2 pieces (genus + species) to be valid
	// 			if(species_parts.length >= 2) {
	// 				if(species_parts[1] != '') {
	// 					var row = {
	// 						uniquename : 'WFID-' + observation_object.id,
	// 						genus : current_genus,
	// 						species : current_species,
	// 						latitude : fuzzy_coordinates.latitude,
	// 						longitude : fuzzy_coordinates.longitude,
	// 						subkingdom : '',
	// 						family : '',
	// 						source_id : 4,
	// 						icon_type : 6,
	// 						coordinate_type : 1
	// 					}


	// 					// Use the species_corrections CSV to either ignore or rename
	// 					var species_corrections = ct_cache.get('species_corrections');
	// 					// console.log(species_corrections);
	// 					var operation = null;
	// 					var correction = null;
	// 					for(var j=0; j<species_corrections.length; j++) {
	// 						if(species_corrections[j].species.toLowerCase() == current_species.trim().toLowerCase()) {
	// 							operation = species_corrections[j].operation;
	// 							correction = species_corrections[j].correction;
	// 							// Since we found a correction, break out of the loop
	// 							break;
	// 						}
	// 					}

	// 					if(operation == 'ignore') {
	// 						// do not add tree (left empty)
	// 					}
	// 					else {
	// 						if(operation == 'rename') {
	// 							// Set the species with the new correction
	// 							row.species = correction;
	// 							row.genus = correction.split(' ')[0];
	// 							console.log('Species correction: replacing ' + current_species + ' with ' + correction);
	// 						}

	// 						// Add tree if not ignore
	// 						utils.wfid_insert_tree(row);
	// 					}
	// 				}  
	// 			}
	// 		  }
	// 		  catch(err) {
	// 			  console.log(err);
	// 		  }

	// 	  }
	// 	  if(body.next_page_url != null && body.next_page_url != undefined && body.next_page_url != 'null') {
	// 		  wfid_import_observations_page(body.next_page_url, oauth_object);
	// 	  }
	// 	  else {
	// 		wfid_consolidate_metadata_function();
	// 	  }
	// 	}
	// ); 	
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
 * This should return tree_ids from genotype snps from an analysis_id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.genotypes_snp_vcf_filtering = async function(req, res, next) {
	try {
		var fs = require('fs');
		var axios = require('axios');
		var https = require('https');

		const axios_instance = axios.create({
			httpsAgent: new https.Agent({  
			  rejectUnauthorized: false
			})
		});

		var FormData = require('form-data');		
		var study_vcf_processing = {};
		// console.log(req.body);
		var vcf_info = JSON.parse(req.body.vcf_info);
		var analysis_id = req.body.analysis_id;
		var galaxy_id = req.body.galaxy_id;
		var history_id = req.body.history_id;
		var cartogratree_base_url = req.body.cartogratree_base_url;
		var studies = Object.keys(vcf_info);

		var all_vars = {
			cartogratree_base_url: cartogratree_base_url,
			vcf_info: vcf_info,
			analysis_id: analysis_id,
			galaxy_id: galaxy_id,
			history_id: history_id,
			studies: studies,
			study_vcf_processing: {},
			upload_history_files_count: 0
		};
		console.log(all_vars);

		for(var i=0; i<studies.length; i++) {
			var vcf_original_location = vcf_info[studies[i]];
			var vcf_exists = false;
			// check if the vcf exists
			if (fs.existsSync(vcf_original_location)) {
				vcf_exists = true;
			}
			if(vcf_original_location.endsWith('.vcf')) {
				if(vcf_exists) {
					all_vars.study_vcf_processing[studies[i]] = {
						study: studies[i],
						vcf_original_location: vcf_info[studies[i]],
						vcf_filter_generated_location: '',
						vcf_filter_generated: false,
						vcf_filtered_location: '',
						vcf_filtered: false,
					}
				}
				else {
					console.log(vcf_original_location);4
					console.log('error', 'Could not find the VCF in the path specified. Critical error.')
				}
			}
			else {
				console.log('error', 'there was a vcf original location which did not end with the .vcf extension - this is a security risk so this file has been ignored')
			}
		}

		all_vars['vcf_files_count'] = Object.keys(all_vars.study_vcf_processing).length;



		// We need to get all selected genotypes indexed into an object key format for searching
		var snps_selected = {};
		// Connect to the database and retrieve all records from the analysis data table
		// var pg_n_client = new pg_native_client();
		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');

		var query_str = "SELECT * FROM public.cartogratree_analysis_data WHERE analysis_id = $1 AND variable_name LIKE 'studies_snp_%';";
		// var rows = pg_n_client.querySync(query_str,[analysis_id]);
		var qres = await client.query(query_str,[analysis_id]);
		var rows = qres.rows;
		var snps = [];
		// go through each row which contains csv variable_data
		// RISH: 11/8/2024 - So this gets all snps from all corresponding studies for this analysis
		// and merges it into the snps[] array.
		for(var i=0; i<rows.length; i++) {
			var row = rows[i];
			var variable_data = row['variable_data'];// this is a csv
			var snps_arr = variable_data.split(',');
			snps = snps.concat(snps_arr);
		}
		// pg_n_client.end();
		client.release();

		// LIKELY DEPRECATED DUE TO HOW TPPS PULLS DATA INTO THE DB NOW
		// Go through each snp and remove the last _ part from the snp
		// for(var i=0; i < snps.length; i++) {
		// 	var last_index = snps[i].lastIndexOf('_');
		// 	snps[i] = snps[i].slice(0, last_index - 1);
		// }

		// Now generate the snps_selected index object
		// RISH: 11/8/2024 - This ensures duplicate snps are not contained and stored in snps_selected[] array
		for(var i=0; i<snps.length; i++) {
			if(snps_selected[snps[i]] == undefined) {
				snps_selected[snps[i]] = true;
			}
		}
		// console.log('SNPS SELECTED');
		// console.log(snps_selected);
		// console.log('snps', JSON.stringify(snps))

		// Delete the snps array to save memory
		snps = [];// empty it
		
		console.log('snps_selected object contains ' + Object.keys(snps_selected).length + ' snps');
		console.log('study_vcf_processing object', all_vars.study_vcf_processing);

		// process each file (we need the studies which contains key to access the rest of processing object)
		const lineByLine = require('n-readlines');
		
		all_vars['vcf_files_generated_count'] = 0; // this is used to generate the new vcf file with various filter changes made to it.
		for(var i=0; i<all_vars.studies.length; i++) {
			var study_accession = all_vars.studies[i];
			var vcf_info_object = all_vars.study_vcf_processing[study_accession];

			all_vars.study_vcf_processing[study_accession]['vcf_filter_generated_location'] = __dirname + '/../store/' + all_vars.analysis_id + '_' + study_accession + '_filter_generated.vcf';
			// check to see if the file already exists, if it does, delete
			if (fs.existsSync(all_vars.study_vcf_processing[study_accession]['vcf_filter_generated_location'])) {
				fs.unlinkSync(all_vars.study_vcf_processing[study_accession]['vcf_filter_generated_location']);
			}
			
			// Open a VCF file for writing line by line	
			var new_vcf_file = fs.createWriteStream(all_vars.study_vcf_processing[study_accession]['vcf_filter_generated_location'], {
				flags: 'a', // 'a' means appending (old data will be preserved)
				autoClose: true
			});

			var options = {
				line: "",
				headers_line: "",
				headers_found: false,
				filter_column: -1,
				id_column: -1,
				lineNumber: 0,
				new_vcf_file: new_vcf_file,
				study_accession: study_accession,
				vcf_original_location: vcf_info_object['vcf_original_location'],
				vcf_info_object: vcf_info_object,
			}
			process_vcf_lines_and_filter_by_snps(options);
			function process_vcf_lines_and_filter_by_snps(options) {
				// Initialize the line reader
				
				var lineReader = require('readline').createInterface({
					input: require('fs').createReadStream(options.vcf_info_object['vcf_original_location'])
				});
				// When a line is read, process it
				lineReader.on('line', function (line) {
					// console.log('Line from file:', line);
					// process.stdout.write('.');
					line = line.toString('ascii');
					line_tab_parts = line.split('\t');
					if(line.startsWith('#CHROM')) {
						options.headers_line = line;
						var headers_line_parts = options.headers_line.split('\t');
						// console.log('headers_line parts', headers_line_parts);
						options.filter_column = headers_line_parts.indexOf('FILTER');
						options.id_column = headers_line_parts.indexOf('ID');
						console.log('FILTER COLUMN INDEX IS:' + options.filter_column);
						console.log('ID/SNP COLUMN INDEX IS:' + options.id_column);
						options.headers_found = true;
					}
	
					var new_line = line;
					if(options.headers_found == true) {
						if(snps_selected[line_tab_parts[options.id_column]] == undefined) {
							// alter the line to the following:
							// replace PASS with FAIL in the FILTER COLUMN
							// write the line to the new file
							
							new_line = new_line.replace('PASS', 'FAIL');
						}
					}
	
					options.new_vcf_file.write(new_line + "\r\n");
	
					if(options.lineNumber % 1000 == 0) {
						// console.log('Line ' + lineNumber + ': ' + line.toString('ascii'));
					}
					options.lineNumber++;
				});
	
				lineReader.on('close', function() {
					console.log('Finished reading file');
					file_end(options.new_vcf_file, options.study_accession, options.vcf_original_location);
				});
			}


			function file_end(new_vcf_file, study_accession, vcf_original_location) {
				//var current_study_accession = study_accession; // not sure if this is async correct
				// new_vcf_file.end(function () {
				// 	console.log('File save end');
				// 	try {
				// 		// new_vcf_file.close();
				// 		// new_vcf_file.end();
				// 	}
				// 	catch (err) {
				// 		console.log('File save end', err);
				// 	}
				// 	all_vars.vcf_files_generated_count = all_vars.vcf_files_generated_count + 1;
				// 	all_vars.study_vcf_processing[study_accession]['vcf_filter_generated'] = true;	
				// 	console.log('File save close');

				// });

				new_vcf_file.close();

				new_vcf_file.on("close", () => {	
					all_vars.vcf_files_generated_count = all_vars.vcf_files_generated_count + 1;
					console.log('all_vars.vcf_files_generated_count', all_vars.vcf_files_generated_count);
					// all_vars.study_vcf_processing[study_accession]['vcf_filter_generated'] = true;	
					console.log('File save close');

					// THIS CHECKS IF ALL FILES HAVE BEEN GENERATED
					console.log('vcf_files_generated_count', all_vars.vcf_files_generated_count);
					console.log('vcf_files_count', all_vars.vcf_files_count);
					if(all_vars.vcf_files_generated_count == all_vars.vcf_files_count) {
						console.log('All VCF files have been generated and is now about to be filtered')
						
						// all files have been finished being generated
						// so now we need to execute vcftools to perform the actual filter
						for(var i=0; i<all_vars.studies.length; i++) {
							var study_accession = all_vars.studies[i];
							console.log(study_accession);
							// if (study_accession != undefined) {
								var vcf_info_object = all_vars.study_vcf_processing[study_accession];
								console.log(vcf_info_object);
								// if (vcf_info_object != undefined) {
			
									all_vars.study_vcf_processing[study_accession]['vcf_filtered_location'] = __dirname + '/../store/' + all_vars.analysis_id + '_' + study_accession + '_filtered.vcf';
									console.log(all_vars.study_vcf_processing[study_accession]['vcf_filtered_location']);
				
									if(fs.existsSync(all_vars.study_vcf_processing[study_accession]['vcf_filtered_location'])) {
										fs.unlinkSync(all_vars.study_vcf_processing[study_accession]['vcf_filtered_location']);
									}

									
									const exec = require('child_process').exec;
									// code = execSync('node -v');
									var cmd = "/usr/local/bin/vcftools --vcf " + vcf_info_object['vcf_filter_generated_location'] + " --stdout --recode --remove-filtered-all  > " + vcf_info_object['vcf_filtered_location'];
									console.log('cmd', cmd);
									perform_filtering_with_vcftools(cmd, vcf_info_object);
									function perform_filtering_with_vcftools(cmd, vcf_info_object) {
										var child = exec(cmd, function(error, stdout, stderr) {
											if(error) {
												console.log(error);
												// results['error'] = true;
												// res.send(JSON.stringify(results));
												// JSON.stringify({result: 'failed'})
												return;
											}
									
											console.log('New filtered VCF generated');
											console.log('Attempting to upload filtered VCF file: ' + vcf_info_object['vcf_filtered_location']);
					
											// We have the filtered file and now we can upload it back to server
											// Open file as a readable stream
											const fileStream = fs.createReadStream(vcf_info_object['vcf_filtered_location']);
					
					
											const form = new FormData();
											// Pass file stream directly to form
											form.append('galaxy_id', all_vars['galaxy_id']);
											form.append('history_id', all_vars['history_id']);
											form.append('file1', fileStream, 'AN' + all_vars.analysis_id + '_' + vcf_info_object['study'] + '_snps.vcf');
									
					
											var url = all_vars.cartogratree_base_url + "/cartogratree_uianalysis/upload_file_to_history";
											axios_instance.post(url, form, {
												headers: {
													...form.getHeaders()
												},	
												'maxContentLength': Infinity,
												'maxBodyLength': Infinity						
											}).then(function(response) {
												console.log(response.data)
												// var resp_object = JSON.stringify(response.data);
												all_vars.upload_history_files_count = all_vars.upload_history_files_count + 1;
												checkIfUploadsCompleted();
												// fs.unlink(all_vars.study_vcf_processing[study_accession]['vcf_filtered_location']);
											})
											.catch(function (error) {
												console.log('New filtered VCF error (in the function, not necessarily the filter file):');
												// console.log(error);
												console.log(error.response.data);
												all_vars.upload_history_files_count = all_vars.upload_history_files_count + 1;
												checkIfUploadsCompleted();
												// fs.unlink(all_vars.study_vcf_processing[study_accession]['vcf_filtered_location']);
											});

											function checkIfUploadsCompleted() {
												if(all_vars.upload_history_files_count == all_vars.vcf_files_count) {
													console.log('Files finished uploading');
													// clearInterval(check_if_files_uploaded_interval);
													res.send(JSON.stringify({result: 'success'}));
												}
											}
					
											//exec("rm -f " + __dirname + '/../store/' + analysis_id + '_pca_phenotypes.csv');
											//exec("rm -f " + __dirname + '/../store/' + analysis_id + '_pca_phenotypes.jpeg');
											// res.send(JSON.stringify(results));
										});
									}
								// }
							// }
						}
					}

				});

				new_vcf_file.on("finish", () => {
					// console.log("FILE IS NOW FINISHED");
				})

				

			}
		}

		// VCF GENERATION WITH FILTER MODIFICATIONS DONE TO THE FILTER COLUMN
		// NOW CONTINUE TO PERFORM THE ACTUAL FILTERING USING VCF TOOLS
		// var interval_check_generated_completion = setInterval(function() {
		// 	console.log('Interval checking on VCF generation...');
		// 	console.log('vcf_files_generated_count', all_vars.vcf_files_generated_count);
		// 	console.log('vcf_files_count', all_vars.vcf_files_count);
		// 	if(all_vars.vcf_files_generated_count == all_vars.vcf_files_count) {
		// 		console.log('All VCF files have been generated and is now about to be filtered')
		// 		// all files have been finished being generated
		// 		// so now we need to execute vcftools to perform the actual filter
		// 		for(var i=0; i<all_vars.studies.length; i++) {
		// 			var study_accession = all_vars.studies[i];
		// 			var vcf_info_object = all_vars.study_vcf_processing[study_accession];

		// 			all_vars.study_vcf_processing[study_accession]['vcf_filtered_location'] = __dirname + '/../store/' + all_vars.analysis_id + '_' + study_accession + '_filtered.vcf';


		// 			if(fs.existsSync(all_vars.study_vcf_processing[study_accession]['vcf_filtered_location'])) {
		// 				fs.unlinkSync(all_vars.study_vcf_processing[study_accession]['vcf_filtered_location']);
		// 			}

		// 			const exec = require('child_process').exec;
		// 			// code = execSync('node -v');
		// 			var cmd = "/usr/local/bin/vcftools --vcf " + vcf_info_object['vcf_filter_generated_location'] + " --stdout --recode --remove-filtered-all  > " + vcf_info_object['vcf_filtered_location'];
		// 			console.log('cmd', cmd);
		// 			var child = exec(cmd, function(error, stdout, stderr) {
						
		// 				if(error) {
		// 					console.log(error);
		// 					results['error'] = true;
		// 					// res.send(JSON.stringify(results));
		// 					return;
		// 				}
				
		// 				console.log('New filtered VCF generated');

		// 				// We have the filtered file and now we can upload it back to server
		// 				// Open file as a readable stream
		// 				const fileStream = fs.createReadStream(vcf_info_object['vcf_filtered_location']);


		// 				const form = new FormData();
		// 				// Pass file stream directly to form
		// 				form.append('galaxy_id', all_vars['galaxy_id']);
		// 				form.append('history_id', all_vars['history_id']);
		// 				form.append('file1', fileStream, 'AN' + all_vars.analysis_id + '_' + vcf_info_object['study'] + '_snps.vcf');
				

		// 				var url = all_vars.cartogratree_base_url + "/cartogratree_uianalysis/upload_file_to_history";
		// 				axios_instance.post(url, form, {
		// 					headers: {
		// 						...form.getHeaders()
		// 					},	
		// 					'maxContentLength': Infinity,
		// 					'maxBodyLength': Infinity						
		// 				}).then(function(response) {
		// 					 console.log(response.data)
		// 					 var resp_object = JSON.stringify(response.data);
		// 					 all_vars.upload_history_files_count = all_vars.upload_history_files_count + 1;
		// 					// fs.unlink(all_vars.study_vcf_processing[study_accession]['vcf_filtered_location']);
		// 				})
		// 				.catch(function (error) {
		// 					console.log(error);
		// 					all_vars.upload_history_files_count = all_vars.upload_history_files_count + 1;
							
		// 					// fs.unlink(all_vars.study_vcf_processing[study_accession]['vcf_filtered_location']);
		// 				});



		// 				//exec("rm -f " + __dirname + '/../store/' + analysis_id + '_pca_phenotypes.csv');
		// 				//exec("rm -f " + __dirname + '/../store/' + analysis_id + '_pca_phenotypes.jpeg');
		// 				// res.send(JSON.stringify(results));
		// 			});


		// 		}

		// 		// stop the interval as well
		// 		clearInterval(interval_check_generated_completion);

		// 		var check_if_files_uploaded_interval = setInterval(function() {
		// 			console.log('Checking if files have been uploaded to galaxy...');
		// 			if(all_vars.upload_history_files_count == all_vars.vcf_files_count) {
		// 				console.log('Files finished uploading');
		// 				clearInterval(check_if_files_uploaded_interval);
		// 				res.send(JSON.stringify({result: 'success'}));
		// 			}
		// 		},1000);
		// 	}
		// }, 1000);
		

		// res.status(200).send({'results':'ok'});	
	}
	catch (err) {
		console.log(err);
		res.status(400).send({'results':err});
	}
 }

/**
 * This should return tree_ids from genotype snps from an analysis_id
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.genotypes_snps_get_tree_ids_by_analysis_id = async function(req, res, next) {
	try {
		var analysis_id = req.body.analysis_id;
		var studies = JSON.parse(req.body.studies);
		console.log('req.body', req.body);
		// Let us use query synchronized for procedural querying
		// var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');

		var query_str = "SELECT * FROM public.cartogratree_analysis_data WHERE analysis_id = $1 AND variable_name LIKE 'studies_snp_%';";
		// var rows = pg_n_client.querySync(query_str,[analysis_id]);
		var qres = await client.query(query_str,[analysis_id]);
		var rows = qres.rows;
		var snps = [];
		// go through each row which contains csv variable_data
		for(var i=0; i<rows.length; i++) {
			var row = rows[i];
			var variable_data = row['variable_data'];// this is a csv
			var snps_arr = variable_data.split(',');
			snps = snps.concat(snps_arr);
		}
		console.log('snps', JSON.stringify(snps))


		var query_str = "";
		query_str = "SELECT * FROM (select distinct unnest(tree_accessions) as tree_accessions from chado.tree_accessions_per_individual_marker where marker in(";
		for(var i=0; i<snps.length; i++) {
			if(i > 0) {
				query_str += ',';
			}
			query_str += "'" + snps[i] + "'";
		}
		query_str += ")) as table1 WHERE (";
		// query_str += " AND (";
		for(var i=0; i<studies.length; i++) {
			if (i > 0) {
				query_str += " OR ";
			}
			query_str += "tree_accessions::TEXT ILIKE '" + studies[i] + "%'";
		}
		query_str += ")";

		console.log('query_str', query_str);

		// SELECT av.uniquename, latitude, longitude FROM ct_trees_all_view av JOIN (
		// 	SELECT uniquename FROM chado.stock_genotype sg LEFT JOIN chado.stock s ON sg.stock_id = 
		// 	s.stock_id 
		// 	WHERE sg.stock_genotype_id IN (
		// 	   SELECT feature_id FROM chado.feature WHERE uniquename IN ('scaffold_10_12172880')
		// 	)
		//   ) as t_output ON av.uniquename = t_output.uniquename


		var rows = [];
		if(snps.length > 0) {
			// rows = pg_n_client.querySync(query_str,[]);
			qres = await client.query(query_str,[]);
			rows = qres.rows;
			console.log(rows);
		}
		// pg_n_client.end();	
		client.release();
		res.send(JSON.stringify(rows));
	}
	catch (err) {
		console.log(err);
		res.status(400).send('error:' + err);
	}
}

/**
 * This function should return the unit for a specific phenotype in the studies specified
 * So basically you specify a phenotype_name and list of studies in an array
 * and it will return rows that contains the units. This is used to determine if conversion
 * is necessary in CartograPlant.
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */

exports.phenotypes_single_phenotype_name_units_per_studies = function(req, res, next) {
	console.log(req.body.studies);
	console.log(req.body.phenotype_name);
	var studies = [];
	
	if(req.body.studies != undefined) {
		studies = JSON.parse(req.body.studies); // should be an array
	}
	console.log('IT CAME HERE');

	var phenotype_name = req.body.phenotype_name;
	console.log("Phenotype name:" + phenotype_name);

	var query_str = "SELECT * FROM chado.phenotypes_and_units_by_study WHERE phenotype = ";
	query_str += "$1 AND accession IN (";
	console.log(query_str);
	for(var i = 0; i<studies.length; i++) {
		if (i > 0) {
			query_str += ',';
		}
		query_str += "'" + studies[i] + "'";
		
	}
	query_str += ");";
	console.log(query_str);
	query (query_str, [phenotype_name], function (err, rows, result) {
		if (err) {
			console.log(err);
			res.status(400);
			return undefined;
		}
		res.status(200).json(rows);
	});
}

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
 * This should return overlapping genotypes by study
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.genotypes_overlapping_markers_by_study_ids = function(req, res, next) {
	console.log('gentypes_overlapping_markers_by_study_ids');
	console.log(req.body.studies);
	var studies = [];
	if(req.body.studies != undefined) {
		studies = JSON.parse(req.body.studies); // should be an array
	}
	if(studies.length > 0) {
		var query_str = 'SELECT accessions, markers FROM chado.test_studies_marker_overlap WHERE ';
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
 * This should return all phenotypes by studies specified (overlapping and none overlapping)
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
  exports.phenotypes_phenotypes_count_by_overlapping_studies = function(req, res, next) {
	console.log('phenotypes_phenotypes_count_by_overlapping_studies');
	console.log(req.body.studies);
	var results = {};
	var studies = [];
	var phenotype_name = req.body.phenotype_name;
	if(req.body.studies != undefined) {
		studies = JSON.parse(req.body.studies); // should be an array
	}
	if(studies.length > 0) {
		// First version
		// var query_str = 'SELECT count(distinct(phenotype_id)) as c1, units FROM (';
		// // console.log(query_str);
		// for(var i=0; i<studies.length; i++) {
		// 	if(i > 0) {
		// 		query_str += " UNION (SELECT * FROM chado.phenotype_view WHERE phenotype = '" + phenotype_name + "' AND study_accession = '" + studies[i] + "') ";
		// 	}
		// 	else {
		// 		query_str += "(SELECT * FROM chado.phenotype_view WHERE phenotype = '" + phenotype_name +"' AND study_accession = '" + studies[i] + "') "
		// 	}
		// }
		// query_str += ") as t_output GROUP BY units";

		// Optimized version suggested by Emily G.
		var query_str = 'SELECT count(distinct(phenotype_id)) as c1, units FROM chado.phenotype_view ';
		query_str += "WHERE phenotype = '" + phenotype_name + "' AND study_accession IN (";
		for(var i=0; i<studies.length; i++) {
			if(i > 0) {
				query_str += ',';
			}
			query_str += "'" + studies[i] + "'";
		}
		query_str += ") group by units;";

		console.log(query_str);
		query (query_str, [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400).json({'error': err});
				return;
		}
		//console.log(rows);
		
		results['rows'] = rows;
		results['phenotype_name'] = phenotype_name;
		res.status(200).json(results);
		});
	}
	else {
		var rows = [];
		results['rows'] = rows;
		results['phenotype_name'] = phenotype_name;
		res.status(200).json(results);
	}
 }

 /**
 * This should return all phenotypes by studies specified (overlapping and none overlapping)
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
  exports.popstruct_fast_structure= function(req, res, next) {
	try {
		var realtime_client_id = req.body.realtime_client_id;
		var analysis_id = req.body.analysis_id; 
		var k_value = req.body.k_value; 
		var vcf_url = req.body.vcf_url; 
		var results = {};
		const axios = require('axios');
		const https = require('https');
		const instance = axios.create({
			httpsAgent: new https.Agent({  
			rejectUnauthorized: false
			})
		});
		instance.get(vcf_url, {responseType: "stream"})  
		.then(response => {

			// If k_value is unset for some reason, set it as default = 2
			if (k_value == undefined) {
				k_value = 2;
			}
			else if (k_value == "") {
				k_value = 2;
			}
			k_value = parseInt(k_value);
			if(k_value == NaN) {
				k_value = 2;
			}

			const exec = require('child_process').exec;
			const execSync = require('child_process').execSync;
			// remove all analysis_popstruct files for related analysis
			if(analysis_id != undefined) {
				if(analysis_id != "") {
					try {
						global.io.to(realtime_client_id).emit('analysis_response', {
							type: 'popstruct_status',
							message: 'Clearing old population structure analysis files'
						});
					} catch (err) { console.log(err) }
					var cmd_rm = "rm -f " + __dirname + "/../store/" + analysis_id + "_popstruct_*";
					console.log('cmd', cmd_rm);
					var child_rm = execSync(cmd_rm, function(error, stdout, stderr) {
						console.log('Deleted ' + analysis_id + '_popstruct_* files');
					})
				}
			}

			try {
				global.io.to(realtime_client_id).emit('analysis_response', {
					type: 'popstruct_status',
					message: 'Initialization - Pulling your selected Population Structure VCF file from Galaxy to CP API for processing...'
				});
			} catch (err) { console.log(err) }
			// Saving file to working directory 
			var vcf_local_location = __dirname + '/../store/' + analysis_id + '_popstruct_vcf.vcf'; 
			// Write the file to the store directory using the WriteStream
			var writeStream = fs.createWriteStream(vcf_local_location);
			response.data.pipe(writeStream);
			writeStream.on('finish', function() {
				console.log('File finished written');

				try {
					global.io.to(realtime_client_id).emit('analysis_response', {
						type: 'popstruct_status',
						message: 'Step 1 - Performing PLINK processing on VCF file...'
					});
				} catch (err) { console.log(err) }
				// Run the Plink step 1
				// code = execSync('node -v');
				var cmd_plink = __dirname + "/../plink/plink --vcf " + vcf_local_location + " --allow-extra-chr --double-id --make-bed --vcf-half-call m --out "  + __dirname + "/../store/" + analysis_id + '_popstruct_plink';
				console.log('cmd', cmd_plink);
				var child_plink = exec(cmd_plink, function(error, stdout, stderr) {
					if(error) {
						console.log(error);
						// results['success'] = false;
						// res.send(JSON.stringify(results));
						return;
					}

					try {
						global.io.to(realtime_client_id).emit('analysis_response', {
							type: 'popstruct_status',
							message: 'Step 2 - Performing FastStructure processing on PLINK files...'
						});
					} catch (err) { console.log(err) }
					var cmd_fast_structure = 'export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib; export CFLAGS="-I/usr/local/include"; export LDFLAGS="-L/usr/local/lib";  python ' + __dirname + "/../fastStructure/structure.py -K "  + k_value + " --input=" + __dirname + "/../store/" + analysis_id + '_popstruct_plink' + " --output="  + __dirname + "/../store/" + analysis_id + '_popstruct_plink --full;'; 
					console.log(cmd_fast_structure);
					var child_fast_structure = exec(cmd_fast_structure, function(error, stdout, stderr) {
						console.log('Finished running fast structure');
						if(error) {
							console.log(error);
							// results['success'] = false;
							// res.send(JSON.stringify(results));
							return;
						}

						try {
							global.io.to(realtime_client_id).emit('analysis_response', {
								type: 'popstruct_status',
								message: 'Step 3 - Using awk and sed to generate IDPanel temporary output file'
							});
						} catch (err) { console.log(err) }
						var cmd_custom_cmds1 = "awk 'BEGIN { OFS = \"_\" } ;{print $1,$2}' " + __dirname + "/../store/" + analysis_id + "_popstruct_plink.fam > " + __dirname + "/../store/" + analysis_id + "_popstruct_IDPanel.txt;";
						cmd_custom_cmds1 += "sed 's/_/\t/g' " + __dirname + "/../store/" + analysis_id + "_popstruct_IDPanel.txt > " + __dirname + "/../store/" + analysis_id + "_popstruct_IDPaneltab.txt;";
						cmd_custom_cmds1 += "awk '{print $1,$2}' " + __dirname + "/../store/" + analysis_id + "_popstruct_IDPaneltab.txt > " + __dirname + "/../store/" + analysis_id + "_popstruct_IDfamPanel.txt;";
						var child_custom_cmds1 = exec(cmd_custom_cmds1, function(error, stdout, stderr) {
							console.log('Finished running custom awk and sed to generate idpanel text files');
							if(error) {
								console.log(error);
								// results['success'] = false;
								// res.send(JSON.stringify(results));
								return;
							}

							try {
								global.io.to(realtime_client_id).emit('analysis_response', {
									type: 'popstruct_status',
									message: 'Step 4 - Counting the population from IDPanel'
								});
							} catch (err) { console.log(err) }
							// wc -l programming.txt
							// We need to get the line count from the IDPanel.txt file
							var cmd_custom_line_count = "wc -l " + __dirname + "/../store/" + analysis_id + "_popstruct_IDPanel.txt";
							var child_custom_line_count = exec(cmd_custom_line_count, function(error, stdout, stderr) {
								console.log('Finished checking line count (population count)');
								
								if(error) {
									console.log(error);
									// results['success'] = false;
									// res.send(JSON.stringify(results));
									return;
								}	

								console.log(stdout);
								var lines = stdout.split("\n");
								var population_count = -1;
								for (var i=0; i<lines.length; i++) {
									if (i==0) {
										var line_parts = lines[i].split(" ");
										population_count = line_parts[0];
										break;
									}
								}
								console.log('Population count', population_count);

								try {
									global.io.to(realtime_client_id).emit('analysis_response', {
										type: 'popstruct_status',
										message: 'Step 5 - Generating Population Panel using R code...'
									});
								} catch (err) { console.log(err) }
								var cmd_custom_r_code = "Rscript " + __dirname + "/../popstruct_from_panel.R ";
								cmd_custom_r_code += analysis_id + " ";
								cmd_custom_r_code += population_count + " ";
								cmd_custom_r_code += __dirname + "/../store/" + analysis_id + "_popstruct_plink." + k_value + ".meanQ ";
								cmd_custom_r_code += __dirname + "/../store/" + analysis_id + "_popstruct_IDfamPanel.txt ";
								cmd_custom_r_code += __dirname + "/../store/" + analysis_id + "_popstruct_PopPanel.txt";
								var child_custom_r_code = exec(cmd_custom_r_code, function(error, stdout, stderr) {
									console.log('Finished custom R code to generate PopPanel');
									
									if(error) {
										console.log(error);
										// results['success'] = false;
										// res.send(JSON.stringify(results));
										return;
									}				
									
									
									try {
										global.io.to(realtime_client_id).emit('analysis_response', {
											type: 'popstruct_status',
											message: 'Step 6 - Cleaning up PopPanel columns...'
										});
									} catch (err) { console.log(err) }
									
									var cmd_remove_column_code = "cut -d\\  -f2- " + __dirname + "/../store/" + analysis_id + "_popstruct_PopPanel.txt > " + __dirname + "/../store/" + analysis_id + "_popstruct_PopPanel_final.txt";
									var child_remove_column_code = exec(cmd_remove_column_code, function(error, stdout, stderr) {
										console.log('Finished remove column and produced PopPanel final file');
										console.log('Location: ' + __dirname + '/../store/' + analysis_id + "_popstruct_PopPanel_final.txt");
										
										if(error) {
											console.log(error);
											// results['success'] = false;
											// res.send(JSON.stringify(results));
											return;
										}		
										
										try {
											global.io.to(realtime_client_id).emit('analysis_response', {
												type: 'popstruct_status',
												message: 'Step 7 - Uploading final Population Panel to your galaxy workspace'
											});
										} catch (err) { console.log(err) }
										// We need to upload this file to the workflow
										// Post the file to galaxy history / workspace
										const FormData = require('form-data');
										const form = new FormData();
										try {
											form.append('galaxy_id', req.body.galaxy_id);
											form.append('workflow_id', req.body.workflow_id);
											form.append('history_id', req.body.history_id);
											form.append('raw_data', fs.readFileSync(__dirname + '/../store/' + analysis_id + '_popstruct_PopPanel_final.txt'));
											form.append('file_name', 'AN' + analysis_id + '_POPSTRUCT_' + '_PopPanel_final.txt');

											instance.post(req.body.history_upload_url, form, { headers: form.getHeaders() });
											console.log('Uploaded history file to the workspace');

											try {
												global.io.to(realtime_client_id).emit('analysis_response', {
													type: 'popstruct_status',
													message: 'Population Structure successfully completed! You can find the outputs under the Manage tab.',
													complete: true
												});
											} catch (err) { console.log(err) }

											var cmd_clean_up = "rm -rf " + __dirname + "/../store/" + analysis_id + '_popstruct_*;';
											var child_clean_up = exec(cmd_clean_up, function(error, stdout, stderr) {
												console.log('Deleting temporary files');
												if(error) {
													console.log(error);
													// results['success'] = false;
													// res.send(JSON.stringify(results));
													return;
												}

											});
										}
										catch (err) {
											console.log(err);
										}
									});
								});

							});
						});
					});
				});				
			});
			
			
		})
		.catch (err => {
			console.log(err);
			// results['success'] = false;
			// res.send(JSON.stringify(results));
			return;
		});

	}
	catch (err) {
		console.log(err);
	}

	results['success'] = true;
	res.status(200).send(JSON.stringify(results));
  }

 /**
 * This should return all phenotypes by studies specified (overlapping and none overlapping)
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.popstruct_dapc = function(req, res, next) {
	var vcf_url = req.body.vcf_url;
	var history_file_upload_url = req.body.history_file_upload_url
	var analysis_id = req.body.analysis_id;

	// This works perfectly well! 
	const axios = require('axios'); 

	axios.get(vcf_url, {responseType: "stream"} )  
	.then(response => {  
		// Saving file to working directory 
		var vcf_local_location = '../store/' + analysis_id + '_popstruct_vcf.vcf';
		response.data.pipe(fs.createWriteStream(vcf_local_location));
		
		const exec = require('child_process').exec;
		// code = execSync('node -v');
		var cmd = "Rscript " + __dirname + "/../popstruct_dapc.R " + __dirname + "/../store/ " + analysis_id;
		console.log('cmd', cmd);
		var child = exec(cmd, function(error, stdout, stderr) {
			
			if(error) {
				console.log(error);
				results['error'] = true;
				res.send(JSON.stringify(results));
				return;
			}
	
			// console.log(JSON.stringify(stdout));
			// console.log(JSON.stringify(stderr));
	
			try {
				var fs = require('fs');
				var data = fs.readFileSync(__dirname + '/../store/' + analysis_id + '_Panel1assignedPopDAPC.txt');
				// var data_base64 = Buffer.from(data).toString('base64');

				// Post the file to galaxy history / workspace
				const FormData = require('form-data');
				const form = new FormData();
				form.append('my_field', 'my value');
				form.append('my_other_field', 'my second value');
				form.append('my_file', fs.createReadStream(__dirname + '/../store/' + analysis_id + '_Panel1assignedPopDAPC.txt'));

				axios.post(history_file_upload_url, form, { headers: form.getHeaders() });

				results['updated'] = true;
	
				exec("rm -f " + __dirname + '/../store/' + analysis_id + '_popstruct_vcf.vcf');
				
				// TODO upload the file back to galaxy workspace
			}
			catch (err_daps_gen) {
				console.log(err_dapc_gen);
			}
			res.send(JSON.stringify(results));
		});
	})  
	.catch(error => {  
		console.log(error);  
	});	
 }

/**
 * This should return all phenotypes by studies specified (overlapping and none overlapping)
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.phenotypes_pca = async function(req, res, next) {
  try {
    console.log('phenotypes_pca');
    var results = {};
    var studies = [];
    // var analysis_id = req.body.analysis_id;
	var user_id = req.body.user_id;
	var workspace_name = req.body.workspace_name;
	var analysis_id = req.body.analysis_id;
	var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
	if(analysis_id == undefined) {
		results['error'] = true;
		res.send(JSON.stringify(results));
		return;
	}
	if(analysis_id == "") {
		results['error'] = true;
		res.send(JSON.stringify(results));
		return;
	}
	analysis_id = parseInt(analysis_id);
    if(req.body.studies != undefined) {
      studies = JSON.parse(req.body.studies); // should be an array
      console.log('studies', JSON.stringify(studies));
    }
	console.log('analysis_id', analysis_id);
    var phenotypes = [];
    if(req.body.phenotypes != undefined) {
      phenotypes = JSON.parse(req.body.phenotypes); // should be an array
      console.log('phenotypes', JSON.stringify(phenotypes));
    }	
    console.log('it came here');
    // for each study
    var rows_results = [];
    for(var i=0; i<studies.length; i++) {
      query_str = "SELECT * FROM chado.phenotype_view WHERE study_accession = '" + studies[i] + "'"; 	
      query_str += " AND phenotype IN (";
      for (var j=0; j<phenotypes.length; j++) {
        if(j > 0) {
          query_str += ",";
        }
        query_str += "'" + phenotypes[j] + "'";
      }
      query_str += ")";

      console.log(query_str);
      // Let us use query synchronized for procedural querying
      // var pg_n_client = new pg_native_client();
	  
	  console.log('it came here 2');

      console.log('Connecting to database...');
      // pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
      const client = await pool.connect();
	  //console.log(config.conf.host);
      //console.log(config.conf.user);
      //console.log(config.conf.password);
      //   pg_n_client.querySync("set datestyle='ISO';");
      //   pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
      //   pg_n_client.querySync("SET bytea_output TO escape;");
      //   pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');

	  await client.query("set datestyle='ISO';");
	  await client.query("SET client_encoding TO 'UTF-8';");
	  await client.query("SET bytea_output TO escape;");
	  await client.query('SET SEARCH_PATH TO "public","chado"');
	  console.log('it came here 3');

      // var rows = pg_n_client.querySync(query_str,[]);
	  var qres = await client.query(query_str,[]);
	  var rows = qres.rows;
	  console.log('it came here 4');
      rows_results = rows_results.concat(rows);
	  console.log('it came here 5');
      // console.log('rows_results', JSON.stringify(rows_results));
      results['updated'] = true;
      // NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
      // pg_n_client.end();
	  client.release();	
    }

    // Generate CSV like object (using the phenotype names as columns / attributes - NOT KEYS)
    // The keys will be the plant_accession
    var csv_object = {};


    // Go through each rows_results which will contain the plant accessions
    console.log('Generate CSV object');
    for(var i=0; i<rows_results.length; i++) {
      // check if plant_accession isn't in the rejected_plant_accessions
      var plant_accession = rows_results[i]['plant_accession'];
      var phenotype_name = rows_results[i]['phenotype'];
      var value = rows_results[i]['value'];
      if(value != 'NA') {
        if(csv_object[plant_accession] == undefined) {
          csv_object[plant_accession] = {};
        }
        csv_object[plant_accession][phenotype_name] = value;
      }
    }

    // Remove all rows containg missing values
    console.log('Remove all rows containing missing values');
    var keys = Object.keys(csv_object);
    console.log('csv_object contains ' + keys.length + ' keys');
    for(var i=0; i<keys.length; i++) {
      if(i == 0) {
        console.log(csv_object[keys[i]]);
      }
      if(Object.keys(csv_object[keys[i]]).length < phenotypes.length) {
        // this plant accession row contains missing values so delete it
        delete csv_object[keys[i]]
      } 
    }

    // Double check the clean up
    keys = Object.keys(csv_object);
    console.log('csv_object contains ' + keys.length + ' keys'); 
    // console.log(csv_object[keys[0]]);


    // Now we have csv object with keys (plant_accession) and attributes are the phenotypes
    // Generate the CSV header
    console.log('Generate CSV header');
    var csv_data = "Accession,";
    for(var i=0; i < phenotypes.length; i++) {
      if(i > 0) {
        csv_data += ",";
      }
      csv_data += phenotypes[i];
    }
    csv_data += "\n";
    console.log('header', csv_data);


    // Add the csv_object data
    //console.log('Generate CSV body data');
    var keys = Object.keys(csv_object);
    console.log('keys length', keys.length);
    console.log(phenotypes.length);
    for(var i=0; i<keys.length; i++) {
      csv_data += keys[i]; // accession
      if(phenotypes.length > 0) {
        csv_data += ",";
      }
      for(j=0; j<phenotypes.length; j++) {
        if(j > 0) {
          csv_data += ",";
        }
        csv_data += csv_object[keys[i]][phenotypes[j]];
      }
      csv_data += "\n";
    }
    csv_data += "\n";

    // Now we have csv data - awesome
    // console.log(csv_data);
	// var fs = require('fs');
	console.log('Generating PCA CSV file');
	fs.writeFile(__dirname + '/../store/' + analysis_id + '_pca_phenotypes.csv', csv_data, {flag: 'w'}, function (err) {
		if (err) {
			console.log(err);
			return;
		}
		else {
			console.log('Generating PCA');
			generate_pca(analysis_id, workspace_dir);
		}
	});
    // fs.writeFileSync(__dirname + '/../store/' + analysis_id + '_pca_phenotypes.csv', csv_data);

    //const execSync = require('child_process').execSync;
	//code = execSync('node -v');
	function generate_pca(analysis_id, workspace_dir) {
		const exec = require('child_process').exec;
		// code = execSync('node -v');
		var cmd = "Rscript " + __dirname + "/../pca_phenotypes.R " + __dirname + "/../store/" + analysis_id;
		console.log('cmd', cmd);
		console.log('it came here 10');
		// var child = exec(cmd, function(error, stdout, stderr) {
		// 	if(error) {
		// 		console.log(error);
		// 		results['error'] = true;
		// 		res.send(JSON.stringify(results));
		// 		return;
		// 	}
		// 	console.log('it came here 11');
		// 	// console.log(JSON.stringify(stdout));
		// 	// var lines = stdout.split("\n");
		// 	// // var analysis_id = "";
		// 	// for(var i=0; i<lines.length; i++) {
		// 	// 	var line = lines[i];
		// 	// 	console.log('line ' + i + ':' + line);
		// 	// 	if(line.includes('analysis_id:')) {
		// 	// 		var line_parts = line.split('analysis_id:');
		// 	// 		console.log(JSON.stringify(line_parts));
		// 	// 		//analysis_id = line_parts[1].replaceAll('"','');
		// 	// 		break;
		// 	// 	}
		// 	// }
		// 	// console.log('Analysis ID:' + analysis_id);


		// 	// console.log(JSON.stringify(stderr));

		// 	try {
		// 		var fs = require('fs');
		// 		var data = fs.readFileSync(__dirname + '/../store/' + analysis_id + '_pca_phenotypes.jpeg');
		// 		var data_base64 = Buffer.from(data).toString('base64');

		// 		results['data_base64'] = data_base64;
		// 		results['updated'] = true;

		// 		exec("rm -f " + __dirname + '/../store/' + analysis_id + '_pca_phenotypes.csv');
		// 		exec("rm -f " + __dirname + '/../store/' + analysis_id + '_pca_phenotypes.jpeg');
		// 	}
		// 	catch (err_pca_gen) {
		// 		console.log(err_pca_gen);
		// 	}
		// 	res.send(JSON.stringify(results));
		// });


		// "Rscript " + __dirname + "/../pca_phenotypes.R " + __dirname + "/../store/ " + analysis_id;
		const ls = spawn('Rscript', [__dirname + "/../pca_phenotypes.R", __dirname + "/../store/",analysis_id]);

		ls.stdout.on('data', (data) => {
		  console.log(`stdout: ${data}`);
		});
		
		ls.stderr.on('data', (data) => {
		  console.error(`stderr: ${data}`);
		});
		
		ls.on('close', (code) => {
			try {
				var fs = require('fs');
				var data = fs.readFileSync(__dirname + '/../store/' + analysis_id + '_pca_phenotypes.png');
				var unix_timestamp = Math.floor(Date.now() / 1000);
				fs.copyFileSync(__dirname + '/../store/' + analysis_id + '_pca_phenotypes.png', workspace_dir + '/' + unix_timestamp + '-AN' + analysis_id + '_IMAGEPCA_phenotypes-image.png');
				var data_base64 = Buffer.from(data).toString('base64');

				results['data_base64'] = data_base64;
				results['updated'] = true;

				 //exec("rm -f " + __dirname + '/../store/' + analysis_id + '_pca_phenotypes.csv');
				exec("rm -f " + __dirname + '/../store/' + analysis_id + '_pca_phenotypes.png');
			}
			catch (err_pca_gen) {
				console.log(err_pca_gen);
			}
			res.send(JSON.stringify(results));
		  // console.log(`child process exited with code ${code}`);
		}); 
	}


	
  }
  catch (err) {
    console.log(err);
	res.send(JSON.stringify(results));
  }
  
}

  /**
 * This should return all phenotypes by studies specified (overlapping and none overlapping)
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.environmental_scatter_plot = function(req, res, next) {
	console.log('environmental_scatter_plot');
	var results = {};
	console.log('req.body', req.body);
    var analysis_id = req.body.analysis_id;
	var user_id = req.body.user_id;
	var workspace_name = req.body.workspace_name;
	var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
	var csv_data = req.body.csv_data;
	if(analysis_id == undefined) {
		results['error'] = true;
		res.send(JSON.stringify(results));
		return;
	}
	var fs = require('fs');
	fs.writeFileSync(__dirname + "/../store/" + analysis_id + '_environmental_scatter_plot.csv', csv_data);	
	try {
		const exec = require('child_process').exec;
		// code = ('node -v');
		var cmd = "Rscript " + __dirname + "/../environmental_scatter_plot.R " + __dirname + "/../store " + analysis_id;
		
		var child = exec(cmd, function(error, stdout, stderr) {
			console.log('ERROR:');
			console.log(error);
			console.log('STDOUT:');
			console.log(stdout);
			console.log('STDERR:');
			console.log(stderr);
			if(error) {
				console.log(error);
				results['error'] = true;
				res.send(JSON.stringify(results));
				return;
			}


			try {
				var fs = require('fs');
				var data = fs.readFileSync(__dirname + '/../store/' + analysis_id + '_environmental_scatter_plot.jpeg');
				var unix_timestamp = Math.floor(Date.now() / 1000);
				fs.copyFileSync(__dirname + '/../store/' + analysis_id + '_environmental_scatter_plot.jpeg', workspace_dir + '/' + unix_timestamp + '-AN' + analysis_id + '_IMAGEENVSCATTERPLOT_environmental_scatter_plot-image.jpeg');
				var data_base64 = Buffer.from(data).toString('base64');
				// var data_base64 = Buffer(data).toString('base64');
	
				results['data_base64'] = data_base64;
				results['updated'] = true;
	
				exec("rm -f " + __dirname + '/../store/' + analysis_id + '_environmental_scatter_plot.csv');
				exec("rm -f " + __dirname + '/../store/' + analysis_id + '_environmental_scatter_plot.jpeg');
			}
			catch (err_env_scatter_plot_gen) {
				console.log(err_env_scatter_plot_gen);
			}
			res.send(JSON.stringify(results));			
		});
	}
	catch (err) {
		console.log('err', err);
		res.send(JSON.stringify(results));	
	}
}

 /**
 * Inserts data into the analysis_data table
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
  exports.analysis_insert_data = async function(req, res, next) {
	var results = {
		updated: false
	};
	try {
		var variable_name = req.body.variable_name;
		var variable_data = req.body.variable_data;
		var analysis_id = req.body.analysis_id;

		// Let us use query synchronized for procedural querying
		var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');

		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');

		// Insert the row
		var query_str = "INSERT INTO public.cartogratree_analysis_data (analysis_id, variable_name, variable_data) VALUES ($1,$2,$3);";
		await client.query(query_str,[analysis_id, variable_name, variable_data]);
		results['updated'] = true;

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		// pg_n_client.end();
		client.release();
	}
	catch (err) {
		console.log(err);
	}

	res.send(JSON.stringify(results));
		
  }

/**
 * Deletes data into the analysis_data table
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.analysis_delete_data = async function(req, res, next) {
	var results = {
		updated: false
	};
	try {
		var variable_name = req.body.variable_name;
		// var variable_data = req.body.variable_data;
		var analysis_id = req.body.analysis_id;

		// Let us use query synchronized for procedural querying
		// var pg_n_client = new pg_native_client();
		

		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');

		// Insert the row
		var query_str = "DELETE FROM public.cartogratree_analysis_data WHERE analysis_id = $1 AND variable_name = $2;";
		await client.query(query_str,[analysis_id, variable_name]);
		results['updated'] = true;

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		//pg_n_client.end();
		client.release();
	}
	catch (err) {
		console.log(err);
	}

	res.send(JSON.stringify(results));
		
}

 /**
 * This should return all lat lon values from the specified tree_ids
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.environmental_get_locations_from_treeids = function(req,res,next) {
	try {
		var tree_ids = JSON.parse(req.body.tree_ids);
		//var query_str = "SELECT distinct(latitude, longitude) FROM ct_trees_all_view WHERE uniquename IN (";
		var query_str = "SELECT latitude,longitude,uniquename FROM ct_trees WHERE uniquename IN (";
		for(var i=0; i<tree_ids.length; i++) {
			if(i > 0) {
				query_str += ',';
			}
			query_str += "'" + tree_ids[i]+ "'"
		}
		query_str += ")";
		
		console.log(query_str);
		query (query_str, [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			else {
				console.log(rows);
				res.status(200).json(rows);
			}
		});
	}
	catch (err) {
		res.status(400).send('error:' + err);
		console.log(err);
	
	}
}

 /**
 * This should return all lat lon values from the specified tree_ids
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.environmental_get_unique_locations_from_treeids = function(req,res,next) {
	try {
		var tree_ids = JSON.parse(req.body.tree_ids);
		var query_str = "SELECT distinct(latitude, longitude) FROM ct_trees WHERE uniquename IN (";
		// var query_str = "SELECT latitude,longitude,uniquename FROM ct_trees_all_view WHERE uniquename IN (";
		for(var i=0; i<tree_ids.length; i++) {
			if(i > 0) {
				query_str += ',';
			}
			query_str += "'" + tree_ids[i]+ "'"
		}
		query_str += ")";
		
		console.log(query_str);
		query (query_str, [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			else {
				console.log(rows);
				res.status(200).json(rows);
			}
		});
	}
	catch (err) {
		res.status(400).send('error:' + err);
		console.log(err);
	
	}
}

 /**
 * This should return all lat lon values from the specified tree_ids
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
  exports.environmental_get_envdata_from_db_table = function(req,res,next) {
	try {
		var layer_id = req.body.layer_id;
		var property_id = req.body.property_id;
		var property_name = req.body.property_name;
		var locations = JSON.parse(req.body.locations);
		
		var query_str = "SELECT latitude, longitude, property_name, property_value, unit_ids, unit_labels FROM public.cartogratree_envdata_" + layer_id + " WHERE property_id = " + property_id + " AND (";
		for(var i=0; i<locations.length; i++) {
			if(i > 0) {
				query_str += ' OR ';
			}
			query_str += " (latitude = " + locations[i]['latitude'] + " AND longitude = " + locations[i]['longitude'] + ") "
		}
		query_str += ")";
		
		console.log(query_str);
		query (query_str, [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			else {
				// console.log(rows);
				res.status(200).json({
					rows: rows,
					layer_id: layer_id,
					property_name: property_name,
					property_id: property_id
				});
			}
		});
	}
	catch (err) {
		res.status(400).send('error:' + err);
		console.log(err);
	
	}
}

 /**
 * This should return all phenotypes by studies specified (overlapping and none overlapping)
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
  exports.phenotypes_phenotypes_values_by_overlapping_studies = function(req, res, next) {
	console.log('phenotypes_phenotypes_values_by_overlapping_studies');
	console.log(req.body.studies);
	
	var studies = [];
	var phenotype_name = req.body.phenotype_name;
	if(req.body.studies != undefined) {
		studies = JSON.parse(req.body.studies); // should be an array
	}
	if(studies.length > 0) {
		// var query_str = 'SELECT distinct(phenotype_id), value, plant_accession, study_accession, units FROM (';
		// console.log(query_str);
		// for(var i=0; i<studies.length; i++) {

		// 	if(i > 0) {
		// 		query_str += " UNION (SELECT * FROM chado.phenotype_view WHERE phenotype = '" + phenotype_name + "' AND study_accession = '" + studies[i] + "') ";
		// 	}
		// 	else {
		// 		query_str += "(SELECT * FROM chado.phenotype_view WHERE phenotype = '" + phenotype_name +"' AND study_accession = '" + studies[i] + "') "
		// 	}
		// }
		// query_str += ") as t_output";


		// Optimized version suggested by Emily G.
		var query_str = 'SELECT distinct(phenotype_id), year, value, plant_accession, study_accession, units FROM chado.phenotype_view ';
		query_str += "WHERE phenotype = '" + phenotype_name + "' AND study_accession IN (";
		for(var i=0; i<studies.length; i++) {
			if(i > 0) {
				query_str += ',';
			}
			query_str += "'" + studies[i] + "'";
		}
		query_str += ")";

		console.log(query_str);
		query (query_str, [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
		}
		//console.log(rows);

		if(req.body.compression != undefined) {
			var data = zlib_deflate_base64(JSON.stringify(rows));
			res.status(200).json({
				zlib_deflated_base64: data
			});
		}
		else {
			res.status(200).json(rows);
		}
		});
	}
	else {
		var rows = [];
		res.status(200).json(rows);
	}
 }

/**
 * This should return all trees with the matching collection (treesnap) based on tree_id specified
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.treesnap_collection_name_lookup_by_tree_id = function(req,res,next) {
	console.log('treesnap_collection_lookup_by_tree_id');
	console.log(req.query);
	var tree_id = req.query.tree_id;
	// var query_str = 'SELECT * FROM public.ct_trees_treesnap WHERE uniquename = $1';
	var query_str = 'SELECT * FROM public.ct_trees WHERE uniquename = $1';
	if (req.query.tree_id != undefined) {
		console.log(query_str);
		query (query_str, [tree_id], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			console.log(rows);
			res.status(200).json(rows);
		});
	}
	else {
		res.status(200).json([]);
	}
}


/**
 * This should return all trees with the matching collection (treesnap) based on tree_id specified
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.treesnap_collection_lookup_by_tree_id = function(req,res,next) {
	console.log('treesnap_collection_lookup_by_tree_id');
	console.log(req.query);
	var tree_id = req.query.tree_id;
	var query_str = 'SELECT * FROM public.ct_trees_treesnap WHERE uniquename = $1';
	if (req.query.tree_id != undefined) {
		console.log(query_str);
		query (query_str, [tree_id], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			console.log(rows);
			if (rows.length > 0) {
				var category = rows[0]['category'].toLowerCase();
				console.log('category', category);
				query_str = 'SELECT uniquename FROM public.ct_trees_treesnap WHERE category ILIKE $1';
				query (query_str, [category], function (err, rows, result) {
					if (err) {
						console.log(err);
						res.status(400);
						return;
					}
					console.log(rows);
					res.status(200).json(rows);
				});
			}
			else {
				res.status(200).json([]);
			}
		});
	}
	else {
		res.status(200).json([]);
	}
}

/**
 * This should return all phenotypes by studies specified (overlapping and none overlapping)
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.phenotypes_phenotypes_all_by_studies_views = function(req, res, next) {
	console.log('phenotypes_phenotypes_all_by_studies_views');
	console.log(req.body.studies);
	var studies = [];
	if(req.body.studies != undefined) {
		studies = JSON.parse(req.body.studies); // should be an array
	}
	if(studies.length > 0) {
		var query_str = 'SELECT * FROM chado.phenotypes_by_study WHERE ';
		console.log(query_str);
		for(var i=0; i<studies.length; i++) {
			if(i > 0) {
				query_str += " OR accession = '" + studies[i] + "' ";
			}
			else {
				query_str += " accession = '" + studies[i] + "' ";
			}
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
 * This should return phenotype_names per study
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.phenotypes_phenotype_names_per_study = function(req, res, next) {
	console.log('phenotypes_phenotypes_overlaps_by_studies_views');
	console.log(req.body.study);
	var studies = [];
	if(req.body.study != undefined) {
		study = req.body.study; // should be string
		
	}
	if(study.length > 0) {
		var query_str = 'SELECT * FROM chado.phenotypes_and_units_by_study where accession LIKE $1';
		console.log(query_str);
		query (query_str, [study], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			//console.log(rows);

			res.status(200).json({
				study_accession: study,
				rows: rows
			});
		})
	}
	else {
		var rows = [];
		res.status(200).json(rows);
	}
 }

/**
 * This should return overlapping phenotypes by studies specified
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.phenotypes_phenotypes_overlaps_by_studies_views = function(req, res, next) {
	console.log('phenotypes_phenotypes_overlaps_by_studies_views');
	console.log(req.body.studies);
	var studies = [];
	if(req.body.studies != undefined) {
		studies = JSON.parse(req.body.studies); // should be an array
	}
	if(studies.length > 0) {
		var query_str = 'SELECT * FROM chado.phenotype_overlap_between_studies WHERE ';
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
		// var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.body.analysis_id;
		var study_ids_arr = JSON.parse(req.body.study_ids_arr);
		var variable_name = "studies_snp_none_overlap_" + study_ids_arr.join("_");
		console.log('Deleting ' + variable_name + ' for analysis_id ' + analysis_id);
		
		// Delete the row if this already exists (just in case)
		var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
		await client.query(query_str,[variable_name,analysis_id]);
		results['updated'] = true;

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		// pg_n_client.end();
		client.release();
				
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
		// var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.body.analysis_id;
		var study_ids_arr = JSON.parse(req.body.study_ids_arr);
		var variable_name = "studies_snp_overlap_" + study_ids_arr.join("_");
		console.log('Deleting ' + variable_name + ' for analysis_id ' + analysis_id);
		
		// Delete the row if this already exists (just in case)
		var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
		await client.query(query_str,[variable_name,analysis_id]);
		results['updated'] = true;

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		// pg_n_client.end();
		client.release();
				
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
		// var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.body.analysis_id;
		var study_ids_arr = JSON.parse(req.body.study_ids_arr);
		var variable_name = "studies_snp_none_overlap_" + study_ids_arr.join("_");		

		for(var i=0; i<study_ids_arr.length; i++) {
			var study_id = study_ids_arr[i];


			// Delete the row if this already exists (just in case)
			var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
			await client.query(query_str,[variable_name,analysis_id]);

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
			
			// var rows = pg_n_client.querySync(query_str);
			var qres = await client.query(query_str);
			var rows = qres.rows;
			if(rows.length > 0) {
				// overlap_none[study_id] = rows[0]['cardinality'];
				var markers = rows[0].markers;

				var query_str = "INSERT INTO cartogratree_analysis_data (analysis_id, variable_name, variable_data)";
				query_str += " VALUES ($1,$2,$3)";
				await client.query(query_str, [analysis_id,variable_name,markers]);
				results['updated'] = true;
			}
		} 
		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		// pg_n_client.end();
		client.release();
	}
	catch (err) {
		console.log(err);
	}
	res.send(JSON.stringify(results));
}

/**
 * This function will perform query to insert markers
 * for an entire study stores it in the analysis_data
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
 exports.analysis_insert_markers_study_all = async function(req, res, next) {
	try {
		var results = {
			updated: false
		};

		// Let us use query synchronized for procedural querying
		var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');

		console.log('req.body:' + JSON.stringify(req.body));

		var analysis_id = req.body.analysis_id;
		var study_id = req.body.study_id;
		var variable_name = "studies_snp_all_" + study_id;
		
		// Delete the row if this already exists (just in case)
		var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
		await client.query(query_str,[variable_name,analysis_id]);


		// Get the markers that overlap
		var query_str = "select accession, markers from chado.markers_and_studies_names where accession in ($1) ";
		// query_str += " order by cardinality desc limit 1";

		// var rows = pg_n_client.querySync(query_str,[study_id]);
		var qres = await client.query(query_str,[study_id]);
		var rows = qres.rows;
		if(rows.length > 0) {
			var markers = rows[0].markers;
			console.log(markers);
			var query_str = "INSERT INTO cartogratree_analysis_data (analysis_id, variable_name, variable_data)";
			query_str += " VALUES ($1,$2,$3)";
			await client.query(query_str, [analysis_id,variable_name,markers]);
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
		//pg_n_client.end();
		client.release();

	}
	catch (err) {
		console.log(err);
	}

	res.send(JSON.stringify(results));
 }

 /**
 * This function will perform query to delete markers
 * for an entire study stores it in the analysis_data
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
  exports.analysis_delete_markers_study_all = async function(req, res, next) {
	try {
		var results = {
			updated: false
		};

		// Let us use query synchronized for procedural querying
		// var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');

		console.log('req.body:' + JSON.stringify(req.body));

		var analysis_id = req.body.analysis_id;
		var study_id = req.body.study_id;
		var variable_name = "studies_snp_all_" + study_id;
		
		// Delete the row if this already exists (just in case)
		var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
		await client.query(query_str,[variable_name,analysis_id]);

		results['updated'] = true;

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		// pg_n_client.end();
		client.release();

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
 exports.analysis_insert_markers_study_overlaps_deprecated_12_10_25 = async function(req, res, next) {
	try {
		var results = {
			updated: false
		};

		// Let us use query synchronized for procedural querying
		// var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		//pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.body.analysis_id;
		var study_ids_arr = JSON.parse(req.body.study_ids_arr);
		var variable_name = "studies_snp_overlap_" + study_ids_arr.join("_");
		
		// Delete the row if this already exists (just in case)
		var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
		console.log(query_str);
		await client.query(query_str,[variable_name,analysis_id]);
		console.log('DONE');


		// Get the markers that overlap
		var query_str = "select markers, cardinality(markers) from chado.test_studies_marker_overlap WHERE ";
		for (var i=0; i<study_ids_arr.length; i++) {
		  var study_id = study_ids_arr[i];
		  study_id = study_id.replace('(', '');
		  study_id = study_id.replace(')', '');
		  if (i == 0) {
			query_str += "'" + study_id + "' = ANY(accessions)";
		  }
		  else {
			query_str += " AND '" + study_id + "' = ANY(accessions)";
		  }
		}
		query_str += " order by cardinality desc limit 1";
		console.log(query_str);
		var qres = await client.query(query_str);

		// Get the markers feature_ids that overlap
		var query_str = "select marker_feature_ids, cardinality(marker_feature_ids) from chado.studies_marker_id_overlaps_test WHERE ";
		for (var i=0; i<study_ids_arr.length; i++) {
			var study_id = study_ids_arr[i];
			study_id = study_id.replace('(', '');
			study_id = study_id.replace(')', '');
			if (i == 0) {
			query_str += "'" + study_id + "' = ANY(study_accessions)";
			}
			else {
			query_str += " AND '" + study_id + "' = ANY(study_accessions)";
			}
		}
		query_str += " order by cardinality desc limit 1";
		console.log(query_str);



		// results['query_str'] = query_str;
		// console.log(query_str);

		// var rows = pg_n_client.querySync(query_str);
		
		var qres_feature_ids = await client.query(query_str);
		console.log('DONE');
		var rows = qres.rows;
		var rows_feature_ids = qres_feature_ids.rows;
		if(rows.length > 0) {
			var markers = rows[0].markers;
			// console.log(markers);
			var query_str = "INSERT INTO cartogratree_analysis_data (analysis_id, variable_name, variable_data)";
			query_str += " VALUES ($1,$2,$3)";
			await client.query(query_str, [analysis_id,variable_name,markers]);
			results['studies'] = study_ids_arr;
			// results['markers'] = markers;
			results['marker_feature_ids'] = rows_feature_ids[0].marker_feature_ids;
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
		// pg_n_client.end();
		client.release();
		res.send(JSON.stringify(results));

	}
	catch (err) {
		res.send(JSON.stringify(results));
		console.log(err);
	}

	// res.send(JSON.stringify(results));
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
		// var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		//pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.body.analysis_id;
		var study_ids_arr = JSON.parse(req.body.study_ids_arr);
		var variable_name = "studies_snp_overlap_" + study_ids_arr.join("_");
		
		// Delete the row if this already exists (just in case)
		var query_str = "DELETE FROM cartogratree_analysis_data WHERE variable_name = $1 AND analysis_id = $2";
		console.log(query_str);
		await client.query(query_str,[variable_name,analysis_id]);
		console.log('DONE');


		// Get the markers that overlap
		var query_str = "select markers, cardinality(markers) from chado.test_studies_marker_overlap WHERE ";
		for (var i=0; i<study_ids_arr.length; i++) {
		  var study_id = study_ids_arr[i];
		  study_id = study_id.replace('(', '');
		  study_id = study_id.replace(')', '');
		  if (i == 0) {
			query_str += "'" + study_id + "' = ANY(accessions)";
		  }
		  else {
			query_str += " AND '" + study_id + "' = ANY(accessions)";
		  }
		}
		query_str += " order by cardinality desc limit 1";
		console.log(query_str);
		var qres = await client.query(query_str);

		// Get the markers feature_ids that overlap
		var query_str = "select marker_feature_ids, cardinality(marker_feature_ids) from chado.studies_marker_id_overlaps_test WHERE ";
		for (var i=0; i<study_ids_arr.length; i++) {
			var study_id = study_ids_arr[i];
			study_id = study_id.replace('(', '');
			study_id = study_id.replace(')', '');
			if (i == 0) {
			query_str += "'" + study_id + "' = ANY(study_accessions)";
			}
			else {
			query_str += " AND '" + study_id + "' = ANY(study_accessions)";
			}
		}
		query_str += " order by cardinality desc limit 1";
		console.log(query_str);



		// results['query_str'] = query_str;
		// console.log(query_str);

		// var rows = pg_n_client.querySync(query_str);
		
		var qres_feature_ids = await client.query(query_str);
		console.log('DONE');
		var rows = qres.rows;
		var rows_feature_ids = qres_feature_ids.rows;
		if(rows.length > 0) {
			var markers = rows[0].markers;
			// console.log(markers);
			var query_str = "INSERT INTO cartogratree_analysis_data (analysis_id, variable_name, variable_data)";
			query_str += " VALUES ($1,$2,$3)";
			await client.query(query_str, [analysis_id,variable_name,markers]);
			// results['studies'] = study_ids_arr;
			// results['markers'] = markers;
			results['marker_feature_ids'] = rows_feature_ids[0].marker_feature_ids;
			results['updated'] = true;

			// This code was used to verify that the data gets inserted into the database
			// var query_str = "SELECT * FROM cartogratree_analysis_data WHERE analysis_id = $1 AND variable_name = $2";
			// var rows2 = pg_n_client.querySync(query_str, [analysis_id,variable_name]);
			// if(rows2.length > 0) {
			// 	console.log(rows2[0].variable_data);
			// 	console.log('variable_data');
			// }
		}

		results['studies'] = study_ids_arr;

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		// pg_n_client.end();
		client.release();
		res.send(JSON.stringify(results));

	}
	catch (err) {
		res.send(JSON.stringify(results));
		console.log(err);
	}

	// res.send(JSON.stringify(results));
 }

/**
 * This should change the analysis name
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */ 
 exports.analysis_update_analysis_name = async function(req, res, next) {
	var results = {
		updated: false
	};
	try {

		// Let us use query synchronized for procedural querying
		// var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');


		var analysis_id = req.query.analysis_id;
		var analysis_name = req.query.analysis_name;
		console.log(req.query);

		// Find the user_id of this user, using the username
		var query_str = "UPDATE public.cartogratree_analysis_index SET analysis_name = $1 WHERE analysis_id = $2";
		var qres = await client.query(query_str, [analysis_name, analysis_id]);

		//var query_str = "UPDATE public.cartogratree_analysis_index SET analysis_name = '" + analysis_name + "' WHERE analysis_id = " + analysis_id + ";";
		//console.log(query_str);
		//await client.query(query_str);


		// var rows = qres.rows;
		results['updated'] = true;
		console.log('Updated: true');

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		//pg_n_client.end();
		client.release();
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
		// var pg_n_client = new pg_native_client();

		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');

		const client = await pool.connect();
		
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');

		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');

		// Find the user_id of this user, using the username
		var query_str = "SELECT * FROM users WHERE mail ILIKE $1 LIMIT 1";
		// var rows = pg_n_client.querySync(query_str, [user_email]);
		var qres = await client.query(query_str, [user_email]);
		var rows = qres.rows;
		if(rows.length > 0) {
			console.log('User id was found');
			user_id = rows[0].uid;
			console.log('user_id', user_id);
		}

		// Ensure the user id was found (valid)
		if(user_id != -1) {
			var query_str = "INSERT INTO public.cartogratree_analysis_index (user_id, analysis_name, analysis_created_time) ";
			query_str += " VALUES ($1,$2,$3) returning analysis_id;";
			console.log(query_str);
			var time_created = Math.floor(Date.now() / 1000);
			// var rows = pg_n_client.querySync(query_str, [user_id, 'Untitled', time_created]);
			var qres = await client.query(query_str, [user_id, 'Untitled', time_created]);
			var rows = qres.rows;
			if(rows.length > 0) {
				results['analysis_id'] = rows[0].analysis_id;
			}
			else {
				results['analysis_id'] = -1;
				console.log('Could not find a returning analysis_id');
			}
		}

		// NOTE: ALWAYS REMEMBER TO CLOSE THE pg_n_client connection at the end!
		// pg_n_client.end();

		client.release();
		res.send(JSON.stringify(results));
		return;
	}
	catch (err) {
		console.log(err);
		console.log(JSON.stringify(err));
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
   		// var pg_n_client = new pg_native_client();
   
		console.log('Connecting to database...');
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		var client = await pool.connect();
		//console.log(config.conf.host);
		//console.log(config.conf.user);
		//console.log(config.conf.password);
		// pg_n_client.querySync("set datestyle='ISO';");
		// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
		// pg_n_client.querySync("SET bytea_output TO escape;");
		// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');    
		
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');  


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
		console.log("STEP 1:" + query_str);
   
		// Perform the query to get the results of total_overlaps
		// var rows = pg_n_client.querySync(query_str);
		var qres = await client.query(query_str);
		var rows = qres.rows;
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
			console.log("STEP 1.5:" + query_str);
			
			// // Perform the query to get the results of total_overlaps between pair
			// var rows = pg_n_client.querySync(query_str);
			var qres = await client.query(query_str);
			var rows = qres.rows;
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
		var query_str = "select accession, cardinality(markers) from chado.markers_and_studies_names where accession in (";
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
		console.log("STEP 2:" + query_str);
		
		// Perform the query to get the results of total snps per studies (each row has the total per study)
		// var rows = pg_n_client.querySync(query_str);
		var qres = await client.query(query_str);
		var rows = qres.rows;
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
			query_str += "(select unnest(markers) from(select markers from chado.test_studies_marker_overlap ";
			query_str += " WHERE '" + anchor_study_id + "' = ANY (accessions) AND '" + other_study + "' = ANY (accessions) order by cardinality(accessions) asc limit 1) table" + table_count + ")";
			query_str += " ";
			table_count = table_count + 1;    
			}
			query_str += ") table" + table_count + ")";
			table_count = table_count + 1;

			// Now we need to get all markers that overlap all studies into this query
			query_str += " EXCEPT ";
			query_str += "(select unnest(markers) FROM (select markers from chado.test_studies_marker_overlap WHERE ";
			for(var j=0; j<study_ids_arr.length; j++) {
			var study = study_ids_arr[j];
			if(j>0) {
				query_str += " AND ";
			}
			query_str += "'" + study + "' = ANY(accessions) ";
			
			} 
			query_str += ") table_overlap_all)) count_table";

			console.log("STEP 3: " + query_str);
			// var rows = pg_n_client.querySync(query_str);
			var qres = await client.query(query_str);
			var rows = qres.rows;
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
			query_str += "(select unnest(markers) from chado.markers_and_studies_names where accession = '" + study_id + "')";
			query_str += " EXCEPT ";
			query_str += "(select distinct markers from ";
			query_str += "(select unnest(markers) as markers from chado.test_studies_marker_overlap WHERE ";
			var c1 = 0;
			for(var j=0; j<study_ids_arr.length;j++) {
				var tmp_study_id = study_ids_arr[j];
				if(tmp_study_id != study_id) {
					if(c1 > 0) {
						query_str  += " OR ";
					}
					query_str += "'" + tmp_study_id + "' = ANY (accessions) ";
					c1 = c1 + 1;
				}
				
			}
			query_str += ")w)";
			// This has a bug when I test it with only 408 and 480 ()
			// query_str += "(select unnest(markers) as markers from test_studies_marker_overlap WHERE '" + study_id + "' = ANY (accessions))w) ";
			query_str += ")";
			query_str += "as markers )";
			query_str += "x)";
			query_str += "y;";
			
			console.log("STEP 4: " + query_str);
			// var rows = pg_n_client.querySync(query_str);
			var qres = await client.query(query_str);
			var rows = qres.rows;
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
		// pg_n_client.end();
   		client.release();

	   	res.send(JSON.stringify(results));
	}
	catch (err) { 
		console.log("ERROR catched");
		console.log(err) 
		try {
			client.release();
		}
		catch (err2) {

		}
		
	}
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
    // var pg_n_client = new pg_native_client();
    
    console.log('Connecting to database...');
    // pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
    const client = await pool.connect();
	//console.log(config.conf.host);
    //console.log(config.conf.user);
    //console.log(config.conf.password);
    // pg_n_client.querySync("set datestyle='ISO';");
    // pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
    // pg_n_client.querySync("SET bytea_output TO escape;");
    // pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');   
	await client.query("set datestyle='ISO';");
    await client.query("SET client_encoding TO 'UTF-8';");
    await client.query("SET bytea_output TO escape;");
    await client.query('SET SEARCH_PATH TO "public","chado"');  


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
	console.log(query_str);
    
    // Perform the query to get the results of total_overlaps
    // var rows = pg_n_client.querySync(query_str);
	var qres = await client.query(query_str);
	var rows = qres.rows;
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
	console.log(query_str);
    
    // Perform the query to get the results of total snps per studies (each row has the total per study)
    // var rows = pg_n_client.querySync(query_str);
	var qres = await client.query(query_str);
	var rows = qres.rows;
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
	  console.log(query_str);

      // console.log(query_str);
      // var rows = pg_n_client.querySync(query_str);
	  var qres = await client.query(query_str);
	  var rows = qres.rows;
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
      console.log(query_str);
      // var rows = pg_n_client.querySync(query_str);
	  var qres = await client.query(query_str);
	  var rows = qres.rows;
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
    // pg_n_client.end();
	client.release();

		res.send(JSON.stringify(results));
	 }
	 catch (err) {
		try {
			// pg_n_client.end();
			client.release();
		} 
		catch (err2) {
			console.log(err2);
		}
		console.log(err) 
	}
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

// exports.genotypes_variant_filtering_panel_filter_by_genotypes = function(req, res, next) {
// 	try {
// 		var analysis_id = req.body.analysis_id;
// 		var study_accession = req.body.study_accession;
// 		var vcf_location = req.body.vcf_location;
// 		var vcf_location_parts = vcf_location.split('/');
// 		var vcf_filename = vcf_location_parts[vcf_location_parts.length - 1];
// 		var vcf_filename_without_ext = vcf_filename.replace('.vcf', '');
// 		console.log('vcf_filename_without_ext', vcf_filename_without_ext);
// 		var json_raw = fs.readFileSync('/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-by-genotypes/' + vcf_filename_without_ext + '.json');
// 		var json_object = JSON.parse(json_raw);
// 		res.send(JSON.stringify(json_object));
// 	} catch (err) {
// 		console.log(err);
// 	}
// }

exports.gwas_get_ui_json = function(req, res, next) {
	var json_data = fs.readFileSync('/home/FCAM/tg-nginx/.nextflow/assets/TreeGenes/gwas-pipeline/nextflow_schema.json');
	res.setHeader('Content-Type', 'application/json');
	res.send(json_data);	
}

// gwas_check_completion_json
exports.gwas_check_completion_json = function(req, res, next) {
	var results = {};
	try {
		console.log(req.body);
		// var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var analysis_id = req.body.analysis_id;
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/gwas-pipeline';
		console.log('Analysis Directory: ' + directory);
		fs.mkdirSync(directory, { recursive: true });
		var completion_json_location = directory + '/completion_message.json';
		console.log('Completion JSON location: ' + completion_json_location);
		var response = "";
		if (fs.existsSync(completion_json_location)) {
			try {
				response = fs.readFileSync(completion_json_location, 'utf-8');
			} catch (err) {
				console.log(err);
			}
			results['response'] = JSON.parse(response);
			results['status'] = 'success';
		}
		else {
			results['response'] = "File not found";
			results['status'] = 'File not found';
		}
		res.status(200).send(JSON.stringify(results));
		return;

	}
	catch (err) {
		results['status'] = 'error';
		results['response'] = err;
		res.status(200).send(JSON.stringify(results));
		return;
	}
}

exports.gwas_step_execution = function(req, res, next) {
	try {
		console.log('post vars', req.body);
		var user_id = req.body.user_id;
		var analysis_id = req.body.analysis_id;
		var workspace_name = req.body.workspace_name;
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		// var vcf_location = req.body.vcf_location;
		var analysis_id = req.body.analysis_id;
		// var study_accession = req.body.study_accession;
		var flags  = JSON.parse(req.body.flags);
		console.log('flags', flags);
		var flags_line = '';
		var flag_names = Object.keys(flags);
		console.log('flag_names', flag_names);
		for (var i = 0; i < flag_names.length; i++) {
			var flag_name = flag_names[i];
			// Check if flags[flag_name] is an array or not
			if (Array.isArray(flags[flag_name])) {
				// If it's an array, we need to add csv values
				var csv_values = flags[flag_name].join(',');
				// Gabe needed this for env_col to be cast as a string
				if (flag_name = 'env_col') {
					if (csv_values.includes(',') == false) {
						csv_values = csv_values + ',';
					}
				}
				flags_line += "--" + flag_name + " '" + csv_values + "' ";
			}
			else {
				flags_line += "--" + flag_name + " '" + flags[flag_name] + "' ";
			}
		}
		console.log('Flags line: ' + flags_line);
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/gwas-pipeline';
		fs.mkdirSync(directory, { recursive: true });
		console.log('It came here');
		try {
			fs.rmSync(directory + '/completion_message.json');
		} catch (err) {
			console.log(err);
		}
		const exec = require('child_process').exec;
		var cmd = "cd " + directory + '; ';
		cmd += 'nextflow run TreeGenes/gwas-pipeline -hub gitlab -r main -profile treegenes --analysis_id '  + analysis_id + ' --user_id ' + user_id +' --outdir \'' + workspace_dir + '\' ' + flags_line + ' ;';
		console.log('cmd', cmd);
		var results = {
			status: 'failed'
		};
		// console.log('req.body', req.body);
		console.log('Performing gwas pipeline ...');
		results['status'] = 'success';
		// results['study_accession'] = study_accession;
		results['analysis_id'] = analysis_id;
		
		var child = exec(cmd, function(error, stdout, stderr) {
			if(error) {
				console.log(error);
				results['status'] = 'failed';
				results['error'] = true;
				// res.send(JSON.stringify(results));
				return;
			}


			console.log('stderr', stderr);
			console.log('stdout', stdout);

			var cmd2 = "cd " + directory + "; RUN_NAME=$(nextflow log | awk -F'\t' 'NR > 1 {print $0}' | sort -r | awk -F'\t' 'NR==1 {print $3}'); nextflow log $RUN_NAME -f script > " + workspace_dir + '/current-runcmds_gwas.txt';
			var child2 = exec(cmd2, function(error, stdout, stderr) {
				console.log('stderr', stderr);
				console.log('stdout', stdout);
			});

			// Get the JSON
			// var analysis_id = req.body.analysis_id;
			// var study_accession = req.body.study_accession;
			// var vcf_location = req.body.vcf_location;
			// var vcf_location_parts = vcf_location.split('/');
			// var vcf_filename = vcf_location_parts[vcf_location_parts.length - 1];
			// var vcf_filename_without_ext = vcf_filename.replace('.vcf', '');
			// console.log('vcf_filename_without_ext', vcf_filename_without_ext);
			// results['vcf_filename_without_ext'] = vcf_filename_without_ext;
			// // var json_raw = fs.readFileSync('/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-by-genotypes/' + vcf_filename_without_ext + '.json');
			// var json_raw = fs.readFileSync('/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-by-genotypes/rule_options.json');
			// var json_object = JSON.parse(json_raw);
			// results['rules_json'] = json_object;

			
		});
		results['pid'] = child['pid'];
		res.status(200).send(JSON.stringify(results)); // will still run in the background
	}
	catch (err) {
		console.log(err);
	}
}

exports.gwas_step_stop_execution = function(req, res, next) {
	try {
		console.log('Stopping gwas step execution');
		var pid = req.body.pid;
		console.log('pid', pid);
		if (pid) {
			const exec = require('child_process').exec;
			var cmd = "kill -9 " + pid;
			console.log('cmd', cmd);
			var results = {
				status: 'failed'
			};
			var child = exec(cmd, function(error, stdout, stderr) {
				if(error) {
					console.log(error);
					results['status'] = 'failed';
					results['error'] = true;
					res.send(JSON.stringify(results));
					return;
				}
				results['status'] = 'success';
				console.log('stderr', stderr);
				console.log('stdout', stdout);
				res.send(JSON.stringify(results));
				return;
			});
		}
		else {
			console.log('No pid provided');
			var results = {
				status: 'failed',
				error: 'No pid provided'
			};
			res.send(JSON.stringify(results));
			return;
		}
	}
	catch (err) {
		console.log(err);
		var results = {
			status: 'failed',
			error: err.message
		};
		res.send(JSON.stringify(results));
		return;
	}
}

exports.popstruct_get_ui_json = function(req, res, next) {
	var json_data = fs.readFileSync('/home/FCAM/tg-nginx/.nextflow/assets/TreeGenes/population-structure-pipeline/nextflow_schema.json');
	res.setHeader('Content-Type', 'application/json');
	res.send(json_data);
}

exports.popstruct_nextflow_visualization = function(req, res, next) {
	console.log('Getting nextflow visualization');
	try {
		var analysis_id = req.query.analysis_id;
		var image_index = req.query.image_index;
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/popstruct/';
		var json_data = fs.readFileSync(directory + '/completion_message.json');
		var json_object = JSON.parse(json_data);
		var barchart_location = json_object['image'][image_index];
		res.sendFile(barchart_location);
		return;
	}
	catch (err) {
		console.log(err);
	}
	return;
}

exports.gwas_nextflow_visualization = function(req, res, next) {
	console.log('Getting nextflow visualization');
	try {
		var analysis_id = req.query.analysis_id;
		var type = null;
		if (req.query.type != undefined) {
			type = req.query.type;
		}
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/gwas-pipeline';
		var json_data = fs.readFileSync(directory + '/completion_message.json');
		var json_object = JSON.parse(json_data);
		var image_location = '';
		if (type == null) {
			image_location = json_object['image'];
		}
		else if (type == 'qqplot') {
			image_location = json_object['qqplot'];
		}
		else if (type == 'manhattan') {
			image_location = json_object['manhattan'];
		}
		res.sendFile(image_location);
		return;
	}
	catch (err) {
		console.log(err);
	}
	return;
}

exports.popstruct_nextflow_workflow = function(req, res, next) {
	console.log('Running nextflow workflow...');
	try {
		// user_id
		// workspace_name
		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var analysis_id = req.body.analysis_id;
		var properties = req.body.properties;
		console.log('properties', properties);
		var properties = JSON.parse(properties);
		var pkeys = Object.keys(properties);
		var pcmd = '';
		for (var i = 0; i < pkeys.length; i++) {
			var pkey = pkeys[i];
			var pvalue = properties[pkey];
			pcmd += ' --' + pkey + ' ' + pvalue;
		}

		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/popstruct/';
		fs.mkdirSync(directory, { recursive: true });
		try {
			fs.rmSync(directory + '/completion_message.json');
		} catch (err) {
			console.log(err);
		}
		const exec = require('child_process').exec;
		var cmd = "cd " + directory + '; ';
		cmd += 'nextflow run TreeGenes/population-structure-pipeline -hub gitlab -r main -profile treegenes --user_id ' + user_id + ' --analysis_id ' + analysis_id + ' --outdir \'' + workspace_dir + '\'';
		cmd += pcmd; // add the properties flags
		console.log('cmd', cmd);
		var results = {
			status: 'failed'
		};
		console.log('req.body', req.body);
		console.log('Performing population structure');
		var child = exec(cmd, function(error, stdout, stderr) {
			if(error) {
				console.log(error);
				results['error'] = true;
				results['error_msg'] = error;
				res.send(JSON.stringify(results));
				return;
			}
			results['status'] = 'success';
			// results['study_accession'] = study_accession;
			// results['analysis_id'] = analysis_id;
			console.log('stderr', stderr);
			console.log('stdout', stdout);

			var cmd2 = "cd " + directory + "; RUN_NAME=$(nextflow log | awk -F'\t' 'NR > 1 {print $0}' | sort -r | awk -F'\t' 'NR==1 {print $3}'); nextflow log $RUN_NAME -f script > " + workspace_dir + '/current-runcmds_population_structure.txt';
			var child2 = exec(cmd2, function(error, stdout, stderr) {
				console.log('stderr', stderr);
				console.log('stdout', stdout);
				// Read the completion_message.json and send it back in the response
				try {
					var completion_json_data = JSON.parse(fs.readFileSync(directory + '/completion_message.json'));
					results['completion_message'] = completion_json_data;
				}
				catch (err) {
					console.log(err);
				}
				results['completion_message'] = completion_json_data;
				res.send(JSON.stringify(results));
			});
			// res.send(JSON.stringify(results));
			return;
		});
	}
	catch (err) {
		console.log(err);
	}
}

exports.genotypes_variant_filtering_panel_filter_and_imputation = function(req, res, next) {
	try {
		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var vcf_location = req.body.vcf_location;
		var analysis_id = req.body.analysis_id;
		var study_accession = req.body.study_accession;
		var filter  = req.body.filter;
		var input_payload = JSON.parse(req.body.payload);
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-and-imputation';
		fs.mkdirSync(directory, { recursive: true });
		try {
			fs.rmSync(directory + '/completion_message.json');
		} catch (err) {
			console.log(err);
		}
		const exec = require('child_process').exec;
		var cmd = "cd " + directory + '; ';
		// cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -hub gitlab -r main -profile treegenes --outdir \'' + workspace_dir + '\'  --input \'' + vcf_location + '\' --filter \'' + filter + '\' --panel \'filter-and-imputation\';';
		

		var input_payload_location = directory + '/input_payload.json';
		fs.writeFileSync(input_payload_location, JSON.stringify(input_payload));
		cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -hub gitlab -r main -profile treegenes --user_id ' + user_id +  ' --analysis_id ' + analysis_id + ' --outdir \'' + workspace_dir + '\'  --input \'' + input_payload_location + '\' --filter \'' + filter + '\' --panel \'filter-and-imputation\';';
		
		console.log('cmd', cmd);
		var results = {
			status: 'failed'
		};
		console.log('req.body', req.body);
		console.log('Performing variant filtering pipeline (filter and imputation) for ' + study_accession);
		var child = exec(cmd, function(error, stdout, stderr) {
			if(error) {
				console.log(error);
				results['error'] = true;
				res.send(JSON.stringify(results));
				return;
			}

			results['status'] = 'success';
			results['study_accession'] = study_accession;
			results['analysis_id'] = analysis_id;
			// results['cmd'] = cmd;
			console.log('stderr', stderr);
			console.log('stdout', stdout);

			var cmd2 = "cd " + directory + "; RUN_NAME=$(nextflow log | awk -F'\t' 'NR > 1 {print $0}' | sort -r | awk -F'\t' 'NR==1 {print $3}'); nextflow log $RUN_NAME -f script > " + workspace_dir + '/current-runcmds_filter_and_imputation.txt';
			results['cmd2'] = cmd2;
			var child2 = exec(cmd2, function(error, stdout, stderr) {
				console.log('stderr', stderr);
				console.log('stdout', stdout);
			});

			// Get the JSON
			// var analysis_id = req.body.analysis_id;
			// var study_accession = req.body.study_accession;
			// var vcf_location = req.body.vcf_location;
			// var vcf_location_parts = vcf_location.split('/');
			// var vcf_filename = vcf_location_parts[vcf_location_parts.length - 1];
			// var vcf_filename_without_ext = vcf_filename.replace('.vcf', '');
			// console.log('vcf_filename_without_ext', vcf_filename_without_ext);
			// results['vcf_filename_without_ext'] = vcf_filename_without_ext;
			// // var json_raw = fs.readFileSync('/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-by-genotypes/' + vcf_filename_without_ext + '.json');
			// var json_raw = fs.readFileSync('/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-by-genotypes/rule_options.json');
			// var json_object = JSON.parse(json_raw);
			// results['rules_json'] = json_object;

			try {
				var completion_json_data = JSON.parse(fs.readFileSync(directory + '/completion_message.json'));
				results['completion_message'] = completion_json_data;
			}
			catch (err) {
				console.log(err);
			}

			res.send(JSON.stringify(results))
		});
	}
	catch (err) {
		console.log(err);
	}
}

exports.genotypes_variant_filtering_panel_filter_by_genotypes_rules_json = function(req, res, next) {
	var results = {
		status: 'failed'
	};
	try {
		var analysis_id = req.body.analysis_id;
		var study_accession = req.body.study_accession;
		var vcf_location = req.body.vcf_location;
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/variant-filtering-pipeline/filter-by-genotypes';	
		
		var vcf_location_parts = vcf_location.split('/');

		var vcf_filename = vcf_location_parts[vcf_location_parts.length - 1];
		
		// var vcf_filename_without_ext = vcf_filename.replace('.vcf', '');
		var vcf_filename_without_ext = "";
		if (vcf_filename.includes('.vcf.gz')) {
			vcf_filename_without_ext = vcf_filename.replace('.gz', '');
		}
		//var vcf_filename_without_ext = vcf_filename.split('.').slice(0, -1).join('.');
		console.log('vcf_filename_without_ext', vcf_filename_without_ext);
		results['vcf_filename_without_ext'] = vcf_filename_without_ext;
		results['study_accession'] = study_accession;
		results['analysis_id'] = analysis_id;
		
		var rule_options_location = "";
		if (fs.existsSync(directory + '/' + vcf_filename_without_ext + '_rule_options.json')) {
			rule_options_location = directory + '/' + vcf_filename_without_ext + '_rule_options.json'
		}
		else {
			rule_options_location = directory + '/' + vcf_filename_without_ext + '.gz_rule_options.json';
		}
		var json_raw = fs.readFileSync(rule_options_location);
		var json_object = JSON.parse(json_raw);
		results['rules_json'] = json_object;
		results['status'] = true;
	}
	catch (err) {
		console.log(err);
	}
	res.send(JSON.stringify(results));
}

exports.genotypes_variant_filtering_panel_filter_by_genotypes_completion_json = function(req, res, next) {
	var results = {
		success: 'false'
	};
	try {
		var analysis_id = req.body.analysis_id;
		var study_accession = req.body.study_accession;
		var vcf_location = req.body.vcf_location;
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/variant-filtering-pipeline/filter-by-genotypes';	

		var json_raw = fs.readFileSync(directory + '/completion_message.json');
		var json_object = JSON.parse(json_raw);
		json_object['ui_study_accession'] = study_accession;
		results = json_object;
		
		// var vcf_location_parts = vcf_location.split('/');

		// var vcf_filename = vcf_location_parts[vcf_location_parts.length - 1];
		
		// // var vcf_filename_without_ext = vcf_filename.replace('.vcf', '');
		// var vcf_filename_without_ext = "";
		// if (vcf_filename.includes('.vcf.gz')) {
		// 	vcf_filename_without_ext = vcf_filename.replace('.gz', '');
		// }
		// //var vcf_filename_without_ext = vcf_filename.split('.').slice(0, -1).join('.');
		// console.log('vcf_filename_without_ext', vcf_filename_without_ext);
		// results['vcf_filename_without_ext'] = vcf_filename_without_ext;
		// results['study_accession'] = study_accession;
		// results['analysis_id'] = analysis_id;
		
		// var rule_options_location = "";
		// if (fs.existsSync(directory + '/' + vcf_filename_without_ext + '_rule_options.json')) {
		// 	rule_options_location = directory + '/' + vcf_filename_without_ext + '_rule_options.json'
		// }
		// else {
		// 	rule_options_location = directory + '/' + vcf_filename_without_ext + '.gz_rule_options.json';
		// }
		// var json_raw = fs.readFileSync(rule_options_location);
		// var json_object = JSON.parse(json_raw);
		// results['rules_json'] = json_object;
		// results['status'] = true;
	}
	catch (err) {
		console.log(err);
	}
	res.send(JSON.stringify(results));
}

exports.genotypes_variant_filtering_panel_get_statistics = function (req, res, next) {
	try {
		console.log('It came here');
		console.log(req.body);
		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var variable_name = req.body.variable_name;
		var directive = req.body.directive;
		console.log('variable_name', variable_name);
		var study_accession = req.body.study_accession;
		var vcf_filename_without_ext = req.body.vcf_filename_without_ext;
		var ext = '.vcf.gz';
		if (vcf_filename_without_ext.endsWith(ext)) {
			// remove the last find of .vcf.gz
			vcf_filename_without_ext = vcf_filename_without_ext.substring(0, vcf_filename_without_ext.length - (ext.length));
		}
		console.log('vcf_filename_without_ext', vcf_filename_without_ext);
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var file_location = '';
		if (directive == "INDV") {
			file_location = workspace_dir + '/vcf_stats/' + vcf_filename_without_ext + '_' + directive + '_' + variable_name + '.txt';
		}
		else {
			file_location = workspace_dir + '/vcf_stats/' + vcf_filename_without_ext + '_' + variable_name + '.txt';
		}
		var file_data = undefined;
		console.log("file location:" + file_location);
		if (fs.existsSync(file_location) && directive != "INDV") {
			console.log('File found: ' + file_location);
			file_data = fs.readFileSync(file_location);
		}
		else if (fs.existsSync(file_location) && directive == "INDV") {
			console.log("INDV FILE DETECTED");
			// first column is sample names, second column is values
			var file_data_tmp = fs.readFileSync(file_location);
			file_data_tmp = file_data_tmp.toString();
			// console.log(file_data_tmp);
			var file_data_tmp_lines = file_data_tmp.split("\n");
			console.log(file_data_tmp_lines);
			file_data_tmp = ""; // empty the read data
			file_data = "";
			for (var i = 0; i < file_data_tmp_lines.length; i++) {
				var line = file_data_tmp_lines[i];
				var line_parts = line.split("\t");
				console.log(line_parts);
				var value = line_parts[1];
				file_data += value + "\n";
			}
		}
		else {
			console.log('File not found: ' + file_location);
			file_location = workspace_dir + '/vcf_stats/FORMAT_' + variable_name + '.txt';
			file_data = fs.readFileSync(file_location);
		}
		console.log('file_data_length', file_data.length);
		if (file_data != undefined) {
			file_data = file_data.toString().split("\n");
		}
		// console.log('file_data', file_data);
		var results = {
			status: 'success',
			study_accession: study_accession,
			values: file_data
		}
		// console.log('IT CAME HERE');
		res.send(JSON.stringify(results));
	}
	catch (err) {
		console.log(err);
		var results = {
			status: 'error',
			response: err
		}
		res.send(JSON.stringify(results));
	}
}

// genotypes_gt_check_check_completion_json
exports.genotypes_gt_check_check_completion_json = function(req, res, next) {
	var results = {};
	try {
		console.log(req.body);
		// var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var analysis_id = req.body.analysis_id;
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/variant-filtering-pipeline/gt-check';
		console.log('Analysis Directory: ' + directory);
		fs.mkdirSync(directory, { recursive: true });
		var completion_json_location = directory + '/completion_message.json';
		console.log('Completion JSON location: ' + completion_json_location);
		var response = "";
		if (fs.existsSync(completion_json_location)) {
			try {
				response = fs.readFileSync(completion_json_location, 'utf-8');
			} catch (err) {
				console.log(err);
			}
			results['response'] = JSON.parse(response);
			results['status'] = 'success';
		}
		else {
			results['response'] = "File not found";
			results['status'] = 'File not found';
		}
		res.status(200).send(JSON.stringify(results));
		return;
	}
	catch (err) {
		results['status'] = 'error';
		results['response'] = err;
		res.status(200).send(JSON.stringify(results));
		return;
	}
}

exports.genotypes_gt_check_run = function(req, res, next) {
	try {
		console.log(req.body);

		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var analysis_id = req.body.analysis_id;
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;

		var payload_json = req.body.payload;
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/variant-filtering-pipeline/gt-check';
		console.log('Analysis Directory: ' + directory);
		fs.mkdirSync(directory, { recursive: true });
		try {
			fs.rmSync(directory + '/completion_message.json');
		} catch (err) {
			console.log(err);
		}
		var payload_json_location = directory + '/payload.json';
		console.log('Payload location: ' + payload_json_location);
		if (fs.existsSync(payload_json_location) == true) {
			fs.unlinkSync(payload_json_location);
		}
		fs.writeFileSync(payload_json_location, payload_json);

		const exec = require('child_process').exec;
		var cmd = "cd " + directory + '; ';
		// -r main or dev -hub gitlab
		// Version 1 used --input 'vcf_location'
		// cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -r main -profile treegenes --outdir \'' + workspace_dir + '\' --input \'' + vcf_location + '\' --panel \'filter-by-genotypes\';';
		// Version 2 uses --input structured_json.json
		cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -r main -profile treegenes --panel \'gt-check\' --input \'' + payload_json_location + '\' --outdir \'' + workspace_dir + '\';';
		console.log('cmd', cmd);
		var results = {
			status: 'failed',
		};
		// results['study_accession'] = study_accession;
		console.log('Performing gt check processing...');
		var child = exec(cmd, function(error, stdout, stderr) {
			
			if(error) {
				console.log(error);
				results['error'] = true;
				// results['study_accession'] = study_accession;
				results['error_msg'] = error;
				results['completion_message'] = {};
				try {
					results['completion_message'] = JSON.parse(fs.readFileSync(directory + '/completion_message.json'));
				} catch (err) {}
				res.status(200).send(JSON.stringify(results));
				return;
			}

			results['status'] = 'success';
			// results['study_accession'] = study_accession;
			results['analysis_id'] = analysis_id;
			// results['cmd'] = cmd;
			console.log('stderr', stderr);
			console.log('stdout', stdout);

			
			res.status(200).send(JSON.stringify(results));
			return;

		});
	}
	catch (err) {
		console.log(err);
		res.status(200).send({
			error: JSON.stringify(err)
		});
		return;
	}
}

// genotypes_merge_vcfs_check_completion_json
exports.genotypes_merge_vcfs_check_completion_json = function(req, res, next) {
	var results = {};
	try {
		console.log(req.body);
		// var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var analysis_id = req.body.analysis_id;
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/variant-filtering-pipeline/vcf-merge';
		console.log('Analysis Directory: ' + directory);
		fs.mkdirSync(directory, { recursive: true });
		var completion_json_location = directory + '/completion_message.json';
		console.log('Completion JSON location: ' + completion_json_location);
		var response = "";
		if (fs.existsSync(completion_json_location)) {
			try {
				response = fs.readFileSync(completion_json_location, 'utf-8');
			} catch (err) {
				console.log(err);
			}
			results['response'] = JSON.parse(response);
			results['status'] = 'success';
		}
		else {
			results['response'] = "File not found";
			results['status'] = 'File not found';
		}
		res.status(200).send(JSON.stringify(results));
		return;

	}
	catch (err) {
		results['status'] = 'error';
		results['response'] = err;
		res.status(200).send(JSON.stringify(results));
		return;
	}
}

exports.genotypes_merge_vcfs_run = function(req, res, next) {
	try {
		console.log(req.body);

		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var analysis_id = req.body.analysis_id;
		
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;

		var payload_json = req.body.payload;
		var study_to_retain_clones_argument = '';
		var payload_json_object = JSON.parse(payload_json);
		if (payload_json_object != undefined) {
			if (payload_json_object['study_to_retain_clones'] != undefined) {
				study_to_retain_clones_argument = '--study_selection ' + payload_json_object['study_to_retain_clones'];
			}
		}
		
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/variant-filtering-pipeline/vcf-merge';
		try {
			fs.rmSync(directory + '/completion_message.json');
		} catch (err) {
			console.log(err);
		}
		console.log('Analysis Directory: ' + directory);
		fs.mkdirSync(directory, { recursive: true });
		var payload_json_location = directory + '/payload.json';
		console.log('Payload location: ' + payload_json_location);
		if (fs.existsSync(payload_json_location) == true) {
			fs.unlinkSync(payload_json_location);
		}
		fs.writeFileSync(payload_json_location, payload_json);

		const exec = require('child_process').exec;
		var cmd = "cd " + directory + '; ';
		// -r main or dev -hub gitlab
		// Version 1 used --input 'vcf_location'
		// cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -r main -profile treegenes --outdir \'' + workspace_dir + '\' --input \'' + vcf_location + '\' --panel \'filter-by-genotypes\';';
		// Version 2 uses --input structured_json.json
		cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -r main -profile treegenes --panel \'vcf-merge\' ' + study_to_retain_clones_argument + ' --input \'' + payload_json_location + '\' --outdir \'' + workspace_dir + '\';';
		console.log('cmd', cmd);
		var results = {
			status: 'failed',
		};
		// results['study_accession'] = study_accession;
		console.log('Performing vcf merge processing...');
		var child = exec(cmd, function(error, stdout, stderr) {
			
			if(error) {
				console.log(error);
				results['error'] = true;
				// results['study_accession'] = study_accession;
				results['error_msg'] = error;
				results['completion_message'] = {};
				try {
					results['completion_message'] = JSON.parse(fs.readFileSync(directory + '/completion_message.json'));
				} catch (err) {}
				res.status(200).send(JSON.stringify(results));
				return;
			}

			results['status'] = 'success';
			// results['study_accession'] = study_accession;
			results['analysis_id'] = analysis_id;
			// results['cmd'] = cmd;
			console.log('stderr', stderr);
			console.log('stdout', stdout);

			
			res.status(200).send(JSON.stringify(results));
			return;

		});
	}
	catch (err) {
		console.log(err);
		res.status(200).send({
			error: JSON.stringify(err)
		});
		return;
	}
}



// manage_study_context_check_completion_json
exports.manage_study_context_check_completion_json = function(req, res, next) {
	var results = {};
	try {
		console.log(req.body);
		// var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var analysis_id = req.body.analysis_id;
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/variant-filtering-pipeline/study-context';
		console.log('Analysis Directory: ' + directory);
		fs.mkdirSync(directory, { recursive: true });
		var completion_json_location = directory + '/completion_message.json';
		console.log('Completion JSON location: ' + completion_json_location);
		var response = "";
		if (fs.existsSync(completion_json_location)) {
			try {
				response = fs.readFileSync(completion_json_location, 'utf-8');
			} catch (err) {
				console.log(err);
			}
			results['response'] = JSON.parse(response);
			results['status'] = 'success';
		}
		else {
			results['response'] = "File not found";
			results['status'] = 'File not found';
		}
		res.status(200).send(JSON.stringify(results));
		return;

	}
	catch (err) {
		results['status'] = 'error';
		results['response'] = err;
		res.status(200).send(JSON.stringify(results));
		return;
	}
}

exports.manage_study_context_run = function(req, res, next) {
	try {
		console.log(req.body);

		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var analysis_id = req.body.analysis_id;
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;

		var payload_json = req.body.payload;
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/variant-filtering-pipeline/study-context';
		try {
			fs.rmSync(directory + '/completion_message.json');
		} catch (err) {
			console.log(err);
		}
		console.log('Analysis Directory: ' + directory);
		fs.mkdirSync(directory, { recursive: true });
		var payload_json_location = directory + '/payload.json';
		console.log('Payload location: ' + payload_json_location);
		if (fs.existsSync(payload_json_location) == true) {
			fs.unlinkSync(payload_json_location);
		}
		fs.writeFileSync(payload_json_location, payload_json);

		const exec = require('child_process').exec;
		var cmd = "cd " + directory + '; ';
		// -r main or dev -hub gitlab
		// Version 1 used --input 'vcf_location'
		// cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -r main -profile treegenes --outdir \'' + workspace_dir + '\' --input \'' + vcf_location + '\' --panel \'filter-by-genotypes\';';
		// Version 2 uses --input structured_json.json
		cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -r main -profile treegenes --panel \'study-context\' --input \'' + payload_json_location + '\' --outdir \'' + workspace_dir + '\';';
		console.log('cmd', cmd);
		var results = {
			status: 'failed',
		};
		// results['study_accession'] = study_accession;
		console.log('Performing study context processing...');
		var child = exec(cmd, function(error, stdout, stderr) {
			
			if(error) {
				console.log(error);
				results['error'] = true;
				// results['study_accession'] = study_accession;
				results['error_msg'] = error;
				results['completion_message'] = {};
				try {
					results['completion_message'] = JSON.parse(fs.readFileSync(directory + '/completion_message.json'));
				} catch (err) {}
				res.status(200).send(JSON.stringify(results));
				return;
			}

			results['status'] = 'success';
			// results['study_accession'] = study_accession;
			results['analysis_id'] = analysis_id;
			// results['cmd'] = cmd;
			console.log('stderr', stderr);
			console.log('stdout', stdout);

			
			res.status(200).send(JSON.stringify(results));
			return;

		});

		try {
			// // CODE IN PROGRESS - CONFIRMED WORKING FOR HPC CLUSTER
			// var nfjm = new NextflowJobManager();
			// nfjm.setJobUser('tg-nginx');
			// // nfjm.newJob('study_context_' + analysis_id, 'local', null); // For local
			// nfjm.newJob('study_context_' + analysis_id, 'cluster', 'login.hpc.cam.uchc.edu'); // For cluster
			// nfjm.setJobAction('run');
			// nfjm.setJobRunDirectory(directory);
			// nfjm.setJobOutputDirectory(workspace_dir);
			// nfjm.setJobTempDirectory(workspace_dir + '/temp');
			// nfjm.setJobSlurmHeaders();
			// nfjm.setJobNextflowResourceName('TreeGenes/variant-filtering-pipeline');
			// nfjm.addJobArgument('-r', 'main');
			// // nfjm.addJobArgument('-profile', 'treegenes'); // For local
			// nfjm.addJobArgument('-profile', 'xanadu'); // For cluster
			// nfjm.addJobArgument('--panel', 'study-context');
			// nfjm.addJobArgument('--input', "'" + payload_json_location + "'");
			// nfjm.addJobArgument('--outdir', "'" + workspace_dir + "'");
			// nfjm.submitJob();

			// results['status'] = 'success';
			// // results['study_accession'] = study_accession;
			// results['analysis_id'] = analysis_id;
			// console.log('stderr', stderr);
			// console.log('stdout', stdout);

			// res.status(200).send(JSON.stringify(results));
			// return;
		} catch (err) {
			console.log(err);
		}

	}
	catch (err) {
		console.log(err);
		res.status(200).send({
			error: JSON.stringify(err)
		});
		return;
	}
}

exports.genotypes_variant_filtering_panel_filter_by_genotypes = function(req, res, next) {
	try {
		var user_id = req.body.user_id;
		var workspace_name = req.body.workspace_name;
		var analysis_id = req.body.analysis_id;
		var workspace_dir = '/isg/treegenes/cartograplant_analysis_workspaces/' + user_id + '/' + workspace_name;
		// Version 1
		// var vcf_location = req.body.vcf_location;
		// if (!fs.existsSync(vcf_location)) {
		// 	vcf_location = vcf_location + '.gz';
		// }
		// var study_accession = req.body.study_accession;
		// var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-by-genotypes';
		// Version 2
		// structured_json as key -> object
		
		var directory = '/isg/treegenes/cartograplant_analysis/' + analysis_id + '/variant-filtering-pipeline/filter-by-genotypes';
		try {
			fs.rmSync(directory + '/completion_message.json');
		} catch (err) {
			console.log(err);
		}
		console.log('Analysis Directory: ' + directory);
		fs.mkdirSync(directory, { recursive: true });
		var structured_json_location = directory + '/structured_json.json';
		console.log('Structured location: ' + structured_json_location);
		try {
			fs.unlinkSync(structured_json_location);
		} catch (err) {
			console.log(err);
		}
		console.log(req.body);

		var structured_json = JSON.parse(req.body.structured_json);

		// Verify files exist at location and try the .gz patch
		var studies = Object.keys(structured_json['studies']);
		for (var i = 0; i < studies.length; i++) {
			var study = studies[i];
			var vcf_location = structured_json['studies'][study][0];
			if (!fs.existsSync(vcf_location)) {
				vcf_location = vcf_location + '.gz';
				if (!fs.existsSync(vcf_location)) {
					vcf_location = null;
				}
			}
			structured_json['studies'][study][0] = vcf_location;
		}

		var structured_json_data = JSON.stringify(structured_json);
		fs.writeFileSync(structured_json_location, structured_json_data);
		console.log('Structured JSON data: ' + structured_json_data);

		const exec = require('child_process').exec;
		var cmd = "cd " + directory + '; ';
		// -r main or dev -hub gitlab
		// Version 1 used --input 'vcf_location'
		// cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -r main -profile treegenes --outdir \'' + workspace_dir + '\' --input \'' + vcf_location + '\' --panel \'filter-by-genotypes\';';
		// Version 2 uses --input structured_json.json
		//cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -r main -profile treegenes --outdir \'' + workspace_dir + '\' --input \'' + structured_json_location + '\' --panel \'filter-by-genotypes\';';
		
		// Version 3: Use the main branch
		cmd += 'nextflow run TreeGenes/variant-filtering-pipeline -r main -profile treegenes --outdir \'' + workspace_dir + '\' --input \'' + structured_json_location + '\' --panel \'filter-by-genotypes\';';
		
		console.log('cmd', cmd);
		var results = {
			status: 'failed',
			studies: studies
		};
		// results['study_accession'] = study_accession;
		console.log('req.body', req.body);
		console.log('Performing variant filtering pipeline (filter by genotypes) for ' + JSON.stringify(studies));
		var child = exec(cmd, function(error, stdout, stderr) {
			
			if(error) {
				console.log(error);
				results['error'] = true;
				// results['study_accession'] = study_accession;
				results['error_msg'] = error;
				results['completion_message'] = {};
				try {
					results['completion_message'] = JSON.parse(fs.readFileSync(directory + '/completion_message.json'));
				} catch (err) {}
				res.send(JSON.stringify(results));
				return;
			}

			results['status'] = 'success';
			// results['study_accession'] = study_accession;
			results['analysis_id'] = analysis_id;
			console.log('stderr', stderr);
			console.log('stdout', stdout);

			// Version 1
			// // Get the JSON
			// // var analysis_id = req.body.analysis_id;
			// // var study_accession = req.body.study_accession;
			// // var vcf_location = req.body.vcf_location;
			// var vcf_location_parts = vcf_location.split('/');
			// var vcf_filename = vcf_location_parts[vcf_location_parts.length - 1];
			// // var vcf_filename_without_ext = vcf_filename.replace('.vcf', '');
			// var vcf_filename_without_ext = vcf_filename.split('.').slice(0, -1).join('.');
			// console.log('vcf_filename_without_ext', vcf_filename_without_ext);
			// results['vcf_filename_without_ext'] = vcf_filename_without_ext;
			// // var json_raw = fs.readFileSync('/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-by-genotypes/' + vcf_filename_without_ext + '.json');
			// var json_raw = fs.readFileSync('/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-by-genotypes/rule_options.json');
			// var json_object = JSON.parse(json_raw);
			// results['rules_json'] = json_object;
			// res.send(JSON.stringify(results));
			// return;

			// // Version 2
			// // Get the JSON
			// // var analysis_id = req.body.analysis_id;
			// // var study_accession = req.body.study_accession;
			// // var vcf_location = req.body.vcf_location;
			// var vcf_location_parts = vcf_location.split('/');
			// var vcf_filename = vcf_location_parts[vcf_location_parts.length - 1];
			// // var vcf_filename_without_ext = vcf_filename.replace('.vcf', '');
			// var vcf_filename_without_ext = vcf_filename.split('.').slice(0, -1).join('.');
			// console.log('vcf_filename_without_ext', vcf_filename_without_ext);
			// results['vcf_filename_without_ext'] = vcf_filename_without_ext;
			// // var json_raw = fs.readFileSync('/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-by-genotypes/' + vcf_filename_without_ext + '.json');
			// var json_raw = fs.readFileSync('/isg/treegenes/cartograplant_analysis/' + analysis_id + '/' + study_accession + '/variant-filtering-pipeline/filter-by-genotypes/rule_options.json');
			// var json_object = JSON.parse(json_raw);
			// results['rules_json'] = json_object;
			
			res.send(JSON.stringify(results));
			return;

		});
	}
	catch (err) {
		console.log(err);
		res.send(JSON.stringify(results));
		return;
	}
	
}
  
/**
 * This should return the snps for a specific study
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.genotypes_snps_by_study = function(req, res, next) {
	try {
		var study = req.body.study;
		var analysis_name = req.body.analysis_name;
		// var query_str = "SELECT * FROM chado.markers_and_studies_names_remapped WHERE accession = $1";
		// query (query_str, [study], function (err, rows, result) {
		// 	if (err) {
		// 		console.log(err);
		// 		res.status(400);
		// 		return;
		// 	}

		// 	if (rows != undefined) {
		// 		if (rows.length > 0) {
		// 			// Add count
		// 			rows[0]['count'] = rows[0]['markers'].length;
		// 			res.status(200).send(JSON.stringify(rows));
		// 		}
		// 		else {
		// 			rows = [];
		// 			res.status(200).send(JSON.stringify(rows));
		// 		}
		// 	}
		// });


		var query_str = "SELECT * FROM chado.markers_per_study_view WHERE study_accession = $1 AND analysis_name = $2";
		query (query_str, [study, analysis_name], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}

			if (rows != undefined) {
				if (rows.length > 0) {
					// Add count
					var rows_edited = [];
					rows_edited = rows;
					rows_edited[0]['markers'] = rows[0]['marker_positions'];
					rows_edited[0]['accession'] = rows[0]['study_accession'];
					delete rows_edited[0]['marker_positions'];
					delete rows_edited[0]['study_accession'];
					delete rows;
					rows_edited[0]['count'] = rows_edited[0]['markers'].length;
					res.status(200).send(JSON.stringify(rows_edited));
				}
				else {
					rows = [];
					res.status(200).send(JSON.stringify(rows));
				}
			}
		});
	}
	catch (err) {
		res.status(400).send('Error');
	}
}

/**
 * This should return the snps for a specific study
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
 exports.genotypes_snps_count_by_study = function(req, res, next) {
	try {
		var study = req.body.study;
		console.log('study', study);
		var query_str = "SELECT cardinality(markers) FROM chado.markers_and_studies_names WHERE accession = $1";
		console.log(query_str);
		query (query_str, [study], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}

			console.log(rows);
			if (rows != undefined) {
				if (rows.length > 0) {
					res.status(200).send(JSON.stringify({ cardinality: rows[0]['cardinality'] }));
					return;
				}
				else {
					res.status(200).send(JSON.stringify({ cardinality: 0 }));
					return;
				}
			}
			else {
				res.status(200).send(JSON.stringify({ cardinality: 0 }));
				return;
			}
		});
	}
	catch (err) {
		console.log(err);
		res.status(400).send('Error');
	}
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
	console.log(source_id);
	//make sure to also cache the query if possible
	if(filter == "") {
		filter = "(1 = 1)";
	}

	var query_str = "SELECT DISTINCT species as species FROM ct_trees WHERE " + filter + " AND source_id = " + source_id;

	
	// DEPRECATED
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
	var query_str = "SELECT COUNT(*) as tree_count FROM public.ct_trees WHERE " + filter + " AND source_id = " + source_id;
	//var query_str = "SELECT COUNT(*) as tree_count FROM (" + sub_query + ") AS TABLE1;";
	console.log(query_str);
	var tree_count = 0;

	var cache_result = ct_cache.get('trees_count_'+query_str);
	if(cache_result != null) {
		res.status(200).json({'tree_count': cache_result});
	}
	else {
		query(query_str, [], function (err, rows, result) {
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
 exports.analysis_related_views_reload = function(req, res, next) {
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
		var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_analysis_related_views.js']);
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


exports.trees_in_sea_results = function(req, res, next) {
	var api_superuser_password = req.query.asup;

	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		try {
			if (ct_cache.get('trees_in_sea_data') == undefined) {
				if(fs.existsSync('trees_in_sea.json') == true) {
					res.send(JSON.stringify({
						'results': JSON.parse(fs.readFileSync('trees_in_sea.json'))
					}));
				}
				res.send(JSON.stringify({
					'results': {}
				}));
			}
			else {
				res.send(JSON.stringify({
					'results': JSON.parse(ct_cache.get('trees_in_sea_data'))
				}));		
			}
		}
		catch (err) {
			res.send(err);
		}
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}
}

/**
 * This function will go through source_id = 0 and source_id = 2 ct_trees_all_view
 * and use the is sea function to detect whether the tree is in the sea or not
 * It stores the results in both cache and also a file
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 * @returns 
 */

exports.check_trees_in_sea = function(req, res, next) {
	
	var api_key = req.query.api_key;
	var api_superuser_password = req.query.asup;

	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		try {
			const defaults = {
				shell: true
			};
			
			// Check if process_check_Trees_in_sea is already running
			var is_running = ct_cache.get('ct_api_process_check_trees_in_sea');
			var output = "";
			if(is_running != true) {
				console.log('running ct_api_process_check_Trees_in_sea');
				ct_cache.put('ct_api_process_check_trees_in_sea', true);
				var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_check_trees_in_sea.js']);
				child.on('exit', function (code, signal) {
					//ct_cache.clear();	
					ct_cache.put('ct_api_process_check_trees_in_sea', false);
					console.log('Check Trees In Sea process has completed check.');
					console.log('child process exited with ' + 'code ' + code + ' and signal ' + signal);
					ct_cache.put('trees_in_sea_data', output);
					try {
						var fs = require('fs');
						fs.writeFileSync('trees_in_sea.json', output);
					}
					catch (err) {
						console.log(err);
					}
					// console.log('trees_in_sea', JSON.parse(output));

				});	
				
				child.stdout.on('data', (data) => {
					console.log("" + data + "");
					output += "" + data + "" ;
				});
				child.stderr.on('data', (data) => {
					console.error("" + data + "");
				});		
				
				res.status(200).json("success");
				return;
			}
			else {
				console.log('process_check_trees_in_sea function is already running - will not re-execute this until it finishes.');
			}
		}
		catch (err) {
			console.log(err);
		}
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
		
		// Check if process_trees_reload is already running
		var is_running = ct_cache.get('ct_api_process_trees_reload_running');
		if(is_running != true) {
			ct_cache.put('ct_api_process_trees_reload_running', true);
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
			console.log('process_trees_reload function is already running - will not re-execute this until it finishes.');
		}
	}
	else {
		res.status(200).json("no asup was given");
		return;
	}
}

/**
 * Clears the cache and refreshes the popstruct data within the popstruct ct trees view
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle   
 */
exports.popstruct_reload = function(req, res, next) {
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
		
		// Check if process_trees_reload is already running
		var is_running = ct_cache.get('ct_api_process_popstruct_reload_running');
		if(is_running != true) {
			ct_cache.put('ct_api_process_trees_reload_running', true);
			var child = spawn('node', ['--max-old-space-size=4096', __dirname + '/../process_popstruct_reload.js']);
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
			console.log('process_popstruct_reload function is already running - will not re-execute this until it finishes.');
		}
	}
	else {
		res.status(200).json("no asup was given");
		return;
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
		setTimeout(async function() {
			// var pg_n_client = new pg_native_client();
			try {
				console.log('Connecting...');
				// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				const client = await pool.connect();
				//console.log(config.conf.host);
				//console.log(config.conf.user);
				//console.log(config.conf.password);
				// pg_n_client.querySync("set datestyle='ISO';");
				// pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
				// pg_n_client.querySync("SET bytea_output TO escape;");
				// pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
				await client.query("set datestyle='ISO';");
				await client.query("SET client_encoding TO 'UTF-8';");
				await client.query("SET bytea_output TO escape;");
				await client.query('SET SEARCH_PATH TO "public","chado"');
				
				var filter = "dryad";
				//var rows = pg_n_client.querySync("SELECT accession FROM tpps_submission where status ILIKE 'approved' AND (POSITION('dryad' IN submission_state::TEXT) > 0)");
				// var rows = pg_n_client.querySync("SELECT accession FROM tpps_submission where status ILIKE 'approved' AND submission_state::TEXT ILIKE '%dryad%';");
				var qres = await client.query("SELECT accession FROM tpps_submission where status ILIKE 'approved' AND submission_state::TEXT ILIKE '%dryad%';");
				var rows = qres.rows;
				console.log('Found ' + rows.length + ' DRYAD studies');
				if(rows.length > 0) {
					for(i=0; i<rows.length; i++) {
						var accession = rows[i].accession;
						console.log('Updating TREES set source_id=2 FOR uniquename starting with:' + accession + '%');
						//Update ct_trees
						var sql_update = "UPDATE ct_trees SET source_id=2 WHERE uniquename ILIKE '" + accession + "%'";
						//console.log(sql_update);
						// pg_n_client.querySync(sql_update);
						await client.query(sql_update);
						//console.log(rows[i]);
					}
				}
				client.release();
			}
			catch(err) {
				console.log(err);
			}
			// Try to close the connection
			try {
				// pg_n_client.end();
				client.release();
			}
			catch (err) {

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
		setTimeout(async function() {
			// var pg_n_client = new pg_native_client();
			try {
				var species_without_organismprop_subkingdom_data = "";
				// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				const client = await pool.connect();
				// var rows = pg_n_client.querySync('SELECT DISTINCT(genus,species), genus, species FROM ct_trees_treesnap WHERE subkingdom IS NULL AND source_id = 1;');
				var qres = await client.query('SELECT DISTINCT(genus,species), genus, species FROM ct_trees_treesnap WHERE subkingdom IS NULL AND source_id = 1;');
				var rows = qres.rows;
				if(rows.length > 0) {
					for(i=0; i<rows.length; i++) {
						genus = rows[i].genus;
						species = rows[i].species;
						species_parts = species.split(' ');
						species_name = species_parts[1];
						//console.log('RESULTS1:' + genus + ':' + species + ':' +  species_name);
						
						//This will find the subkingdom if one exists
						// var rows2 = pg_n_client.querySync("SELECT * FROM chado.organism LEFT JOIN chado.organismprop ON chado.organism.organism_id = chado.organismprop.organism_id WHERE genus ILIKE '" + genus + "' AND organismprop.type_id = 35 LIMIT 1;");
						var qres2 = await client.query("SELECT * FROM chado.organism LEFT JOIN chado.organismprop ON chado.organism.organism_id = chado.organismprop.organism_id WHERE genus ILIKE '" + genus + "' AND organismprop.type_id = 35 LIMIT 1;");
						var rows2 = qres2.rows;
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
								await client.query("UPDATE ct_trees_treesnap SET subkingdom = '" + temp_subkingdom + "' WHERE genus ILIKE '" + genus + "' AND subkingdom IS NULL AND source_id=1;");
								if(temp_subkingdom == 'gymnosperm') {
									await client.query("UPDATE ct_trees_treesnap SET icon_type=4 where subkingdom='gymnosperm' AND genus ILIKE '" + genus +"' AND source_id=1;");
								}
								else if(temp_subkingdom == 'angiosperm') {
									await client.query("UPDATE ct_trees_treesnap SET icon_type=5 where subkingdom='angiosperm' AND genus ILIKE '" + genus + "' AND source_id=1;");
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
				await client.query("UPDATE ct_trees_treesnap SET subkingdom = 'angiosperms' WHERE genus ILIKE 'acer' AND subkingdom IS NULL AND source_id=1;");
				await client.query("UPDATE ct_trees_treesnap SET subkingdom = 'gymnosperms' WHERE genus ILIKE 'pinus' AND subkingdom IS NULL AND source_id=1;");
				console.log('Saving failed species to ' + __dirname + '/info_species_without_organismprop_subkingdom_data.txt');
				fs.writeFile(__dirname + '/info_species_without_organismprop_subkingdom_data.txt', species_without_organismprop_subkingdom_data, function (err) {
				  if (err) throw err;
				  console.log('Saved!');
				});
				species_without_organismprop_subkingdom_data = "";
				// pg_n_client.end();
				client.release();
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
		setTimeout(async function() {
			// var pg_n_client = new pg_native_client();
			try {
				//var species_without_organismprop_subkingdom_data = "";
				// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				const client = await pool.connect();
				// var rows = pg_n_client.querySync('SELECT DISTINCT(genus,species), genus, species FROM ct_trees_treesnap WHERE family IS NULL AND source_id = 1;');
				var qres = await client.query('SELECT DISTINCT(genus,species), genus, species FROM ct_trees_treesnap WHERE family IS NULL AND source_id = 1;');
				var rows = qres.rows;
				if(rows.length > 0) {
					for(i=0; i<rows.length; i++) {
						genus = rows[i].genus;
						species = rows[i].species;
						species_parts = species.split(' ');
						species_name = species_parts[1];
						//console.log('RESULTS1:' + genus + ':' + species + ':' +  species_name);
						
						//This will find the subkingdom if one exists
						// var rows2 = pg_n_client.querySync("SELECT * FROM chado.organism LEFT JOIN chado.organismprop ON chado.organism.organism_id = chado.organismprop.organism_id WHERE genus ILIKE '" + genus + "' AND organismprop.type_id = 10 LIMIT 1;");
						var qres2 = await client.query("SELECT * FROM chado.organism LEFT JOIN chado.organismprop ON chado.organism.organism_id = chado.organismprop.organism_id WHERE genus ILIKE '" + genus + "' AND organismprop.type_id = 10 LIMIT 1;");
						var rows2 = qres2.rows;
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
								await client.query("UPDATE ct_trees_treesnap SET family = '" + temp_family + "' WHERE genus ILIKE '" + genus + "' AND family IS NULL AND source_id=1;");
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
				// pg_n_client.end();
				client.release();
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
	
	// const fs = require('fs');
	// try {
	// fs.unlinkSync('treesnap.json');
	// } catch (e) {}
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

// mama_get_tree_phenotypes
exports.mama_get_tree_phenotypes = async function(req, res, next) {
	console.log('Connecting to database...');
	var rows = [];
	try {
		var tree_id = req.query.tree_id;
		// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		const client = await pool.connect();
		await client.query("set datestyle='ISO';");
		await client.query("SET client_encoding TO 'UTF-8';");
		await client.query("SET bytea_output TO escape;");
		await client.query('SET SEARCH_PATH TO "public","chado"');

		var query_str = "SELECT * FROM public.ct_trees_phenotypes_mama_ash_eab_surveys WHERE tree_acc = $1;";
		// var rows = pg_n_client.querySync(query_str,[analysis_id]);
		var qres = await client.query(query_str,[tree_id]);
		
		rows = qres.rows;
		client.release();
	}
	catch (err) {
		console.log(err);
	}
	res.status(200).json(rows);
}

exports.force_reload_mama = async function(req, res, next) {
	var api_superuser_password = req.query.asup;

	var api_key = req.query.api_key;

	if(config.conf.api_superuser_password == api_superuser_password) {	
		ct_cache.clear();		

		console.log("CLEAR MAMA TREES");
		utils.mama_ash_eab_surveys_clear_trees();
		console.log("CLEAR MAMA PHENOTYPES");
		utils.mama_ash_eab_surveys_clear_phenotypes();

		console.log('Performing MAMA LOAD');


		var axios = require('axios');
		var https = require('https');
	
		const axios_instance = axios.create({
			httpsAgent: new https.Agent({  
			  rejectUnauthorized: false
			})
		});

		var page_no = 1;
		var page_index = 0;
		var page_total = 1;

		while (page_index < page_total) { 
			page_index = page_index + 1;
			try {
				// var url = "https://anecdata.org/rest_observations_v1.json?project_id=316&page=" + page_index + "&nocache=" + Math.floor(Date.now() / 1000);
				var url = "https://api.anecdata.org/observations?project_id=316&page=" + page_index + "&nocache=" + Math.floor(Date.now() / 1000);
				console.log('URL:' + url);
				var config2 = {
					method: 'GET',
					url: url,
					headers: {
						//"Accept": "application/json",
						"Authorization": config.conf_anecdata.token_loggedin,
						'Cache-Control': 'no-cache'
					}
				}
				// console.log(config);
				await axios_instance(config2).then(async function(response) {
					
					try {
						var data = response.data;
						// console.log(data);
						console.log(data.pagination);
						page_total = data.pagination.pageCount;
						// var items = data.items; // array
						var items = data.data; // array
						for (var i = 0; i < items.length; i++) {
							
							var item = items[i];
							var tree_id = "mama." + item.id
							utils.mama_ash_eab_surveys_add_tree(tree_id, item);
							var rows = item.rows;
							for (var j = 0; j < rows.length; j++) {
								var row = rows[j];
								var fields = row.fields;
								utils.mama_ash_eab_surveys_add_phenotype_rows(tree_id, fields);
							}
							// console.log(item);
						}
					}
					catch (err) {
						console.log(err);
					}
				}).catch(function (err) {
					console.log(err);
				});
			}
			catch (err) {
				console.log(err);
			}
		}
		res.status(200).json("success");
		return;
	}
	else {
		res.status(200).json("no asup was given");
		return;		
	}
}

exports.force_reload_treesnap = async function(req, res, next) {
	var api_superuser_password = req.query.asup;
	
	var api_key = req.query.api_key;
	// const fs = require('fs');
	// try {
	// fs.unlinkSync('treesnap.json');
	// }
	// catch (e) {}
	
	//utils.valid_api_key(api_key, res, function() {
	if(config.conf.api_superuser_password == api_superuser_password) {	
		ct_cache.clear();		
		//var uniquename = rows[0].uniquename;
		//var treesnap_num = uniquename.split(".")[1];
		var page_num = 1;
		query("DELETE FROM public.ct_trees_treesnap", [], function (err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			query("DELETE FROM public.ct_trees_evome", [], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(400);
					return;
				}

				query("DELETE FROM public.ct_trees_phenotypes_treesnap", [], function (err, rows, result) {
					console.log('Performing Treesnap_add page no:' + page_num);
					utils.treesnap_terms = [];
					try {
						utils.treesnap_add("https://treesnap.org/web-services/v1/observations?page=" + page_num);
					}
					catch (err) {
						console.log(err);
					}
					res.status(200).json("success");
					return;
				});
			});
		});
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

exports.popstruct_study_plants_count = function(req, res, next) {
	console.log(req.body);
	try {
		var dbxref_id = req.body.dbxref_id;
		var study_id = req.body.study_id;
		console.log('Counting project stocks for dbxref_id:' + dbxref_id + ' study_id:' + study_id);
		var query_str = 'select count(*) as c1 from chado.project_stock where project_id in (select project_id from chado.project_dbxref where dbxref_id = ' + dbxref_id + ');'
		var cached_val = ct_cache.get(query_str);
		if (cached_val == null) {
			query (query_str, [], function (err, rows, result) {
				if (err) {
					console.log(err);
					res.status(200).json({
						"dbxref_id": dbxref_id,
						"study_id": study_id, 
						"count": -1, 
						"status": "error", 
						"cached": false
					});
					return;
				}
				var count = 0;
				if (rows.length > 0) {
					count = rows[0]['c1'];
				}
				ct_cache.put(query_str, count, cache_time_24);
				res.status(200).json({
					"dbxref_id": dbxref_id, 
					"study_id": study_id,
					"count": count, 
					"status": "ok", 
					"cached": false
				});
				return;
			});
		}	
		else {
			res.status(200).json({
				"dbxref_id": dbxref_id, 
				"study_id": study_id,
				"count": cached_val, 
				"status": "ok", 
				"cached": true
			});
			return;
		}
	}
	catch(err) {
		console.log(err);
	}
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
		// disable cache
		cached_val == null;
		if (cached_val == null && source_ids_string != "") {
			// get the cpapi_token (user specific )
			var pass_hash = '';
			try {
			pass_hash = atob(req.query.cpapi_token);
			}
			catch (err) {
				console.log(err);
			}

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
			query ("SELECT * FROM public.geno_view_distinct ORDER BY marker_type", [], function (err, rows, result) {
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
		// Always pull directly from DB due to is_private data
		cached_val = null;
		if(cached_val == null) {
			// get the cpapi_token (user specific )
			var pass_hash = '';
			try {
			pass_hash = atob(req.query.cpapi_token);
			}
			catch (err) {
				console.log(err);
			}
			query("SELECT u.name as name, r.name as role FROM public.users u INNER JOIN public.users_roles ur ON (u.uid = ur.uid) INNER JOIN public.role r ON (r.rid = ur.rid) WHERE pass LIKE $1", [pass_hash], function(err, rows_user_roles, result) {
				var private_source_ids = [];
				var username = null;
				for (var i = 0; i < rows_user_roles.length; i++) {
					username = rows_user_roles[i]["name"];
					if (rows_user_roles[i]["role"] == "mama") {
						private_source_ids.push(6);
					}
				}
				query ("SELECT * " + 
					"FROM ct_trees WHERE uniquename = $1", [tree_id], function (err, rows, result) {
					if (err) {
						console.log(err);
						res.status(400);
						return;
					}
					// console.log('Querying the ct_trees');
					console.log(rows);
					if(rows != undefined) {
						// console.log('rows defined');
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

								// Check if we should allow private data (latitude_precise, longitude_precise)
								for (var i = 0; i < private_source_ids.length; i++) {
									if (private_source_ids[i] == rows[0].source_id) {
										console.log('Permission granted for private data for source_id: ' + rows[0].source_id);
										rows[0].latitude = rows[0].latitude_precise;
										rows[0].longitude = rows[0].longitude_precise;
									}
								}

								// Check if we should allow private data (latitude_precise, longitude_precise) for treesnap scientists
								if (rows[0]['submitter_email'] != undefined || rows[0]['submitter_email'] != undefined) {
									if (username == rows[0]['submitter_email']) {
										console.log('Permission granted for treesnap scientist (detected): ' + rows[0].submitter_email);
										rows[0].latitude = rows[0].latitude_precise;
										rows[0].longitude = rows[0].longitude_precise;
									}
								}

								// Once we've swapped precision, we don't need it anymore (for people not logged in, this data will thus be empty / safe)
								try {
									delete rows[0].latitude_precise;
									delete rows[0].longitude_precise;
								} catch (err) {

								}

								// Remove submitter_emails
								try {
									delete rows[0].submitter_email;
								} catch (err) {}

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
							// res.status(404).json("no tree");
							res.status(200).json("no tree");
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
				query ("SELECT * FROM chado.new_pheno_view WHERE tree_acc = $1 AND synonym IS NOT NULL ORDER BY synonym ASC;", [tree_id], function (err, rows, result) {
					if (err) {
						console.log(err);
						res.status(400);
						return;
					}
					else {
						if (rows == undefined) {
							rows = [];
						}
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

exports.genotypes_from_vcf_tree_get = function(req, res, next) {

	var tree_id = req.body.tree_id;
	var original_tree_id = tree_id;
	// var new_tree_id = tree_id;
	if (tree_id != undefined) {
		tree_id = tree_id.replaceAll(/TGDR\d+-/g, "");
	}
	console.log("Replacing TGDR<number>- part: " + tree_id);
	var api_key = req.body.api_key;	
	var vcf_location = req.body.vcf_location;
	if (vcf_location != undefined) {
		vcf_location = vcf_location.replaceAll("..","");
	}
	
	
	utils.valid_api_key(api_key, res, function() {
		var key = tree_id + "_genotype_from_vcf";
		var cached_val = ct_cache.get(key);
		if (cached_val == null) {
			// Initialize execSync
			const { execSync } = require('child_process');
			const { exec } = require('child_process');
			// var command = "bcftools view -s '" + tree_id + "' '" + vcf_location + "' | grep -v \"^#\" | head -15";
			var command = `
				bcftools query -s ${tree_id} -f '%CHROM\t%POS\t%REF\t%ALT\t[%GT]\n' ${vcf_location} | \
				awk 'BEGIN{OFS="\t"} {
					marker=$1"_"$2
					ref=$3
					split($4,alts,",")
					split($5,gt,"/|\\|")
					
					for(i=1; i<=2; i++) {
						if(gt[i]=="0") allele[i]=ref
						else if(gt[i]==".") allele[i]="."
						else allele[i]=alts[gt[i]]
					}
					
					if(allele[1]=="." || allele[2]==".") call="./."
					else call=allele[1]"/"allele[2]
					
					print marker, call, "GT"
				}' | head -n 15
			`;
			
			
			// var results = execSync(command, { encoding: 'utf8' });

			exec(command, (err, stdout, stderr) => {
				if (err) {
				  console.error(`exec error: ${err}`);
				  res.status(200).json([]);
				  return;
				}
				console.log(`stdout: ${stdout}`);
				console.error(`stderr: ${stderr}`);
				var results = stdout;

				var rows = [];
				var lines = results.split("\n");
				for (var i = 0; i < lines.length; i++) {
					var line_data = lines[i].split("\t");
					var tree_acc = tree_id;
					var marker_name = line_data[0];
					var description = line_data[1];
					var marker_type = line_data[2];
					rows.push({
						tree_acc: original_tree_id,
						marker_name: marker_name,
						description: description,
						marker_type: marker_type
					});
				}
				// var rows = results;
				console.log(rows);
				ct_cache.put(key, rows, cache_time_24);
				res.status(200).json(rows);
				return;				
			});

			// console.log(results);

		}
		else {
			console.log(cached_val);
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
			query ("SELECT * FROM chado.new_geno_view WHERE tree_acc = $1 LIMIT 16;", [tree_id], function (err, rows, result) {
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
			// DEPRECATED: Request module has been deprecated
			// var options = {
			// 	uri: "https://treesnap.org/web-services/v1/observation/" + tree_id, 
			// 	method: "GET",
			// 	headers: {
			// 		"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
			// 		"Accept": "application/json",
			// 	},
			// 	rejectUnauthorized: false
			// }
			var axios = require('axios');
			var https = require('https');
	
			const axios_instance = axios.create({
				httpsAgent: new https.Agent({  
				  rejectUnauthorized: false
				})
			});
			try {
				var headers = {
					"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
					"Accept": "application/json",
					'Cache-Control': 'no-cache'
				}
				axios_instance({
					method: 'get',
					url: "https://treesnap.org/web-services/v1/observation/" + tree_id,
					timeout: 4000,
					headers: headers,

				}).then(function(response) {
					try {
						ct_cache.put(key, response.data, cache_time_24);
						console.log(response.data);
						if (isCircular(response.data)) {
							res.status(500).json({error: "Object is circular, which usually means the treesnap lookup failed"});
							return;
						}
						// protect certain data
						delete response.data['submitter_email'];
						response.data['longitude'] = response.data['fuzzy_longitude'];
						response.data['latitude'] = response.data['fuzzy_latitude'];
						// res.status(200).json(JSON.parse(body).data);
						res.status(200).json(response.data);
						return;
					}
					catch (err) {
						res.status(500).json({error: err});
						return;
					}
					return;
				}).catch(function (err) {
					res.status(500).json({error: 'An error ocurred and was caught'});
					console.log(err)
					return;
				});
			}
			catch (err) {
				res.status(500).json({error: err});
				return;
			}

			// DEPRECATED: Request module has been deprecated
			// var req_result = request(options, function(error, response, body) {
			// 	if (error) {
			// 		console.log(error);
			// 		res.status(400);
			// 		return;
			// 	}

			// 	if (response.statusCode == 200) {
			// 		ct_cache.put(key, body, cache_time_24);
			// 		console.log(JSON.parse(body).data);
			// 		res.status(200).json(JSON.parse(body).data);
			// 		return;
			// 	}	
			// 	res.status(response.statusCode).json("status code: " + response.statusCode);
			// 	return;
			// });
		}
		else {
			console.log(cached_val);
			res.status(200).json(cached_val);
			return;
		}
	});
}

function isCircular (d) {
	try {JSON.stringify(d)}
	catch (e) {return true}
	return false
}

// THIS FUNCTION IS UNUSED SO COMMENTED OUT
// /**
//  * Returns the treesnap data and properties of a treesnap tree as an object
//  * @param {object} request - Request object
//  * @param {object} response - Response object
//  * @param {function} next - Next middleware function in the application"s request-response cycle
//  */
// exports.tree_get_treesnap_from_treesnap_api = function(req, res, next) {
// 	var tree_id = req.query.tree_id.split(".")[1];
// 	var api_key = req.query.api_key;		

// 	utils.valid_api_key(api_key, res, function() {
// 		var key = "ts_"+ tree_id; 
// 		var cached_val = null;//ct_cache.get(key);

// 		if (cached_val == null) {
// 			// DEPRECATED: Request module has been deprecated
// 			// var options = {
// 			// 	uri: "https://treesnap.org/web-services/v1/observation/" + tree_id, 
// 			// 	method: "GET",
// 			// 	headers: {
// 			// 		"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
// 			// 		"Accept": "application/json",
// 			// 	},
// 			// }

// 			var axios = require('axios');
// 			var https = require('https');
	
// 			const axios_instance = axios.create({
// 				httpsAgent: new https.Agent({  
// 				  rejectUnauthorized: false
// 				})
// 			});
// 			axios_instance({
// 				method: 'get',
// 				url: "https://treesnap.org/web-services/v1/observation/" + tree_id,
// 				headers: {
// 					"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
// 					"Accept": "application/json",
// 				},

// 			}).then(function(response) {
// 				ct_cache.put(key, response.data, cache_time_24);
// 				console.log(response.data);
// 				// res.status(200).json(JSON.parse(body).data);
// 				res.status(200).json(response.data);
// 				return;
// 			});

// 			// DEPRECATED: Request module has been deprecated
// 			// var req_result = request(options, function(error, response, body) {
// 			// 	if (error) {
// 			// 		console.log(error);
// 			// 		res.status(400);
// 			// 		return;
// 			// 	}

// 			// 	if (response.statusCode == 200) {
// 			// 		ct_cache.put(key, body, cache_time_24);
// 			// 		res.status(200).json(JSON.parse(body).data);
// 			// 		return;
// 			// 	}	
// 			// 	res.status(response.statusCode).json("status code: " + response.statusCode);
// 			// 	return;
// 			// });
// 		}
// 		else {
// 			res.status(200).json(val);
// 			return;
// 		}
// 	});
// }

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
	if (req.query.exclude_bien != undefined && req.query.exclude_bien == "true") {
		query_str = "SELECT COUNT(*) AS count FROM (SELECT DISTINCT ON(species) * FROM ct_trees WHERE source_id IN (0,1,2)) t";
	}
	console.log(query_str);
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

exports.layers_count = function(req, res, next) {
	var query_str = "SELECT count(*) as c1 from public.cartogratree_layers;";
	var cached_results = ct_cache.get(query_str);
	if(cached_results == null) {
		query (query_str, [], function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			ct_cache.put(query_str, rows, cache_time_24);
			res.status(200).json(rows[0]["c1"]);
			return;
		});
	}
	else {		 
		var rows = cached_results;
		res.status(200).json(rows[0]["c1"]);
		return;		 
	}
};

exports.genera_count = function(req, res, next) {
	var query_str = "SELECT COUNT(DISTINCT genus) FROM ct_trees WHERE source_id IN (0,1,2,3);";
	if (req.query.exclude_bien != undefined && req.query.exclude_bien == "true") {
		query_str = "SELECT COUNT(DISTINCT genus) FROM ct_trees WHERE source_id IN (0,1,2);";
	}
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
	if (req.query.exclude_bien != undefined && req.query.exclude_bien == "true") {
		query_str = "SELECT COUNT(*) FROM ct_trees WHERE source_id IN (0,1,2,5,6);";
	}
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
 * Returns the shared trees count
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
exports.trees_shared_trees = function(req, res, next) {
	console.log('trees_shared_trees');
	console.log(req.body);
	var studies = req.body['studies[]'];
	console.log('studies', studies);
	var studies_csv = "";
	for(var i=0; i<studies.length; i++) {
		if (i==0) {
			studies_csv += "'" + studies[i] + "'";
		}
		else {
			studies_csv += "," + "'" + studies[i] + "'";
		}
	}
	var query_str = "select shared_trees_across_all_studies from chado.test_study_marker_overlap_blah where accessions = array[" + studies_csv +  "]";
	console.log('query_str', query_str);
	var cached_results = ct_cache.get(query_str);
	if(cached_results == null) {
		query (query_str, [], function(err, rows, result) {
			if (err) {
				console.log(err);
				res.status(400);
				return;
			}
			var rows_object = {};
			rows_object['debug'] = true;
			rows_object['studies_csv'] = studies_csv;
			rows_object['studies'] = studies;
			rows_object['rows'] = rows;
			ct_cache.put(query_str, rows_object, cache_time_24);
			res.status(200).json(rows_object);
			return;
		});
	}
	else {
		var rows_object = cached_results;
		res.status(200).json(rows_object);
		return;
   }	
}

function build_tree_query_str(query_conditions, sources) {	
	var query_str = "SELECT DISTINCT ON(uniquename) * FROM public.ct_trees WHERE";
	//var query_str = "SELECT * FROM ct_trees_all_view WHERE";
	if (query_conditions.length > 0) {
		query_str = query_str + " " + query_conditions + " AND (";
	}
	else {
		query_str = "SELECT DISTINCT ON(uniquename) * FROM public.ct_trees WHERE (";
	}

	for (var s = 0; s < sources.length; s++) {
		if(sources[s] != 3) { // bien is not a json layer, do not include
			if (s > 0) {
				query_str += " OR ";
			}
			query_str += "(source_id = " + sources[s] + " AND is_private IS NULL)";
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
		console.log('query', req.body);
		var query_str = build_tree_query_str(utils.parse_json_query(req.body["query"], ""), req.body["active_sources"]);

		var cached_trees = ct_cache.get(query_str);
		// console.log(query_str);

		// disable cached_trees
		// cached_trees = null;
		if (cached_trees == null) {
			console.log('Returning trees from direct Postgresql');
			// get the cpapi_token (user specific )
			var pass_hash = '';
			try {
				pass_hash = atob(req.query.cpapi_token);
			}
			catch (err) {
				console.log(err);
			}
			console.log("PASS_HASH: " + pass_hash);
			query("SELECT u.name as name, r.name as role FROM public.users u INNER JOIN public.users_roles ur ON (u.uid = ur.uid) INNER JOIN public.role r ON (r.rid = ur.rid) WHERE pass LIKE $1", [pass_hash], async function(err, rows_user_roles, result) {
				var private_source_ids = [];
				var username = null;
				for (var i = 0; i < rows_user_roles.length; i++) {
					username = rows_user_roles[i]["name"];
					// console.log(rows_user_roles);
					if (rows_user_roles[i]["role"] == "mama") {
						private_source_ids.push(6);
						query_str += " OR ((source_id = 6 AND is_private = 1) AND species IS NOT 'Fraxinus nigra') ";
					}
				}
				console.log(query_str);
				query (query_str, [], async function(err, rows, result) {
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


					// Lookup this user's ownership of treesnap trees / observations
					console.log('Username: ' + username);

					var treesnap_user_owned_observation_ids = ct_cache.get('treesnap_email_observation_ids_' + username);
					if (treesnap_user_owned_observation_ids == null) {
						treesnap_user_owned_observation_ids = await utils.treesnap_email_observation_ids(username);
						ct_cache.put('treesnap_email_observation_ids_' + username, treesnap_user_owned_observation_ids, cache_time_24);
					}

					for (var i = 0; i < rows.length; i++) {
						// Check if we should allow private data (latitude_precise, longitude_precise)
						for (var j = 0; j < private_source_ids.length; j++) {
							if (private_source_ids[j] == rows[i].source_id) {
								if (rows[i].is_private != null && rows[i].is_private == 1) {
									console.log('Permission granted for ' + rows[i].uniquename + ' (source_id: ' + rows[i].source_id + ')');
									rows[i].latitude = rows[i].latitude_precise;
									rows[i].longitude = rows[i].longitude_precise;
								}
							}
						}

						var uniquename = rows[i]['uniquename'];
						if (uniquename.includes('treesnap')) {
							var uniquename_parts = uniquename.split('.');
							var id = parseInt(uniquename_parts[1]);
							if (treesnap_user_owned_observation_ids != undefined && treesnap_user_owned_observation_ids.includes(id)) {
								console.log('Permission granted for treesnap scientist (detected): ' + rows[0].submitter_email);
								rows[0].latitude = rows[0].latitude_precise;
								rows[0].longitude = rows[0].longitude_precise;
							}
						}

						// Deprecated on 7/21/2025 since Treesnap does not allow sharing emails due to privacy policy
						// // Check if we should allow private data (latitude_precise, longitude_precise) for treesnap scientists
						// if (rows[0]['submitter_email'] != undefined || rows[0]['submitter_email'] != undefined) {
						// 	if (username == rows[0]['submitter_email']) {
						// 		console.log('Permission granted for treesnap scientist (detected): ' + rows[0].submitter_email);
						// 		rows[0].latitude = rows[0].latitude_precise;
						// 		rows[0].longitude = rows[0].longitude_precise;
						// 	}
						// }

						

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
						if (rows[i]["species"] != null && rows[i]["species"].length > 0) {
							unq_species[rows[i]["species"]] = true;	
						}
							
						var coords_key = rows[i]["longitude"] + "_" + rows[i]["latitude"];
						var coords_count = coords_to_freq[coords_key] == undefined ? 1 : coords_count + 1;
							
						coords_to_freq[coords_key] = coords_count;
						freq_to_coords[coords_count] = coords_key;
						if (coords_count > most_common) {
							most_common = coords_count;
						}

						// Clean up trees that are known to be in the sea (eg MAMA data)
						if ((rows[i]["longitude"] > -0.06 && rows[i]["longitude"] <= 0.06) && (rows[i]["latitude"] <= 0.06 && rows[i]["latitude"] >= -0.06)) {
							// Do not include this tree
						}
						else {
							tree_features["features"].push(curr_tree);
						}
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
					
					// ct_cache.put(query_str, tree_features, cache_time_24);
					
					// We could put the compressed data into cache but for debug we won't do that
					// Perform compression
					tree_features = zlib_deflate_base64(JSON.stringify(tree_features));				

					ct_cache.put(query_str, tree_features, cache_time_24);

					res.status(200).json({'zlib_deflated_base64': tree_features, cached: false});
					return;
				});
			});
		}
		else {
			console.log('Retrieving trees from cache');
			// res.status(200).json(cached_trees);

			// Perform compression (no need to do this anymore)
			// cached_trees = zlib_deflate_base64(JSON.stringify(cached_trees));
			res.status(200).json({zlib_deflated_base64: cached_trees, cached: true});

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
exports.trees_list = async function(req, res, next) {
	var email = req.query.email;
	if (email != undefined && email != null & email != "") {
		email = "";
	}

 	var cached_trees = ct_cache.get("trees_list_" + email);
	if(cached_trees == null) {
		// get the cpapi_token (user specific )
		var pass_hash = '';
		try {
		 pass_hash = atob(req.query.cpapi_token);
		}
		catch (err) {
			console.log(err);
		}

		console.log('Looking up treesnap user owned observation ids');
		var treesnap_user_owned_observation_ids = [];
		try {
			treesnap_user_owned_observation_ids = await utils.treesnap_email_observation_ids(email);
			console.log(treesnap_user_owned_observation_ids);
			// process.exit(0);
		} catch (err) {
			console.log('tree_list error:' + err);
			// process.exit(1);
		}
		console.log(treesnap_user_owned_observation_ids);

		

		var query_str = "SELECT * FROM ct_trees WHERE source_id IN (0,2);";
		query (query_str, [], function(err, rows, result) {
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
				currTree["properties"] = {"id": rows[i]["uniquename"], "icon_type": rows[i]["icon_type"], "is_tree": is_tree, "sid": rows[i]["source_id"]};
				if (rows[i]["uniquename"].includes("treesnap")) {
					var uniquename_parts = rows[i]["uniquename"].split(".");
					var id = parseInt(uniquename_parts[1]);
					// Check if the user owns this observation
					if (treesnap_user_owned_observation_ids != undefined && treesnap_user_owned_observation_ids.includes(id)) {
						// If the user owns this observation, we can use the precise coordinates
						currTree["geometry"] = {"type": "Point", "coordinates": [rows[i]["longitude_precise"], rows[i]["latitude_precise"]]};
					}
					else {
						// If the user does not own this observation, we use the fuzzy coordinates
						currTree["geometry"] = {"type": "Point", "coordinates": [rows[i]["longitude"], rows[i]["latitude"]]};
					}
				}
				// If the tree is not from treesnap, we use the fuzzy coordinates
				else {
					currTree["geometry"] = {"type": "Point", "coordinates": [rows[i]["longitude"], rows[i]["latitude"]]};
				}
				treeFeatures.push(currTree);
			}
			// ct_cache.put("trees_list"  + email, treeFeatures, cache_time_24);

			// We could put the compressed data into cache but for debug we won't do that
			// Perform compression
			treeFeatures = zlib_deflate_base64(JSON.stringify(treeFeatures));

			ct_cache.put("trees_list_"  + email, treeFeatures, cache_time_24);

			res.status(200).json({zlib_deflated_base64: treeFeatures, cached: false});
			return;
		});

	}
	else {
		// Perform compression
		// cached_trees = zlib_deflate_base64(JSON.stringify(cached_trees));
		res.status(200).json({zlib_deflated_base64: cached_trees, cached: true});
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
 * Returns all the trees that are currently present in the db
 * @param {object} request - Request object
 * @param {object} response - Response object
 * @param {function} next - Next middleware function in the application"s request-response cycle
 */
 exports.popstruct_trees_list = function(req, res, next) {
	var study_accession = req.query.study_accession;
	// var cached_trees = ct_cache.get("popstruct_trees_list_" + study_accession);
	cached_trees = null; //disable cache
	var study_number = parseInt(study_accession.replace('TGDR', ''));
	
	console.log(study_accession);
   if(cached_trees == null) {
	   console.log('Cache is empty, performing a direct query...');
	   var args = [study_accession];
	   // query ("SELECT * FROM public.ct_trees_all_view WHERE study_accession = $1 AND population IS NOT NULL;", args, function(err, rows, result) {
	   query ("SELECT * FROM public.cartogratree_popstruct_layer WHERE study_accession = $1 AND population IS NOT NULL;", args, function(err, rows, result) {
		   if (err) {
			   console.log(err);
			   res.status(400);
			   return;
		   }
		   var treeFeatures = [];
		   for (var i = 0; i < rows.length; i++) {
			   rows[i]["icon_type"] = 0;
			   // var population_icon_id = study_number + '-' + rows[i]["population"];
			   var population_icon_id = rows[i]["population"];
			   var currTree = {"type": "Feature"};
			   currTree["properties"] = {"id": rows[i]["uniquename"], "icon_type": rows[i]["icon_type"], "population_icon_id": population_icon_id};
			   currTree["geometry"] = {"type": "Point", "coordinates": [rows[i]["longitude"], rows[i]["latitude"]]};
			   treeFeatures.push(currTree);
		   }
		   ct_cache.put("popstruct_trees_list_" + study_accession, treeFeatures, cache_time_24);
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