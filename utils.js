const crypto = require("crypto"); //For mining bitcoins
const request = require("request");
const { Pool, Client } = require("pg"); 
const fs = require('fs');
const config = require('./config');
const query = require("./query");
var pg_native_client = require('pg-native');


const pool = new Pool({
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	database: process.env.DB_NAME,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	max: 5,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 5000, 
});

var treesnap_terms = [];
var treesnap_terms_tree_total = 0;
var treesnap_terms_tree_current = 0;

var treesnap_location_errors = 0;
var treesnap_location_manual = 0;
var treesnap_location_all = 0;
var treesnap_api_terms = [];
var treesnap_otherlabel_values = [];

function treesnap_add_get_terms_only(base_url) {
	try {
		console.log('Attempting to pull treesnap data for terms from:' + base_url);
		const treesnap_max = 100;	
		var options = {
			uri: base_url + "&per_page=" + treesnap_max, 
			method: "GET",
			headers: {
				"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
				"Accept": "application/json",
				'Cache-Control': 'no-cache'
			},
		}

		treesnap_api_terms = [];
		treesnap_otherlabel_values = [];

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
				url: base_url + "&per_page=" + treesnap_max,
				headers: {
					"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
					"Accept": "application/json",
					'Cache-Control': 'no-cache'
				}
			}).then(function(response) {
				try {
					var data = response.data;
					// console.log('data', data);
					treesnap_terms_tree_total = treesnap_terms_tree_total + data.data.length;
					for (var i = 0; i < data.data.length; i++) {
						treesnap_terms_tree_current = treesnap_terms_tree_current + 1;
						var tree_data = data.data[i];
						
						
						treesnap_add_row_get_terms_only(tree_data,treesnap_terms_tree_current, data.next_page_url);
					}
					//console.log(data.next_page_url);
					if (data.next_page_url != null) {
						treesnap_add_get_terms_only(data.next_page_url);
					}
				}
				catch (err) {
					console.log(err);
				}
			}).catch(function (err) {
				console.log(err);
			})
		}
		catch (err) {
			console.log(err);
		}

		// DEPRECATED CODE
		// var req_result = request(options, function(error, response, body) {
		// 	if (error) {
		// 		console.log(error);
		// 		// response.status(400);
		// 		return;
		// 	}

		// 	if (response.statusCode == 200) {
		// 		//console.log(JSON.parse(body).data);
		// 		var data = JSON.parse(body).data;
		// 		treesnap_terms_tree_total = treesnap_terms_tree_total + data.data.length;
		// 		for (var i = 0; i < data.data.length; i++) {
		// 			treesnap_terms_tree_current = treesnap_terms_tree_current + 1;
		// 			var tree_data = data.data[i];
					
					
		// 			treesnap_add_row_get_terms_only(tree_data,treesnap_terms_tree_current, data.next_page_url);
		// 		}
		// 		//console.log(data.next_page_url);
		// 		if (data.next_page_url != null) {
					
		// 			treesnap_add_get_terms_only(data.next_page_url);
					
		// 		}
		// 	}
		// 	else {
		// 		console.log('ERROR Response code from the API was:' + response.statusCode);
		// 	}
		// });
		return;
	}
	catch (err) {
		console.log(err);
	}
}

function treesnap_add_row_get_terms_only(tree_data, treesnap_terms_tree_current, hasNextPage) {
	console.log('TreeSnap ID:' + tree_data["id"]);
	console.log("Current count:"  + treesnap_terms_tree_current + " Total count:" + treesnap_terms_tree_total);

	Object.keys(tree_data).forEach(function(key,index) {
		//console.log('Term found: ' + key);
		if(treesnap_api_terms.includes(key) != true) {
			treesnap_api_terms.push(key);
			//console.log('Treesnap term: ' + key + ' saved in array');
		}
	});

	//Object.keys(tree_data['data']).forEach(function(key,index) {
		//console.log('Term found: ' + key);
		if(treesnap_otherlabel_values.includes(tree_data['meta_data']['otherLabel']) != true) {
			treesnap_otherlabel_values.push(tree_data['meta_data']['otherLabel']);
			//console.log('Treesnap term: ' + key + ' saved in array');
		}
	//});

	treesnap_location_all = treesnap_location_all + 1;
	if(tree_data["location_accuracy"] == "-1") {
		treesnap_location_errors = treesnap_location_errors + 1;
	}

	if(tree_data["location_accuracy"] == "-2") {
		treesnap_location_manual = treesnap_location_manual + 1;
	}	
	// console.log(treesnap_location_all + ',' + treesnap_location_manual + ',' + treesnap_location_errors + ',' + tree_data["location_accuracy"]);

	if (tree_data["species"].toLowerCase() != "unknown" && tree_data["genus"].toLowerCase() != "unknown" && tree_data["location_accuracy"] != "-2") {
		Object.keys(tree_data['meta_data']).forEach(function(key,index) {
			//console.log('Term found: ' + key);
			if(treesnap_terms.includes(key) != true) {
				treesnap_terms.push(key);
				//console.log('Treesnap term: ' + key + ' saved in array');
			}


			// key: the name of the object key
			// index: the ordinal position of the key within the object 

		});	
	}
	else {
		// console.log('DENIED:');
		// console.log(tree_data);
	}
	if(treesnap_terms_tree_total == treesnap_terms_tree_current && hasNextPage == null) {
		/*
		console.log("Treesnap Terms:");
		console.log(treesnap_terms);
		console.log("TreeSnap API Terms:");
		console.log(treesnap_api_terms);
		console.log("TreeSnap Other Label Values:");
		console.log(treesnap_otherlabel_values);
		console.log('Treesnap Location Errors: '  + treesnap_location_errors);
		console.log('Treesnap Location Manual: ' + treesnap_location_manual);
		console.log('Treesnap Location All: ' + treesnap_location_all);
		*/
		try {
			fs.unlinkSync("treesnap_terms.txt");
			//file removed
		  } catch(err) {
			console.error(err)
		  }
		for(var i=0; i< treesnap_terms.length; i++) {
			// fs.appendFileSync('treesnap_terms.txt', treesnap_terms[i] + "\n");
		}
		var today = new Date().toISOString().slice(0, 10)
		var string_output = "Treesnap latest terms (" + treesnap_terms.length + ") [" + today + "]: ";
		for(var i=0; i< treesnap_terms.length; i++) {
			if(i==0) {
				string_output += treesnap_terms[i];
			}
			else {
				string_output += ", " + treesnap_terms[i];			
			}
		}

		// Update the Stats channel in slack
		// http://tghub.org/tghubbot/api/message?k=changeme123&c=' . $channel_name . '&m=' . urlencode($answer_offline));
		var options = {
			uri: "http://treegenesdb.org/tghubbot/api/message?k=" + config.conf.slack_channel_post_password + "&c=stats&m=" + encodeURI(string_output), 
			method: "GET",
			headers: {
			},
		}
	
		var req_result = request(options, function(error, response, body) {
			if (error) {
				console.log(error);
				res.status(400);
				return;
			}
		});				
	}
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
  }



