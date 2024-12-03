const { PerformanceObserver, performance } = require('perf_hooks');
const config = require('./config');
const query = require("./query");
const { Pool, Client } = require("pg");
const ct_cache = require("memory-cache");
var pg_native_client = require('pg-native');
const cache_time_24 = 24*60*60*1000;
const fs = require('fs');
const pool = new Pool({
	host: config.conf_bienv4.host,
	port: config.conf_bienv4.post,
	database: config.conf_bienv4.database,
	user: config.conf_bienv4.user,
	password: config.conf_bienv4.password, 
});

async function perform_bienv4_generategeojson_linkedwithtganddryad_import() {
	//query("DELETE FROM ct_trees WHERE source_id = 3;", [], function (err, rows, result) {
    // var geojson = {
    //     "type": "FeatureCollection",
    //     "features": []
    // };
	fs.unlinkSync('bien.geojson.json');
	fs.appendFileSync('bien.geojson.json', '{"type":"FeatureCollection","features":[');

	query("SELECT * FROM ct_trees_bien LIMIT 1;", [], async function (err, rows, result) {
			if (err) {
				console.log(err);
				//res.status(400);
				res.status(200).json("Error:" + err);
				return;
			}
			else {
				//Get all species from TreeGenes to use for searching
				var pg_n_client = new pg_native_client(); //Connect to TreeGenes Database server
				pg_n_client.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				// console.log('IT CAME HERE');
				var rows = pg_n_client.querySync("SELECT distinct(species) as species FROM (SELECT DISTINCT ON(uniquename) * FROM public.ct_trees_all_view WHERE (source_id = 0 OR source_id = 2)) AS TABLE1");
				pg_n_client.end();
				// console.log('IT CAME HERE 2');
				//semi global variables
				var tree_count_invalid = 0;
				var tree_count_valid = 0;
				var tree_count_abs = 0;
				
				var t0 = performance.now();
				
				console.log('[BIENv4 Generate GeoJSON] Detected ' + rows.length + ' species from TreeGenes');
				for (var i = 0; i < rows.length; i++) {
					var species_original = rows[i].species;
					console.log('[BIENv4 Generate GeoJSON] --------------------------------------------');
					console.log('[BIENv4 Generate GeoJSON] Searching for observations for ' + species_original + ' species');
					
					//each genus record
					//continue to get data from BIENv4
					
					
					try {
						
						console.log('[BIENv4 Generate GeoJSON] Connecting to BIENv4 public database server');
						console.log('IT CAME HERE 3');
						// console.log(config.conf_bienv4);
						// pg_n_client = new pg_native_client();
						// console.log('IT CAME HERE 3.5');
						// pg_n_client.connectSync('postgresql://' + config.conf_bienv4.user + ':' + config.conf_bienv4.password + '@' + config.conf_bienv4.host + ':' + config.conf_bienv4.port + '/' + config.conf_bienv4.database + '');
						// console.log('IT CAME HERE 4');
						
						/*
						pg_n_client.querySync("set datestyle='ISO';");
						pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
						pg_n_client.querySync("SET bytea_output TO escape;");
						pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
						*/
						
						// var rows_bien = pg_n_client.querySync("SELECT COUNT(*) as c FROM view_full_occurrence_individual WHERE scrubbed_species_binomial = '" + species_original + "';");
						// pg_n_client.end();
						//const client = await pool.connect();
						const result = await pool.query("SELECT COUNT(*) as c FROM view_full_occurrence_individual WHERE scrubbed_species_binomial = '" + species_original + "';");
						// await client.release();
						// console.log(result);
						var rows_bien = result.rows;
						console.log('Rows count: ' + rows_bien.length);
						//console.log('Found ' + rows_bien.length + ' for ' + genus);
						if(rows_bien.length > 0) {
							for(j=0; j<rows_bien.length; j++) {
								var c = rows_bien[j].c;
								console.log("[BIENv4 Generate GeoJSON] There are " + c + ' individual occurrences for ' + species_original);
								// console.log("[BIENv4 Generate GeoJSON] Importing into ct_trees_bien table. This could take a while!");

								//Remember to use specific rows to ease up network data download
								var rows_bien_trees_rows_results = await pool.query("SELECT taxonobservation_id, scrubbed_species_binomial, scrubbed_genus, scrubbed_family, higher_plant_group, latitude, longitude FROM view_full_occurrence_individual WHERE scrubbed_species_binomial = '" + species_original + "';");
								var rows_bien_trees_rows = rows_bien_trees_rows_results.rows;
								console.log('Rows count: ' + rows_bien_trees_rows.length);
								if (j > 0) {
									// Write output to geojson file
									fs.appendFileSync('bien.geojson.json', ',');
								}
								for(k=0; k<rows_bien_trees_rows.length; k++) {
									// console.log(rows_bien_trees_rows[k]);
									if (k % 1000 == 0) {
										console.log('Processed individuals: ' + k + ' of ' + rows_bien_trees_rows.length);
									}
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
										//console.log('[BIENv4 Generate GeoJSON] ' + uniquename + ' will be ignored because it contains too much nulls');
									}
									else {
										tree_count_valid = tree_count_valid + 1;
										if(subkingdom == 'flowering') {
											subkingdom = 'angiosperm';
										}
										// pg_n_client_tg.querySync("INSERT INTO ct_trees_bien (uniquename, species, genus, family, subkingdom, latitude, longitude, source_id, icon_type) VALUES('" + uniquename + "','" + species + "','" + genus + "','" + family + "','" + subkingdom + "'," + latitude + "," + longitude +"," + source_id + "," + icon_type + ") ON CONFLICT(uniquename) DO NOTHING;");
										// var feature_obj = {
                                        //     type: "Feature",
                                        //     properties: {
                                        //         id: uniquename,
                                        //         icon_type: 0,
                                        //         genus: genus,
                                        //         species: species,
                                        //         family: family,
                                        //     },
                                        //     geometry: {
                                        //         type: "Point",
                                        //         coordinates: [
                                        //             longitude,
                                        //             latitude
                                        //         ]
                                        //     }
                                        // };
                                        // geojson.features.push(feature_obj);
										if(k % 1000 == 0) {
											console.log("[BIENv4 Generate GeoJSON] PROGRESS - " + k + " of " + rows_bien_trees_rows.length + " inserted [" + species + "]");
										}

										//This is uncompressed
										var json_text_uncmp = '';
										json_text_uncmp = '{"type":"Feature","properties":{"id":"' + uniquename + '","icon_type":0,"genus":"' + genus + '", "species":"' + species + '", "family":"' + family + '"},"geometry":{"type":"Point","coordinates":[' + longitude + ',' + latitude + ']}}' + "\r\n";
										if(k == 0) { //If first line/record, add the opening bracket
											// json_text_uncmp = '[' + json_text_uncmp;
										}
										else if(k == (rows_bien_trees_rows.length -1)) { //If last line/record, add the closing bracket
											// json_text_uncmp = ',' + json_text_uncmp + ']';
										}
										else {
											// json_text_uncmp = ',' + json_text_uncmp; //Records in between
											json_text_uncmp = ',' + json_text_uncmp;
										}

										// Remove any rows where latitude and longitude are nulls
										if(latitude == null && longitude == null) {
											json_text_uncmp = '';
										}
										else {
											// Write output to geojson file
											console.log(json_text_uncmp);
											fs.appendFileSync('bien.geojson.json', json_text_uncmp);
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
						
						console.log('[BIENv4 Generate GeoJSON] Disconnected from BIENv4 public database server');
					}
					catch(err) {
						console.log(err);
					}							
				}
				console.log('[BIENv4 Generate GeoJSON] Writing geojson file...');
				console.log('[BIENv4 Generate GeoJSON] Completed!');
				console.log('[BIENv4 Generate GeoJSON] -------------------------------------------------------');
				console.log('[BIENv4 Generate GeoJSON] Valid tree records:' + tree_count_valid);
				console.log('[BIENv4 Generate GeoJSON] Invalid tree records:' + tree_count_invalid);
				console.log('[BIENv4 Generate GeoJSON] Total tree records:' + tree_count_abs);
				console.log('[BIENv4 Generate GeoJSON] -------------------------------------------------------');
				console.log('[BIENv4 Generate GeoJSON] Import completed.');
				var t1 = performance.now();
				console.log("[BIENv4 Generate GeoJSON] Elapsed time: " + ((t1 - t0)/1000) + " seconds.");
			}
			pool.end();
			
	});
	fs.appendFileSync('bien.geojson.json', ']}');
}
//console.log("This is a test");
perform_bienv4_generategeojson_linkedwithtganddryad_import();
