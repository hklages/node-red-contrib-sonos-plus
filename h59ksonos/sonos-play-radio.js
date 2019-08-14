var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosPlayRadioNode (config) {
    /**  Create Play Radio Node and subscribe to messages
    * @param  {object} config current node configuration data
    */

    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and process message
    var node = this;
    var configNode = RED.nodes.getNode(config.confignode);
    var isValid = helper.validateConfigNodeV2(configNode);
    if (isValid) {
      // clear node status
      node.status({});

      // handle input message
      node.on('input', function (msg) {
        helper.identifyPlayerProcessInputMsg(node, configNode, msg, function (ipAddress) {
          if (ipAddress === null) {
            // error handling node status, node error is done in identifyPlayerProcessInputMsg
          } else {
            handleInputMsg(node, msg, ipAddress);
          }
        });
      });
    }
  }

  // ------------------------------------------------------------------------------------

  function handleInputMsg (node, msg, ipaddress) {
  /**  Validate input message and dispatch
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */

    // get sonos player object
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      helper.setNodeStatus(node, 'error', 'sonos player is null', 'Could not find a valid sonos player. Check configuration Node');
      return;
    }

    // Check msg.payload and msg.topic. Store in command. Function to lowercase
    // payload contains basic function, topic contains parameters
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      helper.setNodeStatus(node, 'error', 'invalid payload', 'Invalid payload. Read documentation.');
      return;
    }
    if (!(msg.topic !== null && msg.topic !== undefined && msg.topic)) {
      helper.setNodeStatus(node, 'error', 'invalid topc', 'Invalid topic. Read documentation.');
      return;
    }

    // dispatch to handle message
    var commandObject = {
      'function': ('' + msg.payload).toLowerCase(),
      'parameter': ('' + msg.topic)
    };
    if (commandObject.function === 'play_mysonos') {
      handleCommandMySonos(node, msg, sonosPlayer, commandObject);
    } else if (commandObject.function === 'play_tunein') {
      handleCommandTuneIn(node, msg, sonosPlayer, commandObject);
    } else {
      helper.setNodeStatus(node, 'warning', 'invalid command.', commandObject);
    }
  }

  // -----------------------------------------------------------------------------
  function handleCommandTuneIn (node, msg, sonosPlayer, commandObject) {
    /**  Activate TuneIn radio station (via simple TuneIn Radio id)
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {object} sonosPlayer Sonos Player
    * @param  {object} commandObject command with function and parameter
    */

    var reg = new RegExp('^[s][0-9]+$'); // example s11111
    if (reg.test(commandObject.parameter)) {
      sonosPlayer.playTuneinRadio(commandObject.parameter).then(result => {
        helper.setNodeStatus(node, 'success', 'TuneIn', '');
        // send message
        node.send(msg);
      }).catch(err => {
        helper.setNodeStatus(node, 'error', 'Radio TuneIn', err);
      });
    } else {
      helper.setNodeStatus(node, 'error', 'invalid TuneIn Radio id.', commandObject);
    }
  }

  function handleCommandMySonos (node, msg, sonosPlayer, commandObject) {
    /**  Get list of My Sonos radion station (only TuneIn, AmazonPrime) and start playing
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {object} sonosPlayer Sonos Player
    * @param  {object} commandObject command with function and parameter
    */

    // get list of My Sonos stations
    sonosPlayer.getFavorites().then(data => {
      if (!(data.returned !== null && data.returned !== undefined &&
        data.returned && parseInt(data.returned) > 0)) {
        helper.setNodeStatus(node, 'error', 'no station found', 'My Sonos does not contain any stations');
        return;
      }

      // filter: TuneIn or Amazon Prime radio stations
      const TUNEIN_PREFIX = 'x-sonosapi-stream:';
      const AMAZON_PREFIX = 'x-sonosapi-radio:';
      var stationList = [];
      var stationUri;
      var radioId;
      for (let i = 0; i < parseInt(data.returned); i++) {
        if (data.items[i].uri.startsWith(TUNEIN_PREFIX)) {
        // get stationId
          stationUri = data.items[i].uri;
          radioId = stationUri.split('?')[0];
          radioId = radioId.substr(TUNEIN_PREFIX.length);
          stationList.push({ 'title': data.items[i].title, 'radioId': radioId, 'uri': stationUri, 'source': 'TuneIn' });
        }
        if (data.items[i].uri.startsWith(AMAZON_PREFIX)) {
          stationList.push({ 'title': data.items[i].title, 'uri': data.items[i].uri, 'source': 'AmazonPrime' });
        }
      }
      if (stationList.length === 0) {
        helper.setNodeStatus(node, 'error', 'no station found', 'My Sonos does not contain any TuneIn or Amazon stations');
        return;
      }

      msg.mySonosRadios = stationList;

      // lookup topic in list and play radio station - first match counts
      var isInStationList = false;
      for (let i = 0; i < stationList.length; i++) {
        if (((stationList[i].title).indexOf(commandObject.parameter)) >= 0) {
          // play radion station
          isInStationList = true;
          if (stationList[i].source === 'TuneIn') {
            sonosPlayer.playTuneinRadio(stationList[i].radioId).then(result => {
              helper.setNodeStatus(node, 'success', 'TuneIn', '');
              // send message
              msg.sonos = 'success';
              node.send(msg);
            }).catch(err => {
              helper.setNodeStatus(node, 'error', 'Radio TuneIn', err);
            });
          } else if (stationList[i].source === 'AmazonPrime') {
            sonosPlayer.setAVTransportURI(stationList[i].uri).then(result => {
              helper.setNodeStatus(node, 'success', 'Amazon', '');
              // send message
              msg.sonos = 'success';
              node.send(msg);
            }).catch(err => {
              helper.setNodeStatus(node, 'error', 'Set Amazon', err);
            });
          } else {
            helper.setNodeStatus(node, 'error', 'unknown', 'Unknown error occured during loop stations.');
            return;
          }
          break;
        }
      }
      if (!isInStationList) {
        helper.setNodeStatus(node, 'error', 'Topic not in MySonos list.', 'Topic not in MySonos list. Modify My Sonos Radion stations');
      }
    }).catch(err => {
      helper.setNodeStatus(node, 'error', 'processing MySonos List', err);
    });
  }
  RED.nodes.registerType('sonos-play-radio', SonosPlayRadioNode);
};
