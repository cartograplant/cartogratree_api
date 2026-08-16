const config = require('./config');

// Add winston logging with rotate file system
const winston = require('winston');
require('winston-daily-rotate-file');

var fs = require('fs');
// Create a logs directory
if (fs.existsSync("logs") == false) {
	fs.mkdirSync("logs", {recursive: true});
}

const transport = new winston.transports.DailyRotateFile({
    filename: 'logs/%DATE%.log',
    datePattern: 'YYYY-MM-DD', // Rotate daily
	// 'YYYY-MM-DD-HH' // Rotate hourly
    zippedArchive: true, // Zip old logs
    maxSize: '20m', // Max size of 20MB
    maxFiles: '14d' // Keep logs for 14 days
});

const logger = winston.createLogger({
    level: 'info', // Log level
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
    ),
    transports: [
        transport,
        new winston.transports.Console() // Also log to console
    ]
});

// Replace console.log with the logger
console.log = (...args) => logger.info(...args); 

// Now, console.log will write to both the file and the console
console.log('This is a test log message.');

const crypto = require('crypto');
const ct_main_cache = require("memory-cache");
const cache_time_14_days = 14*24*60*60*1000;

var express = require("express");
var global = {};
var responseTime = require("response-time");
var bodyParser = require("body-parser");
const http = require('http');
const https = require('https');
const axios = require('axios');
const axios_instance = axios.create({
	httpsAgent: new https.Agent({  
	  rejectUnauthorized: false
	})
});
const WebSocket = require('ws');//websocket implementation
const pg = require('pg');//Postgres database implementation
var pg_native_client = require('pg-native');

//const isSea = require('is-sea');
const QueryStream = require('pg-query-stream');//Postgres Query Streaming implementation
const request = require("request");
const JSONdb = require('simple-json-db');
var CronJob = require('cron').CronJob;
const treeController_fuctions = require('./controllers/treeController_functions');
//const ct_cache = require("memory-cache");
var fs = require('fs');
var write_source_id_geojson_file = false; //this will force the function to write the geojson file
var cors = require("cors")
var app = express();
var port = process.env.PORT || 8088;

const { Pool, Client } = require("pg"); 
console.log(process.env);
const pool = new Pool({
	host: config.conf.host,
	port: config.conf.port,
	database: config.conf.database,
	user: config.conf.user,
	password: config.conf.password,
	max: 20,
	idleTimeoutMillis: 15000,
	connectionTimeoutMillis: 15000, 
});

var screen_enabled = false;

var logStream = fs.createWriteStream('./log.txt', {
	encoding: 'utf8',
	flags: 'a'
});

var old_console_log = console.log;
// Create a new console.log function so we can write
// to the log file log.txt
console.log = function(...args) {
	var timestamp = new Date().toISOString();
	for(let val of args) {
		try {
			if(typeof val === 'object') {
				val = JSON.stringify(val);
			}
			val = '[' + timestamp + '] ' + val + "\n";
			process.stdout.write(val);
			logStream.write(val);
			try {
				io.to('cp-debug').emit('debug-line', {
					line: val
				});
			}
			catch (err) {
				// not much we can do about an error emitting so ignore.
			}
		}
		catch (err) {
			process.stdout.write('[' + timestamp + '] ' + err + "\n");
			logStream.write('[' + timestamp + '] ' + err + "\n");
		}
	}
}

// process.stdout.write = process.stderr.write = access.write.bind(access);


var ON_DEATH = require('death'); //this is intentionally ugly
 
ON_DEATH(function(signal, err) {
  //clean up code here
  console.log('signal', signal);
  console.log('error', err);

  fs.appendFile(__dirname + '/crash_report.txt', signal + ' ' + err, function (err) {
	if (err) throw err;
	console.log('Crash Report saved!');
	process.exit();
  });
});

if(screen_enabled) {
	const screen = require('./screen');
	screen.init();
	// This reroutes the console.log function to
	// output 
	console.log = function (text, text2 = null) {
		if(typeof text === 'object' && text != null) {
			text = JSON.stringify(text);
		}
		if(typeof text === 'object' && text2 != null) {
			text2 = JSON.stringify(text2);
		}
		if(text2 == null) {
			screen.output('box_main', '{bold}' + text + '{/bold}');
		}
		else {
			screen.output('box_main', '{bold}' + text + ':' + text2 + '{/bold}');
		}
	}

	screen.output('box_right', 'Keys:');
	screen.output('box_right', '1: Screen re-render');
	screen.output('box_right', '2: Startup cache build');
	screen.output('box_right', '3: Clear cache');
	screen.output('box_right', '4: Refresh all CP views');

	screen.screen.key(['1'], function(ch, key) {
		console.log('Screen rerendering');
		screen.screen.render();
	});

	screen.screen.key(['2'], function(ch, key) {
		axios_instance.get(config.conf.main_url + '/cartogratree/api/v2/startup_cache_build?asup=' + config.conf.api_superuser_password)
		.then(function (response) {
		// handle success
		console.log(response);
		})
		.catch(function (error) {
		// handle error
		console.log(error);
		})
		.then(function () {
		// always executed
		});	  
	});

	screen.screen.key(['3'], function(ch, key) {
		axios_instance.get(config.conf.main_url + '/cartogratree/api/v2/trees/clear?asup=' + config.conf.api_superuser_password)
		.then(function (response) {
		// handle success
		console.log(response);
		})
		.catch(function (error) {
		// handle error
		console.log(error);
		})
		.then(function () {
		// always executed
		});	  
	});

	screen.screen.key(['4'], function(ch, key) {
		console.log('Performing CT VIEWS refresh');
		axios_instance.get(config.conf.main_url + '/cartogratree/api/v2/trees/reload?asup=' + config.conf.api_superuser_password)
		.then(function (response) {
		// handle success
		console.log(response);
		})
		.catch(function (error) {
		// handle error
		console.log(error);
		})
		.then(function () {
		// always executed
		});	  
	});

}


