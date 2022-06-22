'use strict';

//dependencies and external modules used

const query = require('./../query');
const url = require('url');
const NCache = require('node-cache'); 
const ctCache = new NCache({stdTTL: 60000, checkperiod: 120});

exports.show_me = function(request, response, next) {
	response.status(200).json("Boo");
}

/**
 * Returns all snps from the table
 * @param {type} request Request object
 * @param {type} response Response object
 * @param {type} next Next middleware function in the application's request-response cycle
 * @returns json hashtable with marker_names as keys and array of genotype description/intger as values 
 */
exports.snps_all = function(request, response, next) {
  var request_q = url.parse(request.url, true).query;
  //response.status(200).json("Hello");
  
  ctCache.get(request.url, function(err, val) {
    if(!err) {
      if(val == undefined) {
        query (
          'SELECT marker_name, description, COUNT(*) c FROM ct_geno_view GROUP BY description, marker_name ORDER BY marker_name, c DESC',
          null,
          function(error, rows, result) {
	    if (error) {
              var now = new Date();
	      console.log(now.toLocaleDateString() + ' ' + now.toLocaleTimeString());
              return next(error);
	    }
	     
	    var snp_data = {}; 
            var prevMarker = null;
            var homozygousCount = 0;
	    for (var i = 0; i < rows.length; i++) {
              if(snp_data[rows[i]["marker_name"]] == undefined) {
                snp_data[rows[i]["marker_name"]] = {};
              }
              if (prevMarker == null || prevMarker != rows[i]["marker_name"]) {
                homozygousCount = 0;
              }
	      if (rows[i]["description"] == "NA") {
		snp_data[rows[i]["marker_name"]][rows[i]["description"]] = "NaN";
	      }
	      else{
		var desSplit = rows[i]["description"].split(":");
		if (desSplit[0] == desSplit[1]) {
		  snp_data[rows[i]["marker_name"]][rows[i]["description"]] = homozygousCount;
		  homozygousCount += 2;
		}
		else {
		  snp_data[rows[i]["marker_name"]][rows[i]["description"]] = 1;
		}
	      }
              prevMarker = rows[i]["marker_name"];
	    }
	    //ctCache.set(request.url, genotype_data);
	    
	    response.status(200).json(snp_data);	
          }
        );
      }
      else {
        response.status(200).json(val);
      }
    }
  });
};


/**
 * Returns all snps for given array of trees
 * @param {type} request Request object
 * @param {type} response Response object
 * @param {type} next Next middleware function in the application's request-response cycle
 * @returns json hastable of marker_name as key and description as values
 */
exports.trees_snps = function(request, response, next) {
  var request_query = url.parse(request.url, true).query;
  console.log(request_query);
  /*
  ctCache.get(request.url, function(err, val) {
    if(!err) {
      if(val == undefined) {*/
	if(request_query.tree_acc != "all") {
	  query (
	    'SELECT * FROM ct_geno_view WHERE tree_acc = $1', 
	    [request_query.tree_acc], 
	    function(error, rows, result) {
	      if (error) {
		var now = new Date();
		console.log(now.toLocaleDateString() + ' ' + now.toLocaleTimeString());
		return next(error);
	      }
	     
              var tree_snp_data = {};
	      tree_snp_data["tree"] = request_query.tree_acc; 
	      for (var i = 0; i < rows.length; i++) {
		tree_snp_data[rows[i]["marker_name"]] = rows[i]["description"];
	      }
	      ctCache.set(request.url, tree_snp_data);
	      response.status(200).json(tree_snp_data);	
	    }
	  );  
	}
	else {
	  query (
	    'SELECT * FROM ct_geno_view', 
            null, 
	    function(error, rows, result) {
	      if (error) {
		var now = new Date();
		console.log(now.toLocaleDateString() + ' ' + now.toLocaleTimeString());
		return next(error);
	      }
              var all_snp_data = [];
	      var tree_idx_mapping = {};
              var tree_idx = 0;
	      for (var i = 0; i < rows.length; i++) {
		var tree = rows[i]["tree_acc"];
		if (tree_idx_mapping[tree] == undefined) {
		  var curr_row = {"tree": tree};
		  /*
		  if(genotype_data[rows[i]["tree_acc"]] == undefined){
			  genotype_data[rows[i]["tree_acc"]] = {};
		  }
		  genotype_data[rows[i]["tree_acc"]][rows[i]["marker_name"]] = rows[i]["description"];
		  genotype_data[rows[i]["tree_acc"]]["trees"] += 1;*/
		  curr_row[rows[i]["marker_name"]] = rows[i]["description"];
                  all_snp_data.push(curr_row);
                  tree_idx_mapping[tree] = tree_idx;
                  tree_idx++;
                }
                else {
                  all_snp_data[tree_idx_mapping[tree]][rows[i]["marker_name"]] = rows[i]["description"];
                }
	      }
	      ctCache.set(request.url, all_snp_data);
	      response.status(200).json(all_snp_data);	
	    }
	  );  
	}
      /*}
      else {
        response.status(200).json(val);
      }
    }
  });*/
};


/**
 * Returns records of (layer_id, filter_type, filter_id, value_id, accession) pairs
 * in JSON format based on the (layer_name, genus, and species) or (layer_name and accession) provided.
 * If the query string is the former, the accession will not be included in the response.
 * These #ids can be used to update the filters and consequently the map display as well, and the accession
 * can be used in the CQL to further filter the map.
 * Expected request query: ?genus=x&species=y&layer_name=z or ?accession=x.
 * @param {type} request Request object
 * @param {type} response Response object
 * @param {type} next Next middleware function in the application's request-response cycle
 * @returns {undefined}
 */
exports.treegenes_filter = function(request, response, next) {
  var request_query = url.parse(request.url, true).query;
  var sql_params, sql_query;
  if (typeof (request_query.accession) === 'undefined') {
      // request query: ?genus=x&species=y&layer_name=z
      sql_query = "SELECT t3.layer_id, t2.filter_type, t1.field_id AS filter_id, t1.value_id "
                + "FROM cartogratree_field_values AS t1 "
                + "JOIN cartogratree_fields AS t2 ON t1.field_id = t2.field_id "
                + "JOIN cartogratree_layers AS t3 ON t2.layer_id = t3.layer_id "
                + "WHERE t3.name = $1 AND t2.field_name = 'species' AND t1.value = $2";
      sql_params = [request_query.layer_name, request_query.species];
  }
  else {
      // request query: ?accession=x
      sql_query = "SELECT t3.layer_id, t2.filter_type, t1.field_id AS filter_id, t1.value_id, t5.project_acc AS accession "
                + "FROM cartogratree_field_values AS t1 "
                + "JOIN cartogratree_fields AS t2 using (field_id) "
                + "JOIN cartogratree_layers AS t3 using (layer_id) "
                + "JOIN chado.pub_species AS t4 ON t1.value = right(t4.species, length(t4.species) - position (' ' in t4.species)) "
                + "JOIN chado.pub_projects AS t5 USING (pub_id) "
                + "WHERE t3.name = $1 AND t2.field_name = 'species' AND t5.project_acc = $2;";
      sql_params = [request_query.layer_name, request_query.accession];
  }
  query (sql_query, sql_params, function(error, rows, result) {
    if (error) {
      var now = new Date();
      console.log(now.toLocaleDateString() + ' ' + now.toLocaleTimeString());
      return next(error);
    }
    response.status(200).json(rows);
  });
};

