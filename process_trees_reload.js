async function process_trees_reload() {
    const query = require("./query");
    // console.log('Clear the cache');
    // ct_cache.clear();
    //refresh all dependent views
    var fs = require('fs');
    fs.unlink('refresh_views_log.txt', function (err) {
        console.log(err);
    });
    

    var check_refresh_views_promise_response = await new Promise(function(resolve,reject) {
        query ("SELECT pid, age(clock_timestamp(), query_start), usename, query " +
            "FROM pg_stat_activity " + 
            "WHERE query != '<IDLE>' AND query NOT ILIKE '%pg_stat_activity%' " + 
            "AND query LIKE 'REFRESH MATERIALIZED%' " + 
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
                let query_spaced_parts = query_running.split(" ");
                let view_names = [
                    'chado.ct_view',
                    'chado.ct_trees_treegenes_dryad_without_tree_num',
                    'chado.ct_trees_treegenes_dryad',
                    'ct_trees_all_view',
                    'public.ct_trees_all_view',
                    'public.ct_trees_popstruct',
                    // 'ct_trees_all_view_tmp',
                    // 'public.ct_trees_all_view_tmp',
                    'ct_trees',
                    'chado.tpps_study_summary',
                    'chado.new_geno_view',
                    'chado.geno_view',
                    'chado.plusgeno_view',
                    'chado.new_pheno_view'
                ];
                // check if query contains refresh capitalized keyword
                // check if query spaced parts more than or equal to 5 in length
                // this length conforms with the queries we run to refresh materialized views
                if(query_running.includes('REFRESH MATERIALIZED VIEW') && query_spaced_parts.length >= 5) {
                    if (view_names.includes(query_spaced_parts[4])) {
                        console.log('REFRESH views query already running:' + query_running);
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
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_view", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: chado.ct_view could not be refreshed.'); 
                    reject('error occurred');               
                    // res.status(400);
                    // return;
                }
                console.log('chado.ct_view refresh completed');
                write_log('chado.ct_view refresh completed.' + JSON.stringify(result)); 
                resolve('completed');
            });        
        });

        // ct_trees_treegenes_dryad_without_tree_num
        var ct_trees_treegenes_dryad_without_tree_num_promise_response = await new Promise(function(resolve,reject) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_trees_treegenes_dryad_without_tree_num", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: chado.ct_trees_treegenes_dryad_without_tree_num could not be refreshed.');
                    reject('error occurred');
                    // res.status(400);
                    // return;
                }
                console.log('chado.ct_trees_treegenes_dryad_without_tree_num refresh completed');
                write_log('chado.ct_trees_treegenes_dryad_without_tree_num refresh completed.' + JSON.stringify(result));
                resolve('completed');
            });        
        });       

        var ct_trees_treegenes_dryad_promise_response = await new Promise(function(resolve,reject) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.ct_trees_treegenes_dryad", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: chado.ct_trees_treegenes_dryad could not be refreshed.');
                    reject('error occurred');
                    // res.status(400);
                    // return;
                }
                console.log('chado.ct_trees_treegenes_dryad refresh completed');
                write_log('chado.ct_trees_treegenes_dryad refresh completed.' + JSON.stringify(result));
                resolve('completed');
            });        
        });


        var ct_trees_popstruct_promise_response = await new Promise(function(resolve,reject) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY public.ct_trees_popstruct;", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: public.ct_trees_popstruct could not be refreshed.');
                    reject('error occurred');
                    // res.status(400);
                    // return;
                }
                console.log('public.ct_trees_popstruct refresh completed');
                write_log('public.ct_trees_popstruct refresh completed.' + JSON.stringify(result));
                resolve('completed');
            });
        });        

        // // Drop ct_trees_all_view_tmp if exists (this is the old view)
        // var ct_trees_all_view_tmp_drop_promise_response = await new Promise(function(resolve,reject) {
        //     query ("DROP MATERIALIZED VIEW IF EXISTS ct_trees_all_view_tmp", [], function (err, rows, result) {
        //         if (err) {
        //             console.log(err);
        //             write_log('ERROR: ct_trees_all_view_unique_idx_tmp INDEX could not be dropped.');
        //             reject('error occurred');
        //             // res.status(400);
        //             // return;
        //         }
        //         console.log('ct_trees_all_view_unique_idx_tmp INDEX DROP completed');
        //         write_log('ct_trees_all_view_unique_idx_tmp INDEX DROP completed' + JSON.stringify(result));
        //         resolve('completed');
        //     });
        // }); 


        // // Create a ct_trees_all_view_tmp first
        // var ct_trees_all_view_tmp_promise_response = await new Promise(function(resolve,reject) {
        //     var sql = `CREATE MATERIALIZED VIEW IF NOT EXISTS public.ct_trees_all_view_tmp
        //     TABLESPACE pg_default
        //     AS
        //      SELECT DISTINCT t.uniquename,
        //         t.is_tree,
        //         t.family,
        //         t.genus,
        //         t.species,
        //         t.subkingdom,
        //         t.latitude,
        //         t.longitude,
        //         t.coordinate_type,
        //         t.source_id,
        //         t.icon_type,
        //         t.tree_num,
        //         p.synonym AS phenotype_name,
        //         p.observable_name,
        //         p.structure_name,
        //         g.marker_type,
        //         pb.title,
        //         pb.author,
        //         pb.accession,
        //         t.study_accession,
        //         popstruct.population,
        //         popstruct.pop_source_id
        //        FROM public.ct_trees t
        //          LEFT JOIN chado.new_pheno_view_update p ON t.uniquename = p.tree_acc
        //          LEFT JOIN chado.new_geno_view g ON t.uniquename = g.tree_acc
        //          LEFT JOIN chado.plusgeno_view pb ON t.uniquename ~~ (pb.accession::text || '%'::text)
        //          LEFT JOIN ( SELECT pop.uniquename,
        //                 pop.study_accession,
        //                 pop.population,
        //                 y.pop_source_id
        //                FROM public.cartogratree_popstruct_layer pop
        //                  JOIN ( SELECT DISTINCT ct_trees.study_accession,
        //                         "right"(ct_trees.study_accession, 3) AS pop_source_id
        //                        FROM public.ct_trees) y ON pop.study_accession = y.study_accession) popstruct ON t.uniquename = popstruct.uniquename AND t.study_accession = popstruct.study_accession
        //     WITH DATA;`;
        //     query (sql, [], function (err, rows, result) {
        //         if (err) {
        //             console.log(err);
        //             write_log('ERROR: ct_trees_all_view_tmp could not be created.');
        //             reject('error occurred');
        //             // res.status(400);
        //             // return;
        //         }
        //         console.log('ct_trees_all_view_tmp created completed');
        //         write_log('ct_trees_all_view_tmp created completed.' + JSON.stringify(result));
        //         resolve('completed');
        //     });        
        // });

        // // Drop index if exists
        // var ct_trees_all_view_tmp_drop_index_promise_response = await new Promise(function(resolve,reject) {
        //     query ("DROP INDEX IF EXISTS ct_trees_all_view_unique_idx_tmp", [], function (err, rows, result) {
        //         if (err) {
        //             console.log(err);
        //             write_log('ERROR: ct_trees_all_view_unique_idx_tmp INDEX could not be dropped.');
        //             reject('error occurred');
        //             // res.status(400);
        //             // return;
        //         }
        //         console.log('ct_trees_all_view_unique_idx_tmp INDEX DROP completed');
        //         write_log('ct_trees_all_view_unique_idx_tmp INDEX DROP completed' + JSON.stringify(result));
        //         resolve('completed');
        //     });
        // });         

        // // Create the index
        // var ct_trees_all_view_tmp_create_index_promise_response = await new Promise(function(resolve,reject) {
        //     var sql = `CREATE UNIQUE INDEX ct_trees_all_view_unique_idx_tmp
        //     ON public.ct_trees_all_view_tmp USING btree
        //     (uniquename COLLATE pg_catalog."default", phenotype_name COLLATE pg_catalog."default", title COLLATE pg_catalog."default", author COLLATE pg_catalog."default", marker_type COLLATE pg_catalog."default", population)
        //     TABLESPACE pg_default;`;
        //     query (sql, [], function (err, rows, result) {
        //         if (err) {
        //             console.log(err);
        //             write_log('ERROR: ct_trees_all_view_unique_idx_tmp INDEX could not be created.');
        //             reject('error occurred');
        //             // res.status(400);
        //             // return;
        //         }
        //         console.log('ct_trees_all_view_unique_idx_tmp INDEX CREATED completed');
        //         write_log('ct_trees_all_view_unique_idx_tmp INDEX CREATED completed' + JSON.stringify(result));
        //         resolve('completed');
        //     });
        // });

        
        // // Grant access to the view
        // var ct_trees_all_view_grant1_promise_response = await new Promise(function(resolve,reject) {
        //     query ("GRANT ALL ON TABLE public.ct_trees_all_view_tmp TO cartograplant;", [], function (err, rows, result) {
        //         if (err) {
        //             console.log(err);
        //             write_log('ERROR: ct_trees_all_view_tmp could not be granted (1).');
        //             reject('error occurred');
        //             // res.status(400);
        //             // return;
        //         }
        //         console.log('ct_trees_all_view_tmp grant1 completed');
        //         write_log('ct_trees_all_view_tmp grant1 completed.' + JSON.stringify(result));
        //         resolve('completed');
        //     });
        // });        

        // // Grant access to the view
        // var ct_trees_all_view_grant1_promise_response = await new Promise(function(resolve,reject) {
        //     query ("GRANT ALL ON TABLE public.ct_trees_all_view_tmp TO drupal;", [], function (err, rows, result) {
        //         if (err) {
        //             console.log(err);
        //             write_log('ERROR: ct_trees_all_view_tmp could not be granted (2).');
        //             reject('error occurred');
        //             // res.status(400);
        //             // return;
        //         }
        //         console.log('ct_trees_all_view_tmp grant2 completed');
        //         write_log('ct_trees_all_view_tmp grant2 completed.' + JSON.stringify(result));
        //         resolve('completed');
        //     });
        // });

        // // Drop the backup view
        // var ct_trees_all_view_drop_promise_response = await new Promise(function(resolve,reject) {
        //     query ("DROP MATERIALIZED VIEW IF EXISTS public.ct_trees_all_view_backup;", [], function (err, rows, result) {
        //         if (err) {
        //             console.log(err);
        //             write_log('ERROR: ct_trees_all_view_backup DROP could not be done.');
        //             reject('error occurred');
        //             // res.status(400);
        //             // return;
        //         }
        //         console.log('ct_trees_all_view_backup DROP completed');
        //         write_log('ct_trees_all_view_backup DROP completed.' + JSON.stringify(result));
        //         resolve('completed');
        //     });
        // });

        // // Rename the ct_trees_all_view to backup
        // var ct_trees_all_view_drop_promise_response = await new Promise(function(resolve,reject) {
        //     query ("ALTER MATERIALIZED VIEW ct_trees_all_view RENAME TO ct_trees_all_view_backup;", [], function (err, rows, result) {
        //         if (err) {
        //             console.log(err);
        //             write_log('ERROR: ct_trees_all_view RENAME could not be done.');
        //             reject('error occurred');
        //             // res.status(400);
        //             // return;
        //         }
        //         console.log('ct_trees_all_view RENAME backup completed');
        //         write_log('ct_trees_all_view RENAME backup completed.' + JSON.stringify(result));
        //         resolve('completed');
        //     });
        // });        

        // // Rename the tmp view to the ct_trees_all_view
        // var ct_trees_all_view_rename_promise_response = await new Promise(function(resolve,reject) {
        //     query ("ALTER MATERIALIZED VIEW IF EXISTS ct_trees_all_view_tmp RENAME TO ct_trees_all_view;", [], function (err, rows, result) {
        //         if (err) {
        //             console.log(err);
        //             write_log('ERROR: ct_trees_all_view_tmp to ct_trees_all_view could not be renamed.');
        //             reject('error occurred');
        //             // res.status(400);
        //             // return;
        //         }
        //         console.log('ct_trees_all_view_tmp to ct_trees_all_view rename completed');
        //         write_log('ct_trees_all_view_tmp to ct_trees_all_view rename completed.' + JSON.stringify(result));
        //         resolve('completed');
        //     });
        // });
        
        var ct_trees_all_view_promise_response = await new Promise(function(resolve,reject) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY ct_trees_all_view", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: ct_trees_all_view could not be refreshed.');
                    reject('error occurred');
                    // res.status(400);
                    // return;
                }
                console.log('ct_trees_all_view refresh completed');
                write_log('ct_trees_all_view refresh completed.' + JSON.stringify(result));
                resolve('completed');
            });        
        });

        var ct_trees_promise_response = await new Promise(function(resolve,reject) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY ct_trees;", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: ct_trees could not be refreshed.');
                    reject('error occurred');
                    // res.status(400);
                    // return;
                }
                console.log('ct_trees refresh completed');
                write_log('ct_trees refresh completed.' + JSON.stringify(result));
                resolve('completed');
            });
        });

        var tpps_study_summary_promise_response = await new Promise(function(resolve,reject) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.tpps_study_summary;", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: chado.tpps_study_summary could not be refreshed.');
                    reject('error occurred');
                    // res.status(400);
                    // return;
                }
                console.log('chado.tpps_study_summary refresh completed');
                write_log('chado.tpps_study_summary refresh completed.' + JSON.stringify(result));
                resolve('completed');
            });        
        }); 
        
        var new_geno_view_promise_response = await new Promise(function(resolve,reject) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_geno_view", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: chado.new_geno_view could not be refreshed.');
                    reject('error occurred');
                    // res.status(400);
                    // return;
                }
                console.log('chado.new_geno_view refresh completed');
                write_log('chado.new_geno_view refresh completed.' + JSON.stringify(result));
                resolve('completed');
            });        
        }); 
        
        var geno_view_promise_response = await new Promise(function(resolve,reject) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.geno_view", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: chado.geno_view could not be refreshed.');
                    reject('error occurred');
                    // res.status(400);
                    // return;
                }
                console.log('chado.geno_view refresh completed');
                write_log('chado.geno_view refresh completed.' + JSON.stringify(result));
                resolve('completed');
            });
        }); 
        
        var plusgeno_view_promise_response = await new Promise(function(resolve,reject) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.plusgeno_view", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: chado.plusgeno_view could not be refrshed.');
                    reject('error occurred');
                    // res.status(400);
                    // return;
                }
                console.log('chado.plusgeno_view refresh completed');
                write_log('chado.plusgeno_view refresh completed.' + JSON.stringify(result));
                resolve('completed');
            }); 
        });

        var new_pheno_view_promise_response = await new Promise(function(resolve,reject) {
            query ("REFRESH MATERIALIZED VIEW CONCURRENTLY chado.new_pheno_view", [], function (err, rows, result) {
                if (err) {
                    console.log(err);
                    write_log('ERROR: chado.new_pheno_view could not be refreshed.');
                    reject('error occurred');
                    // res.status(400);
                    // return;
                }
                console.log('chado.new_pheno_view refresh completed');
                write_log('chado.new_pheno_view refresh completed.' + JSON.stringify(result));
                resolve('completed');
            }); 
        });        
    }

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
    fs.appendFile('refresh_views_log.txt', str + "\n", function (err) {
        if (err) throw err;
        console.log('Saved!');
    });
}
process_trees_reload();