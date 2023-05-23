const crypto = require("crypto"); //For mining bitcoins
// const request = require("request"); // deprecated due to dependency vulnerabilities
const { Pool, Client } = require("pg"); //Set up mining pool
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
			fs.appendFileSync('treesnap_terms.txt', treesnap_terms[i] + "\n");
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
		// var options = {
		// 	uri: "http://treegenesdb.org/tghubbot/api/message?k=" + config.conf.slack_channel_post_password + "&c=stats&m=" + encodeURI(string_output), 
		// 	method: "GET",
		// 	headers: {
		// 	},
		// }
	
		// var req_result = request(options, function(error, response, body) {
		// 	if (error) {
		// 		console.log(error);
		// 		res.status(400);
		// 		return;
		// 	}
		// });				
	}
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
  }



function treesnap_add(base_url) {
	try {
		console.log('Attempting to pull treesnap data from:' + base_url);
		const treesnap_max = 100;	
		var options = {
			uri: base_url + "&per_page=" + treesnap_max, 
			method: "GET",
			headers: {
				"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
				"Accept": "application/json",
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
			axios_instance({
				method: 'get',
				url: base_url + "&per_page=" + treesnap_max,
				headers: {
					"Authorization": "Bearer " + process.env.TREESNAP_BEARER,
					"Accept": "application/json",
				}
			}).then(function(response) {
				try {
					var data = response.data;
					// console.log('data', data);
					for (var i = 0; i < data.data.length; i++) {
						var tree_data = data.data[i];
						treesnap_add_row(tree_data);
					}
					if (data.next_page_url != null) {
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

function treesnap_add_row(tree_data) {
	console.log('TreeSnap ID:' + tree_data["id"]);
	if (tree_data["location_accuracy"] != "-1" && tree_data["location_accuracy"] != "-2") {
		if(tree_data["species"] == "Unknown" || tree_data["genus"] == "Unknown") {
			// Try to populate using otherLabel(treesnap) which translates to TG common_name (organism table)
			var otherLabel = tree_data["meta_data"]["otherLabel"];
			console.log("otherLabel:" + otherLabel);
			if (otherLabel == undefined || otherLabel == "undefined" || otherLabel == "Other" || otherLabel == "Unknown" || otherLabel == "unknown") {
				return; // don't continue to add this tree
			}
			else {
				// Let's make otherlabel lower case
				otherLabel = otherLabel.toLowerCase();
				// Most likely got the otherLabel, try to query db
				var pg_n_client_tg = new pg_native_client(); //Connect to TreeGenes Database server synchronously
				pg_n_client_tg.connectSync('postgresql://' + config.conf.user + ':' + config.conf.password + '@' + config.conf.host + ':' + config.conf.port + '/' + config.conf.database + '');
				var cn_rows = pg_n_client_tg.querySync("SELECT distinct(lower(common_name)) as common_name, genus, species FROM chado.organism WHERE lower(common_name) = $1;",[otherLabel]);
				pg_n_client_tg.end(); //Disconnect from TreeGenes database server
				if(cn_rows.length > 0) {
					// we found a match in the db that has the common_name and genus and species!
					console.log("Found a match for otherLabel and common_name");
					console.log(cn_rows[0]);
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
		fs.appendFileSync('meta_data.txt', JSON.stringify(tree_data['meta_data']) + "\n");

		pool.query("INSERT INTO ct_trees_treesnap (uniquename, species, genus, family, subkingdom, latitude, longitude, source_id, icon_type) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(uniquename) DO NOTHING",
			["treesnap." + tree_data["id"], tree_data["genus"] + " " + tree_data["species"], tree_data["genus"], null, null, tree_data["latitude"], tree_data["longitude"], 1, 4],
			function (err, result) {
				if (err) {
					console.log(err);
					return;
				}
				
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
				qString += rules[i]["field"] + " " + opMapping[rules[i]["operator"]] + " '" + rules[i]["value"] + "'";
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
