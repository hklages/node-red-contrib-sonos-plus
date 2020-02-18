'use strict';

const NrcsSoap = require('./Soap.js');

module.exports = {

  // SONOS related data
  FILTER_TYPES: ['all', 'playlist', 'album', 'track'],
  STREAM_IDENTIFIERS: ['x-sonosapi-stream', 'x-sonosapi-radio', 'x-rincon-mp3radio', 'hls-radio:'],

  // SONOS Functions

  /**  Filter My Sonos items.
  * @param  {Object} itmes array of my sonos items with title, uri, metadata
  * @param  {Object} filter
  * @param  {string} filter.stream should be yes or now
  * @output {promise} items
  * array of my Sonos items as object.
  */
  filterMySonosItems: async function (items, filter) {
    const filteredList = [];
    let uriPart = '';
    items.forEach((item, i) => {
      if (item.uri) {
        uriPart = item.uri.split(':')[0];
        if (this.STREAM_IDENTIFIERS.includes(uriPart) && filter.stream) {
          filteredList.push(item);
        }
        if (!this.STREAM_IDENTIFIERS.includes(uriPart) && !filter.stream) {
          filteredList.push(item);
        }
      } else {
        throw new Error('n-r-c-s-p: Item list contains an item without uri: ' + item.title);
      }
    });
    return filteredList;
  },

  /** Find item with property title matching serach string in array
  * @param  {Array} items array of objects with property title
  * @param  {Array} searchString string of objects with property title
  * @return {promise} object {title, uri, meta} or null if not found
  */

  findInArray: async function (items, searchString) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].title.includes(searchString)) {
        console.log('found item');
        return { title: items[i].title, uri: items[i].uri, metaData: items[i].metaData };
      }
    }
    // not found
    console.log('does not found matching item');
    throw new Error('n-r-c-s-p: No title machting msg.topic found. Modify msg.topic');
  },

  /**  Get list of all My Sonos items.
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

  /**  Adds all tracks given uri to SONOS queue: single song, album, playlist
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
  },

  /**  set AVTransportURI: plays a stream or changes to different line
  * @param  {Object} sonosPlayer Sonos Player
  * @param  {string} uri  uri
  * @param  {string} meta  meta data
  */
  setAVTransportURI: async function (sonosPlayer, uri, meta) {
    // copy action parameter and update
    const actionParameter = NrcsSoap.ACTIONS_TEMPLATES.setAVTransportURI;
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
  },
  /**  play
  * @param  {Object} sonosPlayer Sonos Player
  */
  play: async function (sonosPlayer) {
    // copy action parameter and update
    const actionParameter = NrcsSoap.ACTIONS_TEMPLATES.play;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    console.log(actionParameter.baseUrl);
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
