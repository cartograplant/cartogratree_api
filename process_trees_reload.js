async function process_trees_reload() {
    const query = require("./query");
    // console.log('Clear the cache');
    // ct_cache.clear();
    //refresh all dependent views
    
    // query ("", [], function (err, rows, result) {
    query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_view", [], function (err, rows, result) {
        if (err) {
            console.log(err);
            // res.status(400);
            return;
        }
        console.log('chado.ct_view refresh completed');
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_trees_treegenes_dryad", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                res.status(400);
                return;
            }
            console.log('chado.ct_trees_treegenes_dryad refresh completed');			
            // query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.plusgeno_view", [], function (err, rows, result) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY ct_trees_all_view_population_testing", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    res.status(400);
                    return;
                }
                console.log('chado.ct_trees_all_view_population_testing refresh completed');
                // query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_pheno_view", [], function (err, rows, result) {
                query ("REFRESH MATERIALIZED VIEW CONCURRENTLY ct_trees", [], function (err, rows, result) {
                    if (err) {
                        console.log(err);
                        res.status(400);
                        return;
                    }	
                    console.log('chado.ct_trees refresh completed');
                    query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.tpps_study_summary", [], function (err, rows, result) {
                        if (err) {
                            console.log(err);
                            res.status(400);
                            return;
                        }
                        console.log("tpps_study_summary refresh completed");
                        // console.log('Clear the cache');
                        // ct_cache.clear();	

                        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_geno_view", [], function (err, rows, result) {
                            if (err) {
                                console.log(err);
                                res.status(400);
                                return;
                            }
                            console.log('chado.new_geno_view refresh completed');


                            console.log('Beginning refresh of geno_view...');
                            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.geno_view", [], function (err, rows, result) {
                                if (err) {
                                    console.log(err);
                                    res.status(400);
                                    return;
                                }										
                                console.log('Beginning refresh of ct_trees_all_view...');
                                query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.plusgeno_view", [], function (err, rows, result) {
                                    if (err) {
                                        console.log(err);
                                        res.status(400);
                                        return;
                                    }
                                    console.log('chado.plusgeno_view refresh completed');
                                    query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_pheno_view", [], function (err, rows, result) {
                                        if (err) {
                                            console.log(err);
                                            res.status(400);
                                            return;
                                        }
                                        console.log("chado.new_pheno_view refresh completed");
                                    });
                                });	
                            });
                            


                            // WE NEED TO DEPRECATE THE CODE BELOW SINCE THE UNDERLYING FUNCTION utils.insert_new_trees
                            // is trying to insert trees into ct_trees_treegenes which no longer exists as a table.
                            // so this code won't work anymore!
                            // NOTED by Risharde Ramnath 5/5/2022

                            //add new trees to table
                            // 	query ("SELECT * FROM chado.ct_view", [], function (err, rows, result) {
                            // 		if (err) {
                            // 			console.log(err);
                            // 			res.status(400);
                            // 			return;
                            // 		}
                            // 		console.log('chado.ct_view inserting new trees...');
                            // 		console.log('ROWS:' + rows.length);
                            // 		try {
                            // 			utils.insert_new_trees(res, rows);
                            // 		}
                            // 		catch (err) {
                            // 			console.log(err);
                            // 		}
                            // 		console.log('chado.ct_view finished inserting new trees');
                            // 		//refresh the view that houses all the trees and their respective data
                            // 		//THIS IS DUE TO CALLBACK - WE NEED TO WAIT TO MAKE SURE IT PROCESSES CORRECTLY
                            // 		// var wait_time = rows.length * 3; //rows by 3ms
                            // 		// console.log('Waiting ' + (wait_time / 1000) + ' seconds before refreshing ct_trees_all_view ...');
                            // 		// setTimeout(function() {
                            // 		// 	console.log('Beginning refresh of ct_trees_treegenes_dryad...');
                            // 		// 	query ("REFRESH MATERIALIZED VIEW chado.ct_trees_treegenes_dryad", [], function (err, rows, result) {
                            // 		// 		if (err) {
                            // 		// 			console.log(err);
                            // 		// 			res.status(400);
                            // 		// 			return;
                            // 		// 		}										
                            // 		// 		console.log('Beginning refresh of ct_trees_all_view...');
                            // 		// 		query ("REFRESH MATERIALIZED VIEW ct_trees_all_view", [], function (err, rows, result) {
                            // 		// 			if (err) {
                            // 		// 				console.log(err);
                            // 		// 				res.status(400);
                            // 		// 				return;
                            // 		// 			}
                            // 		// 			console.log('ct_trees_all_view refresh completed');
                            // 		// 			query ("REFRESH MATERIALIZED VIEW ct_trees", [], function (err, rows, result) {
                            // 		// 				if (err) {
                            // 		// 					console.log(err);
                            // 		// 					res.status(400);
                            // 		// 					return;
                            // 		// 				}
                            // 		// 				console.log("ct_trees refresh completed");
                            // 		// 				query ("REFRESH MATERIALIZED VIEW chado.tpps_study_summary", [], function (err, rows, result) {
                            // 		// 					if (err) {
                            // 		// 						console.log(err);
                            // 		// 						res.status(400);
                            // 		// 						return;
                            // 		// 					}
                            // 		// 					console.log("tpps_study_summary refresh completed");
                            // 		// 					console.log('Clear the cache');
                            // 		// 					ct_cache.clear();	
                            // 		// 				});
                            // 		// 			});
                            // 		// 		});	
                            // 		// 	});
                            // 		// }, wait_time);
                            // 	});							
                            // });
                        });
                    });
                });
            });
        });
    });
}
process_trees_reload();