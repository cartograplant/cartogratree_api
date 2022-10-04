const { PerformanceObserver, performance } = require('perf_hooks');
const config = require('./config');
const query = require("./query");
const ct_cache = require("memory-cache");
const pg = require('pg');//Postgres database implementation
var pg_native_client = require('pg-native');
const QueryStream = require('pg-query-stream');//Postgres Query Streaming implementation
const cache_time_24 = 24*60*60*1000;

var pg_pool = new pg.Pool(config.conf);

function perform_generategeometry_bienv4_linkedwithtganddryad() {
		var prefix = '[perform_generategeometry_bienv4_linkedwithtganddryad()] ';
		try {
				var pg_n_client_tg = new pg_native_client(); //Connect to TreeGenes Database server
				pg_n_client_tg.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				var rows = pg_n_client_tg.querySync("SELECT count(*) as c FROM public.ct_trees WHERE source_id = 3 AND geometry IS NULL;");
				var total_count = 0;
				for(var i=0; i<rows.length; i++) {
					total_count = rows[i].c;
				}
				
				//Now we can do partition runs since we have a total;
				var partition_items = 2500;
				var total_partitions = Math.ceil(total_count / partition_items);
				for(var p = 0; p < total_partitions; p++) {
					var offset = p * partition_items;
					pg_n_client_tg.querySync("UPDATE public.ct_trees SET geometry = ST_SetSRID(ST_MakePoint(longitude, latitude),3857) WHERE  uniquename IN (SELECT uniquename FROM public.ct_trees WHERE source_id = 3 AND geometry IS NULL ORDER BY uniquename ASC LIMIT " + partition_items + " OFFSET " + offset + ");");
					console.log(prefix + 'Successfully performed geometry updates on ' + (partition_items + offset) + ' of ' + total_count + ' trees');
				}
				console.log(prefix + 'Finished updating all geometries!');	
		}
		catch (err) {
			console.log('Error in ' + prefix + ' ' + err);
		}
}

//console.log("This is a test");
perform_generategeometry_bienv4_linkedwithtganddryad();
