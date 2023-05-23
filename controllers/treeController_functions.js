

/**
 * This function pulls species corrections into the cache for further use when 
 * processing imports from WFID for example.
 */
exports.load_species_corrections_from_csv_function = function() {
  const csv = require('csv-parser')
  const fs = require('fs')
  const results = [];
  try {
    fs.createReadStream(__dirname + '/../store/species_corrections.csv')
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        const ct_cache = require("memory-cache");
        ct_cache.put('species_corrections', results);
        // console.log(results);
        console.log('Species corrections read and saved to cache for further use');
        // [
        //   { NAME: 'Daffy Duck', AGE: '24' },
        //   { NAME: 'Bugs Bunny', AGE: '22' }
        // ]
      }
    );  
  }
  catch (err) {
    console.log(err);
    console.log('Could not load / cache species corrections...');
    console.log('There is no "store/species_corrections.csv" file. Columns should be species,correction,operation');
  }
}

/**
 * This requests a new oauth token for World Forest ID via direct function (used for cronjob in cartogratree_api.js)
 */
 exports.wfid_oauth_token_request_function = function(config,db_storage) {
   try {
    var url = config.conf_wfid.host + '/oauth/token';
    console.log('oauth/token url', url);
    var axios = require('axios').default;
    axios.post(url, {
      grant_type:'password',
      client_id:config.conf_wfid.client_id,
      client_secret: config.conf_wfid.client_secret,
      username: config.conf_wfid.username,
      password: config.conf_wfid.password,
      scope: ''
    }, {
      headers: {
          'Content-Type': 'application/json'
      }
		}).then(function (response) {
      console.log('response', response);
      console.log('response.data', response.data);
      var unix_time = Math.floor(Date.now() / 1000); // save the unix time when this token was generated
      body.time_generated = unix_time;

      db_storage.set('wfid_oauth_object', response.data);
      console.log('New WFID oauth object has been retrieved and saved!');
    }).catch(function (err) {
      console.log(err);
    });
     // DEPRECATED
      //  request.post(
      //    {
      //      url: url,
      //      json: {
      //        grant_type:'password',
      //        client_id:config.conf_wfid.client_id,
      //        client_secret: config.conf_wfid.client_secret,
      //        username: config.conf_wfid.username,
      //        password: config.conf_wfid.password,
      //        scope: ''
      //      },
      //      headers: {
      //          'Content-Type': 'application/json'
      //      }
      //    },
      //    function(error, response, body){
      //      // console.log(error);
      //      // console.log(response);
      //      // console.log(body);
  
      //      var unix_time = Math.floor(Date.now() / 1000); // save the unix time when this token was generated
      //      body.time_generated = unix_time;
  
      //      db_storage.set('wfid_oauth_object', body);
      //      console.log('New WFID oauth object has been retrieved and saved!');
          
      //    }
      //  );    
   }
   catch (err) {
     console.log(err);
   }
 }
 