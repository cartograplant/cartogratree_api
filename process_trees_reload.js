async function process_trees_reload() {
    const query = require("./query");
    // console.log('Clear the cache');
    // ct_cache.clear();
    //refresh all dependent views

    var ct_view_promise = new Promise(function(resolve,reject) {
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_view", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                // res.status(400);
                // return;
            }
            console.log('chado.ct_view refresh completed');
            resolve('completed');
        });        
    });

    var ct_trees_treegenes_dryad_promise = new Promise(function(resolve,reject) {
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_trees_treegenes_dryad", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                // res.status(400);
                // return;
            }
            console.log('chado.ct_trees_treegenes_dryad refresh completed');
            resolve('completed');
        });        
    });

    var ct_trees_all_view_promise = new Promise(function(resolve,reject) {
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY ct_trees_all_view", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                // res.status(400);
                // return;
            }
            console.log('ct_trees_all_view refresh completed');
            resolve('completed');
        });        
    });


    var ct_trees_promise = new Promise(function(resolve,reject) {
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY ct_trees", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                // res.status(400);
                // return;
            }
            console.log('ct_trees refresh completed');
            resolve('completed');
        });        
    });

    var tpps_study_summary_promise = new Promise(function(resolve,reject) {
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.tpps_study_summary", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                // res.status(400);
                // return;
            }
            console.log('chado.tpps_study_summary refresh completed');
            resolve('completed');
        });        
    }); 
    
    var new_geno_view_promise = new Promise(function(resolve,reject) {
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_geno_view", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                // res.status(400);
                // return;
            }
            console.log('chado.new_geno_view refresh completed');
            resolve('completed');
        });        
    }); 
    
    var geno_view_promise = new Promise(function(resolve,reject) {
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.geno_view", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                // res.status(400);
                // return;
            }
            console.log('chado.geno_view refresh completed');
            resolve('completed');
        });        
    }); 
    
    var plusgeno_view_promise = new Promise(function(resolve,reject) {
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.plusgeno_view", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                // res.status(400);
                // return;
            }
            console.log('chado.plusgeno_view refresh completed');
            resolve('completed');
        }); 
    });

    var new_pheno_view_promise = new Promise(function(resolve,reject) {
        query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_pheno_view", [], function (err, rows, result) {
            if (err) {
                console.log(err);
                // res.status(400);
                // return;
            }
            console.log('chado.new_pheno_view refresh completed');
            resolve('completed');
        }); 
    });  
    
    // Run these promises, still indented but hopefully easier to modify
    // There is a reason for not chaining, if we returned promises from other
    // promises, we would have to edit each promise for changes which is more
    // difficult than just running a promise within a promise in this example.
    ct_view_promise.then(function(res) {
        ct_trees_treegenes_dryad_promise.then(function(res) {
            ct_trees_all_view_promise.then(function(res) {
                ct_trees_promise.then(function(res) {
                    tpps_study_summary_promise.then(function(res) {
                        new_geno_view_promise.then(function(res) {
                            geno_view_promise.then(function(res) {
                                plusgeno_view_promise.then(function(res) {
                                    new_pheno_view_promise.then(function(res) {
                                        console.log('All views have been reloaded.')
                                    })
                                })
                            })
                        })
                    })
                })
            })
        })
    })

    // DEPRECATED ON 2/3/2023 for a more organized approach
    /*
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
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY ct_trees_all_view", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    res.status(400);
                    return;
                }
                console.log('chado.ct_trees_all_view refresh completed');
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
                                        // query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.test_studies_marker_overlap", [], function (err, rows, result) {
                                        //     if (err) {
                                        //         console.log(err);
                                        //         res.status(400);
                                        //         return;
                                        //     }
                                        //     console.log("chado.test_studies_marker_overlap refresh completed");
                                        // });
                                        // chado.test_studies_marker_overlap
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
    */
}
process_trees_reload();