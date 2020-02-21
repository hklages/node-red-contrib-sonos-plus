const NrcspHelpers = require('./Helper.js');
const NrcspSonos = require('./Sonos-Commands.js');

module.exports = function (RED) {
  'use strict';

  /**  Create Manage Radio Node and subscribe to messages.
  * @param  {object} config current node configuration data
  */
  function SonosManageMySonosNode (config) {
    RED.nodes.createNode(this, config);
    const sonosFunction = 'setup subscribe';

    const node = this;
    const configNode = RED.nodes.getNode(config.confignode);

    if (!((NrcspHelpers.isValidProperty(configNode, ['ipaddress']) && NrcspHelpers.REGEX_IP.test(configNode.ipaddress)) ||
      (NrcspHelpers.isValidProperty(configNode, ['serialnum']) && NrcspHelpers.REGEX_SERIAL.test(configNode.serialnum)))) {
      NrcspHelpers.failure(node, null, new Error('n-r-c-s-p: invalid config node - missing ip or serial number'), sonosFunction);
      return;
    }

    // clear node status
    node.status({});
    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received');

      // if ip address exist use it or get it via discovery based on serialNum
      if (NrcspHelpers.isValidProperty(configNode, ['ipaddress']) && NrcspHelpers.REGEX_IP.test(configNode.ipaddress)) {
        node.debug('using IP address of config node');
        processInputMsg(node, msg, configNode.ipaddress, configNode.serialnum);
      } else {
        // have to get ip address via disovery with serial numbers
        NrcspHelpers.warning(node, sonosFunction, 'No ip address', 'Providing ip address is recommended');
        if (NrcspHelpers.isValidProperty(configNode, ['serialnum']) && NrcspHelpers.REGEX_SERIAL.test(configNode.serialnum)) {
          NrcspHelpers.discoverSonosPlayerBySerial(node, configNode.serialnum, (err, ipAddress) => {
            if (err) {
              NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: discovery failed'), sonosFunction);
              return;
            }
            if (ipAddress === null) {
              NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: could not find any player by serial'), sonosFunction);
            } else {
              // setting of nodestatus is done in following call handelIpuntMessage
              node.debug('Found sonos player');
              processInputMsg(node, msg, ipAddress, configNode.serialnum);
            }
          });
        } else {
          NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: invalid config node - invalid serial'), sonosFunction);
        }
      }
    });
  }

  // ------------------------------------------------------------------------------------

  /**  Validate sonos player and input message then dispatch further.
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function processInputMsg (node, msg, ipaddress, serial) {
    // get sonos player object
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);

    const sonosFunction = 'handle input msg';

    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null ||
      (typeof sonosPlayer === 'number' && isNaN(sonosPlayer)) || sonosPlayer === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined sonos player'), sonosFunction);
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!NrcspHelpers.isValidPropertyNotEmptyString(msg, ['payload'])) {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined payload', sonosFunction));
      return;
    }

    // dispatch (dont add msg.topic because may not exist and is not checked)
    let command = String(msg.payload);
    command = command.toLowerCase();

    // dispatch
    if (command === 'get_items') {
      getMySonos(node, msg, sonosPlayer);
    } else if (command === 'queue') {
      queue(node, msg, sonosPlayer);
    } else if (command === 'stream') {
      stream(node, msg, sonosPlayer);
    } else if (command === 'lab_test') {
      NrcspSonos.play(sonosPlayer)
        .then((result) => {
          NrcspHelpers.success(node, msg, sonosFunction);
        })
        .catch((error) => NrcspHelpers.failure(node, msg, error, sonosFunction));
    } else {
      NrcspHelpers.warning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(command));
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /**  output array of My Sonos items as object.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} msg.payload  = array of my Sonos items with title, albumArt,uri, metaData, sid, upnpClass, processingType
  * uri, metadata, sid, upnpclass: empty string are allowed
  */
  function getMySonos (node, msg, sonosPlayer) {
    const sonosFunction = 'get My Sonos items';

    NrcspSonos.getAllMySonosItems(sonosPlayer)
      .then((items) => {
        if (items.length === 0) {
          throw new Error('n-r-c-s-p: could not find any My Sonos items');
        }
        msg.payload = items;
        NrcspHelpers.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }

  /**  queue (aka add) first My Sonos item - matching search string and filter - to SONOS queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {String} msg.topic search string
  * @param  {Object} msg.filter optional, example: { processingType: "queue", mediaType: "playlist", serviceName: "all" }
  * @param  {Object} sonosPlayer Sonos Player
  * @output: {Object} msg unmodified / stopped in case of error
  * Info:  content valdidation of mediaType, serviceName in NrcspSonos.findStringInMySonosTitle
  */
  function queue (node, msg, sonosPlayer) {
    const sonosFunction = 'queue my sonos item';

    // validate msg.topic
    if (!NrcspHelpers.isValidPropertyNotEmptyString(msg, ['topic'])) {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }

    // create filter object with processingType queue
    const filter = { processingType: 'queue' }; // no streams!
    // check existens and value of media typye/serviceName
    if (!NrcspHelpers.isValidPropertyNotEmptyString(msg, ['filter'])) {
      // default - no filter
      filter.serviceName = 'all';
      filter.mediaType = 'all';
    } else {
      if (NrcspHelpers.isValidPropertyNotEmptyString(msg, ['filter', 'mediaType'])) {
        filter.mediaType = msg.filter.mediaType;
      } else {
        throw new Error('n-r-c-s-p: missing media type' + JSON.stringify(msg.filter));
      }
      // check existens of service name
      if (NrcspHelpers.isValidPropertyNotEmptyString(msg, ['filter', 'serviceName'])) {
        filter.serviceName = msg.filter.serviceName;
      } else {
        throw new Error('n-r-c-s-p: missing service name. result msg.filter>>' + JSON.stringify(msg.filter));
      }
    }
    node.debug('filter value >>>' + JSON.stringify(filter));

    NrcspSonos.getAllMySonosItems(sonosPlayer)
      .then((items) => {
        return NrcspSonos.findStringInMySonosTitle(items, msg.topic, filter);
      })
      .then((found) => {
        console.log(JSON.stringify(found));
        return NrcspSonos.queue(sonosPlayer, found.uri, found.metaData);
      })
      .then((result) => NrcspHelpers.success(node, msg, sonosFunction))
      .catch((error) => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }

  /** stream (aka play) first radio/stream in My Sonos streams matching search string in msg.topic
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {String} msg.topic search string for title
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} msg unmodified / stopped in case of error
  */
  function stream (node, msg, sonosPlayer) {
    const sonosFunction = 'play my sonos stream';

    // validate msg.topic.
    if (NrcspHelpers.isValidPropertyNotEmptyString(msg, ['topic'])) {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    // TODO similiar to addURI, get service provider!
    const filter = { processingType: 'stream', mediaType: 'all', serviceName: 'all' }; // only streams

    NrcspSonos.getAllMySonosItems(sonosPlayer)
      .then((items) => {
        return NrcspSonos.findStringInMySonosTitle(items, msg.topic, filter);
      })
      .then((found) => {
        console.log(JSON.stringify(found));
        return sonosPlayer.setAVTransportURI(found.uri, found.metaData);
        // TODO switch to NrcspSonos.set...
        // return NrcspSonos.setAVTransportURI(sonosPlayer, found.uri, found.metaData);
      })
      .then((result) => NrcspHelpers.success(node, msg, sonosFunction))
      .catch((error) => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }

  RED.nodes.registerType('sonos-manage-mysonos', SonosManageMySonosNode);
};