// Every 1 minute cron
var CronJob = require('cron').CronJob;
var job1m = new CronJob('0 */1 * * * *', function() {
  // console.log('You will see this message every second');
  const memory_used = process.memoryUsage().heapUsed / 1024 / 1024;
  if(screen_enabled) {
	screen.clear('box_right_top')
	screen.output('box_right_top', '{bold}Resource Window{/bold}');
	screen.output('box_right_top', '{bold}Memory Used:' + memory_used + ' MB{/bold}');
  }
  else {
	console.log('memory_used: ' + memory_used + ' MB');
  }

  try {
	console.log('realtime_connections_count: ' + io.engine.clientsCount);
  }
  catch (err) {
	console.log(err);
  }
}, null, true, 'America/Los_Angeles');
job1m.start();

// Every 2 hours cron
var CronJob = require('cron').CronJob;
var job2hr = new CronJob('0 0 */2 * * *', function() {
  // console.log('You will see this message every second');
  if(screen_enabled) {
	const memory_used = process.memoryUsage().heapUsed / 1024 / 1024;
	screen.clear('box_main')
	screen.output('box_main', '{bold}Screen cleared{/bold}');
  }
}, null, true, 'America/Los_Angeles');
job2hr.start();


var dotenv = require("dotenv")

const result = dotenv.config();

global.__basedir = __dirname;

if (result.error) {
  throw result.error;
}
console.log('FROM DOTENV:');
console.log(result.parsed);

var logger_url = function(req, res, next) {
	console.log(req.url);
	next(); // Passing the request to the next handler in the stack.
}

app.use(logger_url);
// app.use(cors());
app.use(responseTime());
app.use(bodyParser.json({
	limit: '100000kb'
}));
//app.use(bodyParser.urlencoded({extended: false}));

app.set("json spaces", 0);




const server = require('http').createServer(app);
const io = require('socket.io')(server, {
	path: '/cartogratree/api/realtime',
});
global['io'] = io;

io.on('connection', async (client) => { 
	console.log('Realtime connection created: ' + client.id);
	// console.log('Client ID:' + client.id);
	io.to(client.id).emit('client_id',{client_id:client.id});
	io.to(client.id).emit('version',{message:'CartograPlant realtime system v1.0'});
	client.onAny(function(event,data) {
		console.log(event);
		console.log(data);
	});
	client.on('join_channel', (obj) => {
		if(obj['channel_name'] != undefined) {
			// console.log('channel_name: ' + obj['channel_name']);
			client.join(obj['channel_name']);
		}
	});
});

var routes = require("./routes");	// import routes
routes(app, global);// register routes

server.listen(port);


// Without socket io, use the following to listen for http requests
// app.listen(port, "0.0.0.0");

app.use(function(req, res, next) {
	next(createError(404));
});
// address unhandled urls
app.use(function(err, req, res, next) {
	res.locals.message = err.message;
	
	res.status(err.status || 500).send({url: req.originalUrl + " not found"});
});


console.log("CartograTree HTTP API server started on: " + port);

// Pull species corrections from csv into cache on start up
treeController_fuctions.load_species_corrections_from_csv_function(); 

// Add a cron job
var job_check_wfid_auth = new CronJob('0 23 * * * *', function() {
	try{
		wfid_auth();
	}
	catch (err) {
		console.log(err);
	}
}, null, true, 'America/Los_Angeles');
job_check_wfid_auth.start();
wfid_auth();

function wfid_auth() {
	console.log('Checking WFID auth...');
	// Attempt to get the wfid auth info in treecontroll db_storage
	const db_storage = new JSONdb(__dirname + '/storage.json', {asyncWrite: true, syncOnWrite: true});
	var oauth_object = db_storage.get('wfid_oauth_object');
	if(oauth_object == undefined) {
		// force request for new oauth access_token since none exists
		treeController_fuctions.wfid_oauth_token_request_function(config,request,db_storage);
	}
	else {
		var current_unix_time = Math.floor(Date.now() / 1000);
		var grace_period = 7 * 24 * 60  * 60; // 7 days before expiry, get new key
		if((current_unix_time + grace_period) > (oauth_object.expires_in + oauth_object.generated_time)) {
			// expired so request a new one
			treeController_fuctions.wfid_oauth_token_request_function(config,request,db_storage);
		}
		else {
			console.log('No need to update/request a new token from WFID');
			// No need to update / request a new token
		}
	}
}


// This is mandatory since it affects the UI for BIEN
setTimeout(function() {
	console.log('Attempting to precache the BIEN trees count');
	axios_instance.get(config.conf.main_url + '/cartogratree/api/v2/trees/count?source_id=3&filter=')
	.then(function (response) {
	// handle success
	// console.log(response);
		console.log('Tree count for BIEN precached successfully')
	})
	.catch(function (error) {
		// handle error
		console.log(error);
	})
	.then(function () {
		// always executed
	});	  
}, 5000);

if(config.conf.startup_cache_build == true) {
	http.get('http://127.0.0.1:' + port +  '/cartogratree/api/v2/startup_cache_build?asup=' + config.conf.api_superuser_password, (resp) => {
	let data = '';

	// A chunk of data has been recieved.
	resp.on('data', (chunk) => {
		data += chunk;
	});

	// The whole response has been received. Print out the result.
	resp.on('end', () => {
		//console.log(JSON.parse(data).explanation);
	});

	}).on("error", (err) => {
		console.log("Error: " + err.message);
	});
}


