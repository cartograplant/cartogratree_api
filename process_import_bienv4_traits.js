const { PerformanceObserver, performance } = require('perf_hooks');
const config = require('./config');
const query = require("./query");
const ct_cache = require("memory-cache");
var pg_native_client = require('pg-native');
const cache_time_24 = 24*60*60*1000;

function perform_bienv4_import() {
	var prefix = '[BIENv4 Force Reload Traits]';
	//query("DELETE FROM ct_trees WHERE source_id = 3;", [], function (err, rows, result) {
	query("SELECT * FROM ct_trees_phenotypic_data WHERE treeacc ILIKE 'bien.%' LIMIT 1;", [], function (err, rows, result) {
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
				var rows = pg_n_client_tg.querySync("SELECT distinct(genus) FROM chado.organism order by genus asc;");

				//semi global variables
				var tree_count_invalid = 0;
				var tree_count_valid = 0;
				var tree_count_abs = 0;
				
				var t0 = performance.now();
				
				console.log(prefix + ' ' + rows.length + ' genus from TreeGenes');
				for (var i = 0; i < rows.length; i++) {
					var genus_original = rows[i].genus;
					console.log(prefix + ' --------------------------------------------');
					console.log(prefix + ' Searching for traits for ' + genus_original + ' genus');
					
					//each genus record
					//continue to get data from BIENv4
					
					var pg_n_client_bienv4 = new pg_native_client();
					try {
						
						console.log(prefix + ' Connecting to BIENv4 public database server');
						pg_n_client_bienv4.connectSync('postgresql://' + config.conf_bienv4.user + ':' + config.conf_bienv4.password + '@' + config.conf_bienv4.host + ':' + config.conf_bienv4.port + '/' + config.conf_bienv4.database + '');
						/*
						pg_n_client.querySync("set datestyle='ISO';");
						pg_n_client.querySync("SET client_encoding TO 'UTF-8';");
						pg_n_client.querySync("SET bytea_output TO escape;");
						pg_n_client.querySync('SET SEARCH_PATH TO "public","chado"');
						*/
						
						var rows_bien = pg_n_client_bienv4.querySync("SELECT COUNT(*) as c FROM agg_traits WHERE scrubbed_genus = '" + genus_original + "';");
						//console.log('Found ' + rows_bien.length + ' for ' + genus);
						if(rows_bien.length > 0) {
							for(j=0; j<rows_bien.length; j++) {
								var c = rows_bien[j].c;
								console.log(prefix + " There are " + c + ' traits for ' + genus_original);
								console.log(prefix + " Importing into ct_trees_phenotypic_data table. This could take a while!");

								//Remember to use specific rows to ease up network data download
								var rows_bien_trees_rows = pg_n_client_bienv4.querySync("SELECT taxonobservation_id, scrubbed_species_binomial, scrubbed_genus, scrubbed_family, higher_plant_group, latitude, longitude FROM agg_traits WHERE scrubbed_genus = '" + genus_original + "';");
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
										pg_n_client_tg.querySync("INSERT INTO ct_trees (uniquename, species, genus, family, subkingdom, latitude, longitude, source_id, icon_type) VALUES('" + uniquename + "','" + species + "','" + genus + "','" + family + "','" + subkingdom + "'," + latitude + "," + longitude +"," + source_id + "," + icon_type + ") ON CONFLICT(uniquename) DO NOTHING;");
										
										if(k % 1000 == 0) {
											console.log(prefix + " PROGRESS - " + k + " of " + rows_bien_trees_rows.length + " inserted [" + genus + "]");
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
						console.log(prefix + ' Disconnected from BIENv4 public database server');
						pg_n_client_bienv4.end();
					}
					catch(err) {
						console.log(err);
					}							
					

				}
				console.log(prefix + ' -------------------------------------------------------');
				console.log(prefix + ' Valid tree records:' + tree_count_valid);
				console.log(prefix + ' Invalid tree records:' + tree_count_invalid);
				console.log(prefix + ' Total tree records:' + tree_count_abs);
				console.log(prefix + ' -------------------------------------------------------');
				console.log(prefix + ' Import completed.');
				var t1 = performance.now();
				console.log(prefix + " Elapsed time: " + ((t1 - t0)/1000) + " seconds.");
				pg_n_client_tg.end(); //Disconnect from TreeGenes database server

			}
			
	});
}

//console.log("This is a test");
perform_bienv4_import();