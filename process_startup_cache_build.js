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

async function perform_startup_cache_build() {
    try {
        if(config.conf.startup_cache_build_studies == true) {
            var prefix = '[PROCESS_STARTUP_CACHE_BUILD]';
            var pg_n_client_tg = new pg_native_client(); //Connect to TreeGenes Database server
            pg_n_client_tg.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
            
            var accessions_rows = pg_n_client_tg.querySync("SELECT distinct(accession) FROM chado.tpps_study_summary ORDER BY accession ASC;");
            console.log(prefix + ' CACHE WARM UP TGDR Studies count: ' + accessions_rows.length);
            for(k=0; k < accessions_rows.length; k++) {
                var accession = accessions_rows[k].accession;
                
                //Warm up the cache for this specific accession
                console.log(prefix + ' CACHE WARM UP WITH TGDR Study: ' + accession);
                var query_str = "SELECT DISTINCT ON(uniquename) * FROM ct_trees_all_view WHERE (uniquename ILIKE '" + accession + "%') AND (source_id = 0 OR source_id = 1 OR source_id = 2)";
                var rows = pg_n_client_tg.querySync(query_str);

                var tree_features = {"features":[], "center":[null, null]};
                var most_common = 0;
                var coords_to_freq = {};
                var freq_to_coords = {};
                var unq_species = {};
                var unq_pub = {};
                var tree_count = 0;
                for (var i = 0; i < rows.length; i++) {
                    var curr_tree = {"type": "Feature"};
                    curr_tree["properties"] = {"id": rows[i].uniquename, "icon_type": rows[i].icon_type};
                    curr_tree["geometry"] = {"type": "point", "coordinates": [rows[i].longitude, rows[i].latitude]};
                    if (rows[i].accession != null && rows[i].accession.length > 0) {
                        unq_pub[rows[i].accession] = true;
                    }						
                    if (rows[i].species.length > 0) {
                        unq_species[rows[i].species] = true;	
                    }
                        
                    var coords_key = rows[i].longitude + "_" + rows[i].latitude;
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
                tree_features["num_species"] = Object.keys(unq_species).length;
                tree_features["unq_species"] = unq_species;
                tree_features["num_pubs"] = Object.keys(unq_pub).length;
                tree_features["num_trees"] = tree_count;

                //ct_cache.put(query_str, tree_features, cache_time_24);
                //console.log(prefix + ' FINISHED LOADING TGDR Study: ' + accession + ' INTO CACHE');
                var result = {'accession': accession,'query_str': query_str, 'tree_features': tree_features};   
                process.send(JSON.stringify(result));
                await sleep(500); // Basically allows the cache to be written from parent process
            }
    
            console.log(prefix + ' Waiting 2 seconds before proceeding to warm up species data...');
            await sleep(2000);
        }

        if(config.conf.startup_cache_build_species == true) {
            var species_rows = pg_n_client_tg.querySync("SELECT DISTINCT(species) FROM ct_trees WHERE source_id IN (0,1,2) ORDER BY species ASC;");
            console.log(prefix + ' CACHE WARM UP Species count: ' + species_rows.length);
            for(k=0; k < species_rows.length; k++) {
                var species = species_rows[k].species;
                
                //Warm up the cache for this specific accession
                console.log(prefix + ' CACHE WARM UP WITH Species: ' + species);
                var query_str = "SELECT DISTINCT ON(uniquename) * FROM ct_trees_all_view WHERE (species = '" + species + "') AND (source_id = 0 OR source_id = 1 OR source_id = 2)";
                var rows = pg_n_client_tg.querySync(query_str);

                var tree_features = {"features":[], "center":[null, null]};
                var most_common = 0;
                var coords_to_freq = {};
                var freq_to_coords = {};
                var unq_species = {};
                var unq_pub = {};
                var tree_count = 0;
                for (var i = 0; i < rows.length; i++) {
                    var curr_tree = {"type": "Feature"};
                    curr_tree["properties"] = {"id": rows[i].uniquename, "icon_type": rows[i].icon_type};
                    curr_tree["geometry"] = {"type": "point", "coordinates": [rows[i].longitude, rows[i].latitude]};
                    if (rows[i].accession != null && rows[i].accession.length > 0) {
                        unq_pub[rows[i].accession] = true;
                    }						
                    if (rows[i].species.length > 0) {
                        unq_species[rows[i].species] = true;	
                    }
                        
                    var coords_key = rows[i].longitude + "_" + rows[i].latitude;
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
                tree_features["num_species"] = Object.keys(unq_species).length;
                tree_features["unq_species"] = unq_species;
                tree_features["num_pubs"] = Object.keys(unq_pub).length;
                tree_features["num_trees"] = tree_count;

                //ct_cache.put(query_str, tree_features, cache_time_24);
                //console.log(prefix + ' FINISHED LOADING TGDR Study: ' + accession + ' INTO CACHE');
                var result = {'species': species,'query_str': query_str, 'tree_features': tree_features};   
                process.send(JSON.stringify(result)); 
                await sleep(500); // Basically allows the cache to be written from parent process
            }  
        }      
    }
    catch(err) {
        console.log('[ERROR] process_startup_cache_build.js');
        console.log(err);
    }

}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

perform_startup_cache_build();