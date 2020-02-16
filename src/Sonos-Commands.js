'use strict';

const NrcsSoap = require('./Soap.js');

module.exports = {

  // SONOS related data

  // SONOS Functions

  /**  Get list of My Sonos items.
  * @param  {Object} sonosPlayer Sonos Player
  * @output {promise} items
  * array of my Sonos items as object.
  */
  getAllMySonosItems: async function (sonosPlayer) {
    // receive data from player
    const actionParameter = NrcsSoap.ACTIONS_TEMPLATES.browse;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    actionParameter.args.ObjectID = 'FV:2'; // My Sonos
    const { baseUrl, path, name, action, args } = actionParameter;
    const response = await NrcsSoap.sendToPlayerV1(baseUrl, path, name, action, args);

    // convert to SOAP XML to JSON
    let bodyXml;
    if (response.statusCode === 200) { // maybe not necessary as promise will throw error
      bodyXml = await NrcsSoap.parseSoapBody(response.body);
    } else {
      throw new Error('n-r-c-s-p: status code: ' + response.statusCode + '-- body:' + JSON.stringify(response.body));
    }

    // select/transform item properties
    const paths = actionParameter.responsePath;
    const result = paths.reduce((object, path) => {
      return (object || {})[path];
    }, bodyXml);
    const list = await NrcsSoap.parseBrowseFavoritesResults(result);

    return list;
  },

  /**  Adds all tracks given in uri to SONOS queue: single song, album, playlist
  * @param  {Object} sonosPlayer Sonos Player
  * @param  {string} uri  uri
  * @param  {string} meta  meta data
  * array of my Sonos items as object.
  */
  addToQueue: async function (sonosPlayer, uri, meta) {
    // copy action parameter and update
    const actionParameter = NrcsSoap.ACTIONS_TEMPLATES.addURIToQueue;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    actionParameter.args.EnqueuedURI = NrcsSoap.encodeXml(uri);
    actionParameter.args.EnqueuedURIMetaData = NrcsSoap.encodeXml(meta);
    const { baseUrl, path, name, action, args } = actionParameter;
    const response = await NrcsSoap.sendToPlayerV1(baseUrl, path, name, action, args);

    // convert to SOAP XML to JSON
    let bodyXml;
    if (response.statusCode === 200) { // maybe not necessary as promise will throw error
      bodyXml = await NrcsSoap.parseSoapBody(response.body);
    } else {
      throw new Error('n-r-c-s-p: status code: ' + response.statusCode + '-- body:' + JSON.stringify(response.body));
    }

    // select/transform item properties
    const paths = actionParameter.responsePath;
    const result = paths.reduce((object, path) => {
      return (object || {})[path];
    }, bodyXml);
    if (result !== actionParameter.responseValue) {
      throw new Error('n-r-c-s-p: got error message from player: ' + JSON.stringify(bodyXml));
    }
    return true;
  }

};
