/**
 * This code gets executed when starting Cartogratree API
 * It does is warming up the cache for TGDR studies
 */
const config = require('./config');
const pg = require('pg');//Postgres database implementation
var pg_native_client = require('pg-native');

//Start up pg_pool which is used by Query Streams
const conf = require('./config.js');
var pg_pool = new pg.Pool(conf.conf);

async function perform_check_trees_in_sea() {
  try {
    var prefix = '[PROCESS_CHECK_TREES_IN_SEA]';
    var pg_n_client_tg = new pg_native_client(); //Connect to TreeGenes Database server
    pg_n_client_tg.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
    var rows = pg_n_client_tg.querySync("SELECT uniquename, latitude, longitude, study_accession FROM public.ct_trees_all_view WHERE (source_id = 0 OR source_id = 2)");
    pg_n_client_tg.end(); //Disconnect from TreeGenes database server
    console.error(prefix + ' Iterating through ' + rows.length + ' trees from database results...');
    const isSea = require('is-sea');
    var trees_in_sea = {};
    var studies_containing_trees_in_sea = {}
    var rows_count = rows.length;
    console.error('rows_count', rows_count);
    for(k=0; k < rows.length; k++) {
        // console.err(k);
        process.stderr.write(k + ' of ' + rows_count + ' ');
        
        var uniquename = rows[k].uniquename;
        var latitude = rows[k].latitude;
        var longitude = rows[k].longitude;
        var study_accession = rows[k].study_accession;

        
        if(isSea(latitude,longitude) == true) {
          console.error('uniquename seems to be in the sea: ' + uniquename);
          trees_in_sea['uniquename'] = {
            uniquename: uniquename,
            latitude: latitude,
            longitude: longitude
          };

          if(uniquename.startsWith('TGDR')) {
            studies_containing_trees_in_sea[study_accession] = true;
          }
        }
    }
    
    return JSON.stringify({
      'studies_containing_trees_in_sea': studies_containing_trees_in_sea,
      'trees_in_sea': trees_in_sea,
      'rows_count': rows_count
    });
  }
  catch (err) {
    console.error(err);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

perform_check_trees_in_sea();