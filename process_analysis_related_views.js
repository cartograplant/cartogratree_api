async function process_analysis_related_views_reload() {
    console.log('refreshing analysis related views...');
    const query = require("./query");
    // console.log('Clear the cache');
    // ct_cache.clear();
    //refresh all dependent views
    query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.genotypes_by_study_with_tree_accessions", [], function (err, rows, result) {
        if (err) {
            console.log(err);
            // res.status(400);
            return;
        }
        console.log('chado.genotypes_by_study_with_tree_accessions refresh completed');
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.genetic_markers_and_tree_accessions_per_individual_study", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                res.status(400);
                return;
            }
            console.log('chado.genetic_markers_and_tree_accessions_per_individual_study refresh completed');			
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.genetic_markers_and_study_accession_per_individual_tree", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    res.status(400);
                    return;
                }
                console.log('chado.genetic_markers_and_study_accession_per_individual_tree refresh completed');
                query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.markers_and_studies_names", [], function (err, rows, result) {
                    if (err) {
                        console.log(err);
                        res.status(400);
                        return;
                    }	
                    console.log('chado.markers_and_studies_names refresh completed');
                    query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.tree_accessions_per_individual_marker", [], function (err, rows, result) {
                        if (err) {
                            console.log(err);
                            res.status(400);
                            return;
                        }
                        console.log('chado.tree_accessions_per_individual_marker refresh completed');
                    });
                });
            });
        });
    });
}
process_analysis_related_views_reload();