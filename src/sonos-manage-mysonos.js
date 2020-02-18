const NrcspHelpers = require('./Helper.js');
const NrcspSonos = require('./Sonos-Commands.js');
const NrcspSoap = require('./Soap.js');

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

    if (!NrcspHelpers.validateConfigNode(configNode)) {
      NrcspHelpers.failure(node, null, new Error('n-r-c-s-p: invalid config node'), sonosFunction);
      return;
    }

    // clear node status
    node.status({});
    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received');

      // if ip address exist use it or get it via discovery based on serialNum
      if (!(typeof configNode.ipaddress === 'undefined' || configNode.ipaddress === null ||
        (typeof configNode.ipaddress === 'number' && isNaN(configNode.ipaddress)) || configNode.ipaddress.trim().length < 7)) {
        // exisiting ip address - fastes solution, no discovery necessary
        node.debug('using IP address of config node');
        processInputMsg(node, msg, configNode.ipaddress, configNode.serialnum);
      } else {
        // have to get ip address via disovery with serial numbers
        NrcspHelpers.warning(node, sonosFunction, 'No ip address', 'Providing ip address is recommended');
        if (!(typeof configNode.serialnum === 'undefined' || configNode.serialnum === null ||
                (typeof configNode.serialnum === 'number' && isNaN(configNode.serialnum)) || (configNode.serialnum.trim()).length < 19)) {
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
    if (typeof msg.payload === 'undefined' || msg.payload === null ||
      (typeof msg.payload === 'number' && isNaN(msg.payload)) || msg.payload === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined payload', sonosFunction));
      return;
    }

    // dispatch (dont add msg.topic because may not exist and is not checked)
    let command = String(msg.payload);
    command = command.toLowerCase();

    // dispatch
    if (command === 'get_items') {
      getMySonos(node, msg, sonosPlayer);
    } else if (command === 'add') {
      addToQueue(node, msg, sonosPlayer);
    } else if (command === 'play_stream') {
      playStream(node, msg, sonosPlayer);
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

  /**  Get list of My Sonos items.
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * change msg.payload to current array of my Sonos items
  */
  function getMySonos (node, msg, sonosPlayer) {
    const sonosFunction = 'get items';

    NrcspSonos.getAllMySonosItems(sonosPlayer)
      .then((items) => {
        msg.payload = items;
        NrcspHelpers.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }

  /**  add My Sonos item to queue
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
            {String} msg.topic title
  * @param  {Object} sonosPlayer Sonos Player
  * @output: {Object} msg unmodified / stopped in case of error
  */
  function addToQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'add mysonos item to queue';

    // validate msg.topic an
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }

    // create filter for not stream and type
    const filter = { stream: false }; // no streams!
    // validate msg.filter
    if (!(typeof msg.filter === 'undefined' || msg.filter === null ||
      (typeof msg.filter === 'number' && isNaN(msg.filter)) || msg.filter === '')) {
      const filterString = msg.filter;
      if (filterString.startsWith('type')) {
        const type = filterString.susbstring('type'.length); // because of :
        if (NrcspSonos.FILTER_TYPES.includes(type)) {
          filter.type = type;
        } else {
          NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: invalid filter parameter'), sonosFunction);
          return;
        }
      } else {
        NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: invalid filter - must start with keyword type'), sonosFunction);
        return;
      }
    } else {
      filter.type = 'all';
    }

    NrcspSonos.getAllMySonosItems(sonosPlayer)
      .then((items) => {
        return NrcspSonos.filterMySonosItems(items, filter);
      })
      .then((filteredItems) => {
        return NrcspSonos.findInArray(filteredItems, msg.topic);
      })
      .then((found) => {
        console.log(JSON.stringify(found));
        return NrcspSonos.addToQueue(sonosPlayer, found.uri, found.metaData);
      })
      .then((result) => {
        NrcspHelpers.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }

  /**  play My Sonos stream
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
            {String} msg.topic title
  * @param  {Object} sonosPlayer Sonos Player
  * @output: {Object} msg unmodified / stopped in case of error
  */
  function playStream (node, msg, sonosPlayer) {
    const sonosFunction = 'play my sonos stream';

    // validate msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }

    const filter = { stream: true }; // only streams
    // validate msg.filter
    if (!(typeof msg.filter === 'undefined' || msg.filter === null ||
      (typeof msg.filter === 'number' && isNaN(msg.filter)) || msg.filter === '')) {
      const filterString = msg.filter;
      if (filterString.startsWith('type')) {
        const type = filterString.susbstring('type'.length); // because of :
        if (NrcspSonos.FILTER_TYPES.includes(type)) {
          filter.type = type;
        } else {
          NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: invalid filter parameter'), sonosFunction);
          return;
        }
      } else {
        NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: invalid filter - must start with keyword type'), sonosFunction);
        return;
      }
    } else {
      filter.type = 'all';
    }

    NrcspSonos.getAllMySonosItems(sonosPlayer)
      .then((items) => {
        return NrcspSonos.filterMySonosItems(items, filter);
      })
      .then((filteredItems) => {
        return NrcspSonos.findInArray(filteredItems, msg.topic);
      })
      .then((found) => {
        console.log(JSON.stringify(found));
        console.log(found.uri);
        console.log(found.metaData);
        return sonosPlayer.setAVTransportURI(found.uri, found.metaData);
        // return NrcspSonos.setAVTransportURI(sonosPlayer, found.uri, NrcspSoap.encodeXml(found.metaData));
      })
      .then((result) => {
        NrcspHelpers.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }

  /**  start queue
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * change msg.payload to current array of my Sonos items
  */
  function startQueue (node, msg, sonosPlayer, serial) {
    const sonosFunction = 'start queue';
    const mac = serial.split(':')[0];
    const uri = `x-rincon-queue:RINCON_${mac}0${sonosPlayer.port}#0`;
    console.log(JSON.stringify(uri));
    NrcspSonos.setAVTransportURI(sonosPlayer, uri, '')
      .then((result) => {
        NrcspSonos.play(sonosFunction);
      })
      .then((result) => {
        NrcspHelpers.success(node, msg, sonosPlayer);
      })
      .catch((error) => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }

  RED.nodes.registerType('sonos-manage-mysonos', SonosManageMySonosNode);
};
