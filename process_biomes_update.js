const { PerformanceObserver, performance } = require('perf_hooks');
const config = require('./config');
const query = require("./query");
const ct_cache = require("memory-cache");
var pg_native_client = require('pg-native');
const cache_time_24 = 24*60*60*1000;
const retus = require("retus");
const sleep = require("./sleep");


async function perform_biomes_update() {
    var pretext = "BIOMES UPDATE: ";
    console.log('Update biomes from the database for trees that do not have records');
    query ("SELECT COUNT(*) FROM public.ct_trees_biome_data", [], function (err, rows, result) {
        if (err) {
            console.log(err);
            //res.status(400);
            return;
        }
        console.log('Finding trees that do not have biome data - this could take a while!');
        // query ("SELECT uniquename, latitude, longitude FROM public.ct_trees WHERE uniquename NOT IN (SELECT tree_acc FROM public.ct_trees_biome_data)", [], async function (err, trees_rows, result) {
        query ("SELECT uniquename, latitude, longitude FROM ct_trees t LEFT JOIN ct_trees_biome_data b ON b.tree_acc = t.uniquename WHERE b.tree_acc IS NULL", [], async function (err, trees_rows, result) {
            if (err) {
                console.log(err);
                //res.status(400);
                return;
            }


            for(var i=0; i<trees_rows.length; i++) {
                var tree_acc = trees_rows[i].uniquename;
                //console.log("tree_acc:" + tree_acc);

                // We need to query Geoserver Biome Layer
                var bbox_offset = 0.00000001;
                var bbox = (trees_rows[i].latitude - bbox_offset)  + "," + (trees_rows[i].longitude - bbox_offset) + "," + (trees_rows[i].latitude + bbox_offset) + "," + (trees_rows[i].longitude + bbox_offset);
                // https://treegenesdb.org/geoserver/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=ct:terrestrialecoregions2013&LAYERS=ct:terrestrialecoregions2013&INFO_FORMAT=application%2Fjson&I=128&J=128&WIDTH=256&HEIGHT=256&CRS=EPSG:4326&STYLES=&BBOX=36.33757500746764%2C-100.82608947753931%2C36.537575007467645%2C-100.62608947753932
                var gs_url = "https://treegenesdb.org/geoserver/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&FORMAT=image%2Fpng&TRANSPARENT=true&QUERY_LAYERS=ct:terrestrialecoregions2013&LAYERS=ct:terrestrialecoregions2013&INFO_FORMAT=application%2Fjson&I=128&J=128&WIDTH=256&HEIGHT=256&CRS=EPSG:4326&STYLES=&BBOX=" + encodeURI(bbox);
                var response_data = retus(gs_url);
                //console.log(response_data.body);
                try {
                    // TODO process this JSON data then insert using the code below
                    var response_json = JSON.parse(response_data.body);
                    //console.log(response_json.features[0].properties.BIOME);

                    if(response_json.features.length > 0) {
                        var biome = response_json.features[0].properties.BIOME;
                        
                        console.log(pretext + ' Adding tree ' + (i+1) + ' of ' +  trees_rows.length + ' ' + tree_acc + " with biome value " + biome);
                        query ("INSERT INTO public.ct_trees_biome_data (tree_acc, biome) VALUES ($1, $2) ON CONFLICT(tree_acc) DO NOTHING;", [tree_acc, biome], function (err, rows, result) {
                            if (err) {
                                console.log(err);
                                //res.status(400);
                                return;
                            }
                            // res.status(200).json("success");
                            // return;	
                        });
                        
                        try {
                            console.log(pretext + 'Taking a rest...');
                            await sleep.sleep(150);
                        }
                        catch (err) {
                            console.log(err);
                        }
                    }
                }
                catch (err) {

                }
            }

        });

        //res.status(200).json("success");
        //return;	
    });
}


perform_biomes_update();