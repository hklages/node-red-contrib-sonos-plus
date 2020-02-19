'use strict';

const NrcspSoap = require('./Soap.js');

module.exports = {

  // SONOS related data
  MEDIA_TYPES: ['all', 'playlist', 'Album', 'Track'],

  // SONOS Functions

  /**  Get list of all My Sonos items.
  * @param  {Object} sonosPlayer Sonos Player
  * @output {promise} items
  * array of my Sonos items as object.
  */
  getAllMySonosItems: async function (sonosPlayer) {
    // receive data from player
    const actionParameter = NrcspSoap.ACTIONS_TEMPLATES.browse;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    actionParameter.args.ObjectID = 'FV:2'; // My Sonos
    const { baseUrl, path, name, action, args } = actionParameter;
    const response = await NrcspSoap.sendToPlayerV1(baseUrl, path, name, action, args);

    // convert to SOAP XML to JSON
    let bodyXml;
    if (response.statusCode === 200) { // maybe not necessary as promise will throw error
      bodyXml = await NrcspSoap.parseSoapBody(response.body);
    } else {
      throw new Error('n-r-c-s-p: status code: ' + response.statusCode + '-- body:' + JSON.stringify(response.body));
    }

    // select/transform item properties
    const paths = actionParameter.responsePath;
    const result = paths.reduce((object, path) => {
      return (object || {})[path];
    }, bodyXml);
    const list = await NrcspSoap.parseBrowseFavoritesResults(result);
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
    const actionParameter = NrcspSoap.ACTIONS_TEMPLATES.addURIToQueue;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    actionParameter.args.EnqueuedURI = NrcspSoap.encodeXml(uri);
    actionParameter.args.EnqueuedURIMetaData = NrcspSoap.encodeXml(meta);
    const { baseUrl, path, name, action, args } = actionParameter;
    const response = await NrcspSoap.sendToPlayerV1(baseUrl, path, name, action, args);

    // convert to SOAP XML to JSON
    let bodyXml;
    if (response.statusCode === 200) { // maybe not necessary as promise will throw error
      bodyXml = await NrcspSoap.parseSoapBody(response.body);
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
    const actionParameter = NrcspSoap.ACTIONS_TEMPLATES.setAVTransportURI;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    actionParameter.args.EnqueuedURI = NrcspSoap.encodeXml(uri);
    actionParameter.args.EnqueuedURIMetaData = NrcspSoap.encodeXml(meta);
    console.log('args' + JSON.stringify(actionParameter.args));
    const { baseUrl, path, name, action, args } = actionParameter;
    const response = await NrcspSoap.sendToPlayerV1(baseUrl, path, name, action, args);

    // convert to SOAP XML to JSON
    let bodyXml;
    if (response.statusCode === 200) { // maybe not necessary as promise will throw error
      bodyXml = await NrcspSoap.parseSoapBody(response.body);
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
    const actionParameter = NrcspSoap.ACTIONS_TEMPLATES.play;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    console.log(actionParameter.baseUrl);
    const { baseUrl, path, name, action, args } = actionParameter;
    const response = await NrcspSoap.sendToPlayerV1(baseUrl, path, name, action, args);

    // convert to SOAP XML to JSON
    let bodyXml;
    if (response.statusCode === 200) { // maybe not necessary as promise will throw error
      bodyXml = await NrcspSoap.parseSoapBody(response.body);
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

  /** find searchString in My Sonos items, property title
  * @param  {Array} items array of objects with property title, ...
  * @param  {string} searchString search string for title property
  * @param  {Object} filter filter to reduce returned item playlist
  * @param  {string} filter.processingType
  * @param  {string} filter.mediaType media type Album, Track, playlist
  * @param  {string} filter.serviceName service name according to SERVICE_NAME
  * @return {promise} object {title, uri, meta} or null if not found
  */

  findStringInMySonosTitle: async function (items, searchString, filter) {
    // get sid from name
    console.log(JSON.stringify(filter));

    // get service id from filter.serviceName or set '' if all.
    let service;
    if (filter.serviceName !== 'all') {
      service = NrcspSoap.SERVICES.find(o => o.name === filter.serviceName);
      if (!service) {
        throw new Error('n-r-c-s-p: service currently not supported > ' + filter.serviceName);
      }
    }

    if (!this.MEDIA_TYPES.includes(filter.mediaType)) {
      throw new Error('n-r-c-s-p: invalid media type ' + filter.mediaType);
    }

    for (var i = 0; i < items.length; i++) {
      if ((items[i].title.includes(searchString)) &&
        (items[i].processingType === filter.processingType) &&
        (items[i].sid === service.sid || filter.serviceName === 'all') &&
        (items[i].upnpClass.includes(filter.mediaType) || filter.mediaType === 'all')) {
        return { title: items[i].title, uri: items[i].uri, metaData: items[i].metaData };
      }
    }
    // not found
    console.log('does not found matching item');
    throw new Error('n-r-c-s-p: No title machting msg.topic found. Modify msg.topic');
  }
};
