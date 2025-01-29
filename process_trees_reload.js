async function process_trees_reload() {
    const query = require("./query");
    // console.log('Clear the cache');
    // ct_cache.clear();
    //refresh all dependent views
    var fs = require('fs');
    fs.unlink('refresh_views_log.txt', function (err) {
        console.log(err);
    });

    // CALL refresh_views();
    var check_refresh_views_promise_response = await new Promise(function(resolve,reject) {
        query ("SELECT pid, age(clock_timestamp(), query_start), usename, query " +
            "FROM pg_stat_activity " + 
            "WHERE query != '<IDLE>' AND query NOT ILIKE '%pg_stat_activity%' " + 
            "AND query LIKE '%CALL refresh_views%' " + 
            "ORDER BY query_start desc;", 
            [], function (err, rows, result) {
            if (err) {
                console.log(err);
                reject('error occurred');
                // res.status(400);
                // return;
            }
            console.log('querying for running materialized refresh completed');
            for(let i=0; i<rows.length; i++) {
                let row = rows[i];
                let query_running = row['query'];
                console.log('QUERY RUNNING: ' + query_running);
                // check if query contains refresh capitalized keyword
                // check if query spaced parts more than or equal to 5 in length
                // this length conforms with the queries we run to refresh materialized views
                if(query_running.includes('CALL refresh_views')) {
                    if (view_names.includes(query_spaced_parts[4])) {
                        console.log('refresh_views query already running:' + query_running);
                        console.log('Will not run a reload until those queries complete');
                        write_log('Reload already in progress. Aborting new reload call.');
                        reject('rejected');
                    }
                }
            }
            resolve('completed');
        });        
    });

    if(check_refresh_views_promise_response == "completed") {
        var ct_view_promise_response = await new Promise(function(resolve,reject) {
            write_log('EXECUTING: refresh_views()');
            query ("CALL public.refresh_views();", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: refresh_views() could not be refreshed.'); 
                    reject('error occurred');               
                    // res.status(400);
                    // return;
                }
                console.log('refresh_views() completed');
                write_log('refresh_views() completed.' + JSON.stringify(result)); 
                resolve('completed');
            });        
        });
    }

    // OLD CODE - 12/10/2024 - V2
    // var check_refresh_views_promise_response = await new Promise(function(resolve,reject) {
    //     query ("SELECT pid, age(clock_timestamp(), query_start), usename, query " +
    //         "FROM pg_stat_activity " + 
    //         "WHERE query != '<IDLE>' AND query NOT ILIKE '%pg_stat_activity%' " + 
    //         "AND query LIKE 'REFRESH MATERIALIZED%' " + 
    //         "ORDER BY query_start desc;", 
    //         [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('querying for running materialized refresh completed');
    //         for(let i=0; i<rows.length; i++) {
    //             let row = rows[i];
    //             let query_running = row['query'];
    //             console.log('QUERY RUNNING: ' + query_running);
    //             let query_spaced_parts = query_running.split(" ");
    //             let view_names = [
    //                 'chado.ct_view',
    //                 'chado.ct_trees_treegenes_dryad_without_tree_num',
    //                 'chado.ct_trees_treegenes_dryad',
    //                 'ct_trees_all_view',
    //                 'public.ct_trees_all_view',
    //                 'public.ct_trees_popstruct',
    //                 // 'ct_trees_all_view_tmp',
    //                 // 'public.ct_trees_all_view_tmp',
    //                 'ct_trees',
    //                 'public.ct_trees',
    //                 'chado.tpps_study_summary',
    //                 'chado.new_geno_view',
    //                 'chado.geno_view',
    //                 'chado.plusgeno_view',
    //                 'chado.new_pheno_view'
    //             ];
    //             // check if query contains refresh capitalized keyword
    //             // check if query spaced parts more than or equal to 5 in length
    //             // this length conforms with the queries we run to refresh materialized views
    //             if(query_running.includes('REFRESH MATERIALIZED VIEW') && query_spaced_parts.length >= 5) {
    //                 if (view_names.includes(query_spaced_parts[4])) {
    //                     console.log('REFRESH views query already running:' + query_running);
    //                     console.log('Will not run a reload until those queries complete');
    //                     write_log('Reload already in progress. Aborting new reload call.');
    //                     reject('rejected');
    //                 }
    //             }
    //         }
    //         resolve('completed');
    //     });        
    // });

    // if(check_refresh_views_promise_response == "completed") {
        
    //     var ct_view_promise_response = await new Promise(function(resolve,reject) {
    //         write_log('EXECUTING: ct_view');
    //         query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_view", [], function (err, rows, result) {
    //             if (err) {
    //                 console.log(err);
    //                 write_log('ERROR: chado.ct_view could not be refreshed.'); 
    //                 reject('error occurred');               
    //                 // res.status(400);
    //                 // return;
    //             }
    //             console.log('chado.ct_view refresh completed');
    //             write_log('chado.ct_view refresh completed.' + JSON.stringify(result)); 
    //             resolve('completed');
    //         });        
    //     });

    //     // ct_trees_treegenes_dryad_without_tree_num
    //     var ct_trees_treegenes_dryad_without_tree_num_promise_response = await new Promise(function(resolve,reject) {
    //         write_log('EXECUTING: ct_trees_treegenes_dryag_without_tree_num');
    //         query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_trees_treegenes_dryad_without_tree_num", [], function (err, rows, result) {
    //             if (err) {
    //                 console.log(err);
    //                 write_log('ERROR: chado.ct_trees_treegenes_dryad_without_tree_num could not be refreshed.');
    //                 reject('error occurred');
    //                 // res.status(400);
    //                 // return;
    //             }
    //             console.log('chado.ct_trees_treegenes_dryad_without_tree_num refresh completed');
    //             write_log('chado.ct_trees_treegenes_dryad_without_tree_num refresh completed.' + JSON.stringify(result));
    //             resolve('completed');
    //         });        
    //     });       

    //     var ct_trees_treegenes_dryad_promise_response = await new Promise(function(resolve,reject) {
    //         write_log('EXECUTING: ct_trees_treegenes_dryad');
    //         query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_trees_treegenes_dryad", [], function (err, rows, result) {
    //             if (err) {
    //                 console.log(err);
    //                 write_log('ERROR: chado.ct_trees_treegenes_dryad could not be refreshed.');
    //                 reject('error occurred');
    //                 // res.status(400);
    //                 // return;
    //             }
    //             console.log('chado.ct_trees_treegenes_dryad refresh completed');
    //             write_log('chado.ct_trees_treegenes_dryad refresh completed.' + JSON.stringify(result));
    //             resolve('completed');
    //         });        
    //     });


    //     var ct_trees_popstruct_promise_response = await new Promise(function(resolve,reject) {
    //         write_log('EXECUTING: ct_trees_popstruct');
    //         query ("REFRESH MATERIALIZED VIEW CONCURRENTLY public.ct_trees_popstruct;", [], function (err, rows, result) {
    //             if (err) {
    //                 console.log(err);
    //                 write_log('ERROR: public.ct_trees_popstruct could not be refreshed.');
    //                 reject('error occurred');
    //                 // res.status(400);
    //                 // return;
    //             }
    //             console.log('public.ct_trees_popstruct refresh completed');
    //             write_log('public.ct_trees_popstruct refresh completed.' + JSON.stringify(result));
    //             resolve('completed');
    //         });
    //     }); 


    //     var tpps_study_summary_promise_response = await new Promise(function(resolve,reject) {
    //         write_log('EXECUTING: tpps_study_summary');
    //         query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.tpps_study_summary;", [], function (err, rows, result) {
    //             if (err) {
    //                 console.log(err);
    //                 write_log('ERROR: chado.tpps_study_summary could not be refreshed.');
    //                 reject('error occurred');
    //                 // res.status(400);
    //                 // return;
    //             }
    //             console.log('chado.tpps_study_summary refresh completed');
    //             write_log('chado.tpps_study_summary refresh completed.' + JSON.stringify(result));
    //             resolve('completed');
    //         });        
    //     }); 
        
    //     var new_geno_view_promise_response = await new Promise(function(resolve,reject) {
    //         write_log('EXECUTING: new_geno_view');
    //         query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_geno_view", [], function (err, rows, result) {
    //             if (err) {
    //                 console.log(err);
    //                 write_log('ERROR: chado.new_geno_view could not be refreshed.');
    //                 reject('error occurred');
    //                 // res.status(400);
    //                 // return;
    //             }
    //             console.log('chado.new_geno_view refresh completed');
    //             write_log('chado.new_geno_view refresh completed.' + JSON.stringify(result));
    //             resolve('completed');
    //         });        
    //     }); 
        
    //     var geno_view_promise_response = await new Promise(function(resolve,reject) {
    //         write_log('EXECUTING: geno_view');
    //         query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.geno_view", [], function (err, rows, result) {
    //             if (err) {
    //                 console.log(err);
    //                 write_log('ERROR: chado.geno_view could not be refreshed.');
    //                 reject('error occurred');
    //                 // res.status(400);
    //                 // return;
    //             }
    //             console.log('chado.geno_view refresh completed');
    //             write_log('chado.geno_view refresh completed.' + JSON.stringify(result));
    //             resolve('completed');
    //         });
    //     });
        
    //     var plusgeno_view_promise_response = await new Promise(function(resolve,reject) {
    //         write_log('EXECUTING: plusgeno_view');
    //         query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.plusgeno_view", [], function (err, rows, result) {
    //             if (err) {
    //                 console.log(err);
    //                 write_log('ERROR: chado.plusgeno_view could not be refrshed.');
    //                 reject('error occurred');
    //                 // res.status(400);
    //                 // return;
    //             }
    //             console.log('chado.plusgeno_view refresh completed');
    //             write_log('chado.plusgeno_view refresh completed.' + JSON.stringify(result));
    //             resolve('completed');
    //         }); 
    //     });

    //     var new_pheno_view_promise_response = await new Promise(function(resolve,reject) {
    //         write_log('EXECUTING: new_pheno_view');
    //         query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_pheno_view", [], function (err, rows, result) {
    //             if (err) {
    //                 console.log(err);
    //                 write_log('ERROR: chado.new_pheno_view could not be refreshed.');
    //                 reject('error occurred');
    //                 // res.status(400);
    //                 // return;
    //             }
    //             console.log('chado.new_pheno_view refresh completed');
    //             write_log('chado.new_pheno_view refresh completed.' + JSON.stringify(result));
    //             resolve('completed');
    //         }); 
    //     });        
    // }

    // var ct_trees_promise_response = await new Promise(function(resolve,reject) {
    //     write_log('EXECUTING: ct_trees');
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY public.ct_trees;", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             write_log('ERROR: ct_trees could not be refreshed.');
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('ct_trees refresh completed');
    //         write_log('ct_trees refresh completed.' + JSON.stringify(result));
    //         resolve('completed');
    //     });
    // });

    // var ct_trees_all_view_promise_response = await new Promise(function(resolve,reject) {
    //     write_log('EXECUTING: ct_trees_all_view');
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY public.ct_trees_all_view", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             write_log('ERROR: ct_trees_all_view could not be refreshed.');
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('ct_trees_all_view refresh completed');
    //         write_log('ct_trees_all_view refresh completed.' + JSON.stringify(result));
    //         resolve('completed');
    //     });        
    // });      

    // OLD CODE - 12/10/2024 - V1
    // var ct_view_promise = new Promise(function(resolve,reject) {
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_view", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             reject('error occurred');                
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('chado.ct_view refresh completed');
    //         resolve('completed');
    //     });        
    // });

    // var ct_trees_treegenes_dryad_promise = new Promise(function(resolve,reject) {
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_trees_treegenes_dryad", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('chado.ct_trees_treegenes_dryad refresh completed');
    //         resolve('completed');
    //     });        
    // });

    // var ct_trees_all_view_promise = new Promise(function(resolve,reject) {
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY ct_trees_all_view", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('ct_trees_all_view refresh completed');
    //         resolve('completed');
    //     });        
    // });


    // var ct_trees_promise = new Promise(function(resolve,reject) {
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY ct_trees", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('ct_trees refresh completed');
    //         resolve('completed');
    //     });        
    // });

    // var tpps_study_summary_promise = new Promise(function(resolve,reject) {
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.tpps_study_summary", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('chado.tpps_study_summary refresh completed');
    //         resolve('completed');
    //     });        
    // }); 
    
    // var new_geno_view_promise = new Promise(function(resolve,reject) {
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_geno_view", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('chado.new_geno_view refresh completed');
    //         resolve('completed');
    //     });        
    // }); 
    
    // var geno_view_promise = new Promise(function(resolve,reject) {
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.geno_view", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('chado.geno_view refresh completed');
    //         resolve('completed');
    //     });        
    // }); 
    
    // var plusgeno_view_promise = new Promise(function(resolve,reject) {
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.plusgeno_view", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('chado.plusgeno_view refresh completed');
    //         resolve('completed');
    //     }); 
    // });

    // var new_pheno_view_promise = new Promise(function(resolve,reject) {
    //     query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_pheno_view", [], function (err, rows, result) {
    //         if (err) {
    //             console.log(err);
    //             reject('error occurred');
    //             // res.status(400);
    //             // return;
    //         }
    //         console.log('chado.new_pheno_view refresh completed');
    //         resolve('completed');
    //     }); 
    // });  
    
    // Run these promises, still indented but hopefully easier to modify
    // There is a reason for not chaining, if we returned promises from other
    // promises, we would have to edit each promise for changes which is more
    // difficult than just running a promise within a promise in this example.
    // check_refresh_views_promise.then(function(res) {
    //     console.log('Check refresh views did not detect any running refreshes... continuing...');
    //     ct_view_promise.then(function(res) {
    //         ct_trees_treegenes_dryad_promise.then(function(res) {
    //             ct_trees_all_view_promise.then(function(res) {
    //                 ct_trees_promise.then(function(res) {
    //                     tpps_study_summary_promise.then(function(res) {
    //                         new_geno_view_promise.then(function(res) {
    //                             geno_view_promise.then(function(res) {
    //                                 plusgeno_view_promise.then(function(res) {
    //                                     new_pheno_view_promise.then(function(res) {
    //                                         console.log('All views have been reloaded.')
    //                                     })
    //                                 })
    //                             })
    //                         })
    //                     })
    //                 })
    //             })
    //         })
    //     })
    // }).catch(function (err) {
    //     console.log('A refresh materialized view is already running');
    // });

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

async function write_log(str) {
    var fs = require('fs');
    var unixtime = Math.floor(Date.now() / 1000);
    fs.appendFile('refresh_views_log.txt', unixtime + ':' + str + "\n", function (err) {
        if (err) throw err;
        console.log('Saved!');
    });
}
process_trees_reload();