async function treesnap_add(base_url) {
	try {
		console.log('Attempting to pull treesnap data from:' + base_url);
		const treesnap_max = 100;	
		var options = {
			uri: base_url + "&per_page=" + treesnap_max, 
			method: "GET",
			headers: {
				"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
				"Accept": "application/json",
				'Cache-Control': 'no-cache'
			},
		}

		var axios = require('axios');
		var https = require('https');
	
		const axios_instance = axios.create({
			httpsAgent: new https.Agent({  
			  rejectUnauthorized: false
			})
		});

		try {
			var url = base_url + "&per_page=" + treesnap_max;
			console.log('URL:' + url);
			var config = {
				method: 'get',
				url: url,
				headers: {
					"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
					"Accept": "application/json",
					'Cache-Control': 'no-cache'
				}
			}
			// console.log(config);
			axios_instance(config).then(async function(response) {
				try {
					console.log(Object.keys(response));
					var data = response.data;
					data = data.data; // boy is this confusing but okay
					console.log('Keys:' + Object.keys(data.data));
					console.log('Trees count:' + data.data.length);
					// var fs = require('fs');
					// fs.appendFileSync('treesnap.json', JSON.stringify(data.data) + "\n");
					for (var i = 0; i < data.data.length; i++) {
						var tree_data = data.data[i];
						try {
							await treesnap_add_row(tree_data);
						}
						catch (err) {
							console.log(err);
						}
					}
					if (data.next_page_url != null) {
						console.log('Next page URL: ' + data.next_page_url);
						treesnap_add(data.next_page_url);
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
		// var req_result = request(options, function(error, response, body) {
		// 	if (error) {
		// 		console.log(error);
		// 		//res.status(400);
		// 		return;
		// 	}

		// 	if (response.statusCode == 200) {
		// 		//console.log(JSON.parse(body).data);
		// 		var data = JSON.parse(body).data;
		// 		for (var i = 0; i < data.data.length; i++) {

		// 			var tree_data = data.data[i];
		// 			treesnap_add_row(tree_data);
					
		// 			/*
		// 			if (tree_data["species"] != "Unknown" && tree_data["genus"] != "Unknown") {

		// 				pool.query("INSERT INTO ct_trees_treesnap (uniquename, species, genus, family, subkingdom, latitude, longitude, source_id, icon_type) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(uniquename) DO NOTHING",
		// 					["treesnap." + tree_data["id"], tree_data["genus"] + " " + tree_data["species"], tree_data["genus"], null, null, tree_data["latitude"], tree_data["longitude"], 1, 4],
		// 					function (err, result) {
		// 						if (err) {
		// 							console.log(err);
		// 							return;
		// 						}
								
		// 						//console.log(tree_data['meta_data']);
								
		// 						if(tree_data['meta_data'].diameterNumeric_values != undefined) {
		// 							pool.query("INSERT INTO public.ct_trees_phenotypes_treesnap (tree_acc,phenotype_name,value,units) VALUES ($1,$2,$3,$4)",
		// 								["treesnap." + tree_data["id"], "diameter", tree_data['meta_data'].diameterNumeric_values.US_value, tree_data['meta_data'].diameterNumeric_values.US_unit], function(err, result) {
		// 								if(err) {
		// 									console.log(err);
		// 									return;
		// 								}
		// 								//nothing to do
		// 							});
		// 						}
								
		// 					}
		// 				);
		// 			}
		// 			*/
		// 		}
		// 		//console.log(data.next_page_url);
		// 		if (data.next_page_url != null) {
		// 			treesnap_add(data.next_page_url);
		// 		}
		// 	}
		// 	else {
		// 		console.log('ERROR Response code from the API was:' + response.statusCode);
		// 	}
		// });
		return;
	}
	catch (err) {
		console.log(err);
	}

}

async function mama_ash_eab_surveys_clear_trees() {
	const client = await pool.connect();
	await client.query("DELETE FROM public.ct_trees_mama_ash_eab_surveys");
    client.release();
}

async function mama_ash_eab_surveys_add_tree(tree_id, item) {
	// Each item has a rows key which contains field data like phenotypic data
    // Each item has a rows key which contains field data like phenotypic data
    console.log('Attempt to add MAMA TREE ID:' + item.id);
    const client = await pool.connect();
    var is_private = null;
    // We need to still go through all rows within this item to get to 'Ash species identification' to set black ash to is_private = 0
    var rows = item.rows;

    for (var j = 0; j < rows.length; j++) {
		var genus = null;
		var species = null;
        var row = rows[j];
        var fields = row.fields;
        for (var j = 0; j < fields.length; j++) {
            try {
                var field = fields[j];
                var value = null;
                var slug = field['slug'];
                var name = field['name'];
                if (slug.includes('ash-species-identification')) {
                    console.log('Detected an ash-species-identification for tree :' + tree_id);
                    if (field['value'] != null && field['value'] != 'null') {
                        value = field['value'];
                    }
                    else if (field['value_id'] != null) {
                        // Lookup frrom the picklist objects
                        for (var k = 0; k < field['picklist'].length; k++) {
                            var picklist_item = field['picklist'][k];
                            if (picklist_item['id'] == field['value_id']) {
                                value = picklist_item['value'];
                                break;
                            }
                        }
                    }
					
                    if (value != null && value != '') {
						
						var lower_value = value.toLowerCase();
						console.log("value:" + lower_value);
						if (lower_value.includes('black ash') || lower_value.includes('nigra')) {
							is_private = 1;
							genus = 'Fraxinus';
							species = genus + ' nigra';
						}
						else if (lower_value.includes('ash sp')) {
							genus = 'Fraxinus';
							species = null;
						}
						else if (lower_value.includes('white ash') || lower_value.includes('americana')) {
							genus = 'Fraxinus';
							species = genus + ' americana';
						}		
						else if (lower_value.includes('green ash') || lower_value.includes('pennsylvanica')) {
							genus = 'Fraxinus';
							species = genus + ' pennsylvanica';
						}
						else if (lower_value.includes('blue ash') || lower_value.includes('quadrangulata')) {
							genus = 'Fraxinus';
							species = genus + ' quadrangulata';
						}				
						else if (lower_value.includes('pumpkin ash') || lower_value.includes('profunda')) {
							genus = 'Fraxinus';
							species = genus + ' profunda';
						}
						else if (lower_value.includes('not sure if this is ash')) {
							genus = 'Fraxinus (unconfirmed)';
							species = null;
						}
                    }
                }
            }
            catch (err) {
                console.log(err);
            }
        }
    }

	// Add jitter to the lat and lng values
	var lat = item.location.lat;
	var lng = item.location.lng; 

	// LATITUDE
	// 1 degree of latitude is approximately 111 kilometers (69 miles). 
	// 0.1 degrees of latitude is approximately 11.1 kilometers (6.9 miles). 
	// 0.01 degrees of latitude is approximately 1.11 kilometers (0.69 miles). 
	// 0.001 degrees of latitude is approximately 111 meters (364 feet). 

	// LONGITUDE
	// One decimal place: Distinguishes between large regions or countries. 
	// Two decimal places: Can identify a large city or district. 
	// Three decimal places: Represents a distance of roughly 111 meters. 
	// Four decimal places: Represents a distance of roughly 11.1 meters. 
	// Five decimal places: Represents a distance of roughly 1.11 meters. 
	// Six decimal places: Represents a distance of roughly 0.111 meters. 

	var jitter = 0.01; // + or - will depend on what the value is in the original lat and lng
	var lat_jittered = '';
	var lng_jittered = '';


	var randomInt = Math.floor(Math.random() * 5) + 1; // random between 1 and 5
	var randomChoice = Math.floor(Math.random() * 2) + 1; // random between 1 (negative) and 2 (positive)
	var generated_jitter = 0;
	if (randomChoice == 1) {
		generated_jitter = jitter * randomInt * -1;
	}
	else {
		generated_jitter = jitter * randomInt;
	}
	lat_jittered = parseFloat(lat) + generated_jitter;

	var randomInt = Math.floor(Math.random() * 5) + 1; // random between 1 and 5
	var randomChoice = Math.floor(Math.random() * 2) + 1; // random between 1 (negative) and 2 (positive)
	var generated_jitter = 0;
	if (randomChoice == 1) {
		generated_jitter = jitter * randomInt * -1;
	}
	else {
		generated_jitter = jitter * randomInt;
	}
	lng_jittered = parseFloat(lng) + generated_jitter;

	
    await client.query(
		"INSERT INTO public.ct_trees_mama_ash_eab_surveys " + 
		"(uniquename, species, genus, family, subkingdom, latitude, longitude, source_id, icon_type, category, is_private, latitude_precise, longitude_precise) " + 
		"VALUES($1, $2,      $3,   $4,   $5,          $6,                $7,       $8, $9, $10,      $11,    $12,          $13) ON CONFLICT(uniquename) DO NOTHING",
        [tree_id, species, genus, null, null,   lat_jittered, lng_jittered, 6, 4, null, is_private, item.location.lat, item.location.lng]);
    client.release();
}

async function mama_ash_eab_surveys_clear_phenotypes() {
	const client = await pool.connect();
	await client.query("DELETE FROM public.ct_trees_phenotypes_mama_ash_eab_surveys");
    client.release();
}

async function mama_ash_eab_surveys_add_phenotype_rows(tree_id, fields) {
	// Each item has a rows key which contains field data like phenotypic data
	const client = await pool.connect()
	for (var j = 0; j < fields.length; j++) {
		try {
			var field = fields[j];
			var value = null;
			var slug = field['slug'];
			var name = field['name'];
			console.log('Attempt to add MAMA PHENOTYPE:' + slug);
			if (field['value'] != null) {
				value = field['value'];
			}
			else if (field['value_id'] != null) {
				// Lookup frrom the picklist objects
				for (var k = 0; k < field['picklist'].length; k++) {
					var picklist_item = field['picklist'][k];
					if (picklist_item['id'] == field['value_id']) {
						value = picklist_item['value'];
						break;
					}
				}
			}
			else if (field['uploads'] != null && field['uploads'].length > 0) {
				// This is a file upload, so we need to get the first one
				value = field['uploads'][0]['url'];
			}
			if (value != null && value != '' && value != 'null') {
				// var name = slug;
				var structure = null;
				var structure_id = null;
				var attribute = null;
				var cvterm_1_name = null;
				var cvterm_1_id = null;
				var cvterm_2_name = null;
				var cvterm_2_id = null;
				var unit = null;
				var valid_phenotype = false;
				switch (name) {
					case 'Multiple D-shaped holes?':
						name = 'presence of D shaped holes in bark'
						structure = 'bark';
						structure_id = 52702;
						attribute = 'presence';
						cvterm_1_name = 'fenestrated';
						cvterm_1_id = 137595;
						unit = 'binary';
						unit_id = 51085;
						valid_phenotype = true;
						break;
					case 'Distinctive EAB larvae?':
						name = 'presence of emerald ash borer larvae'
						structure = 'whole plant';
						structure_id = '52336';
						attribute = 'presence';
						cvterm_1_name = 'emerald ash borer';
						cvterm_1_id = 143002;
						cvterm_2_name = 'larva';
						cvterm_2_id = 136785;
						unit = 'binary';
						unit_id = 51085
						valid_phenotype = true;
						break;
					case 'Add photo of distinctive EAB larvae':
						name = 'photo of emerald ash borer larvae'
						structure = 'whole plant';
						structure_id = '2749';
						attribute = 'image';
						cvterm_1_name = 'emerald ash borer';
						cvterm_1_id = 143002;
						cvterm_2_name = 'larva';
						cvterm_2_id = 136785
						unit = 'image';
						unit_id = 2749;
						valid_phenotype = true;
						break;
				}
				//if (valid_phenotype == true) {
					await client.query(
						"INSERT INTO public.ct_trees_phenotypes_mama_ash_eab_surveys " +
						//      1         2       3        4            5          6    7         8                 9                 10            11              12              13                 14           15         16            17             18             19
						" (uniquename, tree_acc,name,mapped_name,phenotype_name,value,units,observable_name,observable_accession,cvterm_name,cvterm_accession,structure_name,structure_accession, structure_id, unit_id, cvterm_1_name, cvterm_1_id, cvterm_2_name, cvterm_2_id) " + 
						" VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT(uniquename) DO NOTHING",
						//          1              2     3    4    5    6    7       8      9    10   11     12       13       14          15          16           17           18              19
						[tree_id + "." + slug, tree_id,name,null,slug,value,unit,attribute,null,null,null,structure, null, structure_id, unit_id, cvterm_1_name, cvterm_1_id, cvterm_2_name, cvterm_2_id]
					);
				// }
			}
		}
		catch (err) {
			console.log(err);
		}
	}
	client.release();
}

async function download_treesnap_image(tree_data, image_category, icimages_index, image_link) {

	const https = require('https');
	const fs = require('fs');

	var images_directory = '/isg/treegenes/evome/image_data';
	fs.mkdirSync(images_directory, { recursive: true});

	const fileUrl = image_link;
						
	var filename = new URL(image_link).pathname.split('/').pop();
	console.log(filename)
	var file_ext = ''

	if (filename.toLowerCase().includes('.jpg') == true || filename.toLowerCase().includes('.jpeg') == true) {
		file_ext = '.jpg'
	}
	else if (filename.toLowerCase().includes('.png') == true) {
		file_ext = '.png'
	}
	else {
		file_ext = '.unsupported'
	}
	const destination = images_directory + '/'  + tree_data['id'] + '_' + image_category.toLowerCase().replaceAll(" ", "_") + '_' + (icimages_index + 1) + file_ext;

	const file = fs.createWriteStream(destination);

	https.get(fileUrl, (response) => {
		response.pipe(file);
		file.on('finish', () => {
			file.close(() => {
				console.log('File downloaded successfully');
			});
		});
	}).on('error', (err) => {
		fs.unlink(destination, () => {
			console.error('Error downloading file:', err);
		});
	});
}

async function treesnap_add_row(tree_data) {
	console.log('TreeSnap ID:' + tree_data["id"]);
	// console.log(tree_data);
	if (tree_data["location_accuracy"] != "-1" && tree_data["location_accuracy"] != "-2") {
		// if(tree_data["species"] == "Unknown" || tree_data["genus"] == "Unknown") {
		// 10/1/2024 Temporarily replaced the Unknown checks to get Alaskan Willow data into the db
		if(tree_data["species"] == "Dummyval") {
			// Try to populate using otherLabel(treesnap) which translates to TG common_name (organism table)
			var otherLabel = tree_data["meta_data"]["otherLabel"];
			// console.log("otherLabel:" + otherLabel);
			if (otherLabel == undefined || otherLabel == "undefined" || otherLabel == "Other" || otherLabel == "Unknown" || otherLabel == "unknown") {
				return; // don't continue to add this tree
			}
			else {
				// Let's make otherlabel lower case
				otherLabel = otherLabel.toLowerCase();
				// Most likely got the otherLabel, try to query db
				//var pg_n_client_tg = new pg_native_client(); //Connect to TreeGenes Database server synchronously
				//pg_n_client_tg.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				var cn_rows = await pool.query("SELECT distinct(lower(common_name)) as common_name, genus, species FROM chado.organism WHERE lower(common_name) = $1;",[otherLabel]);
				// pg_n_client_tg.end(); //Disconnect from TreeGenes database server
				if(cn_rows.length > 0) {
					// we found a match in the db that has the common_name and genus and species!
					//console.log("Found a match for otherLabel and common_name");
					//console.log(cn_rows[0]);
					tree_data["genus"] = cn_rows[0].genus;
					tree_data["species"] = cn_rows[0].species;
				}
				else {
					return; // don't continue to add this tree
				}
			}
		}
		else {
			// continue like normal, no mods necessary
		}
		// fs.appendFileSync('meta_data.txt', JSON.stringify(tree_data['meta_data']) + "\n");
		// console.log('[TREESNAP] INSERTING TREESNAP TREE');
		var category = null;
		var category_lowercase = '';
		if (tree_data['category'] != undefined) {
			category = tree_data['category'];
			category_lowercase = category.toLowerCase();
			// console.log(category + ' vs ' + category_lowercase);
			if (category_lowercase == 'alaskan willow') {
				console.log('Found alaskan willow category');
				tree_data["genus"] = 'Salix'; // Default Genus
				var willowSpecies = tree_data['meta_data']['willowSpecies'];
				if (willowSpecies != undefined) {
					var species_parts = willowSpecies.split(' ');
					if (species_parts.length >= 2) {
						tree_data["genus"] = species_parts[0];
						tree_data["species"] = species_parts[1];
					}
				}
				if (tree_data["species"] == "" || tree_data["species"] == "Unknown" || tree_data["species"] == "unknown" || tree_data["species"] == null || tree_data["species"] == undefined) {
					tree_data["species"] = 'spp.';
				}
			}
		}
		
		var latitude = "";
		var longitude = "";
		var latitude_precise = "";
		var longitude_precise = "";
		var is_private = 0;
		var submitter_email = null;
		if (tree_data['submitter_email'] != null && tree_data['submitter_email'] != undefined) {
			is_private = 1;
			submitter_email = tree_data['submitter_email'];
		}
		latitude = tree_data['fuzzy_latitude'];
		longitude = tree_data['fuzzy_longitude'];
		latitude_precise = tree_data['latitude'];
		longitude_precise = tree_data['longitude'];
		
		
		var submitter_email = tree_data['submitter_email'];
		if (submitter_email == undefined) {
			submitter_email = null;
		}


		// console.log(category_lowercase);
		if (category_lowercase == 'alaskan willow') {
			// console.log('Alaskan Willow inserted into EVOME table');
			var results = await pool.query("INSERT INTO public.ct_trees_evome (uniquename, species, genus, family, subkingdom, latitude, longitude, source_id, icon_type, category, latitude_precise, longitude_precise) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT(uniquename) DO NOTHING",
				["treesnap." + tree_data["id"], tree_data["genus"] + " " + tree_data["species"], tree_data["genus"], null, null, latitude, longitude, 5, 4, category, latitude_precise, longitude_precise]);

			try {

				var image_categories = Object.keys(tree_data["images"]);
				console.log(image_categories);
				// process.exit(1);
				for (var ic_index = 0; ic_index < image_categories.length; ic_index++) {
					var image_category = image_categories[ic_index];
					console.log(image_category);
					for (var icimages_index = 0; icimages_index < tree_data["images"][image_category].length; icimages_index++) {
						var image_link = tree_data["images"][image_category][icimages_index];
						console.log("Image link: " + image_link);
						download_treesnap_image(tree_data, image_category, icimages_index, image_link);

					}
				}
			}
			catch (err) {
				console.log(err)
				// process.exit(1);
			}
		}
		else {
			var results = await pool.query("INSERT INTO public.ct_trees_treesnap (uniquename, species, genus, family, subkingdom, latitude, longitude, source_id, icon_type, category, latitude_precise, longitude_precise, submitter_email) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT(uniquename) DO NOTHING",
				["treesnap." + tree_data["id"], tree_data["genus"] + " " + tree_data["species"], tree_data["genus"], null, null, latitude, longitude, 1, 4, category, latitude_precise, longitude_precise, submitter_email]);
		}
		//console.log(tree_data['meta_data']);
		// const client = await pool.connect()
		if(tree_data['meta_data'].diameterNumeric_values != undefined) {
			await pool.query("INSERT INTO public.ct_trees_phenotypes_treesnap (uniquename, tree_acc,name,mapped_name,phenotype_name,value,units,observable_name,observable_accession,structure_name,structure_accession) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(uniquename) DO NOTHING",
				["treesnap." + tree_data["id"] + ".diameter", "treesnap." + tree_data["id"],"diameter",'Diameter',"diameter", tree_data['meta_data'].diameterNumeric_values.US_value, tree_data['meta_data'].diameterNumeric_values.US_unit,"diameter","PATO:0001334","stem", "PO_0009047"]);
		}
		if(tree_data['meta_data'].heightNumeric_values != undefined) {
			await pool.query("INSERT INTO public.ct_trees_phenotypes_treesnap (uniquename, tree_acc,name,mapped_name,phenotype_name,value,units,observable_name,observable_accession,structure_name,structure_accession) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(uniquename) DO NOTHING",
				["treesnap." + tree_data["id"] + ".height", "treesnap." + tree_data["id"],"height",'Height',"height", tree_data['meta_data'].heightNumeric_values.US_value, tree_data['meta_data'].heightNumeric_values.US_unit,"height","PATO:0000119","whole plant", "PO:0000003"]);
		}
		

		var keys = Object.keys(tree_data['meta_data']);
		for (var ki = 0; ki<keys.length; ki++) {
			// key: the name of the object key
			var key = keys[ki];
			if(treesnap_terms.includes(key) != true) {
				// treesnap_terms.push(key);
				//console.log('Treesnap term: ' + key + ' saved in array');
			}
			//console.log(treesnap_terms);
			

			if(Array.isArray(tree_data['meta_data'][key]) !== true && typeof tree_data['meta_data'][key] !== 'object') {
				var phenotype_name = key;
				var value = tree_data['meta_data'][key];
				var units = '-';
				var confidence = '-';
				//console.log(phenotype_name + ":" + value);
				

				if(tree_data['meta_data'][phenotype_name + '_units'] && phenotype_name.includes('_units') == false) {
					//this should be the basic phenotype with the value, so value variable is correct
					if(tree_data['meta_data'][phenotype_name + '_units'] != undefined) {
						units = tree_data['meta_data'][phenotype_name + '_units'];
					}
					if(tree_data['meta_data'][phenotype_name + '_confidence'] != undefined) {
						if(tree_data['meta_data'][phenotype_name + '_confidence'] != null) {
							confidence = tree_data['meta_data'][phenotype_name + '_confidence'];
						}
					}
				}

				if(phenotype_name.includes('_units') == true || phenotype_name.includes('_confidence') == true) {
					phenotype_name = 'ignore';
				}


				if(phenotype_name != 'ignore') {
					//console.log('INSERTING phenotype_name:' + phenotype_name);
					var mapped_name = phenotype_name;
					var new_units = units;
					var structure = '';
					var structure_accession = '';
					var attribute = '';
					var attribute_accession = '';
					var additional_term = '';
					var additional_term_accession = '';
					
					switch(phenotype_name) {
						case 'acorns':
							mapped_name = 'Acorns present';
							new_units = 'ordinal';
							structure = 'seed';
							structure_accession = 'PO_0009010';
							attribute = 'amount';
							attribute_accession = 'PATO_0000070';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'bearingFruit':
							new_units = 'ordinal';
							structure = 'fruit';
							structure_accession = 'PO_0009001';
							attribute = 'amount';
							attribute_accession = 'PATO_0000070';
							additional_term = '';
							additional_term_accession = '';
							break;									
						case 'burrs':
							mapped_name = 'Burrs present';
							new_units = 'ordinal';
							structure = 'seed';
							structure_accession = 'PO_0009010';
							attribute = 'amount';
							attribute_accession = 'PATO_0000070';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'catkins':
							mapped_name = 'Catkins present';
							new_units = 'binary';
							structure = 'floral organ';
							structure_accession = 'PO_0030119';
							attribute = 'amount';
							attribute_accession = 'PATO_0000070';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'chestnutBlightSigns':
							mapped_name = 'Signs of chestnut blight';
							new_units = 'qualitative';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'damage';
							attribute_accession = 'PATO_0001020';
							additional_term = 'Cryphonectria parasitica';
							additional_term_accession = 'NCBITaxon_511';
							break;
						case 'cones':
							mapped_name = 'Cones present';
							new_units = 'binary';
							structure = 'floral organ';
							structure_accession = 'PO_0025395';
							attribute = 'amount';
							attribute_accession = 'PATO_0000070';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'conesMaleFemale':
							mapped_name = 'Male or female cones present';
							new_units = 'ordinal';
							structure = 'floral organ';
							structure_accession = 'PO_0025395';
							attribute = 'amount';
							attribute_accession = 'PATO_0000070';
							additional_term = '';
							additional_term_accession = '';
							break;	
						case 'crownClassification':
							mapped_name = 'Crown position relative to nearby trees';
							new_units = 'qualitative';
							structure = 'shoot system';
							structure_accession = 'PO_0009006';
							attribute = 'position';
							attribute_accession = 'PATO_0000140';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'crownDieback':
							new_units = 'qualitative';
							structure = 'shoot system';
							structure_accession = 'PO_0009006';
							attribute = 'lesioned';
							attribute_accession = 'PATO_0040025';
							additional_term = '';
							additional_term_accession = '';
							break;									
						case 'crownHealth':
							mapped_name = 'Crown health';
							new_units = 'ordinal';
							structure = 'shoot system';
							structure_accession = 'PO_0009006';
							attribute = 'damage';
							attribute_accession = 'PATO_0001020';
							additional_term = '';
							additional_term_accession = '';
							break;	
						case 'deerRub':
							mapped_name = 'Damage from deer rubbing';
							new_units = 'ordinal';
							structure = 'stem';
							structure_accession = 'PO_0009047';
							attribute = 'damage';
							attribute_accession = 'PATO_0001020';
							additional_term = 'Cervidae';
							additional_term_accession = 'NCBITaxon_9850';
							break;	
						case 'diameter':
							mapped_name = 'Diameter';
							new_units = units;
							structure = 'stem';
							structure_accession = 'PO_0009047';
							attribute = 'diameter';
							attribute_accession = 'PATO_0001334';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'diameterNumeric':
							mapped_name = 'Diameter';
							new_units = units;
							structure = 'stem';
							structure_accession = 'PO_0009047';
							attribute = 'diameter';
							attribute_accession = 'PATO_0001334';
							additional_term = '';
							additional_term_accession = '';
							break;									
						case 'emeraldAshBorer':
							mapped_name = 'Signs of Emerald Ash Borer';
							new_units = 'qualitative';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'damage';
							attribute_accession = 'PATO_0001020';
							additional_term = 'Agrilus planipennis';
							additional_term_accession = 'NCBITaxon_224129';
							break;	
						case 'flowersBinary':
							mapped_name = 'Flowers present (binary)';
							new_units = 'binary';
							structure = 'floral organ';
							structure_accession = 'PO_0025395';
							attribute = 'amount';
							attribute_accession = 'PATO_0000070';
							additional_term = '';
							additional_term_accession = '';
							break;	
						case 'height':
							mapped_name = 'Height';
							new_units = units;
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'height';
							attribute_accession = 'PATO_0000119';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'heightNumeric':
							mapped_name = 'Height';
							new_units = units;
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'height';
							attribute_accession = 'PATO_0000119';
							additional_term = '';
							additional_term_accession = '';
							break;										
						case 'heightFirstBranch':
							mapped_name = 'Height of first branch';
							new_units = units;
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'height';
							attribute_accession = 'PATO_0000119';
							additional_term = '';
							additional_term_accession = '';
							break;	
						case 'locationCharacteristics':
							mapped_name = 'Location type';
							new_units = 'qualitative';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'ecological environment exposure';
							attribute_accession = 'PECO:0007064';
							additional_term = '';
							additional_term_accession = '';
							break;	
						case 'nearbyTrees':
							mapped_name = 'Health and size of nearby trees';
							new_units = 'qualitative';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'nearby tree health';
							attribute_accession = 'tg 57';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'needleAmount':
							mapped_name = 'Needle amount';
							new_units = 'binary';
							structure = 'vascular leaf';
							structure_accession = 'PO_0009025';
							attribute = 'amount';
							attribute_accession = 'PATO_0000070';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'needleColor':
							mapped_name = 'Needle color';
							new_units = 'qualitative';
							structure = 'vascular leaf';
							structure_accession = 'PO_0009025';
							attribute = 'color';
							attribute_accession = 'PATO_0000014';
							additional_term = '';
							additional_term_accession = '';
							break;		
						case 'numberRootSprouts':
							mapped_name = 'Number of root sprouts';
							new_units = 'discrete';
							structure = 'shoot system';
							structure_accession = 'PO_0009006';
							attribute = 'has number of';
							attribute_accession = 'PATO_0001555';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'oakHealthProblems':
							mapped_name = 'Signs of disease (oak)';
							new_units = 'qualitative';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'damage';
							attribute_accession = 'PATO_0001020';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'plantedWild':
							mapped_name = 'Wild or human-planted';
							new_units = 'binary';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'plant placement source';
							attribute_accession = 'tg 58';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'seedsBinary':
							mapped_name = 'Seeds present (binary)';
							new_units = 'binary';
							structure = 'seed';
							structure_accession = 'PO_0009010';
							attribute = 'amount';
							attribute_accession = 'PATO_0000070';
							additional_term = '';
							additional_term_accession = '';
							break;	
						case 'standTagging':
							mapped_name = 'Stand tagged (binary)';
							new_units = 'binary';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'labeled';
							attribute_accession = 'NCIT_C43386';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'torreyaFungalBlight':
							mapped_name = 'Signs of fungal blight on Torreya';
							new_units = 'qualitative';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'damage';
							attribute_accession = 'PATO_0001020';
							additional_term = 'Physalospora';
							additional_term_accession = 'NCBITaxon_186525';
							break;
						case 'treated':
							mapped_name = 'Treated (binary)';
							new_units = 'binary';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'plant exposure';
							attribute_accession = 'PECO:0001001';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'woollyAdesCoverage':
							mapped_name = 'Coverage of infection by wooly adelgid';
							new_units = 'qualitative';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'amount';
							attribute_accession = 'PATO_0000070';
							additional_term = 'Adelges tsugae';
							additional_term_accession = 'NCBITaxon_357502';
							break;
						case 'willowHeightNumeric':
							mapped_name = 'Plant height';
							new_units = units;
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'height';
							attribute_accession = 'PATO_0000119';
							additional_term = '';
							additional_term_accession = '';
							break;
						// case 'willowHeightNumeric [Measured]':
						// 	mapped_name = 'Plant height';
						// 	new_units = units;
						// 	structure = 'whole plant';
						// 	structure_accession = 'PO_0000003';
						// 	attribute = 'height';
						// 	attribute_accession = 'PATO_0000119';
						// 	additional_term = '';
						// 	additional_term_accession = '';
						// 	break;
						// case 'willowHeightNumeric [Estimated]':
						// 	mapped_name = 'Plant height, estimated';
						// 	new_units = units;
						// 	structure = 'whole plant';
						// 	structure_accession = 'PO_0000003';
						// 	attribute = 'height';
						// 	attribute_accession = 'PATO_0000119';
						// 	additional_term = '';
						// 	additional_term_accession = '';
						// 	break;
						case 'willowLeaves':
							mapped_name = 'Leaf description';
							new_units = 'no unit';
							structure = 'vascular leaf';
							structure_accession = 'PO_0009025';
							attribute = 'description';
							attribute_accession = 'SIO_000136';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'willowBranches':
							mapped_name = 'Branch description';
							new_units = 'no unit';
							structure = 'branch';
							structure_accession = 'PO_0025073';
							attribute = 'description';
							attribute_accession = 'SIO_000136';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'otherWillowSpecies':
							mapped_name = 'Willow species within 10m';
							new_units = 'nominal';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'proximity';
							attribute_accession = 'NCIT_C25633';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'nearbyWillowSpecies':
							mapped_name = 'Tree species within 10m';
							new_units = 'nominal';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'proximity';
							attribute_accession = 'NCIT_C25633';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'otherNearbyWillowSpecies':
							mapped_name = 'Species within 10m';
							new_units = 'nominal';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'proximity';
							attribute_accession = 'NCIT_C25633';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'streamEdgeDistance':
							mapped_name = 'Distance from plant to stream edge';
							new_units = 'ordinal';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'distance';
							attribute_accession = 'PATO_0000040';
							additional_term = '';
							additional_term_accession = '';
							break;
						case 'streamRunningDistance':
							mapped_name = 'Distance from plant to running water';
							new_units = 'ordinal';
							structure = 'whole plant';
							structure_accession = 'PO_0000003';
							attribute = 'distance';
							attribute_accession = 'PATO_0000041';
							additional_term = '';
							additional_term_accession = '';
							break;
					}

					// Cater for none phenotype data
					var is_phenotype = true;
					switch(phenotype_name) {
						case 'willowTreeSampleId':
							is_phenotype = false;
							break;

						case 'willowTreeLocation':
							is_phenotype = false;
							break;
					}
					
					if (is_phenotype == false) {
						await pool.query("INSERT INTO public.ct_trees_data_treesnap " +
						"(uniquename,                                                tree_acc,                   name,      phenotype_name,mapped_name,value,units,observable_name,observable_accession,cvterm_name,cvterm_accession,structure_name,structure_accession,confidence,cvterm_1_name,additional_term_accession) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(uniquename) DO NOTHING",
						["treesnap." + tree_data["id"] + "." + phenotype_name, "treesnap." + tree_data["id"],phenotype_name,phenotype_name,mapped_name,value,new_units,attribute,attribute_accession,phenotype_name,      "",            structure,structure_accession,confidence,additional_term,additional_term_accession]);	
					}
					if (is_phenotype == true) {
						if(value != "I'm not sure" && value != "Unknown" && value != "Not sure" && phenotype_name != "ashSpecies" && phenotype_name != "comment" && phenotype_name != "hybridTraits" && phenotype_name != "hybridAttributes" && phenotype_name != "otherLabel") {
							// console.log(phenotype_name + ',' + value + ',' + new_units);
							await pool.query("INSERT INTO public.ct_trees_phenotypes_treesnap " + 
								"(uniquename,                                                     tree_acc,               name,     phenotype_name,mapped_name,value,  units,  observable_name,  observable_accession, structure_name, structure_accession,confidence,cvterm_1_name,additional_term_accession) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(uniquename) DO NOTHING",
								["treesnap." + tree_data["id"] + "." + phenotype_name, "treesnap." + tree_data["id"],phenotype_name,phenotype_name,mapped_name,value,new_units, structure,        structure_accession,       structure, structure_accession,confidence,additional_term,additional_term_accession]);
						}
					}
				}
			}			
		}
		// client.release();

		
		// OLD CODE THAT DOESN'T WORK (MOST LIKELY A MEMORY OVERLOAD ISSUE)
		/*
		pool.query("INSERT INTO ct_trees_treesnap (uniquename, species, genus, family, subkingdom, latitude, longitude, source_id, icon_type) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(uniquename) DO NOTHING",
			["treesnap." + tree_data["id"], tree_data["genus"] + " " + tree_data["species"], tree_data["genus"], null, null, tree_data["latitude"], tree_data["longitude"], 1, 4],
			function (err, result) {
				if (err) {
					console.log(err);
					return;
				}
				console.log('[TREESNAP] TREE INSERT OCCURRED');
				
				//console.log(tree_data['meta_data']);
				if(tree_data['meta_data'].diameterNumeric_values != undefined) {
					pool.query("INSERT INTO public.ct_trees_phenotypes_treesnap (uniquename, tree_acc,name,mapped_name,phenotype_name,value,units,observable_name,observable_accession,cvterm_name,cvterm_accession,structure_name,structure_accession) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(uniquename) DO NOTHING",
						["treesnap." + tree_data["id"] + ".diameter", "treesnap." + tree_data["id"],"diameter",'Diameter',"diameter", tree_data['meta_data'].diameterNumeric_values.US_value, tree_data['meta_data'].diameterNumeric_values.US_unit,"diameter","PATO:0001334","diameter","PATO:0001334","stem", "PO_0009047"], function(err, result) {
						if(err) {
							console.log(err);
							return;
						}
						//nothing to do
					});
				}
				if(tree_data['meta_data'].heightNumeric_values != undefined) {
					pool.query("INSERT INTO public.ct_trees_phenotypes_treesnap (uniquename, tree_acc,name,mapped_name,phenotype_name,value,units,observable_name,observable_accession,cvterm_name,cvterm_accession,structure_name,structure_accession) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(uniquename) DO NOTHING",
						["treesnap." + tree_data["id"] + ".height", "treesnap." + tree_data["id"],"height",'Height',"height", tree_data['meta_data'].heightNumeric_values.US_value, tree_data['meta_data'].heightNumeric_values.US_unit,"height","PATO:0000119","height","PATO:0000119","whole plant", "PO:0000003"], function(err, result) {
						if(err) {
							console.log(err);
							return;
						}
						//nothing to do
					});
				}		
				
				//Maybe sort this by descending...
				
				Object.keys(tree_data['meta_data']).forEach(function(key,index) {
					//console.log('Term found: ' + key);

					if(treesnap_terms.includes(key) != true) {
						treesnap_terms.push(key);
						//console.log('Treesnap term: ' + key + ' saved in array');
					}
					//console.log(treesnap_terms);

					// key: the name of the object key
					// index: the ordinal position of the key within the object 
					if(Array.isArray(tree_data['meta_data'][key]) !== true && typeof tree_data['meta_data'][key] !== 'object') {
						var phenotype_name = key;
						var value = tree_data['meta_data'][key];
						var units = '-';
						var confidence = '-';
						//console.log(phenotype_name + ":" + value);
						

						if(tree_data['meta_data'][phenotype_name + '_units'] && phenotype_name.includes('_units') == false) {
							//this should be the basic phenotype with the value, so value variable is correct
							if(tree_data['meta_data'][phenotype_name + '_units'] != undefined) {
								units = tree_data['meta_data'][phenotype_name + '_units'];
							}
							if(tree_data['meta_data'][phenotype_name + '_confidence'] != undefined) {
								if(tree_data['meta_data'][phenotype_name + '_confidence'] != null) {
									confidence = tree_data['meta_data'][phenotype_name + '_confidence'];
								}
							}
						}

						if(phenotype_name.includes('_units') == true || phenotype_name.includes('_confidence') == true) {
							phenotype_name = 'ignore';
						}

	
						if(phenotype_name != 'ignore') {
							//console.log('INSERTING phenotype_name:' + phenotype_name);
							var mapped_name = phenotype_name;
							var new_units = units;
							var structure = '';
							var structure_accession = '';
							var attribute = '';
							var attribute_accession = '';
							var additional_term = '';
							var additional_term_accession = '';
							
							switch(phenotype_name) {
								case 'acorns':
									mapped_name = 'Acorns present';
									new_units = 'ordinal';
									structure = 'seed';
									structure_accession = 'PO_0009010';
									attribute = 'amount';
									attribute_accession = 'PATO_0000070';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'bearingFruit':
									new_units = 'ordinal';
									structure = 'fruit';
									structure_accession = 'PO_0009001';
									attribute = 'amount';
									attribute_accession = 'PATO_0000070';
									additional_term = '';
									additional_term_accession = '';
									break;									
								case 'burrs':
									mapped_name = 'Burrs present';
									new_units = 'ordinal';
									structure = 'seed';
									structure_accession = 'PO_0009010';
									attribute = 'amount';
									attribute_accession = 'PATO_0000070';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'catkins':
									mapped_name = 'Catkins present';
									new_units = 'binary';
									structure = 'floral organ';
									structure_accession = 'PO_0025395';
									attribute = 'amount';
									attribute_accession = 'PATO_0000070';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'chestnutBlightSigns':
									mapped_name = 'Signs of chestnut blight';
									new_units = 'qualitative';
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'damage';
									attribute_accession = 'PATO_0001020';
									additional_term = 'Cryphonectria parasitica';
									additional_term_accession = 'NCBITaxon_511';
									break;
								case 'cones':
									mapped_name = 'Cones present';
									new_units = 'binary';
									structure = 'floral organ';
									structure_accession = 'PO_0025395';
									attribute = 'amount';
									attribute_accession = 'PATO_0000070';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'conesMaleFemale':
									mapped_name = 'Male or female cones present';
									new_units = 'ordinal';
									structure = 'floral organ';
									structure_accession = 'PO_0025395';
									attribute = 'amount';
									attribute_accession = 'PATO_0000070';
									additional_term = '';
									additional_term_accession = '';
									break;	
								case 'crownClassification':
									mapped_name = 'Crown position relative to nearby trees';
									new_units = 'qualitative';
									structure = 'shoot system';
									structure_accession = 'PO_0009006';
									attribute = 'position';
									attribute_accession = 'PATO_0000140';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'crownDieback':
									new_units = 'qualitative';
									structure = 'shoot system';
									structure_accession = 'PO_0009006';
									attribute = 'lesioned';
									attribute_accession = 'PATO_0040025';
									additional_term = '';
									additional_term_accession = '';
									break;									
								case 'crownHealth':
									mapped_name = 'Crown health';
									new_units = 'ordinal';
									structure = 'shoot system';
									structure_accession = 'PO_0009006';
									attribute = 'damage';
									attribute_accession = 'PATO_0001020';
									additional_term = '';
									additional_term_accession = '';
									break;	
								case 'deerRub':
									mapped_name = 'Damage from deer rubbing';
									new_units = 'ordinal';
									structure = 'stem';
									structure_accession = 'PO_0009047';
									attribute = 'damage';
									attribute_accession = 'PATO_0001020';
									additional_term = 'Cervidae';
									additional_term_accession = 'NCBITaxon_9850';
									break;	
								case 'diameter':
									mapped_name = 'Diameter';
									new_units = units;
									structure = 'stem';
									structure_accession = 'PO_0009047';
									attribute = 'diameter';
									attribute_accession = 'PATO_0001334';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'diameterNumeric':
									mapped_name = 'Diameter';
									new_units = units;
									structure = 'stem';
									structure_accession = 'PO_0009047';
									attribute = 'diameter';
									attribute_accession = 'PATO_0001334';
									additional_term = '';
									additional_term_accession = '';
									break;									
								case 'emeraldAshBorer':
									mapped_name = 'Signs of Emerald Ash Borer';
									new_units = 'qualitative';
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'damage';
									attribute_accession = 'PATO_0001020';
									additional_term = 'Agrilus planipennis';
									additional_term_accession = 'NCBITaxon_224129';
									break;	
								case 'flowersBinary':
									mapped_name = 'Flowers present (binary)';
									new_units = 'binary';
									structure = 'floral organ';
									structure_accession = 'PO_0025395';
									attribute = 'amount';
									attribute_accession = 'PATO_0000070';
									additional_term = '';
									additional_term_accession = '';
									break;	
								case 'height':
									mapped_name = 'Height';
									new_units = units;
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'height';
									attribute_accession = 'PATO_0000119';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'heightNumeric':
									mapped_name = 'Height';
									new_units = units;
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'height';
									attribute_accession = 'PATO_0000119';
									additional_term = '';
									additional_term_accession = '';
									break;										
								case 'heightFirstBranch':
									mapped_name = 'Height of first branch';
									new_units = units;
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'height';
									attribute_accession = 'PATO_0000119';
									additional_term = '';
									additional_term_accession = '';
									break;	
								case 'locationCharacteristics':
									mapped_name = 'Location type';
									new_units = 'qualitative';
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'ecological environment exposure';
									attribute_accession = 'PECO:0007064';
									additional_term = '';
									additional_term_accession = '';
									break;	
								case 'nearbyTrees':
									mapped_name = 'Health and size of nearby trees';
									new_units = 'qualitative';
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'nearby tree health';
									attribute_accession = 'tg 57';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'needleAmount':
									mapped_name = 'Needle amount';
									new_units = 'binary';
									structure = 'vascular leaf';
									structure_accession = 'PO_0009025';
									attribute = 'amount';
									attribute_accession = 'PATO_0000070';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'needleColor':
									mapped_name = 'Needle color';
									new_units = 'qualitative';
									structure = 'vascular leaf';
									structure_accession = 'PO_0009025';
									attribute = 'color';
									attribute_accession = 'PATO_0000014';
									additional_term = '';
									additional_term_accession = '';
									break;		
								case 'numberRootSprouts':
									mapped_name = 'Number of root sprouts';
									new_units = 'discrete';
									structure = 'shoot system';
									structure_accession = 'PO_0009006';
									attribute = 'has number of';
									attribute_accession = 'PATO_0001555';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'oakHealthProblems':
									mapped_name = 'Signs of disease (oak)';
									new_units = 'qualitative';
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'damage';
									attribute_accession = 'PATO_0001020';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'plantedWild':
									mapped_name = 'Wild or human-planted';
									new_units = 'binary';
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'plant placement source';
									attribute_accession = 'tg 58';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'seedsBinary':
									mapped_name = 'Seeds present (binary)';
									new_units = 'binary';
									structure = 'seed';
									structure_accession = 'PO_0009010';
									attribute = 'amount';
									attribute_accession = 'PATO_0000070';
									additional_term = '';
									additional_term_accession = '';
									break;	
								case 'standTagging':
									mapped_name = 'Stand tagged (binary)';
									new_units = 'binary';
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'labeled';
									attribute_accession = 'NCIT_C43386';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'torreyaFungalBlight':
									mapped_name = 'Signs of fungal blight on Torreya';
									new_units = 'qualitative';
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'damage';
									attribute_accession = 'PATO_0001020';
									additional_term = 'Physalospora';
									additional_term_accession = 'NCBITaxon_186525';
									break;
								case 'treated':
									mapped_name = 'Treated (binary)';
									new_units = 'binary';
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'plant exposure';
									attribute_accession = 'PECO:0001001';
									additional_term = '';
									additional_term_accession = '';
									break;
								case 'woollyAdesCoverage':
									mapped_name = 'Coverage of infection by wooly adelgid';
									new_units = 'qualitative';
									structure = 'whole plant';
									structure_accession = 'PO_0000003';
									attribute = 'amount';
									attribute_accession = 'PATO_0000070';
									additional_term = 'Adelges tsugae';
									additional_term_accession = 'NCBITaxon_357502';
									break;										
							}
							
							if(value != "I'm not sure" && value != "Unknown" && value != "Not sure" && phenotype_name != "ashSpecies" && phenotype_name != "comment" && phenotype_name != "hybridTraits" && phenotype_name != "hybridAttributes" && phenotype_name != "otherLabel") {
								console.log(phenotype_name + ',' + value + ',' + new_units);
								pool.query("INSERT INTO public.ct_trees_phenotypes_treesnap (uniquename, tree_acc,name,phenotype_name,mapped_name,value,units,observable_name,observable_accession,cvterm_name,cvterm_accession,structure_name,structure_accession,confidence,additional_term,additional_term_accession) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(uniquename) DO NOTHING",
									["treesnap." + tree_data["id"] + "." + phenotype_name, "treesnap." + tree_data["id"],phenotype_name,phenotype_name,mapped_name,value,new_units,attribute,attribute_accession,phenotype_name,"",structure, structure_accession,confidence,additional_term,additional_term_accession], function(err, result) {
									if(err) {
										console.log(err);
										return;
									}
									//nothing to do
								});
							}
						}
						
					}
				});
			}
		);
		*/
	}	
}

function execute_request(query_str, query_args, response, next) {
	pool.query (query_str, query_args, function(err, result) {
		if (err) {
			console.log(err);
			response.status(400);
			return;
		}
		response.status(200).json(result.rows);
		return;
	});
}

function valid_api_key(key, response, callback) {
	var encrypted_key = encrypt(key).toString("hex");
	// console.log(key);
	// console.log(encrypted_key);
	pool.query("SELECT * FROM ct_api_keys WHERE api_key = $1", [encrypted_key], function (err, result) {
		if (err || result.rowCount == 0) {
			//console.log("Invalid API key: " + result.rowCount); //this causes the server 'crash'
			console.log("Invalid API key");
			console.log(err);
			response.status(401).json("Invalid API key supplied");
			return;
		}
		callback();
		return;
	});
}

function encrypt(string) {
	try {
		// var cipher = crypto.createCipher("aes-256-cbc", process.env.TOKEN_PW);
		const IV = "5183666c72eec9e4"; // set random initialisation vector
		let cipher = crypto.createCipheriv('aes-256-cbc', process.env.TOKEN_PW, IV);
		var encrypted = cipher.update(string, "utf8", "base64");
		encrypted += cipher.final("base64");
		// console.log('encrypted', encrypted);
		return encrypted;
	} 
	catch (exception) {
		return exception.message;
	}
}
	
function decrypt(string) {
	try {
		// var decipher = crypto.createDecipher("aes-256-cbc", process.env.TOKEN_PW);
		const IV = "5183666c72eec9e4"; // set random initialisation vector
		let decipher = crypto.createDecipheriv('aes-256-cbc', process.env.TOKEN_PW, IV);
		var decrypted = decipher.update(string, "base64", "utf8");
		decrypted += decipher.final("utf8");
		// console.log('decrypted', decrypted);
		return decrypted;
	} 
	catch (exception) {
		return exception.message;
	}
}


function generate_date_time() {
	var today = new Date();
	var date = today.getFullYear() + "-" + (today.getMonth() + 1) + "-" + today.getDate();
	var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();

	return date_time = date + " " + time;
}

/**
 * The parser for the json object created from the query builder
 * @param {JSON object} data - the json object created from the q builder
 * @param {string} qString - the sql query string
 */
function parse_json_query(data, qString) {
	var opMapping = {"equal": "=", "not equal": "<>"}

	if (Object.keys(data).length == 0) {
		return "";
	}
	var cond = data["condition"];
	var rules = data["rules"];
	qString += "(";
	for (var i = 0; i < rules.length; i++) {
		if (rules[i]["condition"] != undefined) {
			//qString = parseJsonQuery(rules[i], qString); //OLD
			qString = parse_json_query(rules[i], qString); //BUG FIX? The name of the function was named incorrectly?
		}
		else {
			if(rules[i]["field"] == "accession") {
				qString += "uniquename ILIKE '" + rules[i]["value"] + "%'"; 
			}
			else {
				// qString += rules[i]["field"] + " " + opMapping[rules[i]["operator"]] + " '" + rules[i]["value"] + "'";
				qString += rules[i]["field"] + " ILIKE '%" + rules[i]["value"] + "%'";
			}
		}
		
		if (i < rules.length - 1) {
			qString += " " + cond + " ";
		}	
	}
	qString += ")";
	return qString;
}

/**
 * The parser for the the single type, but potentially multiple combination selection for the filter fields
 * @param {JSON object} query_object - the json object created from the q builder
 * @param {boolean} match - indicator to use ILIKE or check for equlity in query
 * @param {string} field - the chosen field to base the filter on
 */
function parse_uni_query(query_object, match, field) {
	var base_query = "";//"SELECT uniquename FROM ct_trees WHERE";	
	var matching = [];
	var k ="";
	var clause = match ? "ILIKE" : "=";

	if (typeof(query_object) == "object") {	
		var obj_keys = Object.keys(query_object).sort(function(a,b){return (query_object[a]).localeCompare(query_object[b])});
		for (var i = 0; i < obj_keys.length; i++) {
			base_query += " " + field + " " + clause + " $" + (i + 1);
			if (i < obj_keys.length - 1) {
				base_query += " OR";
			}
			k += query_object[obj_keys[i]];
			
			if (match) {
				query_object[obj_keys[i]] += "%";
			}
			matching.push(query_object[obj_keys[i]]);
		}
	}
	else {
		if (match) {
			matching.push(query_object + "%");
		}
		else {
			matching.push(query_object);
		}
		k += query_object;
		base_query += " " + field + " "  + clause + " $1";
	}
	return {"key": k, "query_vals": matching, "query_str": base_query}; 
}

/**
 * Returns a list of trees along with their basic properties
 * @param {object} response - Response object
 * @param {object} query_props the query properties
 */
function get_trees(response, query_props) {
	pool.query (query_props["query_str"], query_props["query_vals"], function(err, result) {
		if (err) {
			//res.json("bam baby");
			return err;
		}
		var rows = result.rows;
		var treeFeatures = [];
		for (var i = 0; i < rows.length; i++) {
			var currTree = {"type": "Feature"};
			currTree["properties"] = {"id": rows[i]["uniquename"], "icon": 0};
			currTree["geometry"] = {"type": "point", "coordinates": [rows[i]["longitude"], rows[i]["latitude"]]};
			treeFeatures.push(currTree);
		}
		ct_cache.put(query_props["key"] + "_trees", treeFeatures, cache_time_24);
		response.status(200).json(treeFeatures);
	});
}

/**
 * Returns a list of trees identified by their tree_num
 * @param {object} response - Response object
 * @param {object} query_props the query properties
 */
function get_tree_ids(response, query_props) {
	pool.query (query_props["query_str"], query_props["query_vals"], function(err, result) {
		if (err) {
			return err;
		}
		var rows = result.rows;
		var trees = [];
		for (var i = 0; i < rows.length; i++) {
			trees.push(rows[i]["tree_num"]);
		}
		ct_cache.put(query_props["key"] + "_trees", trees, cache_time_24);
		response.status(200).json(trees);
	});
}

function insert_trees_query(res, tree, icon_type, coord_type) {
	try {
		pool.query("INSERT INTO ct_trees_treegenes (uniquename, genus, species, subkingdom, family, latitude, longitude, coordinate_type, source_id, icon_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (uniquename) DO NOTHING", [tree["uniquename"], tree["genus"], tree["genus"] + " " + tree["species"], tree["subkingdom"], tree["family"], tree["latitude"], tree["longitude"], coord_type, 0, icon_type], function (err, result) {
			if (err) {
				//res.status(200).json(err.stack);
				console.log(err);
			}
			//console.log('.');
		});
	}
	catch (err) {
		console.log(err);
	}
}

function wfid_insert_tree(row) {
	pool.query("INSERT INTO ct_trees_wfid (uniquename, genus, species, latitude, longitude, coordinate_type, source_id, icon_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (uniquename) DO NOTHING", [row.uniquename, row.genus, row.species, row.latitude, row.longitude, row.coordinate_type, row.source_id, row.icon_type], function (err, result) {
		if (err) {
			//res.status(200).json(err.stack);
			console.log(err);
		}
		//console.log('.');
	});	
}

function wfid_delete_tree(observation_id) {
	var uniquename = 'WFID-' + observation_id;
	pool.query("DELETE FROM ct_trees_wfid WHERE uniquename = $1", [uniquename], function (err, result) {
		if (err) {
			//res.status(200).json(err.stack);
			console.log(err);
		}
		//console.log('.');
	});	
}

function insert_new_trees(res, trees_arr) {
	for (var i = 0; i < trees_arr.length; i++) {
		var tree = trees_arr[i];
		var icon_type = 0;
		var coord_type = tree["coordinate_type"] == "exact" ? 0 : 1;
		if (tree["subkingdom"] == "angiosperm") {
			if (coord_type == 0) {
				icon_type = 0;
			}	
			else {
				icon_type = 2;
			}
		}
		else {	
			if (coord_type == 0) {
				icon_type = 1;
			}	
			else {
				icon_type = 3;
			}
		}
		insert_trees_query(res, tree, icon_type, coord_type);
	}
	//pool.end();
	//res.status(200).json("He's just standing there ... MENACINGLY!!!");	
	//return;
}

module.exports = {
	get_trees,
	get_tree_ids,
	parse_uni_query,
	parse_json_query,	
	insert_new_trees,
	generate_date_time,
	encrypt,
	decrypt,
	valid_api_key,
	execute_request,
	mama_ash_eab_surveys_clear_trees,
	mama_ash_eab_surveys_clear_phenotypes,
	mama_ash_eab_surveys_add_tree,
	mama_ash_eab_surveys_add_phenotype_rows,
	treesnap_add,
	treesnap_add_get_terms_only,
	treesnap_add_row_get_terms_only,
	treesnap_terms_tree_total,
	treesnap_terms_tree_current,
	treesnap_terms,
	treesnap_location_errors,
	treesnap_location_manual,
	treesnap_location_all,
	treesnap_api_terms,
	treesnap_otherlabel_values,
	wfid_insert_tree,
	wfid_delete_tree,
}
