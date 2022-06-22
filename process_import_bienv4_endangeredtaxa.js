const { PerformanceObserver, performance } = require('perf_hooks');
const config = require('./config');
const query = require("./query");
const ct_cache = require("memory-cache");
var pg_native_client = require('pg-native');
const cache_time_24 = 24*60*60*1000;

function perform_bienv4_import() {
	var prefix = '[BIENv4 Force Reload EndageredTaxa]';
	query("DELETE FROM ct_trees_bien_endangered_taxa;", [], function (err, rows, result) {
	//query("SELECT * FROM ct_trees LIMIT 1;", [], function (err, rows, result) {
		if (err) {
			console.log(err);
			//res.status(400);
			res.status(200).json("Error:" + err);
			return;
		}
		else {
			
			var pg_n_client_tg = new pg_native_client(); //Connect to TreeGenes Database server
			pg_n_client_tg.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');

				
			//each genus record
			//continue to get data from BIENv4
			
			var pg_n_client_bienv4 = new pg_native_client();
			try {
				
				console.log(prefix + ' Connecting to BIENv4 public database server');
				pg_n_client_bienv4.connectSync('postgresql://' + config.conf_bienv4.user + ':' + config.conf_bienv4.password + '@' + config.conf_bienv4.host + ':' + config.conf_bienv4.port + '/' + config.conf_bienv4.database + '');


				//Remember to use specific rows to ease up network data download
				var rows_bien_endangered_taxa = pg_n_client_bienv4.querySync("SELECT * FROM endangered_taxa;");
				for(k=0; k<rows_bien_endangered_taxa.length; k++) {
					var endangered_taxa_id = rows_bien_endangered_taxa[k].endangered_taxa_id;
					var taxon_scrubbed_canonical = rows_bien_endangered_taxa[k].taxon_scrubbed_canonical;
					var taxon_rank = rows_bien_endangered_taxa[k].taxon_rank;
					var cites_status = rows_bien_endangered_taxa[k].cites_status;
					var iucn_status = rows_bien_endangered_taxa[k].iucn_status;
					var usda_status_fed = rows_bien_endangered_taxa[k].usda_status_fed;
					var usda_status_state = rows_bien_endangered_taxa[k].usda_status_state;


					pg_n_client_tg.querySync("INSERT INTO ct_trees_bien_endangered_taxa (endangered_taxa_id, taxon_scrubbed_canonical, taxon_rank, cites_status, iucn_status, usda_status_fed, usda_status_state) VALUES(" + endangered_taxa_id + ",'" + taxon_scrubbed_canonical + "','" + taxon_rank + "','" + cites_status+ "','" + iucn_status + "','" + usda_status_fed + "','" + usda_status_state + "');");
					
					if(k % 1000 == 0) {
						console.log(prefix + " PROGRESS - " + k + " of " + rows_bien_endangered_taxa.length + " inserted [" + endangered_taxa_id + "]");
					}
						//uniquename	genus	species	subkingdom	family	latitude	longitude	coordinate_type	source_id	icon_type	tree_num	external_name
						
						
					
				}

				console.log(prefix + ' Disconnected from BIENv4 public database server');
				pg_n_client_bienv4.end();
			}
			catch(err) {
				console.log(err);
			}							
				

			
			console.log(prefix + ' Import completed.');
			var t1 = performance.now();
			//console.log(prefix + " Elapsed time: " + ((t1 - t0)/1000) + " seconds.");
			pg_n_client_tg.end(); //Disconnect from TreeGenes database server

		}
	});
}

//console.log("This is a test");
perform_bienv4_import();