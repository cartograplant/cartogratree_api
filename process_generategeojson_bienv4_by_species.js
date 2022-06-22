const { PerformanceObserver, performance } = require('perf_hooks');
const config = require('./config');
var pg_native_client = require('pg-native');
var fs = require('fs');

var geojson_dir = './geojson';
if (!fs.existsSync(geojson_dir)){
    fs.mkdirSync(geojson_dir);
}

var mbtiles_dir = './mbtiles';
if (!fs.existsSync(mbtiles_dir)){
    fs.mkdirSync(mbtiles_dir);
}


function perform_generategeojson_bienv4_by_species_import(in_species, generate_mbtiles) {
	generate_mbtiles = generate_mbtiles.toLowerCase();
	var species_format_filename = 'bienv4_' + in_species.toLowerCase();
	species_format_filename = species_format_filename.replace(/ /g, "_");
	var geojson_filename = geojson_dir +  '/' + species_format_filename + '.geojson.json';	
	//Delete the file if it exists to regenerate it
	try {
		if (true) {
			fs.unlink(geojson_filename,
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

	var pg_n_client_bienv4 = new pg_native_client();
	console.log('[BIENv4 GENERATE GEOJSON BIENV4 BY SPECIES] Searching for species: ' + in_species);
	console.log('[BIENv4 GENERATE GEOJSON BIENV4 BY SPECIES] Connecting to BIENv4 public database server');
	pg_n_client_bienv4.connectSync('postgresql://' + config.conf_bienv4.user + ':' + config.conf_bienv4.password + '@' + config.conf_bienv4.host + ':' + config.conf_bienv4.port + '/' + config.conf_bienv4.database + '');

	//Perform Query
	var rows_bien_trees_rows = pg_n_client_bienv4.querySync("SELECT taxonobservation_id, scrubbed_species_binomial, scrubbed_genus, scrubbed_family, higher_plant_group, latitude, longitude FROM view_full_occurrence_individual WHERE scrubbed_species_binomial = '" + in_species + "';");
	console.log('[BIENv4 GENERATE GEOJSON BIENV4 BY SPECIES] Found ' + rows_bien_trees_rows.length +  ' for species ' + in_species);
	for(k=0; k<rows_bien_trees_rows.length; k++) {
		var uniquename = 'bien.' + rows_bien_trees_rows[k].taxonobservation_id;
		var species = rows_bien_trees_rows[k].scrubbed_species_binomial;
		var genus = rows_bien_trees_rows[k].scrubbed_genus;
		var family = rows_bien_trees_rows[k].scrubbed_family;
		var latitude = rows_bien_trees_rows[k].latitude;
		var longitude = rows_bien_trees_rows[k].longitude;


		//Try to make this easy by creating a json object

		//This is uncompressed
		var json_text_uncmp = '';
		if(latitude != null && longitude != null) {
			json_text_uncmp = '{"type":"Feature","properties":{"id":"' + uniquename + '","icon_type":0,"genus":"' + genus + '", "species":"' + species + '", "family":"' + family + '"},"geometry":{"type":"Point","coordinates":[' + longitude + ',' + latitude + ']}}' + "\r\n";
		}
		if(k == 0) { //If first line/record, add the opening bracket
			json_text_uncmp = '[' + json_text_uncmp;
		}
		else if(k == (rows_bien_trees_rows.length -1)) { //If last line/record, add the closing bracket
			json_text_uncmp = ',' + json_text_uncmp + ']';
		}
		else {
			json_text_uncmp = ',' + json_text_uncmp; //Records in between
		}

		//Remove any rows where latitude and longitude are nulls
		if(latitude == null && longitude == null && json_text_uncmp == ',') {
			json_text_uncmp = '';
		}



		//TODO: Write output to geojson file
		fs.appendFileSync(geojson_filename, json_text_uncmp);
	}
	console.log('[BIENv4 GENERATE GEOJSON BIENV4 BY SPECIES] COMPLETED ' + rows_bien_trees_rows.length +  ' for species ' + in_species);
	console.log('[BIENv4 GENERATE GEOJSON BIENV4 BY SPECIES] GEOJSON FILE GENERATED: ' + geojson_filename);

	if(generate_mbtiles == 'true') {
		console.log('[BIENv4 GENERATE GEOJSON BIENV4 BY SPECIES] GENERATE MBTILE for species: ' + in_species);
		const { exec } = require("child_process");

		exec("./tippecanoe/tippecanoe --force -zg -o " + mbtiles_dir + '/' + species_format_filename + ".mbtiles --drop-densest-as-needed " + geojson_filename, (error, stdout, stderr) => {
			if (error) {
				console.log(`error: ${error.message}`);
				//return;
			}
			if (stderr) {
				console.log(`stderr: ${stderr}`);
				//return;
			}
			console.log(`stdout: ${stdout}`);
			console.log('[BIENv4 GENERATE GEOJSON BIENV4 BY SPECIES] MBTILE FILE GENERATED for species: ' + in_species);
		});		
	}
}

//console.log("This is a test");
process.on('message', (msg) => {
	console.log('Message from parent:', msg);
	var result = JSON.parse(msg);
	if(result.species != '' && result.species != undefined) {
		var generate_mbtiles = false;
		if(result.mbtiles != '' && result.mbtiles != undefined) {
			generate_mbtiles = result.mbtiles; 
		}
		perform_generategeojson_bienv4_by_species_import(result.species, generate_mbtiles);
	}
	else {
		console.log('[perform_generategeojson_bienv4_by_species_import] No species was specified. Not executed.');
	}
});
