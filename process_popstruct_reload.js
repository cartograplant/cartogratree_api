async function process_popstruct_reload() {
    const query = require("./query");
    // console.log('Clear the cache');
    // ct_cache.clear();
    //refresh all dependent views
    
    // query ("", [], function (err, rows, result) {
    query ("REFRESH MATERIALIZED VIEW CONCURRENTLY ct_trees_all_view", [], function (err, rows, result) {
        if (err) {
            console.log(err);
            // res.status(400);
            return;
        }
    });
}
process_popstruct_reload();