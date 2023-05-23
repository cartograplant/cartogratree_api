const { PerformanceObserver, performance } = require('perf_hooks');
const config = require('./config');
const query = require("./query");
const ct_cache = require("memory-cache");
const pg = require('pg');//Postgres database implementation
var pg_native_client = require('pg-native');
const QueryStream = require('pg-query-stream');
const cache_time_24 = 24*60*60*1000;
// const isSea = require('is-sea'); // deprecated due to vulnerable dependencies
const retus = require("retus");
// console.log(isSea(0,0));

//Start up pg_pool which is used by Query Streams
const conf = require('./config.js');
var pg_pool = new pg.Pool(conf.conf);

function perform_bienv4_cleanup_trees() {
	var prefix = '[BIENv4 Clean Up Trees]';
	console.log(prefix + ' Beginning to clean up trees');
	var trees_count = 0;
	var removed_count = 0;
	try {
		
		var pg_n_client_tg = new pg_native_client(); //Connect to TreeGenes Database server
		pg_n_client_tg.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
		
		var rows_species = pg_n_client_tg.querySync("SELECT distinct(species) as species FROM (SELECT * FROM ct_trees_treegenes UNION SELECT * FROM ct_trees_dryad) AS TABLE1");
		for(k=0; k < rows_species.length; k++) {
			var current_species = rows_species[k].species;
			//First let's get a count of the trees (yes, this might be expensive)
			var rows = pg_n_client_tg.querySync("SELECT count(*) as c FROM ct_trees_bien WHERE species = '" + current_species + "';");
			var trees_total = parseInt(rows[0].c);
			console.log(prefix + ' Total trees from species ' + current_species + ' to perform checks on: ' + trees_total);
			//Perform checks in segments
			var segments_range = 10000;
			var segments_current = 0;
			var segments_total = Math.ceil(trees_total / segments_range);
			for(i=0; i < segments_total; i++) {
				console.log(prefix + ' Current segment ' + i);
				var offset = segments_range * i;
				var limit = segments_range;
				var trees_rows = pg_n_client_tg.querySync("SELECT uniquename, latitude, longitude FROM ct_trees_bien WHERE species = '" + current_species + "' ORDER BY uniquename ASC LIMIT " + limit + " OFFSET " + offset);
				console.log(prefix + ' Peforming tasks on LIMIT ' + limit + ' and OFFSET ' + offset);
				var time_start = (new Date()).getTime();
				var time_end = (new Date()).getTime();
				for(j=0; j < trees_rows.length; j++) {
					var lat = trees_rows[j].latitude;
					var lon = trees_rows[j].longitude;
					var uniquename = trees_rows[j].uniquename;
					
					var method = 1;

					if(method == 2) {
						var wms_url = 'https://tgwebdev.cam.uchc.edu/geoserver/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=ct:wc2_0_30s_prec_01&LAYERS=ct:wc2_0_30s_prec_01&INFO_FORMAT=application%2Fjson&I=128&J=128&WIDTH=256&HEIGHT=256&CRS=EPSG%3A4326&STYLES=&BBOX=' + (lat - 0.1) + '%2C' + (lon - 0.1) + '%2C' + (lat + 0.1) + '%2C' + (lon + 0.1);
						const { body } = retus(wms_url);
					}
					
					
					if(j%100 == 0) {
						console.log(prefix + ' Continuing to process trees for segment ' + i + ': ' + j + ' trees...');
						if(method ==2) {
							console.log(wms_url);
							console.log(body);
						}
						time_end = (new Date()).getTime();
						console.log(prefix + ' PTIME: ' + (time_end - time_start) + ' ms');
						time_start = (new Date()).getTime();
					}				
					
					
					
					
					if(method == 1) {
						// if(isSea(lat,lon) == true) {
						// 	//This tree is in the sea, so remove italics
						// 	removed_count = removed_count + 1;
						// 	console.log(prefix + ' ' + removed_count + ' tree removed...');
						// 	console.log(trees_rows[j]);
						// 	pg_n_client_tg.querySync("DELETE FROM ct_trees_bien WHERE uniquename = '" + uniquename + "';");
						// }
					}
					
					
				}
			}
		}
		pg_n_client_tg.end(); //Disconnect from TreeGenes database server
	}
	catch(err) {
		console.log(err);
	}
	
}

//console.log("This is a test");
perform_bienv4_cleanup_trees();