const wss = new WebSocket.Server({ port: 8880, host: '0.0.0.0' });
console.log("Cartogratree Websocket API server started on: 8880");
var user_count = 0;
//The Websocket server object that does most functions
var ctapi_wss = {
	
	//An array with current clients connected
	clients: new Array(),
	
	//This function essentially boots up the ctapi_wss server for performing
	//commands on connection and messages

	start: function() {
		wss.on('connection', function connection(wss, req) {
			wss.send('NOTICE:Successfully connected.');
			var client_id = user_count + 1;
			user_count = user_count + 1;
			ctapi_wss.addClient(wss, client_id);

			wss.on('message', function incoming(message) {
				console.log("WSS RECEIVED:" + message);
				message = message.replace(/(\r\n|\n|\r)/gm, "");
				//console.log('Received from userid: %s', user_count);
				
				ctapi_wss.processMessage(wss, message);
			});

			wss.on('close', function() {
				ctapi_wss.removeClient(wss);
			});				
		});
	},

	//This will process messages received
	processMessage: function(wss, message) {
		var message_parts_init = ctapi_wss.split(message, ':', 1);
		//console.log(message_parts_init);
		switch(message_parts_init[0]) {
			case 'hello':
				wss.send('hello back at you');
				break;
			case 'generate_environmental_data_for_csv_from_trees':
				ctapi_wss.api_generate_environmental_data_for_csv_from_trees(wss, message);
				break;
			case 'trees_by_source_id':
				//wss.send('hello back at you');
				ctapi_wss.api_trees_by_source_id(wss, message);
				break;
			case 'trees_by_source_id_linked_treegenes_and_dryad':
				ctapi_wss.api_trees_by_source_id_linked_treegenes_and_dryad(wss,message);
				break;
			case 'generate_snps_to_missing_freq':
				ctapi_wss.api_generate_snps_to_missing_freq(wss, message);
				break;
		}
	},
	
	//API function to generate snps to missing freq
	api_generate_snps_to_missing_freq: async function(wss, message) {
		var msg_parts = message.split('::');
		var trees = msg_parts[1];
		console.log("api_generate_snps_to_missing_freq function executed");
		var trees_arr = trees.split(',');

		// Perform look up for each tree
		for(i = 0; i < trees_arr.length; i++) {
			console.log(trees_arr[i]);
			ctapi_wss.api_generate_snps_to_missing_freq_single_tree(wss, trees_arr[i]);
			await sleep(150);
		}				
	},


	//API function to generate snps to missing freq per tree
	api_generate_snps_to_missing_freq_single_tree: async function(wss, tree_id) {
		// Perform a SQL lookup for the basic tree information
		var pg_n_client = new pg_native_client();
		try {
			//console.log('Connecting...');
			pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
			pg_n_client.querySync("set datestyle='ISO';");
			pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
			pg_n_client.querySync("SET bytea_output TO escape;");
			pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');

			// var rows = pg_n_client.querySync("SELECT tree_acc, marker_name, description FROM chado.new_geno_view WHERE marker_type = 'SNP' AND tree_acc = '" + tree_id + "' LIMIT 1;");
			var rows = pg_n_client.querySync("SELECT tree_acc, marker_type FROM chado.ctree_trees_with_markers WHERE marker_type = 'SNP' AND tree_acc = '" + tree_id + "' LIMIT 1;");
			//console.log('Found ' + rows.length + ' tree with ID:' + tree_id);
			var response_object = {};
			if(rows.length > 0) {
				// This is really just one tree
				
				for(var i=0; i<rows.length; i++) {
					response_object = {
						'tree_acc': rows[i].tree_acc,
						'marker_name': rows[i].marker_name,
						'description': '',
						//'description': rows[i].description,
					}
				}

			}

			console.log('snps_to_missing_freq_single_tree::' + JSON.stringify(response_object));
			wss.send('snps_to_missing_freq_single_tree::' + JSON.stringify(response_object));
			
			pg_n_client.end();
		}
		catch(err) {
			console.log(err);
		}
	},

	//API function to generate environmental data from trees delimited by commas
	api_generate_environmental_data_for_csv_from_trees: async function(wss, message) {
		try {
			var msg_parts = message.split('::');
			var gis_url = msg_parts[1];
			var trees = msg_parts[2];
			var trees_arr = trees.split(',');
			console.log(trees_arr);

			// Empty trees variable since we don't need it after parsing (memory clear up)
			trees = "";

			// Retrieve the layer and data property names
			var data_properties_objects = JSON.parse(msg_parts[3]);
			console.log('data_properties_objects', data_properties_objects);

			// Generate the header line
			var header_line = "TREE_ID,LATITUDE,LONGITUDE,GENUS,SPECIES";
			
			for(var i=0; i < data_properties_objects.length; i++) {
				header_line += "," + data_properties_objects[i]['property_value'];
				// Units
				header_line += "," + data_properties_objects[i]['property_value'] + "_unit_ids";
				header_line += "," + data_properties_objects[i]['property_value'] + "_unit_labels";
			}
			//console.log("Header line:" + header_line);
			wss.send('environmental_data_csv_line_start::true');
			wss.send('environmental_data_csv_line::' + header_line);

			// Perform look up for each tree
			var client = await pool.connect();
			await client.query("set datestyle='ISO';");
			await client.query("SET client_encoding TO 'UTF-8';");
			await client.query("SET bytea_output TO escape;");
			await client.query('SET SEARCH_PATH TO "public","chado"');
			for(i = 0; i < trees_arr.length; i++) {
				// console.log(trees_arr[i]);
				await ctapi_wss.api_generate_environmental_data_for_csv_single_tree(client, wss, gis_url, trees_arr[i], data_properties_objects);
				// await sleep(1000);
			}
			wss.send('environmental_data_csv_line_complete::true');
			try {
				client.release();
			} catch (err) {
				console.log(err);
			}

		}
		catch (err) {
			console.log(err);
		}
	},

	// API function to generate a single CSV line of environmental data for a tree
	api_generate_environmental_data_for_csv_single_tree: async function(client, wss, gis_url, tree_id, data_properties_objects) {
		// Perform a SQL lookup for the basic tree information
		// var pg_n_client = new pg_native_client();
		// const client = "";
		
		try {
			//client = await pool.connect();
			//console.log('Connecting...');
			// pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');



			var sql = "SELECT * FROM ct_trees WHERE uniquename = '" + tree_id + "' LIMIT 1;";

			var cached_rows = ct_main_cache.get(sql);
			var rows = [];
			if(cached_rows != undefined || cached_rows != null) {
				rows = cached_rows;
			}
			else {
				var qres = await client.query(sql);
				rows = qres.rows;
				// add to cache
				ct_main_cache.put(sql, rows, cache_time_14_days);
			}
			//console.log('Found ' + rows.length + ' tree with ID:' + tree_id);
			if(rows.length > 0) {
				// This is really just one tree
				var csv_line = "";
				for(var i=0; i<rows.length; i++) {
					//console.log(rows[i]);
					csv_line += tree_id + "," + rows[i].latitude + "," + rows[i].longitude + "," + rows[i].genus + "," + rows[i].species;
					var tree_basic_data_object = {
						"tree_id": rows[i].uniquename,
						"tree_latitude": rows[i].latitude,
						"tree_longitude": rows[i].longitude,
						"tree_genus": rows[i].genus,
						"tree_species": rows[i].species
					}
					//console.log(tree_basic_data_object);
					// Perform lookups for each data property on geoserver
					for(var j=0; j < data_properties_objects.length; j++) {
						try {
							var data_property_object = data_properties_objects[j];
							console.log('data_property_object', data_property_object);
							var output = await ctapi_wss.api_generate_environmental_data_for_csv_single_tree_async_geoserver_value(wss, gis_url, tree_basic_data_object, data_property_object);
							console.log("OUTPUT:" + output);
						
							// Try to parse the output received
							var data_prop_query = JSON.parse(output);
							if (data_prop_query['features'].length >= 1) {
								var properties = data_prop_query['features'][0]['properties'];
								//console.log(properties);
								var keys = Object.keys(properties);
			
								for(var k = 0; k < keys.length; k++) {
									var key_name = keys[k];
									var key_value = properties[key_name];
									//console.log(key_name + ',' + key_value);



									//console.log(k + ',' + data_property_object.property_id);
			
									if(k == data_property_object.property_id) {
										// Add this one to the CSV
										// analysis_envdata_csv_data += ',' + key_value;
			
										csv_line += "," + key_value;

										var layer_id = data_property_object['layer_id'];
										// Unit lookup on the public.cartogratree_layers_environmental_units table
										var unit_info_sql = "SELECT unit_ids, unit_labels FROM public.cartogratree_layers_environmental_units WHERE layer_id = $1 LIMIT 1;";
										var unit_info_cached_rows = ct_main_cache.get(unit_info_sql);
										var unit_info_rows = [];
										if(unit_info_cached_rows != undefined || unit_info_cached_rows != null) {
											unit_info_rows = unit_info_cached_rows;
										}
										else {
											var unit_info_qres = await client.query(unit_info_sql, [layer_id]);
											unit_info_rows = unit_info_qres.rows;
											// add to cache
											ct_main_cache.put(unit_info_sql, unit_info_rows, cache_time_14_days);
										}
										var unit_ids = "NA";
										var unit_labels = "NA";
										if (unit_info_rows.length > 0) {
											unit_ids = unit_info_rows[0].unit_ids;
											unit_labels = unit_info_rows[0].unit_labels;
										}
										csv_line += "," + unit_ids;
										csv_line += "," + unit_labels;
			

										// For storing in cartogratree_envdata_<layer_id>
										var db_record = [
											parseFloat(tree_basic_data_object['tree_latitude']),
											parseFloat(tree_basic_data_object['tree_longitude']),
											k,
											key_name,
											key_value,
											unit_ids,
											unit_labels
										]
										console.log('envdata db record data', JSON.stringify(db_record));
										var envdata_create_table_sql = "CREATE TABLE IF NOT EXISTS public.cartogratree_envdata_" + data_property_object['layer_id'] + " (";
										envdata_create_table_sql += "envdata_id serial NOT NULL,";
										envdata_create_table_sql += "latitude double precision NOT NULL,";
										envdata_create_table_sql += "longitude double precision NOT NULL,";
										envdata_create_table_sql += "property_id integer NOT NULL,";
										envdata_create_table_sql += "property_name varchar(1024) NOT NULL,";
										envdata_create_table_sql += "property_value varchar(1024) NOT NULL,";
										envdata_create_table_sql += "unit_ids varchar(1024) NOT NULL,";
										envdata_create_table_sql += "unit_labels varchar(1024) NOT NULL,";
										envdata_create_table_sql += "UNIQUE (latitude, longitude, property_id, property_name, property_value)"
										envdata_create_table_sql += ")";
										await client.query(envdata_create_table_sql);

										var envdata_create_index_sql = "CREATE INDEX IF NOT EXISTS latitude_index ON public.cartogratree_envdata_" + data_property_object['layer_id'] + "(latitude)";
										await client.query(envdata_create_index_sql);
										envdata_create_index_sql = "CREATE INDEX IF NOT EXISTS longitude_index ON public.cartogratree_envdata_" + data_property_object['layer_id'] + "(longitude)";
										await client.query(envdata_create_index_sql);
										envdata_create_index_sql = "CREATE INDEX IF NOT EXISTS latlon_index ON public.cartogratree_envdata_" + data_property_object['layer_id'] + "(latitude, longitude)";
										await client.query(envdata_create_index_sql);


										var envdata_insert_sql = "INSERT INTO public.cartogratree_envdata_" + data_property_object['layer_id'] + " ";
										envdata_insert_sql += "(latitude, longitude, property_id, property_name, property_value, unit_ids, unit_labels) ";
										envdata_insert_sql += " VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING";
										await client.query(envdata_insert_sql, [db_record[0],db_record[1],db_record[2],db_record[3],db_record[4],db_record[5],db_record[6]]);
									}
								}
							}
							else {
								var key_value = "NA";
								csv_line += "," + key_value;
								csv_line += ",NA"; // unit ids
								csv_line += ",NA"; // unit labels
							}							
						}
						catch(err) {
							console.log(err);
							csv_line += ",ERROR";
						}
					}
					wss.send('environmental_data_csv_line::' + csv_line);
				}
			}
			//pg_n_client.end();
			// try { client.release(); } catch (err) { console.log(err) }
		}
		catch(err) {
			console.log(err);
			// try { client.release(); } catch (err) { console.log(err) }
		}		
		
	},

	//API function will retrieve embedded geoserver data for specific tree (this will produce multiple lines per data property)
	api_generate_environmental_data_for_csv_single_tree_async_geoserver_value: async function(wss, gis_url, tree_basic_data_object, data_property_object) {
		var bbox = tree_basic_data_object.tree_latitude + ',' 
		+ tree_basic_data_object.tree_longitude + ',' 
		+ (parseFloat(tree_basic_data_object.tree_latitude) + 0.0000000001) + ',' 
		+ (parseFloat(tree_basic_data_object.tree_longitude) + 0.000000001);
		var url_relative_location =  "/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=" + data_property_object.layer_name + "&LAYERS=" + data_property_object.layer_name + "&INFO_FORMAT=application%2Fjson&I=128&J=128&WIDTH=256&HEIGHT=256&CRS=EPSG:4326&STYLES=&BBOX=" + bbox;
		// var hash = generateMD5Hash(url_relative_location);
		var gen_url = gis_url + url_relative_location;
		
		// console.log(gen_url);
		var output = "error";
		// await sleep(500);
		await (async () => {
			try {

				// Check cache first
				console.log('Checking cache for URL location:', url_relative_location);
				var cached_output = ct_main_cache.get(url_relative_location);
				// var test_val = ct_main_cache.get('test');
				// console.log('test_val:', test_val);
				// ct_main_cache.put('test', 'test_value', cache_time_14_days);
				// return;

				// console.log('cached_output:', cached_output);
				if(cached_output != undefined || cached_output != null) {
					output = cached_output;
				}
				else {
					const response = await axios_instance.get(gen_url);
					//console.log(response);
					//console.log(response.data.url);
					//console.log(response.data.explanation);
					//return response.body;
					output = JSON.stringify(response.data);
					// add to cache
					ct_main_cache.put(url_relative_location, output, cache_time_14_days);
				}
			  	console.log(output);
			} catch (error) {
				ct_main_cache.put(url_relative_location, 'error', cache_time_14_days);
				console.log('ERROR: ' + error);
				//console.log(error.response.body);
				output = "error";
			}
		})();
		//});  
		return output;
	},

	//API function to get trees by source_id and stream it back to the browser
	api_trees_by_source_id: function(wss, message) {
		try {
			var msg_parts = ctapi_wss.split(message, ':', 1);
			var source_id = msg_parts[1];
			if(source_id == null) {
				source_id = 0;
			}
			else {
				source_id = parseInt(source_id);
			}
			//This subsection gets the count for the source_id specified
			pg_pool.connect((err, pg_client, done) => {
				if(err) {
					console.log('Error in api_trees_by_source_id' + err);
					done();
				}
				else {
					//if (err) throw err;
					var query = new QueryStream('SELECT count(*) as c FROM public.ct_trees WHERE source_id = $1 AND (latitude BETWEEN 23.885838 AND 48.9222499) AND (longitude BETWEEN -125.595703 AND -66.884766)',[source_id]);
					const stream = pg_client.query(query);
					var count = 0;
					wss.send('trees_by_source_id_total_tree_count_start:' + source_id);
					stream.on('end', function() {
						done();
						console.log('api_trees_by_source_id DONE clause');
					});					
					stream.on('data', (row) => {
						//console.log(row);
						try {
							var tree_count = row.c.toString().trim();
							console.log('trees_by_source_id_total_tree_count:' + source_id + ':' + tree_count);
							wss.send('trees_by_source_id_total_tree_count:' + source_id + ':' + tree_count); //this send response to the browser
						}
						catch(err) {
							console.log(err);
						}
					});				
				}
			});
			
			//Once we know the count from the previous section, we should now stream the actual results
			pg_pool.connect((err, pg_client, done) => {
				if(err) {
					console.log('Error in api_trees_by_source_id' + err);
					done();
				}
				else {
					//if (err) throw err;
					var query = new QueryStream('SELECT * FROM public.ct_trees WHERE source_id = $1 AND (latitude BETWEEN 23.885838 AND 48.9222499) AND (longitude BETWEEN -125.595703 AND -66.884766) LIMIT 1000000',[source_id]);
					const stream = pg_client.query(query);
					var count = 0;
					wss.send('trees_by_source_id_start:' + source_id);
					stream.on('end', function() {
						wss.send('trees_by_source_id_stop:' + source_id);
						done();
						console.log('api_trees_by_source_id DONE clause');
					});					
					stream.on('data', (row) => {
						//console.log(row);
						try {
							count = count + 1;
							var uniquename = row.uniquename.toString().trim();
							var longitude = row.longitude.toString().trim();
							var latitude = row.latitude.toString().trim();
							var json_text = '{"type":"Feature","properties":{"id":"' + uniquename + '","icon_type":0},"geometry":{"type":"point","coordinates":[' + longitude + ',' + latitude + ']}}';
							//Try to make this easy by creating a json object
							
							wss.send('tbsiit::' + source_id + '::' + count + '::' + json_text);
						}
						catch(err) {
							console.log(err);
						}
					});				
				}
			});
		}
		catch(err) {
			console.log('Error with function get_country_details:' + err.toString());
		}		
	},
	
	//Create POSTGIS table for bien trees
	api_create_postgis_bien_table: function(wss, message) {
		var prefix = '[api_trees_by_source_id_linked_treegenes_and_dryad] ';
		try {
			var msg_parts = ctapi_wss.split(message, ':', 1);
			var source_id = msg_parts[1];
			if(source_id == null) {
				source_id = 0;
			}
			else {
				source_id = parseInt(source_id);
			}
			
			/*
			var ct_trees_segment_count = ct_cache.get("ct_trees_source_id_" + source_id + "_segment_count");
			console.log("Segment count:" + ct_trees_segment_count);
			if(ct_trees_segment_count == undefined || ct_trees_segment_count == null) {
			*/
			if(true) {
				pg_pool.connect((err, pg_client, done) => {
					if(err) {
						console.log('Error in api_trees_by_source_id' + err);
						done();
					}
					else {
						
						//if (err) throw err;
						var query = new QueryStream('SELECT distinct(species) as species FROM public.ct_trees WHERE source_id = $1 OR source_id = $2;',[0,2]);
						const stream = pg_client.query(query);
						var species_array = [];
						//wss.send('trees_by_source_id_total_tree_count_start:' + source_id);
						stream.on('end', function() {
							//done();

							var rows_for_cache = [];
							var iteration = 1;
							//foreach species in species_array
							console.log(prefix + 'Found ' + species_array.length + ' linked unique species from TreeGenes and DryAd combined');
							//wss.send('trees_by_source_id_start:' + source_id);
							var i = 0;
							var count = 0;
							while (i<species_array.length) {
								(function(i) {
									var current_species = species_array[i];
									//perform subquery to get the trees
									//console.log(source_id + ':' + current_species);
									var query_species = new QueryStream('SELECT uniquename, longitude, latitude, genus, species, family FROM public.ct_trees WHERE source_id = $1 AND species LIKE $2;', [source_id, current_species]);
									var stream_species = pg_client.query(query_species);
									stream_species.on('end', function() {
										if(i == species_array.length - 1) {

											
											//wss.send('trees_by_source_id_stop:' + source_id);
																				
											done();
											console.log(prefix + 'All results returned to client');
										}
										else {
											console.log(prefix + 'Finished retrieving results for ' + current_species);
										}
									});
									stream_species.on('data', (row_species) => {
										//console.log(row);
										try {
											
											count = count + 1;
											
											
											//console.log(count);
											//console.log(row_species.uniquename.toString().trim());
											var uniquename = row_species.uniquename.toString().trim();
											var longitude = row_species.longitude.toString().trim();
											var latitude = row_species.latitude.toString().trim();
											var genus = row_species.genus.toString().trim();
											var species = row_species.species.toString().trim();
											var family = row_species.family.toString().trim();
											//if(parseFloat(latitude) != 0 && parseFloat(longitude) != 0) { //not a sea point (the data is valid so send it)
												//Try to make this easy by creating a json object
											
												//This is uncompressed
												//var json_text_uncmp = '{"type":"Feature","properties":{"id":"' + uniquename + '","icon_type":0,"genus":"' + genus + '", "species":"' + species + '", "family":"' + family + '"},"geometry":{"type":"Point","coordinates":[' + longitude + ',' + latitude + ']}}';
												
												//Modified simple compression
												//var json_text = 'ex1' + uniquename + 'ex2' + longitude + ',' + latitude + ']}}';

												//wss.send('tbsiit::' + source_id + '::' + count + '::' + json_text);
											//}	
										}
										catch(err) {
											console.log(err);
										}
									});	
								})(i);
								i = i + 1;
							}
						});					
						stream.on('data', (row) => {
							//console.log(row);
							try {
								console.log(row.species.toString().trim());
								species_array.push(row.species.toString().trim());
							}
							catch(err) {
								console.log(err);
							}
						});				
					}
				});
			}
		}
		catch(err) {
			console.log('Error with function get_country_details:' + err.toString());
		}		
	},
	
	
	//API function to get trees by source_id and stream it back to the browser
	api_trees_by_source_id_linked_treegenes_and_dryad: function(wss, message) {
		var prefix = '[api_trees_by_source_id_linked_treegenes_and_dryad] ';
		try {
			var msg_parts = ctapi_wss.split(message, ':', 1);
			var source_id = msg_parts[1];
			if(source_id == null) {
				source_id = 0;
			}
			else {
				source_id = parseInt(source_id);
			}
			
			/*
			var ct_trees_segment_count = ct_cache.get("ct_trees_source_id_" + source_id + "_segment_count");
			console.log("Segment count:" + ct_trees_segment_count);
			if(ct_trees_segment_count == undefined || ct_trees_segment_count == null) {
			*/
			if(true) {
				pg_pool.connect((err, pg_client, done) => {
					if(err) {
						console.log('Error in api_trees_by_source_id' + err);
						done();
					}
					else {
						//Delete the file if it exists to regenerate it
						try {
							if (write_source_id_geojson_file == true) {
								fs.unlink('geojson.json',
									// callback function
									function(err) { 
										if (err) {
											console.log(err);
										}
										// if no error
										//console.log("Data is appended to file successfully.")
									}	
								);	
							}
						}	
						catch(err) {
							console.log(err);
						}						
						
						
						//if (err) throw err;
						var query = new QueryStream('SELECT distinct(species) as species FROM public.ct_trees WHERE source_id = $1 OR source_id = $2;',[0,2]);
						const stream = pg_client.query(query);
						var species_array = [];
						//wss.send('trees_by_source_id_total_tree_count_start:' + source_id);
						stream.on('end', function() {
							//done();
							try {
								if (write_source_id_geojson_file == true) {
									fs.appendFile('geojson.json','[', 'utf8',
										// callback function
										function(err) { 
											if (err) {
												console.log(err);
											}
											// if no error
											//console.log("Data is appended to file successfully.")
										}
									);	
								}
							}	
							catch(err) {
								console.log(err);
							}						
							
							var rows_for_cache = [];
							var iteration = 1;
							//foreach species in species_array
							console.log(prefix + 'Found ' + species_array.length + ' linked unique species from TreeGenes and DryAd combined');
							wss.send('trees_by_source_id_start:' + source_id);
							var i = 0;
							var count = 0;
							while (i<species_array.length) {
								(function(i) {
									var current_species = species_array[i];
									//perform subquery to get the trees
									//console.log(source_id + ':' + current_species);
									var query_species = new QueryStream('SELECT uniquename, longitude, latitude, genus, species, family FROM public.ct_trees WHERE source_id = $1 AND species LIKE $2;', [source_id, current_species]);
									var stream_species = pg_client.query(query_species);
									stream_species.on('end', function() {
										if(i == species_array.length - 1) {
											//Set cache
											/*
											ct_cache.put("ct_trees_source_id_" + source_id + "_" + iteration, rows_for_cache, 7*24*60*60*1000); //Usually 7 days
											ct_cache.put("ct_trees_source_id_" + source_id + "_segment_count", iteration, 7*24*60*60*1000); //Usually 7 days
											wss.send('Rows cached:' + count);
											wss.send('Segments cached:' + count);
											*/
											
											wss.send('trees_by_source_id_stop:' + source_id);
											
											try {
												if (write_source_id_geojson_file == true) {
													fs.appendFile('geojson.json',']', 'utf8',
														// callback function
														function(err) { 
															if (err) {
																console.log(err);
															}
															// if no error
															//console.log("Data is appended to file successfully.")
														}
													);	
												}
											}	
											catch(err) {
												console.log(err);
											}										
											done();
											console.log(prefix + 'All results returned to client');
										}
										else {
											console.log(prefix + 'Finished retrieving results for ' + current_species);
										}
									});
									stream_species.on('data', (row_species) => {
										//console.log(row);
										try {
											
											count = count + 1;
											
											//Cache the specific segment
											/*
											rows_for_cache.push(row_species);
											if(count % 500000 == 0 && count > 0) {
												ct_cache.put("ct_trees_source_id_" + source_id + "_" + iteration, rows_for_cache, 7*24*60*60*1000); //Usually 7 days
												console.log("ct_trees_source_id_" + source_id + "_" + iteration + " segments has been saved in cache");
												iteration = iteration + 1;
												rows_for_cache = []; //reset the array
											}
											*/
											
											
											//console.log(count);
											//console.log(row_species.uniquename.toString().trim());
											var uniquename = row_species.uniquename.toString().trim();
											var longitude = row_species.longitude.toString().trim();
											var latitude = row_species.latitude.toString().trim();
											var genus = row_species.genus.toString().trim();
											var species = row_species.species.toString().trim();
											var family = row_species.family.toString().trim();
											//if(parseFloat(latitude) != 0 && parseFloat(longitude) != 0) { //not a sea point (the data is valid so send it)
												//Try to make this easy by creating a json object
											
												//This is uncompressed
												var json_text_uncmp = '{"type":"Feature","properties":{"id":"' + uniquename + '","icon_type":0,"genus":"' + genus + '", "species":"' + species + '", "family":"' + family + '"},"geometry":{"type":"Point","coordinates":[' + longitude + ',' + latitude + ']}}';
												
												//Modified simple compression
												var json_text = 'ex1' + uniquename + 'ex2' + longitude + ',' + latitude + ']}}';
												
												// append data to file
												try {
													if (write_source_id_geojson_file == true) {
														if(count == 1) {
															fs.appendFile('geojson.json',json_text_uncmp, 'utf8',
																// callback function
																function(err) { 
																	if (err) {
																		console.log(err);
																	}
																	// if no error
																	//console.log("Data is appended to file successfully.")
																}
															);	
														}
														else {
															fs.appendFile('geojson.json',',' + json_text_uncmp, 'utf8',
																// callback function
																function(err) { 
																	if (err) {
																		console.log(err);
																	}
																	// if no error
																	//console.log("Data is appended to file successfully.")
																}
															);	
														}
													}
												}	
												catch(err) {
													console.log(err);
												}
												wss.send('tbsiit::' + source_id + '::' + count + '::' + json_text);
											//}	
										}
										catch(err) {
											console.log(err);
										}
									});	
								})(i);
								i = i + 1;
							}
						});					
						stream.on('data', (row) => {
							//console.log(row);
							try {
								// console.log(row.species.toString().trim());
								species_array.push(row.species.toString().trim());
							}
							catch(err) {
								console.log(err);
							}
						});				
					}
				});
			}
			/*
			else {
				//it found cache data so use that instead of pulling from database
				console.log('Found ct_trees_source_id_' + source_id + ' from cache - attempting to stream to user interface...');
				console.log('Segments found:' + ct_trees_segment_count);
				var sendMessage = new Worker(function() {

					this.onmessage = function (event) {
					  //postMessage(sendMessage(event.data));
					  //console.log(event.data.msg);
					  (async () => {
						wss.send(event.data.msg);
					  })();
					}
				});

		
				//Send header
				wss.send('trees_by_source_id_start:' + source_id);
				//(async () => {
						//bar();				
					for(var j=1; j<= ct_trees_segment_count; j++) {
						var rows_from_cache = ct_cache.get("ct_trees_source_id_" + source_id + "_" + j);
						console.log('Attempting to send ct_trees_source_id_' + source_id + ' segment ' + j + ' of ' + ct_trees_segment_count + ' from cache');

							for(var i=0; i < rows_from_cache.length; i++) {
								try {
									
									//process and send it out per row
									var row_species = rows_from_cache[i];
									var uniquename = row_species.uniquename.toString().trim();
									var longitude = row_species.longitude.toString().trim();
									var latitude = row_species.latitude.toString().trim();					
									var json_text = '{"type":"Feature","properties":{"id":"' + uniquename + '","icon_type":0},"geometry":{"type":"point","coordinates":[' + longitude + ',' + latitude + ']}}';
									//console.log(i);
									//wss.send('tbsiit::' + source_id + '::' + (i+1) + '::' + json_text);
									sendMessage.postMessage({'msg': 'tbsiit::' + source_id + '::' + (i+1) + '::' + json_text});
									
								}
								catch(err) {
									console.log(err);
								}
								
							}
							console.log('Waiting 1 second...');
							//await delay(1000);
						
					}
								
					
					//Send ender
					wss.send('trees_by_source_id_stop:' + source_id);
					console.log('Stream completed.');
				//})();				
			}
			*/
			
			/*
			//Once we know the count from the previous section, we should now stream the actual results
			pg_pool.connect((err, pg_client, done) => {
				if(err) {
					console.log('Error in api_trees_by_source_id' + err);
					done();
				}
				else {
					//if (err) throw err;
					var query = new QueryStream('SELECT * FROM public.ct_trees WHERE source_id = $1 AND (latitude BETWEEN 23.885838 AND 48.9222499) AND (longitude BETWEEN -125.595703 AND -66.884766) LIMIT 1000000',[source_id]);
					const stream = pg_client.query(query);
					var count = 0;
					wss.send('trees_by_source_id_start:' + source_id);
					stream.on('end', function() {
						wss.send('trees_by_source_id_stop:' + source_id);
						done();
						console.log('api_trees_by_source_id DONE clause');
					});					
					stream.on('data', (row) => {
						//console.log(row);
						try {
							count = count + 1;
							var uniquename = row.uniquename.toString().trim();
							var longitude = row.longitude.toString().trim();
							var latitude = row.latitude.toString().trim();
							var json_text = '{"type":"Feature","properties":{"id":"' + uniquename + '","icon_type":0},"geometry":{"type":"point","coordinates":[' + longitude + ',' + latitude + ']}}';
							//Try to make this easy by creating a json object
							
							wss.send('trees_by_source_id_individual_tree::' + source_id + '::' + count + '::' + json_text);
						}
						catch(err) {
							console.log(err);
						}
					});				
				}
			});
			*/
		}
		catch(err) {
			console.log('Error with function get_country_details:' + err.toString());
		}		
	},
	

	//This adds a new client to the clients array
	addClient: function(wss, client_id){
		var client_object = { socket: wss, client_id: client_id, client_type: 'user', client_username: 'N/A', client_current_page: 'N/A', client_ip: 'N/A'};
		ctapi_wss.clients.push(client_object);
	},	
	
	//This removes a client from the clients array
	removeClient: function(wss) {
		for(i = 0; i < ctapi_wss.clients.length; i++){
			if(ctapi_wss.clients[i].socket === wss){
				ctapi_wss.clients.splice(i,1);
				//console.log('remove client');
			}
		}		
	},
	
	//A better version of split that will return remainder as well
	split: function (str, separator, limit) {
		str = str.split(separator);

		if(str.length > limit) {
			var ret = str.splice(0, limit);
			ret.push(str.join(separator));

			return ret;
		}
		return str;		
	},	
}

function sleep(ms) {
	return new Promise((resolve) => {
	  setTimeout(resolve, ms);
	});
} 

function generateMD5Hash(inputString) {
	// Create an MD5 hash object
	const hash = crypto.createHash('md5');
  
	// Update the hash with the input string
	// It's a good practice to specify the input encoding (e.g., 'utf8')
	hash.update(inputString, 'utf8');
  
	// Generate the hash in hexadecimal format
	const md5Hash = hash.digest('hex');
  
	return md5Hash;
  }

//Start up pg_pool which is used by Query Streams
const conf = require('./config.js');
const { exit } = require('process');
const { url } = require('inspector');
const e = require('cors');
var pg_pool = new pg.Pool(conf.conf);

//Begin listening for connections and messages
ctapi_wss.start();
