var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosPlayFavoriteNode (config) {
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
          handleInputMsg(node, configNode, msg, device.ipaddress);
        });
      });
    }
  }

  // ------------------------------------------------------------------------------------

  function handleInputMsg (node, configNode, msg, ipaddress) {
    var errorMsg;
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'Could not find player' });
      return;
    }

    // Convert payload to lowercase string
    var cmd;
    if (msg.payload !== null && msg.payload !== undefined && msg.payload) {
      cmd = '' + msg.payload;// convert to string -not really necessary
    }
    cmd = msg.payload;
    cmd = cmd.toLowerCase();

    // check syntax auf msg
    if (cmd.startsWith('favorite')) {
      const TUNEIN_PREFIX = 'x-sonosapi-stream:';
      const AMAZON_PREFIX = 'x-sonosapi-radio:';
      const AMAZON_PLAYLIST = 'x-rincon-cpcontainer:';

      // index of station in list of favorites
      var stationIndex = 0;

      // check syntax favorite_<number>
      if (cmd.indexOf('_') > 0) {
        var stationString = cmd.split('_')[1];
        if (stationString.length > 0) {
          stationIndex = parseInt(stationString);
          if (isNaN(stationIndex)) {
            node.status({ fill: 'red', shape: 'dot', text: 'Wrong msg format' });
            node.error('Error: Command favorite does not contain station index after seperator: ' + cmd);
            return;
          }
        } else {
          node.status({ fill: 'red', shape: 'dot', text: 'Wrong msg format' });
          node.error('Error: Command favorite does not contain station after seperator: ' + cmd);
          return;
        }
      } else {
        node.status({ fill: 'red', shape: 'dot', text: 'Wrong msg format' });
        node.error('Error: Command favorite does not contain seperator: ' + cmd);
        return;
      }

      // get favorites from Sonos and define msg.title
      sonosPlayer.getFavorites().then(data => {
        var lastStation = parseInt(data.returned);
        if ((stationIndex < 0) || (stationIndex >= lastStation)) {
          node.status({ fill: 'red', shape: 'dot', text: 'Wrong index' });
          errorMsg = { code: 'Fav-003', message: 'Station index is out of range.' };
          throw errorMsg;
        }

        var stationUri = data.items[stationIndex].uri;
        msg.favorite_name = data.items[stationIndex].title;

        if (stationUri.startsWith(TUNEIN_PREFIX)) {
          // Extract radio id
          var radioId = stationUri.split('?')[0];
          radioId = radioId.substr(TUNEIN_PREFIX.length);
          sonosPlayer.playTuneinRadio(radioId).then(result => {
            node.status({ fill: 'green', shape: 'dot', text: 'OK TuneIN' });
          }).catch(err => {
            node.status({ fill: 'red', shape: 'dot', text: 'Set TuneIn' });
            node.error(JSON.stringify(err));
          });
        } else if (stationUri.startsWith(AMAZON_PREFIX)) {
          // Amazon Prime Radio Stations
          sonosPlayer.setAVTransportURI(stationUri).then(result => {
            node.status({ fill: 'green', shape: 'dot', text: 'OK Amazon or ...' });
          }).catch(err => {
            node.status({ fill: 'red', shape: 'dot', text: 'Set Amazon' });
            node.error(JSON.stringify(err));
          });
        } else if (stationUri.startsWith(AMAZON_PLAYLIST)) {
          // Amazon Prime AMAZON_PLAYLIST
          errorMsg = { code: 'Fav_001', message: 'Currently playlists are not implemented.' };
          throw errorMsg;
        } else {
          // TODO resonable error codes
          errorMsg = { code: 'Fav-002', message: 'Could not identify stream.' };
          throw errorMsg;
        }
        // send message
        msg.mysonos = data.items;
        node.send(msg);
      }).catch(err => {
        node.status({ fill: 'red', shape: 'dot', text: 'Processing favorites' });
        node.error(JSON.stringify(err));
      });
    }
  }
  RED.nodes.registerType('sonos-play-favorite', SonosPlayFavoriteNode);
};
