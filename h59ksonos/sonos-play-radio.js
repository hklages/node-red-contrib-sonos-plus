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
    var isValid = helper.validateConfigNode(node, configNode);
    if (isValid) {
      // clear node status
      node.status({});

      // handle input message
      node.on('input', function (msg) {
        helper.preprocessInputMsg(node, configNode, msg, (device) => {
          handleInputMsg(node, msg, device.ipaddress);
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
      node.status({ fill: 'red', shape: 'dot', text: 'Could not find player' });
      node.error('sonos player is null');
      return;
    }

    // Check msg.payload and msg.topic. Store in command. Function to lowercase
    // payload contains basic function, topic contains parameters
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      node.status({ fill: 'red', shape: 'dot', text: 'wrong payload' });
      node.error('invalid payload!');
      return;
    }
    if (!(msg.topic !== null && msg.topic !== undefined && msg.topic)) {
      node.status({ fill: 'red', shape: 'dot', text: 'wrong topic' });
      node.error('invalid topic');
      return;
    }

    // dispatch to handle message
    var commandObject = { 'function': ('' + msg.payload).toLowerCase(),
      'parameter': ('' + msg.topic) };
    if (commandObject.function === 'play_mysonos') {
      handleCommandMySonos(node, msg, sonosPlayer, commandObject);
    } else if (commandObject.function === 'play_tunein') {
      handleCommandTuneIn(node, msg, sonosPlayer, commandObject);
    } else {
      node.status({ fill: 'red', shape: 'dot', text: 'invalid command!' });
      node.warn('invalid command: ' + JSON.stringify(commandObject));
    }
  }

  // -----------------------------------------------------------------------------
  function handleCommandTuneIn (node, msg, sonosPlayer, commandObject) {
    /**  Activate TuneIn radion station
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {object} sonosPlayer Sonos Player
    * @param  {object} commandObject command with function and parameter
    */

    var reg = new RegExp('^[s][0-9]+$'); // example s11111
    if (reg.test(commandObject.parameter)) {
      sonosPlayer.playTuneinRadio(commandObject.parameter).then(result => {
        node.status({ fill: 'green', shape: 'dot', text: 'OK TuneIN' });
        // send message
        node.send(msg);
      }).catch(err => {
        node.status({ fill: 'red', shape: 'dot', text: 'Error set TuneIn' });
        node.error('Error Radio TuneIn' + JSON.stringify(err));
      });
    } else {
      node.status({ fill: 'red', shape: 'dot', text: 'invalid command!' });
      node.warn('invalid TuneIn identifier: ' + JSON.stringify(commandObject));
    }
  }

  function handleCommandMySonos (node, msg, sonosPlayer, commandObject) {
  // get list of My Sonos stations - first match!
    sonosPlayer.getFavorites().then(data => {
      if (!(data.returned !== null && data.returned !== undefined &&
        data.returned && parseInt(data.returned) > 0)) {
        node.status({ fill: 'red', shape: 'dot', text: 'no station found' });
        node.error('My Sonos does not contain any stations');
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
        node.status({ fill: 'red', shape: 'dot', text: 'no station found' });
        node.error('My Sonos does not contain any TuneIn or Amazon stations');
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
              node.status({ fill: 'green', shape: 'dot', text: 'OK TuneIN' });
              // send message
              msg.sonos = 'success';
              node.send(msg);
            }).catch(err => {
              node.status({ fill: 'red', shape: 'dot', text: 'Erro set TuneIn' });
              node.error('Error Radio TuneIn' + JSON.stringify(err));
            });
          } else if (stationList[i].source === 'AmazonPrime') {
            sonosPlayer.setAVTransportURI(stationList[i].uri).then(result => {
              node.status({ fill: 'green', shape: 'dot', text: 'OK Amazon' });
              // send message
              msg.sonos = 'success';
              node.send(msg);
            }).catch(err => {
              node.status({ fill: 'red', shape: 'dot', text: 'Error Set Amazon' });
              node.error('Error Radio TuneIn' + JSON.stringify(err));
            });
          } else {
            node.status({ fill: 'red', shape: 'dot', text: 'Error unknown' });
            node.error('Error unknown');
            return;
          }
          break;
        }
      }
      if (!isInStationList) {
        node.status({ fill: 'red', shape: 'dot', text: 'Topic not in MySonos list.' });
        node.error('Station name not in MySonos station list.');
      }
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'Error Processing MySonos List' });
      node.error('Error processing MySonos List' + JSON.stringify(err));
    });
  }
  RED.nodes.registerType('sonos-play-radio', SonosPlayRadioNode);
};
