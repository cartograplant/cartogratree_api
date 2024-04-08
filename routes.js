"use strict";
module.exports = async function(app, global) {
	try {
		global.io.emit('test', {test:'test'});
	} catch (err) { console.log(err) }
	// This is middleware for routes that use POST
	const bodyParser = require("body-parser");
	app.use(bodyParser.urlencoded({limit: '50mb', extended: false }));
	app.use(bodyParser.json());


	//old API deprecated functions
	var old_controller = require("./controllers/oldController");
	

	app.get("/cartogratree/api/v1.0/trees/markers/snps", old_controller.trees_snps);
	app.get("/cartogratree/api/v1.0/trees/markers/snps/all", old_controller.snps_all);
	app.get("/cartogratree/api/test", old_controller.show_me);
	
	//API V2 new end points and controllers
	var tree_controller = require("./controllers/treeController");
	tree_controller.set_global(global);
	var user_controller = require("./controllers/userController");  

	app.get("/cartogratree/api/v2/wfid/oauth_request", tree_controller.wfid_oauth_token_request);
	app.post("/cartogratree/api/v2/wfid/observation/action", tree_controller.wfid_observation_action_hook);
	app.get("/cartogratree/api/v2/wfid/import/observations/all", tree_controller.wfid_import_observations_all);

	app.get("/cartogratree/api/v2/tree", tree_controller.tree_get_basic);
	app.get("/cartogratree/api/v2/tree/snp", tree_controller.tree_get_snp); 
	app.get("/cartogratree/api/v2/tree/treesnap", tree_controller.tree_get_treesnap);
	app.get("/cartogratree/api/v2/phenotypes", tree_controller.phenotypes_tree_get);
	app.get("/cartogratree/api/v2/genotypes", tree_controller.genotypes_tree_get);
	app.get("/cartogratree/api/v2/genotypes/count", tree_controller.genotypes_count_tree_get);	
	app.get("/cartogratree/api/v2/markertypes", tree_controller.markertypes_tree_get);
	app.get("/cartogratree/api/v2/publications", tree_controller.publications_tree_get);

	app.get("/cartogratree/api/v2/phenotypes/count/all", tree_controller.phenotypes_count_all_tree_get);
	app.get("/cartogratree/api/v2/genotypes/count/all", tree_controller.genotypes_count_all_tree_get);

	app.post("/cartogratree/api/v2/genotypes/snps_overlaps_by_studies_views_venn_format", tree_controller.genotypes_snps_overlaps_by_studies_views_venn_format);
	app.post("/cartogratree/api/v2/genotypes/snps_overlaps_by_studies_views", tree_controller.genotypes_snps_overlaps_by_studies_views);
	app.post("/cartogratree/api/v2/genotypes/snps_by_study", tree_controller.genotypes_snps_by_study);
	app.post("/cartogratree/api/v2/genotypes/snps_count_by_study", tree_controller.genotypes_snps_count_by_study);
	app.post("/cartogratree/api/v2/genotypes/snps_by_studies", tree_controller.genotypes_snps_by_studies);
	app.post("/cartogratree/api/v2/genotypes/snps_by_batch", tree_controller.genotypes_snps_by_batch);
	app.post("/cartogratree/api/v2/genotypes/ssrs_by_batch", tree_controller.genotypes_ssrs_by_batch);
	app.post("/cartogratree/api/v2/genotypes/by_study_ids", tree_controller.genotypes_overlapping_by_study_ids);
	app.post("/cartogratree/api/v2/genotypes/snps_get_tree_ids_by_analysis_id", tree_controller.genotypes_snps_get_tree_ids_by_analysis_id);
	app.post("/cartogratree/api/v2/genotypes/snp_vcf_filtering", tree_controller.genotypes_snp_vcf_filtering);

	app.get("/cartogratree/api/v2/fields/trees", tree_controller.trees_get_fields);
	app.get("/cartogratree/api/v2/fields/trees/dynamic", tree_controller.trees_get_fields_dynamic);
	app.get("/cartogratree/api/v2/fields/markers", tree_controller.markers_get_fields);

	app.get("/cartogratree/api/v2/biomes/generate", tree_controller.biomes_generate);
	app.get("/cartogratree/api/v2/biomes/update", tree_controller.biomes_update);

	app.get("/cartogratree/api/v2/data/neon/summary",tree_controller.data_get_neon_site_summary);

	//These are administrative functions that can be executed via the API.
	//These endpoints require the ASUP (api_superuser_password) from config.js.
	//Simply append ?asup=password to the end of the url to perform the command.
	app.get("/cartogratree/api/v2/startup_cache_build", tree_controller.process_startup_cache_build);
	app.get("/cartogratree/api/v2/generategeojson_bienv4_by_species", tree_controller.process_generategeojson_bienv4_by_species);


	app.get("/cartogratree/api/v2/species/count", tree_controller.species_count);
	app.get("/cartogratree/api/v2/trees/count", tree_controller.trees_count);
	app.get("/cartogratree/api/v2/trees/remove_treegenes_trees", tree_controller.remove_treegenes_trees);
	app.get("/cartogratree/api/v2/trees/reload", tree_controller.trees_reload);
	app.get("/cartogratree/api/v2/trees/reload_status", tree_controller.trees_reload_status);
	app.get("/cartogratree/api/v2/trees/clear", tree_controller.cache_clear);
	app.get("/cartogratree/api/v2/trees/check_trees_in_sea", tree_controller.check_trees_in_sea);
	app.get("/cartogratree/api/v2/trees/results_trees_in_sea", tree_controller.trees_in_sea_results);
	app.get("/cartogratree/api/v2/trees/treesnap/consolidate_subkingdoms", tree_controller.treesnap_consolidate_subkingdoms);	
	app.get("/cartogratree/api/v2/trees/treesnap/consolidate_families", tree_controller.treesnap_consolidate_families);
	app.get("/cartogratree/api/v2/trees/treesnap/reload", tree_controller.reload_treesnap);

	app.get("/cartogratree/api/v2/trees/treesnap/find_terms", tree_controller.force_find_treesnap_terms);
	app.get("/cartogratree/api/v2/trees/treesnap/force_reload", tree_controller.force_reload_treesnap);
	app.get("/cartogratree/api/v2/trees/treesnap/collection_lookup_by_tree_id", tree_controller.treesnap_collection_lookup_by_tree_id);
	app.get("/cartogratree/api/v2/trees/treesnap/collection_name_lookup_by_tree_id", tree_controller.treesnap_collection_name_lookup_by_tree_id);


	app.get("/cartogratree/api/v2/trees/dryad/consolidate_dryad_trees_from_treegenes", tree_controller.dryad_consolidate_trees_from_treegenes);
	app.get("/cartogratree/api/v2/trees/bienv4/trees/force_reload", tree_controller.force_reload_bienv4);
	app.get("/cartogratree/api/v2/trees/bienv4/trees/force_reload_linkedwithtganddryad", tree_controller.force_reload_bienv4_linkedwithtganddryad);
	app.get("/cartogratree/api/v2/trees/bienv4/trees/force_generategeometry_linkedwithtganddryad", tree_controller.force_generategeometry_bienv4_linkedwithtganddryad);
	app.get("/cartogratree/api/v2/trees/bienv4/trees/reload", tree_controller.reload_bienv4);
	app.get("/cartogratree/api/v2/trees/bienv4/trees/cleanup", tree_controller.cleanup_bienv4);
	app.get("/cartogratree/api/v2/trees/bienv4/endangered_taxa/force_reload", tree_controller.force_reload_bienv4_endangeredtaxa);
	
	app.post("/cartogratree/api/v2/traits/union/by_batch", tree_controller.union_traits_by_batch);
	app.post("/cartogratree/api/v2/traits/intersect/by_batch", tree_controller.intersect_traits_by_batch);
	app.post("/cartogratree/api/v2/traits/filter_trees/by_traits", tree_controller.trees_by_trait);
	app.post("/cartogratree/api/v2/traits/filter_trees/by_intersect_trait", tree_controller.trees_by_intersect_trait);

	app.post("/cartogratree/api/v2/phenotypes/single_phenotype_name_units_per_studies", tree_controller.phenotypes_single_phenotype_name_units_per_studies);
	app.post("/cartogratree/api/v2/phenotypes/phenotype_names_per_study", tree_controller.phenotypes_phenotype_names_per_study);
	app.post("/cartogratree/api/v2/phenotypes/phenotypes_overlaps_by_studies_views", tree_controller.phenotypes_phenotypes_overlaps_by_studies_views);
	app.post("/cartogratree/api/v2/phenotypes/phenotypes_all_by_studies_views", tree_controller.phenotypes_phenotypes_all_by_studies_views);
	app.post("/cartogratree/api/v2/phenotypes/phenotypes_values_by_overlapping_studies", tree_controller.phenotypes_phenotypes_values_by_overlapping_studies);
	app.post("/cartogratree/api/v2/phenotypes/phenotypes_count_by_overlapping_studies", tree_controller.phenotypes_phenotypes_count_by_overlapping_studies);
	app.post("/cartogratree/api/v2/phenotypes/phenotypes_pca", tree_controller.phenotypes_pca);
	
	// phenotypes_phenotypes_all_by_studies_views
	app.get("/cartogratree/api/v2/trees", tree_controller.trees_list);
	app.get("/cartogratree/api/v2/trees/by_source_id", tree_controller.trees_list_by_source_id);
	app.post("/cartogratree/api/v2/trees/q", tree_controller.trees_list_qbuilder);
	app.get("/cartogratree/api/v2/trees/source", tree_controller.trees_by_source);
	app.get("/cartogratree/api/v2/trees/family", tree_controller.trees_by_family);
	app.get("/cartogratree/api/v2/trees/genus", tree_controller.trees_by_genus);
	app.get("/cartogratree/api/v2/trees/species", tree_controller.trees_by_species);
	app.get("/cartogratree/api/v2/trees/pub", tree_controller.trees_by_publication);
	app.get("/cartogratree/api/v2/trees/genotype", tree_controller.trees_by_genotype);
	app.get("/cartogratree/api/v2/trees/phenotype", tree_controller.trees_by_phenotype);
	app.get("/cartogratree/api/v2/trees/snp", tree_controller.trees_snp);
	app.post("/cartogratree/api/v2/trees/snp/missing", tree_controller.trees_snps_missing);

	app.get("/cartogratree/api/v2/trees/wfid", tree_controller.wfid_trees_list);
	app.get("/cartogratree/api/v2/trees/wfid_consolidate_metadata", tree_controller.wfid_consolidate_metadata);

	app.get("/cartogratree/api/v2/trees/popstruct", tree_controller.popstruct_trees_list);

	app.get("/cartogratree/api/v2/stats/unq/species", tree_controller.total_unique_species);
	app.get("/cartogratree/api/v2/stats/num/species", tree_controller.total_species);
	app.get("/cartogratree/api/v2/stats/num/pub", tree_controller.total_publications);
	app.get("/cartogratree/api/v2/stats/num/trees", tree_controller.total_trees);

	app.post("/cartogratree/api/v2/trees/shared_trees", tree_controller.trees_shared_trees);
	
	app.get("/cartogratree/api/v2", user_controller.get_api_key);

	app.post("/cartogratree/api/v2/user/session/save", user_controller.session_save);
	app.post("/cartogratree/api/v2/user/session/save/by-user", user_controller.session_save_user); 
	app.get("/cartogratree/api/v2/user/session", user_controller.session_get); 
	app.get("/cartogratree/api/v2/user/session/by-user", user_controller.session_get_user);
	app.get("/cartogratree/api/v2/user/session/by-user/all", user_controller.sessions_all_get_user);
	app.get("/cartogratree/api/v2/user/session/create", user_controller.session_create);
	app.get("/cartogratree/api/v2/user/session/delete", user_controller.session_delete);

	app.get("/cartogratree/api/v2/analysis/create", tree_controller.analysis_create_id);
	app.get("/cartogratree/api/v2/analysis/update_analysis_name", tree_controller.analysis_update_analysis_name);
	app.post("/cartogratree/api/v2/analysis/insert_markers_study_all", tree_controller.analysis_insert_markers_study_all);
	app.post("/cartogratree/api/v2/analysis/delete_markers_study_all", tree_controller.analysis_delete_markers_study_all);	
	app.post("/cartogratree/api/v2/analysis/insert_markers_studies_overlap", tree_controller.analysis_insert_markers_study_overlaps);
	app.post("/cartogratree/api/v2/analysis/delete_markers_studies_overlap", tree_controller.analysis_delete_markers_study_overlaps);
	app.post("/cartogratree/api/v2/analysis/insert_markers_studies_none_overlap", tree_controller.analysis_insert_markers_study_none_overlaps);
	app.post("/cartogratree/api/v2/analysis/delete_markers_studies_none_overlap", tree_controller.analysis_delete_markers_study_none_overlaps);
	
	// app.get("/cartogratree/api/v2/environmental/generate_layer_values_table")
	// Environmental Layer Data
	app.post("/cartogratree/api/v2/environmental/get_unique_locations_from_treeids", tree_controller.environmental_get_unique_locations_from_treeids);
	app.post("/cartogratree/api/v2/environmental/get_locations_from_treeids", tree_controller.environmental_get_locations_from_treeids);
	app.post("/cartogratree/api/v2/environmental/get_envdata_from_db_table", tree_controller.environmental_get_envdata_from_db_table);
	app.post("/cartogratree/api/v2/environmental/environmental_scatter_plot", tree_controller.environmental_scatter_plot);

	// PopStruct related routes
	app.post("/cartogratree/api/v2/popstruct/fast_structure", tree_controller.popstruct_fast_structure);
	app.post("/cartogratree/api/v2/popstruct/dapc", tree_controller.popstruct_dapc);
	app.get("/cartogratree/api/v2/popstruct/reload", tree_controller.popstruct_reload);

	app.post("/cartogratree/api/v2/analysis/insert_data", tree_controller.analysis_insert_data);
	app.post("/cartogratree/api/v2/analysis/delete_data", tree_controller.analysis_delete_data);
	app.get("/cartogratree/api/v2/analysis/analysis_related_views_reload", tree_controller.analysis_related_views_reload);
};
